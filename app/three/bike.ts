import * as THREE from "three/webgpu";
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from "three/webgpu";
import { COLORS } from "./palette";

/**
 * The player: a Dutch city bike plus a low-poly rider.
 * Local space: the bike faces +X, so
 *   - rotation about X = roll (leaning into a corner)
 *   - rotation about Z = pitch (nose up/down on the bridges)
 *   - rotation about Y = yaw (steering, and the world heading)
 * y = 0 is the tyre contact patch.
 */

export type BikeAnimation = {
  t: number;
  speed: number;
  steer: number;
  lean: number;
  pitch: number;
  wheelAngle: number;
  pedalAngle: number;
};

export type BikeRig = {
  root: THREE.Group;
  body: THREE.Group;
  update(state: BikeAnimation): void;
};

const materialCache = new Map<string, THREE.Material>();

function solid(color: THREE.ColorRepresentation, roughness = 0.62, metalness = 0.08): THREE.Material {
  const key = `s:${String(color)}:${roughness}:${metalness}`;
  const hit = materialCache.get(key);
  if (hit) return hit;
  const material = new MeshStandardNodeMaterial({
    color: new THREE.Color(color as THREE.Color),
    roughness,
    metalness,
    flatShading: true,
  });
  materialCache.set(key, material);
  return material;
}

function glow(color: THREE.ColorRepresentation): THREE.Material {
  const key = `g:${String(color)}`;
  const hit = materialCache.get(key);
  if (hit) return hit;
  const material = new MeshBasicNodeMaterial({ color: new THREE.Color(color as THREE.Color) });
  materialCache.set(key, material);
  return material;
}

/** Unit cylinder along +Y from y = 0 to y = 1, so it can be stretched between two joints. */
function limbGeometry(rTop: number, rBottom: number, segments = 7): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rTop, rBottom, 1, segments).translate(0, 0.5, 0);
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpDir = new THREE.Vector3();
const tmpAB = new THREE.Vector3();
const tmpPerp = new THREE.Vector3();

function placeLimb(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3): void {
  tmpDir.subVectors(b, a);
  const length = tmpDir.length() || 0.0001;
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(UP, tmpDir.divideScalar(length));
  mesh.scale.set(1, Math.max(length, 0.001), 1);
}

/** Two-bone IK: the joint position that lets `root` reach `target`. */
function solveJoint(
  root: THREE.Vector3,
  target: THREE.Vector3,
  l1: number,
  l2: number,
  hint: THREE.Vector3,
  out: THREE.Vector3,
): void {
  tmpAB.subVectors(target, root);
  const distance = THREE.MathUtils.clamp(tmpAB.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  tmpAB.normalize();
  const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  tmpPerp.copy(hint).addScaledVector(tmpAB, -hint.dot(tmpAB));
  if (tmpPerp.lengthSq() < 1e-6) tmpPerp.set(0, 0, 1).addScaledVector(tmpAB, -tmpAB.z);
  tmpPerp.normalize();
  out.copy(root).addScaledVector(tmpAB, along).addScaledVector(tmpPerp, height);
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = true;
  return m;
}

const STEER_LIMIT = 0.5;

export function createBike(): BikeRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const wheelGeometry = new THREE.TorusGeometry(0.35, 0.042, 8, 20);
  const tubeGeometry = limbGeometry(0.032, 0.032);
  const frameMaterial = solid(COLORS.bikeFrame, 0.45, 0.35);
  const metalMaterial = solid(COLORS.metalDark, 0.5, 0.4);
  const rimMaterial = solid(COLORS.rim, 0.35, 0.6);

  // wheels ---------------------------------------------------------------
  const spinning: THREE.Object3D[] = [];
  for (const x of [-0.55, 0.55]) {
    const tyre = mesh(wheelGeometry, solid(COLORS.tire, 0.95, 0));
    tyre.position.set(x, 0.35, 0);
    const rim = mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 18), rimMaterial);
    rim.position.set(x, 0.35, 0);
    const spokeA = mesh(new THREE.BoxGeometry(0.6, 0.014, 0.014), rimMaterial);
    spokeA.position.set(x, 0.35, 0);
    const spokeB = mesh(new THREE.BoxGeometry(0.014, 0.6, 0.014), rimMaterial);
    spokeB.position.set(x, 0.35, 0);
    const hub = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 6), metalMaterial);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(x, 0.35, 0);
    const fender = mesh(new THREE.TorusGeometry(0.41, 0.028, 5, 12, Math.PI * 0.78), solid(COLORS.bikeFrameAlt, 0.5, 0.2));
    fender.position.set(x, 0.35, 0);
    fender.rotation.z = Math.PI * 0.6;
    body.add(tyre, rim, spokeA, spokeB, hub, fender);
    spinning.push(rim, spokeA, spokeB);
  }

  // frame
  const tubes: [THREE.Vector3, THREE.Vector3, THREE.Material][] = [
    [new THREE.Vector3(0.0, 0.34, 0), new THREE.Vector3(-0.2, 1.02, 0), frameMaterial],
    [new THREE.Vector3(-0.18, 0.99, 0), new THREE.Vector3(0.44, 0.92, 0), frameMaterial],
    [new THREE.Vector3(0.02, 0.36, 0), new THREE.Vector3(0.46, 0.88, 0), frameMaterial],
    [new THREE.Vector3(0.0, 0.34, 0), new THREE.Vector3(-0.55, 0.35, 0), frameMaterial],
    [new THREE.Vector3(-0.18, 0.95, 0), new THREE.Vector3(-0.55, 0.35, 0), frameMaterial],
  ];
  for (const [a, b, material] of tubes) {
    const tube = mesh(tubeGeometry, material);
    placeLimb(tube, a, b);
    body.add(tube);
  }
  const seatPost = mesh(limbGeometry(0.026, 0.026), metalMaterial);
  placeLimb(seatPost, new THREE.Vector3(-0.2, 1.0, 0), new THREE.Vector3(-0.22, 1.16, 0));
  const saddle = mesh(new THREE.BoxGeometry(0.32, 0.07, 0.17), solid(COLORS.trimDark, 0.8, 0));
  saddle.position.set(-0.24, 1.19, 0);
  const rack = mesh(new THREE.BoxGeometry(0.42, 0.04, 0.28), metalMaterial);
  rack.position.set(-0.5, 0.85, 0);
  const crate = mesh(new THREE.BoxGeometry(0.34, 0.22, 0.26), solid(COLORS.boatWood, 0.85, 0));
  crate.position.set(-0.5, 0.98, 0);
  const rearLight = mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), glow(0xd94f4f));
  rearLight.position.set(-0.66, 0.74, 0);
  body.add(seatPost, saddle, rack, crate, rearLight);

  // steering assembly (rotates about the head tube axis)
  const steer = new THREE.Group();
  steer.position.set(0.48, 0.86, 0);
  body.add(steer);
  for (const z of [-0.07, 0.07]) {
    const fork = mesh(limbGeometry(0.024, 0.024), metalMaterial);
    placeLimb(fork, new THREE.Vector3(0.0, 0.02, z), new THREE.Vector3(0.07, -0.51, z));
    steer.add(fork);
  }
  const stem = mesh(limbGeometry(0.028, 0.028), metalMaterial);
  placeLimb(stem, new THREE.Vector3(0.0, 0.02, 0), new THREE.Vector3(0.03, 0.18, 0));
  const bar = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.56, 7), metalMaterial);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(0.04, 0.18, 0);
  const headlight = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), solid(COLORS.bikeFrameAlt, 0.4, 0.5));
  headlight.rotation.z = Math.PI / 2;
  headlight.position.set(0.12, -0.16, 0);
  const headlightGlow = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 8), glow(COLORS.lampGlass));
  headlightGlow.rotation.z = Math.PI / 2;
  headlightGlow.position.set(0.18, -0.16, 0);
  const bell = mesh(new THREE.SphereGeometry(0.04, 8, 6), solid(0xb08a2e, 0.3, 0.7));
  bell.position.set(0.02, 0.22, -0.2);
  const basket = mesh(new THREE.BoxGeometry(0.34, 0.24, 0.3), solid(COLORS.basket, 0.85, 0));
  basket.position.set(0.2, 0.0, 0);
  const basketFlowers = mesh(new THREE.BoxGeometry(0.26, 0.12, 0.22), glow(0xd7557a));
  basketFlowers.position.set(0.2, 0.15, 0);
  steer.add(stem, bar, headlight, headlightGlow, bell, basket, basketFlowers);

  // pedals ---------------------------------------------------------------
  const crank = new THREE.Group();
  crank.position.set(0.0, 0.34, 0);
  body.add(crank);
  crank.add(mesh(new THREE.TorusGeometry(0.12, 0.016, 5, 14), metalMaterial));
  for (const sign of [1, -1]) {
    const arm = mesh(new THREE.BoxGeometry(0.05, 0.34, 0.03), metalMaterial);
    arm.position.set(0, sign * 0.17, sign * 0.09);
    const pedal = mesh(new THREE.BoxGeometry(0.13, 0.03, 0.09), solid(COLORS.trimDark, 0.7, 0.1));
    pedal.position.set(0, sign * 0.17, sign * 0.15);
    crank.add(arm, pedal);
  }

  // ---------------------------------------------------------------- rider
  const skin = solid(COLORS.skin, 0.75, 0);
  const jacket = solid(COLORS.jacket, 0.8, 0);
  const pants = solid(COLORS.pants, 0.85, 0);

  const seatPoint = new THREE.Vector3(-0.2, 1.22, 0);
  const shoulder = new THREE.Vector3(0.14, 1.62, 0);
  const shoulderHalf = 0.17;
  const hipHalf = 0.115;

  const pelvis = mesh(new THREE.BoxGeometry(0.28, 0.24, 0.3), pants);
  pelvis.position.copy(seatPoint).add(new THREE.Vector3(0.02, 0.06, 0));
  const torso = mesh(limbGeometry(0.17, 0.19), jacket);
  placeLimb(torso, seatPoint.clone().add(new THREE.Vector3(0.0, 0.1, 0)), shoulder.clone().add(new THREE.Vector3(-0.02, 0, 0)));
  const neck = mesh(limbGeometry(0.05, 0.06), skin);
  placeLimb(neck, shoulder.clone().add(new THREE.Vector3(0.02, 0.02, 0)), shoulder.clone().add(new THREE.Vector3(0.08, 0.12, 0)));
  const head = mesh(new THREE.SphereGeometry(0.135, 12, 10), skin);
  head.position.copy(shoulder).add(new THREE.Vector3(0.12, 0.18, 0));
  const hair = mesh(
    new THREE.SphereGeometry(0.142, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    solid(COLORS.hair, 0.9, 0),
  );
  hair.position.copy(head.position).add(new THREE.Vector3(-0.015, 0.012, 0));
  const backpack = mesh(new THREE.BoxGeometry(0.22, 0.28, 0.26), solid(COLORS.jacketAlt, 0.85, 0));
  backpack.position.copy(seatPoint).add(new THREE.Vector3(-0.15, 0.3, 0));
  torso.rotation.z = -0.42;
  body.add(pelvis, torso, neck, head, hair, backpack);

  const upperArmGeometry = limbGeometry(0.05, 0.045);
  const foreArmGeometry = limbGeometry(0.045, 0.038);
  const thighGeometry = limbGeometry(0.085, 0.07);
  const shinGeometry = limbGeometry(0.065, 0.05);
  const shoeGeometry = new THREE.BoxGeometry(0.2, 0.07, 0.11);

  const arms: { upper: THREE.Mesh; fore: THREE.Mesh }[] = [];
  const legs: { thigh: THREE.Mesh; shin: THREE.Mesh; shoe: THREE.Mesh }[] = [];
  for (let i = 0; i < 2; i++) {
    const upper = mesh(upperArmGeometry, jacket);
    const fore = mesh(foreArmGeometry, skin);
    body.add(upper, fore);
    arms.push({ upper, fore });

    const thigh = mesh(thighGeometry, pants);
    const shin = mesh(shinGeometry, pants);
    const shoe = mesh(shoeGeometry, solid(COLORS.shoes, 0.8, 0));
    body.add(thigh, shin, shoe);
    legs.push({ thigh, shin, shoe });
  }

  const shoulderPoint = new THREE.Vector3();
  const hipPoint = new THREE.Vector3();
  const gripPoint = new THREE.Vector3();
  const pedalPoint = new THREE.Vector3();
  const joint = new THREE.Vector3();
  const hintForward = new THREE.Vector3(1, 0.2, 0);
  const hintBack = new THREE.Vector3(-0.45, -1, 0);
  const gripLocal = new THREE.Vector3(0.04, 0.18, 0.28);
  const pedalRadius = 0.17;

  const light = new THREE.PointLight(0xffc98a, 3.4, 15, 2);
  light.position.set(1.5, 1.0, 0);
  body.add(light);

  function update(state: BikeAnimation): void {
    body.rotation.x = state.lean;
    body.rotation.z = state.pitch;
    const steerAngle = -state.steer * STEER_LIMIT;
    steer.rotation.y = steerAngle;

    for (const part of spinning) part.rotation.z = state.wheelAngle;
    crank.rotation.z = state.pedalAngle;

    const cos = Math.cos(steerAngle);
    const sin = Math.sin(steerAngle);
    const speedFactor = THREE.MathUtils.clamp(Math.abs(state.speed) / 6, 0, 1);
    const bob = Math.sin(state.t * 7) * 0.01 * speedFactor;

    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? 1 : -1;
      const arm = arms[i];
      const leg = legs[i];

      // hands follow the rotating handlebar
      const gx = gripLocal.x * cos + sign * gripLocal.z * sin;
      const gz = -gripLocal.x * sin + sign * gripLocal.z * cos;
      shoulderPoint.set(shoulder.x, shoulder.y + bob, sign * shoulderHalf);
      gripPoint.set(steer.position.x + gx, steer.position.y + gripLocal.y, gz);
      solveJoint(shoulderPoint, gripPoint, 0.35, 0.35, hintBack, joint);
      placeLimb(arm.upper, shoulderPoint, joint);
      placeLimb(arm.fore, joint, gripPoint);

      const angle = state.pedalAngle + (sign > 0 ? 0 : Math.PI);
      pedalPoint.set(Math.cos(angle) * pedalRadius, 0.34 + Math.sin(angle) * pedalRadius, sign * 0.15);
      hipPoint.set(seatPoint.x + 0.02, seatPoint.y + 0.02 + bob, sign * hipHalf);
      solveJoint(hipPoint, pedalPoint, 0.5, 0.5, hintForward, joint);
      placeLimb(leg.thigh, hipPoint, joint);
      placeLimb(leg.shin, joint, pedalPoint);
      leg.shoe.position.copy(pedalPoint).add(new THREE.Vector3(0.05, 0.05, 0));
      leg.shoe.rotation.set(0, 0, -Math.sin(angle) * 0.25);
    }

    head.position.set(shoulder.x + 0.12, shoulder.y + 0.18 + bob, 0);
    hair.position.copy(head.position).add(new THREE.Vector3(-0.015, 0.012, 0));
  }

  return { root, body, update };
}
