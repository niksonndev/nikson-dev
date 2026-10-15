import * as THREE from "three/webgpu";
import { RenderPipeline, WebGPURenderer } from "three/webgpu";
import { pass } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { buildCity, SUN_COLOR, SUN_DIR, type Collectible } from "./city";
import { createBike } from "./bike";
import { createAudio } from "./audio";
import { createInput } from "./input";
import {
  LAYOUT,
  POI_ANCHORS,
  depthLimitAt,
  heightAt,
  isOnBridge,
  sideStreetHalfAt,
  slopeAt,
  type Collider,
  type PoiId,
} from "./layout";
import { COLORS } from "./palette";
import { makeShadowTexture } from "./utils";

export type Quality = "low" | "medium" | "high";

export type Telemetry = {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  collected: number;
  total: number;
  muted: boolean;
  backend: string;
  items: { x: number; z: number; taken: boolean }[];
};

export type WorldOptions = {
  canvas: HTMLCanvasElement;
  onProgress: (label: string, value: number) => void;
  onReady: (info: { backend: string }) => void;
  onNear: (poi: PoiId | null) => void;
  onOpen: (poi: PoiId) => void;
  onCollect?: (collected: number, total: number) => void;
  onMute?: (muted: boolean) => void;
  onError: (error: unknown) => void;
};

export type WorldHandle = {
  dispose: () => void;
  setPaused: (paused: boolean) => void;
  setVirtual: (input: { steer?: number; throttle?: number; brake?: number }) => void;
  interact: () => void;
  jump: () => void;
  reset: () => void;
  resize: (width: number, height: number) => void;
  getTelemetry: () => Telemetry;
  toggleMute: () => boolean;
  setQuality: (quality: Quality) => void;
};

const MAX_SPEED = 17;
const BOOST_SPEED = 25;
const ACCEL = 15;
const BRAKE = 26;
const RIDER_RADIUS = 0.45;
const POI_RANGE = 5;

const MARKER_COLORS: Record<PoiId, number> = {
  projects: 0xffc077,
  about: 0xf3a55f,
  stack: 0xffdcaa,
  contact: 0xe8836a,
  made: 0xd4739a,
};

/** Golden dust motes drifting through the sunlight, recycled around the rider. */
function createMotes(): {
  points: THREE.Points;
  update: (t: number, dt: number, center: THREE.Vector3) => void;
} {
  const count = 700;
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 70;
    positions[i * 3 + 1] = 0.4 + Math.random() * 9;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 46;
    phases[i] = Math.random() * Math.PI * 2;
    speeds[i] = 0.25 + Math.random() * 0.7;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsNodeMaterial({
    size: 0.14,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    color: new THREE.Color(0xffdcae),
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  return {
    points,
    update(t, dt, center) {
      const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
      const array = attribute.array as Float32Array;
      for (let i = 0; i < count; i++) {
        const ix = i * 3;
        array[ix] += speeds[i] * dt * 1.7;
        array[ix + 1] += Math.sin(t * 0.7 + phases[i]) * dt * 0.4;
        array[ix + 2] += Math.cos(t * 0.5 + phases[i]) * dt * 0.3;
        if (array[ix] > 35) array[ix] = -35;
        if (array[ix + 1] > 12) array[ix + 1] = 0.3;
        if (array[ix + 1] < 0.2) array[ix + 1] = 11.5;
        if (array[ix + 2] > 23) array[ix + 2] = -23;
        if (array[ix + 2] < -23) array[ix + 2] = 23;
      }
      attribute.needsUpdate = true;
      points.position.set(center.x, 0, center.z);
    },
  };
}

export function createWorld(options: WorldOptions): WorldHandle {
  const { canvas } = options;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(COLORS.fog, 0.004);

  const camera = new THREE.PerspectiveCamera(56, 1, 0.3, 1200);
  camera.position.set(-44, 4, 10);

  const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: false });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const input = createInput();
  const bike = createBike();
  const motes = createMotes();
  scene.add(motes.points);
  const audio = createAudio();
  let audioReady = false;
  let colliders: Collider[] = [];
  let collectibles: Collectible[] = [];
  let totalCollectibles = 0;
  let backendName = "WebGL2";
  let paused = false;
  let disposed = false;

  scene.add(bike.root);

  // lights ---------------------------------------------------------------
  const hemisphere = new THREE.HemisphereLight(COLORS.ambientSky, COLORS.ambientGround, 1.35);
  const sun = new THREE.DirectionalLight(SUN_COLOR, 3.5);
  sun.position.copy(SUN_DIR).multiplyScalar(120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 300;
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  // cool bounce from the opposite side so the shadowed facades never crush to black
  const fill = new THREE.DirectionalLight(0x8fb4dd, 0.5);
  fill.position.set(-SUN_DIR.x * 80, 40, -SUN_DIR.z * 80);
  scene.add(hemisphere, sun, sun.target, fill);

  // bloom keeps the lamps, lit windows and the sun path on the water alive
  const renderPipeline = new RenderPipeline(renderer);
  const scenePass = pass(scene, camera, { samples: 4 });
  const sceneColor = scenePass.getTextureNode();
  const bloomNode = bloom(sceneColor, 0.55, 0.5, 0.72);
  renderPipeline.outputNode = sceneColor.add(bloomNode);

  // fake contact shadow under the bike
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 2.9),
    new THREE.MeshBasicNodeMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = LAYOUT.groundY + 0.03;
  scene.add(shadow);

  // points of interest ---------------------------------------------------
  const markers = new Map<PoiId, THREE.Group>();
  const markerGeometry = new THREE.OctahedronGeometry(0.42, 0);
  const ringGeometry = new THREE.TorusGeometry(0.9, 0.06, 6, 26);
  for (const id of Object.keys(POI_ANCHORS) as PoiId[]) {
    const { x, z } = POI_ANCHORS[id];
    const group = new THREE.Group();
    const color = MARKER_COLORS[id];
    const diamond = new THREE.Mesh(markerGeometry, new THREE.MeshBasicNodeMaterial({ color }));
    diamond.position.y = 2.7;
    const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicNodeMaterial({ color }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    group.add(diamond, ring);
    group.position.set(x, heightAt(x, z), z);
    group.visible = false;
    scene.add(group);
    markers.set(id, group);
  }

  // state ----------------------------------------------------------------
  const state = {
    x: -38,
    z: 10.2,
    yaw: 0,
    speed: 0,
    lean: 0,
    pitch: 0,
    wheelAngle: 0,
    pedalAngle: 0,
    time: 0,
    airHeight: 0,
    airVelocity: 0,
    airborne: false,
    collected: 0,
    nearest: null as PoiId | null,
  };

  const cameraState = { yawOffset: 0, pitchOffset: 0, distance: 7.2, dragging: false, lastX: 0, lastY: 0 };
  // before the first input the camera slowly orbits the bike, like a title screen
  let intro = true;
  let introSpin = 0;

  const forward = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  let lastFrame = performance.now();

  function forwardVector(yaw: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.cos(yaw), 0, -Math.sin(yaw));
  }

  function killSpeed(factor: number): void {
    state.speed *= factor;
  }

  function updatePhysics(dt: number): void {
    const { steer, throttle, brake, boost } = input.state;
    const maxSpeed = boost ? BOOST_SPEED : MAX_SPEED;
    const moving = Math.abs(state.speed) > 0.05;

    if (!paused) {
      if (throttle > 0) {
        const headroom = Math.max(0, 1 - state.speed / maxSpeed);
        state.speed += ACCEL * headroom * dt;
      }
      if (brake > 0) {
        if (state.speed > 0.2) state.speed -= BRAKE * dt;
        else state.speed = Math.max(state.speed - ACCEL * 0.6 * dt, -5);
      }
    }

    // drag + rolling resistance so the bike coasts to a stop
    state.speed -= state.speed * 0.12 * dt;
    if (Math.abs(state.speed) < 0.06) state.speed = 0;
    if (!moving && throttle === 0) state.speed *= 0.9;

    const speedFactor = THREE.MathUtils.clamp(Math.abs(state.speed) / 4, 0, 1);
    const steerRate =
      2.25 * speedFactor * (1 - 0.24 * THREE.MathUtils.clamp(Math.abs(state.speed) / BOOST_SPEED, 0, 1));
    const turn = steer * steerRate * dt * Math.sign(state.speed >= 0 ? 1 : -1);
    state.yaw -= turn;

    forwardVector(state.yaw, forward);
    let nextX = state.x + forward.x * state.speed * dt;
    let nextZ = state.z + forward.z * state.speed * dt;

    // canal: the quay wall, except where a bridge crosses
    const canalLimit = LAYOUT.canalHalf + 0.5;
    if (Math.abs(nextZ) < canalLimit && !isOnBridge(nextX)) {
      nextZ = Math.sign(state.z || 1) * canalLimit;
      killSpeed(0.35);
    }
    // house facades, except where a bridge gap or a side street cuts in
    const limit = depthLimitAt(nextX, nextZ);
    if (Math.abs(nextZ) > limit) {
      nextZ = Math.sign(nextZ) * limit;
      killSpeed(0.5);
    }
    // walls of a side street once the rider is past the facade line
    if (Math.abs(nextZ) > LAYOUT.blockEdgeZ) {
      for (const sx of LAYOUT.sideStreets) {
        const half = sideStreetHalfAt(nextZ);
        const dx = nextX - sx;
        if (Math.abs(dx) > half && Math.abs(state.x - sx) <= half) {
          nextX = sx + Math.sign(dx) * half;
          killSpeed(0.6);
        }
      }
    }
    // bridge railings
    if (Math.abs(nextZ) < LAYOUT.bridgeSpan) {
      for (const bx of LAYOUT.bridges) {
        const limit = LAYOUT.bridgeHalfWidth - 0.45;
        if (Math.abs(nextX - bx) < limit) continue;
        if (Math.abs(state.x - bx) < limit) {
          nextX = bx + Math.sign(nextX - bx) * limit;
          killSpeed(0.6);
        }
      }
    }
    // world ends
    if (Math.abs(nextX) > LAYOUT.worldX - 4) {
      nextX = Math.sign(nextX) * (LAYOUT.worldX - 4);
      killSpeed(0.4);
    }

    // round obstacles
    for (const c of colliders) {
      const dx = nextX - c.x;
      const dz = nextZ - c.z;
      const min = c.r + RIDER_RADIUS;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      nextX += (dx / d) * (min - d);
      nextZ += (dz / d) * (min - d);
      killSpeed(0.72);
    }

    state.x = nextX;
    state.z = nextZ;

    // sit on the terrain, with a little suspension rattle over the bricks
    const groundY = heightAt(state.x, state.z);

    // a hop, with a bit of gravity
    if (state.airborne) {
      state.airVelocity -= 16 * dt;
      state.airHeight += state.airVelocity * dt;
      if (state.airHeight <= 0) {
        state.airHeight = 0;
        state.airVelocity = 0;
        state.airborne = false;
      }
    }

    const roll = -state.wheelAngle * 0.35;
    const bump = (Math.sin(roll * 6.5) * 0.018 + Math.sin(roll * 2.3 + 1.1) * 0.013) * speedFactor;
    bike.root.position.set(state.x, groundY + bump + state.airHeight, state.z);
    bike.root.rotation.y = state.yaw;

    const climb = slopeAt(state.x, state.z) * forward.z;
    const airPitch = state.airborne ? THREE.MathUtils.clamp(state.airVelocity * 0.06, -0.3, 0.3) : 0;
    const targetPitch = THREE.MathUtils.clamp(Math.atan(climb) + airPitch, -0.6, 0.6);
    state.pitch += (targetPitch - state.pitch) * Math.min(1, dt * 8);

    const targetLean = steer * 0.42 * THREE.MathUtils.clamp(Math.abs(state.speed) / 8, 0, 1);
    state.lean += (targetLean - state.lean) * Math.min(1, dt * 6);

    state.wheelAngle -= (state.speed * dt) / 0.35;
    state.pedalAngle -= state.speed * dt * 1.15;

    // shadow follows the bike, flattened on the ground
    shadow.position.set(state.x, groundY + 0.03, state.z);
    shadow.rotation.z = state.yaw;

    bike.update({
      t: state.time,
      speed: state.speed,
      steer,
      lean: state.lean,
      pitch: state.pitch,
      wheelAngle: state.wheelAngle,
      pedalAngle: state.pedalAngle,
    });
  }

  function updateCamera(dt: number): void {
    const smoothing = 1 - Math.exp(-6 * dt);
    if (intro) introSpin += dt * 0.22;
    else introSpin *= 1 - Math.min(1, dt * 1.6);
    const yaw = state.yaw + cameraState.yawOffset + introSpin;
    forwardVector(yaw, forward);
    const back = cameraState.distance + Math.abs(state.speed) * 0.1;
    const height = 2.9 + cameraState.pitchOffset;

    desired
      .set(state.x - forward.x * back, heightAt(state.x, state.z) + height, state.z - forward.z * back)
      .add(new THREE.Vector3(0, 0, 0));
    camera.position.lerp(desired, smoothing);

    // keep the chase camera out of the houses: same limits as the rider, but a
    // touch tighter so it never clips into a wall
    const camLimit = depthLimitAt(state.x, state.z) - 0.5;
    if (Math.abs(camera.position.z) > camLimit) camera.position.z = Math.sign(camera.position.z) * camLimit;
    const street = LAYOUT.sideStreets.find((sx) => Math.abs(state.x - sx) <= LAYOUT.sideStreetHalf);
    if (street !== undefined && Math.abs(state.z) > LAYOUT.blockEdgeZ) {
      const half = sideStreetHalfAt(state.z) - 0.3;
      const dx = camera.position.x - street;
      if (Math.abs(dx) > half) camera.position.x = street + Math.sign(dx) * half;
    }

    lookAt.set(state.x + forward.x * 3.2, heightAt(state.x, state.z) + 1.5, state.z + forward.z * 3.2);
    camera.lookAt(lookAt);
    // a touch of camera roll, like every bike game does
    camera.rotateZ(-state.lean * 0.35);

    const targetFov = 56 + THREE.MathUtils.clamp(Math.abs(state.speed), 0, BOOST_SPEED) * 0.55;
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 1.5);
      camera.updateProjectionMatrix();
    }

    if (!cameraState.dragging) {
      cameraState.yawOffset *= 1 - Math.min(1, dt * 2.2);
      cameraState.pitchOffset *= 1 - Math.min(1, dt * 2.2);
    }
  }

  function updatePois(t: number): void {
    let nearest: PoiId | null = null;
    let nearestDistance = POI_RANGE;
    for (const [id, group] of markers) {
      const { x, z } = POI_ANCHORS[id];
      const distance = Math.hypot(state.x - x, state.z - z);
      const active = distance < POI_RANGE;
      group.visible = true;
      const diamond = group.children[0];
      diamond.rotation.y = t * 1.2;
      diamond.position.y = 2.7 + Math.sin(t * 2 + x) * 0.14;
      const ring = group.children[1];
      ring.rotation.z = t * 0.6;
      ring.scale.setScalar(active ? 1.25 : 1);
      if (active && distance < nearestDistance) {
        nearest = id;
        nearestDistance = distance;
      }
    }
    if (nearest !== state.nearest) {
      state.nearest = nearest;
      options.onNear(nearest);
    }
  }

  function openNearest(): void {
    if (state.nearest) {
      options.onOpen(state.nearest);
      input.clear();
      paused = true;
    }
  }

  /** Ride over a tulip to pick it up. */
  function collectNearby(): void {
    for (const item of collectibles) {
      if (item.taken) continue;
      if (Math.hypot(state.x - item.x, state.z - item.z) > 1.7) continue;
      item.taken = true;
      item.group.visible = false;
      state.collected += 1;
      audio.collect();
      options.onCollect?.(state.collected, totalCollectibles);
      if (state.collected >= totalCollectibles) audio.cheer();
    }
  }

  function onPointerDown(event: PointerEvent): void {
    intro = false;
    if (!audioReady) {
      audio.resume();
      audioReady = true;
    }
    cameraState.dragging = true;
    cameraState.lastX = event.clientX;
    cameraState.lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!cameraState.dragging) return;
    const dx = event.clientX - cameraState.lastX;
    const dy = event.clientY - cameraState.lastY;
    cameraState.lastX = event.clientX;
    cameraState.lastY = event.clientY;
    cameraState.yawOffset = THREE.MathUtils.clamp(cameraState.yawOffset - dx * 0.005, -1.4, 1.4);
    cameraState.pitchOffset = THREE.MathUtils.clamp(cameraState.pitchOffset + dy * 0.02, -1.4, 4.5);
  }

  function onPointerUp(event: PointerEvent): void {
    cameraState.dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    cameraState.distance = THREE.MathUtils.clamp(cameraState.distance + event.deltaY * 0.004, 4, 12);
  }

  function onResize(width: number, height: number): void {
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function onVisibility(): void {
    if (document.hidden) input.clear();
  }

  let resizeObserver: ResizeObserver | null = null;

  async function boot(): Promise<void> {
    try {
      await renderer.init();
      const backend = (renderer.backend as unknown as { isWebGPUBackend?: boolean })?.isWebGPUBackend
        ? "WebGPU"
        : "WebGL2";
      backendName = backend;
      const built = await buildCity(options.onProgress);
      if (disposed) return;

      colliders = built.colliders;
      collectibles = built.collectibles;
      totalCollectibles = collectibles.length;
      scene.add(built.root);

      const parent = canvas.parentElement;
      const rect = parent?.getBoundingClientRect();
      onResize(rect?.width ?? canvas.clientWidth ?? 800, rect?.height ?? canvas.clientHeight ?? 600);
      if (parent && typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          const next = parent.getBoundingClientRect();
          onResize(next.width, next.height);
        });
        resizeObserver.observe(parent);
      }

      input.attach();
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);
      canvas.addEventListener("wheel", onWheel, { passive: false });
      document.addEventListener("visibilitychange", onVisibility);

      try {
        await renderer.compileAsync?.(scene, camera);
      } catch {
        /* compiling up front is an optimisation only */
      }

      options.onProgress("ready", 1);
      options.onReady({ backend });

      lastFrame = performance.now();
      renderer.setAnimationLoop(() => {
        if (disposed) return;
        const now = performance.now();
        const dt = Math.min((now - lastFrame) / 1000, 0.05);
        lastFrame = now;
        state.time += dt;

        if (input.takeReset()) {
          state.x = -38;
          state.z = 10.2;
          state.yaw = 0;
          state.speed = 0;
          state.lean = 0;
          state.pitch = 0;
        }
        if (input.takeBell()) audio.bell();
        if (input.takeInteract()) openNearest();
        if (input.takeMute()) {
          audio.setMuted(!audio.isMuted());
          options.onMute?.(audio.isMuted());
        }
        if (input.takeJump() && !paused && !state.airborne) {
          state.airVelocity = 6.4;
          state.airborne = true;
        }
        if (!audioReady && (input.state.throttle > 0 || input.state.brake > 0 || Math.abs(input.state.steer) > 0)) {
          audio.resume();
          audioReady = true;
        }
        if (intro && (input.state.throttle > 0 || input.state.brake > 0 || Math.abs(input.state.steer) > 0.01)) {
          intro = false;
        }

        updatePhysics(dt);
        collectNearby();
        audio.update(state.speed, state.airborne);
        built.update(state.time, dt);
        built.setCamera(camera.position);
        updateCamera(dt);
        updatePois(state.time);
        motes.update(state.time, dt, bike.root.position);

        // keep the shadow frustum centred on the rider
        sun.target.position.set(state.x, 0, state.z);
        sun.target.updateMatrixWorld();
        sun.position.copy(SUN_DIR).multiplyScalar(120).add(sun.target.position);

        renderPipeline.render();
      });

      // handles for the test harness; in production only behind ?ride-debug
      if (import.meta.env.DEV || new URLSearchParams(window.location.search).has("ride-debug")) {
        (window as unknown as { __ride?: unknown }).__ride = {
          renderer,
          scene,
          camera,
          state,
          built,
          input,
        };
      }
    } catch (error) {
      options.onError(error);
    }
  }

  void boot();

  return {
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      input.detach();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      document.removeEventListener("visibilitychange", onVisibility);
      resizeObserver?.disconnect();
      audio.dispose();
      renderer.dispose();
    },
    setPaused(next: boolean) {
      paused = next;
      if (next) input.clear();
    },
    setVirtual(next) {
      input.setVirtual(next);
    },
    interact() {
      openNearest();
    },
    jump() {
      if (!state.airborne) {
        state.airVelocity = 6.4;
        state.airborne = true;
      }
    },
    reset() {
      state.x = -38;
      state.z = 10.2;
      state.yaw = 0;
      state.speed = 0;
      state.lean = 0;
      state.pitch = 0;
    },
    resize(width: number, height: number) {
      onResize(width, height);
    },
    getTelemetry() {
      return {
        x: state.x,
        z: state.z,
        yaw: state.yaw,
        speed: state.speed,
        collected: state.collected,
        total: totalCollectibles,
        muted: audio.isMuted(),
        backend: backendName,
        items: collectibles.map((item) => ({ x: item.x, z: item.z, taken: item.taken })),
      };
    },
    toggleMute() {
      audio.setMuted(!audio.isMuted());
      return audio.isMuted();
    },
    setQuality(quality: Quality) {
      const parent = canvas.parentElement;
      const rect = parent?.getBoundingClientRect();
      const width = Math.max(1, rect?.width ?? window.innerWidth);
      const height = Math.max(1, rect?.height ?? window.innerHeight);
      // cap total pixels, not just the device ratio: a 4K or retina screen would
      // otherwise ask for several times the fill rate of a 1080p one
      const budget = quality === "low" ? 1.1e6 : quality === "medium" ? 1.9e6 : 3e6;
      const wanted =
        quality === "low"
          ? 0.75
          : quality === "medium"
            ? Math.min(window.devicePixelRatio, 1.25)
            : Math.min(window.devicePixelRatio, 1.5);
      renderer.setPixelRatio(Math.max(0.5, Math.min(wanted, Math.sqrt(budget / (width * height)))));
      const shadows = quality !== "low";
      renderer.shadowMap.enabled = shadows;
      sun.castShadow = shadows;
      const shadowSize = quality === "high" ? 2048 : 1024;
      if (sun.shadow.mapSize.x !== shadowSize) {
        sun.shadow.mapSize.set(shadowSize, shadowSize);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
      motes.points.visible = quality !== "low";
      renderPipeline.outputNode = quality === "low" ? sceneColor : sceneColor.add(bloomNode);
      if (parent) {
        const resized = parent.getBoundingClientRect();
        onResize(resized.width, resized.height);
      }
    },
  };
}
