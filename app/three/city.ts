import * as THREE from "three/webgpu";
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from "three/webgpu";
import {
  abs,
  cameraPosition,
  clamp,
  cos,
  dot,
  float,
  floor,
  fract,
  max,
  mix,
  normalize,
  positionLocal,
  positionWorld,
  pow,
  sin,
  smoothstep,
  time,
  vec2,
  vec3,
} from "three/tsl";
import { COLORS, brickColor } from "./palette";
import { LAYOUT, POI_ANCHORS, heightAt, type Collider } from "./layout";
import {
  MeshBuilder,
  box,
  chance,
  cone,
  cyl,
  icoGeo,
  makeRng,
  matrix,
  pick,
  plane,
  planeGeo,
  range,
  shade,
  shapePiece,
  torus,
  type Piece,
  type Rng,
  type Vec3,
} from "./utils";

/** Direction that points AT the sun. Shared by the sky shader, the water and the lights. */
export const SUN_DIR = new THREE.Vector3(-0.62, 0.34, -0.42).normalize();
export const SUN_COLOR = new THREE.Color(COLORS.sun);

export type City = {
  root: THREE.Group;
  colliders: Collider[];
  collectibles: Collectible[];
  update(t: number, dt: number): void;
  /** keeps the sky dome centred on the camera */
  setCamera(position: THREE.Vector3): void;
};

/** A tulip bundle you can pick up by riding over it. */
export type Collectible = {
  id: number;
  x: number;
  z: number;
  group: THREE.Group;
  taken: boolean;
};

const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

function place(pieces: Piece[], base: THREE.Matrix4): Piece[] {
  return pieces.map((piece) => ({
    ...piece,
    transform: piece.transform ? base.clone().multiply(piece.transform) : base.clone(),
  }));
}

/* ------------------------------------------------------------------ ground */

function buildQuays(builder: MeshBuilder, rng: Rng): void {
  const halfLen = LAYOUT.worldX;
  const tiles = Math.ceil((halfLen * 2) / 6);
  const tileW = (halfLen * 2) / tiles;
  const bodyTop = LAYOUT.groundY - 0.1;

  for (const side of [1, -1] as const) {
    for (let i = 0; i < tiles; i++) {
      const x = -halfLen + tileW * (i + 0.5);
      const f = 0.93 + rng() * 0.12;
      const w = tileW + 0.05;
      builder.addAll([
        // quay body: the stone wall drops into the canal
        box(
          shade(COLORS.quayStone, f),
          [w, bodyTop + 1.6, LAYOUT.facadeZ - LAYOUT.canalHalf],
          [x, (bodyTop - 1.6) / 2 + 0.06, side * (LAYOUT.canalHalf + (LAYOUT.facadeZ - LAYOUT.canalHalf) / 2)],
        ),
        box(
          shade(COLORS.cobble, f),
          [w, 0.12, LAYOUT.roadOuter - LAYOUT.roadInner],
          [x, LAYOUT.groundY - 0.06, side * ((LAYOUT.roadOuter + LAYOUT.roadInner) / 2)],
        ),
        box(
          shade(COLORS.pavement, f),
          [w, 0.12, LAYOUT.roadInner - LAYOUT.canalHalf],
          [x, LAYOUT.groundY - 0.06, side * ((LAYOUT.roadInner + LAYOUT.canalHalf) / 2)],
        ),
        box(
          shade(COLORS.pavementAlt, f),
          [w, 0.12, LAYOUT.facadeZ - LAYOUT.roadOuter],
          [x, LAYOUT.groundY - 0.06, side * ((LAYOUT.facadeZ + LAYOUT.roadOuter) / 2)],
        ),
      ]);
    }
  }
}

/* ----------------------------------------------------------------- bridges */

function buildBridges(builder: MeshBuilder, glow: MeshBuilder): void {
  const span = LAYOUT.bridgeSpan;
  const halfWidth = LAYOUT.bridgeHalfWidth;
  const steps = 28;

  for (const bx of LAYOUT.bridges) {
    // One extruded arch per bridge: the deck follows heightAt exactly, so the
    // ride and the geometry agree and there are no stair steps.
    const profile: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const z = -span + (2 * span * i) / steps;
      profile.push([z, heightAt(bx, z)]);
    }

    const deckShape = new THREE.Shape();
    deckShape.moveTo(profile[0][0], profile[0][1] - 0.6);
    for (const [z, y] of profile) deckShape.lineTo(z, y - 0.6);
    for (let i = profile.length - 1; i >= 0; i--) deckShape.lineTo(profile[i][0], profile[i][1]);
    deckShape.closePath();
    const deck = new THREE.ExtrudeGeometry(deckShape, { depth: halfWidth * 2, bevelEnabled: false });
    builder.addGeometry(deck, COLORS.bridgeStone, matrix([bx - halfWidth, 0, 0], [0, Math.PI / 2, 0]));
    deck.dispose();

    // stone parapet + metal handrail on both sides
    for (const sx of [-1, 1]) {
      const wallShape = new THREE.Shape();
      wallShape.moveTo(profile[0][0], profile[0][1] - 0.12);
      for (const [z, y] of profile) wallShape.lineTo(z, y - 0.12);
      for (let i = profile.length - 1; i >= 0; i--) wallShape.lineTo(profile[i][0], profile[i][1] + 0.95);
      wallShape.closePath();
      const wall = new THREE.ExtrudeGeometry(wallShape, { depth: 0.3, bevelEnabled: false });
      builder.addGeometry(
        wall,
        shade(COLORS.bridgeStone, 0.95),
        matrix([bx + sx * (halfWidth - 0.15) - 0.15, 0, 0], [0, Math.PI / 2, 0]),
      );
      wall.dispose();

      const railShape = new THREE.Shape();
      railShape.moveTo(profile[0][0], profile[0][1] + 0.95);
      for (const [z, y] of profile) railShape.lineTo(z, y + 0.95);
      for (let i = profile.length - 1; i >= 0; i--) railShape.lineTo(profile[i][0], profile[i][1] + 1.12);
      railShape.closePath();
      const rail = new THREE.ExtrudeGeometry(railShape, { depth: 0.14, bevelEnabled: false });
      builder.addGeometry(
        rail,
        COLORS.metalDark,
        matrix([bx + sx * (halfWidth - 0.15) - 0.07, 0, 0], [0, Math.PI / 2, 0]),
      );
      rail.dispose();
    }

    // stone arch seen from the canal
    const arch = new THREE.CylinderGeometry(6.65, 6.65, halfWidth * 2 + 0.2, 22, 1, true, 0, Math.PI);
    arch.rotateZ(-Math.PI / 2);
    builder.addGeometry(arch, COLORS.bridgeStone, matrix([bx, 1.3, 0], [0, 0, 0], [1, 0.5, 1]));
    arch.dispose();

    // squat abutments where the deck meets the street
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) {
        builder.add(
          box(COLORS.bridgeStone, [0.5, 1.5, 0.9], [
            bx + sx * (halfWidth - 0.25),
            LAYOUT.groundY + 0.75,
            sz * (span - 0.45),
          ]),
        );
      }
      const z = sz * (span - 2.4);
      const y = heightAt(bx, z);
      const lampX = bx - sz * (halfWidth - 0.45);
      builder.addAll([
        cyl(COLORS.lampPole, [0.08, 0.13], 3.4, [lampX, y + 1.7, z], [0, 0, 0], 8),
        cyl(COLORS.lampPole, [0.22, 0.3], 0.4, [lampX, y + 0.2, z], [0, 0, 0], 8),
      ]);
      glow.add(box(COLORS.lampGlass, [0.3, 0.44, 0.3], [lampX, y + 3.62, z]));
      builder.add(cone(COLORS.lampPole, 0.3, 0.32, [lampX, y + 4.02, z], [0, 0, 0], 4));
    }
  }
}

/* ------------------------------------------------------------------ houses */

type GableType = "step" | "bell" | "neck" | "spout";

function gableShape(type: GableType, width: number, roofHeight: number): THREE.Shape | null {
  const half = width / 2;
  const shape = new THREE.Shape();
  if (type === "bell") {
    shape.moveTo(-half, 0);
    shape.lineTo(-half * 0.78, roofHeight * 0.42);
    shape.lineTo(-half * 0.36, roofHeight * 0.8);
    shape.quadraticCurveTo(0, roofHeight * 1.14, half * 0.36, roofHeight * 0.8);
    shape.lineTo(half * 0.78, roofHeight * 0.42);
    shape.lineTo(half, 0);
    shape.lineTo(-half, 0);
    return shape;
  }
  if (type === "spout") {
    shape.moveTo(-half, 0);
    shape.lineTo(-half, roofHeight * 0.3);
    shape.lineTo(-half * 0.55, roofHeight * 0.55);
    shape.lineTo(0, roofHeight);
    shape.lineTo(half * 0.55, roofHeight * 0.55);
    shape.lineTo(half, roofHeight * 0.3);
    shape.lineTo(half, 0);
    shape.lineTo(-half, 0);
    return shape;
  }
  return null;
}

/**
 * One canal house, built facing +Z locally (front plane at z = 0, body growing
 * towards -Z). The caller rotates it into place.
 */
function buildHouse(
  rng: Rng,
  index: number,
  detail: boolean,
): { solid: Piece[]; glow: Piece[]; width: number } {
  const width = range(rng, 3.9, 6.6);
  const height = range(rng, 8.5, 14);
  const depth = LAYOUT.houseDepth;
  const color = chance(rng, 0.14) ? pick(rng, COLORS.houseAccent) : brickColor(index * 3 + 1);
  const roofColor = pick(rng, COLORS.roof);
  const roofHeight = width * range(rng, 0.3, 0.44);
  const gable: GableType = pick(rng, ["step", "bell", "neck", "spout"] as const);
  const solid: Piece[] = [];
  const glow: Piece[] = [];
  const zc = -depth / 2;

  solid.push(box(color, [width, height, depth], [0, height / 2, zc]));
  solid.push(box(COLORS.plinth, [width + 0.16, 1.05, depth + 0.04], [0, 0.52, zc]));

  if (detail) {
    const cols = Math.max(2, Math.round(width / 1.9));
    const margin = 0.62;
    const stepX = (width - margin * 2) / cols;
    const windowW = Math.min(1.02, stepX * 0.62);
    const windowH = 1.34;
    const floors = Math.max(1, Math.floor((height - 4.8) / 2.7));
    for (let f = 0; f < floors; f++) {
      const y = 3.6 + f * 2.7;
      for (let c = 0; c < cols; c++) {
        const x = -width / 2 + margin + stepX * (c + 0.5);
        solid.push(box(COLORS.trim, [windowW + 0.24, windowH + 0.26, 0.12], [x, y, 0.03]));
        glow.push(
          box(
            chance(rng, 0.58)
              ? chance(rng, 0.35)
                ? COLORS.windowLitAlt
                : COLORS.windowLit
              : COLORS.windowDark,
            [windowW, windowH, 0.08],
            [x, y, 0.08],
          ),
        );
        if (f === 0 && chance(rng, 0.4)) {
          solid.push(box(COLORS.boatWood, [windowW + 0.12, 0.22, 0.3], [x, y - 0.86, 0.16]));
          for (let t = 0; t < 3; t++) {
            solid.push(
              box(pick(rng, COLORS.tulip), [0.15, 0.24, 0.15], [
                x - windowW / 3 + (t * windowW) / 3,
                y - 0.66,
                0.18,
              ]),
            );
          }
        }
      }
    }

    const doorX = -width / 2 + 0.9 + rng() * Math.max(0.2, width - 2.6);
    if (chance(rng, 0.32)) {
      // a little shop on the ground floor
      const shopW = width * 0.74;
      const glass = chance(rng, 0.5) ? COLORS.windowLit : COLORS.windowLitAlt;
      solid.push(box(COLORS.trimDark, [shopW + 0.36, 2.45, 0.16], [0, 1.62, 0.04]));
      glow.push(box(glass, [shopW, 2.05, 0.1], [0, 1.62, 0.1]));
      solid.push(box(COLORS.trim, [shopW + 0.55, 0.2, 0.44], [0, 2.92, 0.17]));
      // mullions so the shop window reads as glass, not a blank panel
      solid.push(box(COLORS.trimDark, [0.08, 2.05, 0.12], [0, 1.62, 0.12]));
      solid.push(box(COLORS.trimDark, [shopW, 0.08, 0.12], [0, 2.2, 0.12]));
      solid.push(box(COLORS.trimDark, [0.06, 2.05, 0.12], [shopW * 0.34, 1.62, 0.12]));
      solid.push(box(COLORS.trimDark, [0.06, 2.05, 0.12], [-shopW * 0.34, 1.62, 0.12]));
      solid.push(box(shade(color, 0.8), [shopW + 0.7, 0.1, 1.0], [0, 3.12, 0.45], [0.17, 0, 0]));
      solid.push(box(COLORS.metalDark, [0.06, 0.06, 0.75], [width * 0.3, 3.6, 0.38]));
      solid.push(box(pick(rng, COLORS.flag), [0.09, 0.52, 0.52], [width * 0.3, 3.2, 0.68]));
      // a couple of crates by the door
      solid.push(box(shade(COLORS.boatWood, 0.95), [0.5, 0.4, 0.45], [doorX + 0.4, 0.2, 0.42]));
    } else {
      solid.push(box(pick(rng, COLORS.door), [1.18, 2.5, 0.18], [doorX, 1.25, 0.05]));
      solid.push(box(COLORS.trim, [1.5, 0.18, 0.22], [doorX, 2.6, 0.06]));
      solid.push(box(COLORS.trim, [0.16, 2.5, 0.2], [doorX - 0.66, 1.25, 0.05]));
      solid.push(box(COLORS.trim, [0.16, 2.5, 0.2], [doorX + 0.66, 1.25, 0.05]));
      solid.push(box(COLORS.pavement, [1.6, 0.2, 0.8], [doorX, LAYOUT.groundY - 0.02, 0.32]));
      glow.push(
        box(chance(rng, 0.65) ? COLORS.windowLit : COLORS.windowDark, [0.6, 0.46, 0.08], [doorX, 3.05, 0.09]),
      );
      if (chance(rng, 0.22)) {
        const awning = pick(rng, [0x9c3a34, 0x2f5d57, 0xd8b45c, 0x3a4f7a]);
        solid.push(box(awning, [width * 0.82, 0.12, 1.5], [0, 3.8, 0.75], [0.24, 0, 0]));
        solid.push(box(COLORS.metalDark, [width * 0.82, 0.1, 0.1], [0, 3.56, 1.45]));
      }
    }

    // sills, muntins, the odd pair of shutters and a floor band per storey
    for (let f = 0; f < floors; f++) {
      const y = 3.6 + f * 2.7;
      for (let c = 0; c < cols; c++) {
        const x = -width / 2 + margin + stepX * (c + 0.5);
        solid.push(box(COLORS.trim, [windowW + 0.34, 0.09, 0.22], [x, y - windowH / 2 - 0.09, 0.08]));
        solid.push(box(COLORS.trim, [0.055, windowH, 0.13], [x, y, 0.11]));
        if (chance(rng, 0.55)) {
          solid.push(box(COLORS.trim, [windowW, 0.055, 0.13], [x, y + windowH * 0.18, 0.11]));
        }
        if (chance(rng, 0.16)) {
          const shutter = shade(pick(rng, COLORS.door), 1.15);
          solid.push(box(shutter, [windowW * 0.42, windowH, 0.06], [x - windowW * 0.76, y, 0.08]));
          solid.push(box(shutter, [windowW * 0.42, windowH, 0.06], [x + windowW * 0.76, y, 0.08]));
        }
      }
      solid.push(box(shade(color, 1.07), [width + 0.08, 0.1, 0.16], [0, y + 1.45, 0.05]));
    }

    // wall anchors, drainpipe and cornice: the small stuff that sells a facade
    for (let a = 0; a < 3; a++) {
      solid.push(box(COLORS.trimDark, [0.16, 0.16, 0.07], [-width / 2 + 0.34, 4.6 + a * 2.2, 0.06]));
      solid.push(box(COLORS.trimDark, [0.16, 0.16, 0.07], [width / 2 - 0.34, 4.6 + a * 2.2, 0.06]));
    }
    solid.push(
      cyl(COLORS.trimDark, [0.075, 0.075], height - 0.3, [width / 2 - 0.2, (height - 0.3) / 2, 0.14], [0, 0, 0], 6),
    );
    solid.push(box(shade(color, 1.12), [width + 0.12, 0.22, 0.28], [0, height - 0.14, 0.02]));
  }

  // gable
  const gableBase: Piece[] = [];
  if (gable === "step") {
    for (let s = 0; s < 3; s++) {
      const w = width * (1 - 0.24 * (s + 1));
      gableBase.push(box(color, [w, 0.72, 0.62], [0, 0.36 + s * 0.72, -0.31]));
    }
  } else if (gable === "neck") {
    gableBase.push(box(color, [width * 0.6, 1.5, 0.62], [0, 0.75, -0.31]));
    gableBase.push(box(color, [width * 0.42, 0.55, 0.62], [0, 1.75, -0.31]));
  } else {
    const shape = gableShape(gable, width, roofHeight);
    if (shape) gableBase.push(shapePiece(color, shape, 0.62, [0, 0, -0.62]));
  }
  solid.push(...place(gableBase, matrix([0, height, 0])));

  // pitched roof, chimney and the hoisting beam
  const slope = Math.atan2(roofHeight, width / 2);
  const slopeLen = Math.hypot(width / 2, roofHeight) + 0.28;
  for (const sx of [-1, 1]) {
    solid.push(
      box(
        roofColor,
        [slopeLen, 0.22, depth + 0.5],
        [sx * (width / 4 + 0.04), height + roofHeight / 2, zc - 0.15],
        [0, 0, -sx * slope],
      ),
    );
  }
  solid.push(box(roofColor, [0.34, 0.32, depth + 0.5], [0, height + roofHeight + 0.05, zc - 0.15]));
  solid.push(box(shade(color, 0.8), [0.56, 1.1, 0.56], [width * 0.22, height + roofHeight * 0.72, -depth * 0.72]));
  solid.push(box(COLORS.trimDark, [0.18, 0.18, 0.95], [0, height + roofHeight - 0.35, 0.42]));
  solid.push(cyl(COLORS.trimDark, [0.05, 0.08], 0.34, [0, height + roofHeight - 0.9, 0.78], [0, 0, 0], 6));

  return { solid, glow, width };
}

function buildHouseRow(
  solid: MeshBuilder,
  glow: MeshBuilder,
  rng: Rng,
  side: 1 | -1,
  detailFrom: number,
  detailTo: number,
): void {
  let x = -LAYOUT.worldX - 6;
  let index = 0;
  while (x < LAYOUT.worldX + 6) {
    const detail = x > detailFrom && x < detailTo;
    const house = buildHouse(rng, index++, detail);
    const centerX = x + house.width / 2;
    const inBridgeGap = LAYOUT.bridges.some((bx) => Math.abs(centerX - bx) < LAYOUT.bridgeGap);
    if (!inBridgeGap) {
      const base = matrix([centerX, 0, side * LAYOUT.facadeZ], [0, side > 0 ? Math.PI : 0, 0]);
      solid.addAll(place(house.solid, base));
      glow.addAll(place(house.glow, base));
    }
    x = centerX + house.width / 2 + range(rng, 0.05, 0.4);
  }
}

/* ----------------------------------------------------------------- skyline */

function buildSkyline(solid: MeshBuilder, rng: Rng): THREE.Object3D {
  for (const side of [1, -1] as const) {
    let x = -LAYOUT.worldX - 24;
    while (x < LAYOUT.worldX + 24) {
      const w = range(rng, 6, 13);
      const h = range(rng, 9, 17);
      const d = range(rng, 8, 14);
      const z = side * (LAYOUT.facadeZ + LAYOUT.houseDepth + range(rng, 6, 26));
      solid.addAll([
        box(shade(brickColor(Math.round(x)), 0.62), [w, h, d], [x + w / 2, h / 2, z]),
        cone(
          shade(COLORS.roof[0], 0.7),
          w * 0.58,
          w * 0.4,
          [x + w / 2, h + w * 0.2, z],
          [0, 0, Math.PI / 4],
          4,
        ),
      ]);
      x += w + range(rng, 2, 10);
    }
  }

  // church tower closing the view down the canal
  const tx = 64;
  const tz = LAYOUT.facadeZ + 30;
  solid.addAll([
    box(shade(brickColor(7), 0.72), [6, 20, 6], [tx, 10, tz]),
    box(shade(COLORS.trim, 0.85), [6.6, 0.7, 6.6], [tx, 20.2, tz]),
    cyl(shade(brickColor(7), 0.74), [2.6, 3.2], 5, [tx, 23, tz], [0, 0, 0], 8),
    cone(shade(COLORS.trim, 0.92), 3.3, 7.5, [tx, 29.2, tz], [0, 0, Math.PI / 4], 4),
    cyl(COLORS.lampGlass, [0.07, 0.07], 2.4, [tx, 33.4, tz], [0, 0, 0], 6),
    box(shade(COLORS.trim, 1.1), [0.4, 2.4, 2.4], [tx, 16, tz - 3.2]),
  ]);

  // windmill, blades animated
  const wx = -104;
  const wz = LAYOUT.facadeZ + 34;
  solid.addAll([
    cyl(shade(brickColor(2), 0.78), [2.6, 4.2], 11, [wx, 5.5, wz], [0, 0, 0], 10),
    cyl(shade(COLORS.trim, 0.8), [2.75, 2.75], 0.8, [wx, 11.3, wz], [0, 0, 0], 10),
    cone(shade(COLORS.roof[1], 0.8), 3.2, 3.4, [wx, 13.4, wz], [0, 0, 0], 10),
    box(shade(COLORS.boatTrim, 0.85), [3.4, 1.1, 0.3], [wx, 11.9, wz - 2.3]),
  ]);

  const sailBuilder = new MeshBuilder();
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    sailBuilder.addAll(
      place(
        [
          box(shade(COLORS.boatWood, 0.95), [0.34, 6.6, 0.16], [0, 3.3, 0]),
          box(shade(COLORS.boatTrim, 0.9), [1.5, 5.4, 0.1], [0.85, 4, 0]),
        ],
        matrix([0, 0, 0], [0, 0, angle]),
      ),
    );
  }
  const blades = new THREE.Group();
  const sails = new THREE.Mesh(
    sailBuilder.build(),
    new MeshStandardNodeMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }),
  );
  blades.add(sails);
  blades.position.set(wx, 13.6, wz - 3.6);
  blades.rotation.z = 0.4;
  return blades;
}

/* ------------------------------------------------------------------- props */

function treePieces(rng: Rng, at: Vec3): Piece[] {
  const h = range(rng, 2.7, 3.7);
  const foliage = pick(rng, COLORS.foliage);
  const crown: Vec3 = [at[0], at[1] + h + 0.35, at[2]];
  return [
    cyl(COLORS.trunk, [0.13, 0.2], h + 0.6, [at[0], at[1] + (h + 0.6) / 2, at[2]], [0, 0, 0], 6),
    {
      geometry: icoGeo(1.05, 0),
      color: foliage,
      transform: matrix(crown, [range(rng, 0, 1), range(rng, 0, 1), range(rng, 0, 1)], [
        1,
        range(rng, 0.85, 1.1),
        1,
      ]),
    },
    {
      geometry: icoGeo(0.72, 0),
      color: shade(foliage, 0.88),
      transform: matrix(
        [crown[0] + range(rng, -0.5, 0.5), crown[1] + range(rng, 0.35, 0.75), crown[2] + range(rng, -0.4, 0.4)],
        [range(rng, 0, 1), range(rng, 0, 1), range(rng, 0, 1)],
        [1, 1, 1],
      ),
    },
  ];
}

function lampPieces(at: Vec3): { solid: Piece[]; glow: Piece[] } {
  const h = 4.3;
  return {
    solid: [
      cyl(COLORS.lampPole, [0.22, 0.3], 0.55, [at[0], at[1] + 0.27, at[2]], [0, 0, 0], 8),
      cyl(COLORS.lampPole, [0.09, 0.13], h, [at[0], at[1] + h / 2 + 0.4, at[2]], [0, 0, 0], 8),
      box(COLORS.lampPole, [0.5, 0.14, 0.5], [at[0], at[1] + h + 0.47, at[2]]),
      cone(COLORS.lampPole, 0.36, 0.34, [at[0], at[1] + h + 1.2, at[2]], [0, 0, 0], 4),
    ],
    glow: [box(COLORS.lampGlass, [0.34, 0.5, 0.34], [at[0], at[1] + h + 0.79, at[2]])],
  };
}

/** Cheap parked bike, facing +X with the tyres on y = 0. */
function parkedBikePieces(rng: Rng): Piece[] {
  const frame = chance(rng, 0.5) ? COLORS.bikeFrame : pick(rng, COLORS.brick);
  return [
    torus(COLORS.tire, 0.33, 0.035, [-0.52, 0.33, 0]),
    torus(COLORS.tire, 0.33, 0.035, [0.52, 0.33, 0]),
    cyl(COLORS.rim, [0.04, 0.04], 0.16, [-0.52, 0.33, 0], [0, 0, Math.PI / 2], 6),
    cyl(COLORS.rim, [0.04, 0.04], 0.16, [0.52, 0.33, 0], [0, 0, Math.PI / 2], 6),
    cyl(frame, [0.035, 0.035], 0.95, [0.02, 0.62, 0], [0, 0, 0.42], 6),
    cyl(frame, [0.035, 0.035], 0.85, [0.18, 0.6, 0], [0, 0, -0.55], 6),
    cyl(frame, [0.035, 0.035], 0.62, [-0.16, 0.75, 0], [0, 0, 1.15], 6),
    cyl(frame, [0.032, 0.032], 0.5, [0.47, 0.62, 0], [0, 0, 0.3], 6),
    cyl(COLORS.metalDark, [0.025, 0.025], 0.52, [0.44, 1.0, 0], [Math.PI / 2, 0, 0], 6),
    box(COLORS.trimDark, [0.3, 0.09, 0.16], [-0.24, 1.02, 0]),
    box(shade(frame, 0.8), [0.44, 0.06, 0.3], [-0.5, 0.72, 0]),
  ];
}

function benchPieces(at: Vec3, rotY: number): Piece[] {
  return place(
    [
      box(COLORS.bench, [1.9, 0.1, 0.5], [0, 0.45, 0]),
      box(COLORS.bench, [1.9, 0.5, 0.1], [0, 0.72, -0.22]),
      box(COLORS.metalDark, [0.12, 0.5, 0.5], [-0.8, 0.25, 0]),
      box(COLORS.metalDark, [0.12, 0.5, 0.5], [0.8, 0.25, 0]),
    ],
    matrix(at, [0, rotY, 0]),
  );
}

function buildProps(
  solid: MeshBuilder,
  glow: MeshBuilder,
  nature: MeshBuilder,
  colliders: Collider[],
  rng: Rng,
): void {
  const g = LAYOUT.groundY;
  const nearBridge = (x: number, pad: number = LAYOUT.bridgeGap + 1) =>
    LAYOUT.bridges.some((bx) => Math.abs(x - bx) < pad);

  for (const side of [1, -1] as const) {
    // trees on the pavement in front of the houses
    for (let x = -LAYOUT.worldX + 8; x < LAYOUT.worldX - 6; x += range(rng, 11, 17)) {
      if (nearBridge(x)) continue;
      const z = side * (LAYOUT.facadeZ - 1.5);
      nature.addAll(treePieces(rng, [x, g, z]));
      colliders.push({ x, z, r: 0.55 });
      if (chance(rng, 0.3)) {
        const bx = x + 3.4;
        const bz = z - side * 0.5;
        solid.addAll(benchPieces([bx, g, bz], side > 0 ? Math.PI : 0));
        colliders.push({ x: bx, z: bz, r: 0.9 });
      }
    }

    // street lamps on the canal-side pavement
    for (let x = -LAYOUT.worldX + 14; x < LAYOUT.worldX - 6; x += range(rng, 15, 22)) {
      if (nearBridge(x, 4)) continue;
      const z = side * (LAYOUT.canalHalf + 1.1);
      const lamp = lampPieces([x, g, z]);
      solid.addAll(lamp.solid);
      glow.addAll(lamp.glow);
      colliders.push({ x, z, r: 0.35 });
    }

    // the famous amsterdammertje bollards along the quay edge
    for (let x = -LAYOUT.worldX + 4; x < LAYOUT.worldX - 2; x += 3.4) {
      if (nearBridge(x, LAYOUT.bridgeHalfWidth + 0.8)) continue;
      const z = side * (LAYOUT.canalHalf + 0.42);
      solid.addAll([
        cyl(COLORS.bollard, [0.11, 0.13], 0.86, [x, g + 0.43, z], [0, 0, 0], 8),
        { geometry: icoGeo(0.14, 0), color: COLORS.bollard, transform: matrix([x, g + 0.95, z]) },
      ]);
      colliders.push({ x, z, r: 0.22 });
    }

    // parked bikes leaning against the facades
    for (let cluster = 0; cluster < 12; cluster++) {
      const cx = -LAYOUT.worldX + 12 + cluster * 20 + range(rng, -4, 4);
      if (nearBridge(cx)) continue;
      const count = Math.floor(range(rng, 2, 6));
      for (let i = 0; i < count; i++) {
        const x = cx + i * 0.74;
        const z = side * (LAYOUT.facadeZ - 0.75);
        solid.addAll(place(parkedBikePieces(rng), matrix([x, g, z], [0, Math.PI / 2, 0])));
        colliders.push({ x, z, r: 0.45 });
      }
    }
  }

  // café terrace around the "about" anchor
  {
    const { x: ax, z: az } = POI_ANCHORS.about;
    const street = Math.sign(az);
    for (let i = 0; i < 3; i++) {
      const tx = ax - 2.4 + i * 2.4;
      const tz = az - street * 0.6;
      solid.addAll([
        cyl(COLORS.trim, [0.42, 0.42], 0.09, [tx, g + 0.76, tz], [0, 0, 0], 10),
        cyl(COLORS.metalDark, [0.06, 0.06], 0.74, [tx, g + 0.37, tz], [0, 0, 0], 6),
        cyl(COLORS.metalDark, [0.34, 0.34], 0.06, [tx, g + 0.03, tz], [0, 0, 0], 8),
      ]);
      for (const a of [0, Math.PI]) {
        const cx = tx + Math.sin(a) * 0.8;
        const cz = tz + Math.cos(a) * 0.8;
        solid.addAll([
          box(COLORS.bench, [0.44, 0.07, 0.44], [cx, g + 0.45, cz], [0, a, 0]),
          box(COLORS.bench, [0.44, 0.5, 0.07], [cx + Math.sin(a) * 0.25, g + 0.72, cz + Math.cos(a) * 0.25], [0, a, 0]),
          box(COLORS.metalDark, [0.07, 0.45, 0.07], [cx, g + 0.22, cz]),
        ]);
      }
      colliders.push({ x: tx, z: tz, r: 0.85 });
      if (i === 1) {
        solid.addAll([
          cyl(COLORS.trim, [0.05, 0.05], 2.5, [ax, g + 1.25, tz], [0, 0, 0], 6),
          cone(0x9c3a34, 1.7, 0.6, [ax, g + 2.6, tz], [0, 0, 0], 8),
        ]);
      }
    }
  }

  // bike shop around the "projects" anchor
  {
    const { x: px, z: pz } = POI_ANCHORS.projects;
    const street = Math.sign(pz);
    solid.addAll([
      box(pick(rng, COLORS.brick), [4.8, 4.6, 0.35], [px, g + 2.3, pz + street * 0.95]),
      box(0x2f5d57, [5.6, 0.18, 1.9], [px, g + 3.5, pz + street * 2.0], [street * 0.22, 0, 0]),
      box(COLORS.boatTrim, [4.4, 1.0, 0.12], [px, g + 2.7, pz + street * 1.18]),
      box(COLORS.metalDark, [4.8, 0.14, 0.14], [px, g + 3.3, pz + street * 3.0]),
    ]);
    colliders.push({ x: px, z: pz, r: 1.5 });
    for (let i = 0; i < 5; i++) {
      const x = px - 3.4 + i * 1.2;
      const z = pz - street * 1.5;
      solid.addAll(place(parkedBikePieces(rng), matrix([x, g, z], [0, Math.PI / 2, 0])));
      colliders.push({ x, z, r: 0.4 });
    }
  }

  // flower stall around the "made" anchor
  {
    const { x: fx, z: fz } = POI_ANCHORS.made;
    const street = Math.sign(fz);
    solid.addAll([
      box(COLORS.boatWood, [4.4, 0.9, 1.5], [fx, g + 0.45, fz - street * 0.2]),
      box(shade(COLORS.boatWood, 0.85), [4.6, 0.14, 1.7], [fx, g + 0.97, fz - street * 0.2]),
      box(0xd8b45c, [5.0, 0.14, 2.2], [fx, g + 2.7, fz - street * 0.1], [street * 0.16, 0, 0]),
    ]);
    colliders.push({ x: fx, z: fz - street * 0.2, r: 1.7 });
    for (let c = 0; c < 5; c++) {
      const x = fx - 1.7 + (c * 3.4) / 4;
      solid.addAll([
        box(shade(COLORS.boatWood, 1.05), [0.62, 0.36, 0.5], [x, g + 1.2, fz - street * 0.2]),
        box(pick(rng, COLORS.tulip), [0.56, 0.3, 0.44], [x, g + 1.5, fz - street * 0.2]),
      ]);
    }
  }

  // postbox and bench around the "contact" anchor
  {
    const { x: cx, z: cz } = POI_ANCHORS.contact;
    const street = Math.sign(cz);
    solid.addAll([
      box(0xa8322c, [0.9, 1.5, 0.6], [cx, g + 0.75, cz - street * 0.5]),
      box(shade(0xa8322c, 0.8), [1.0, 0.16, 0.7], [cx, g + 1.55, cz - street * 0.5]),
      box(COLORS.trimDark, [0.5, 0.09, 0.1], [cx, g + 1.3, cz - street * 0.78]),
      box(COLORS.trim, [0.7, 0.5, 0.06], [cx, g + 1.15, cz - street * 0.8]),
    ]);
    colliders.push({ x: cx, z: cz - street * 0.5, r: 0.7 });
    solid.addAll(benchPieces([cx + 3, g, cz - street * 0.3], street > 0 ? Math.PI : 0));
    colliders.push({ x: cx + 3, z: cz - street * 0.3, r: 0.9 });
  }

  // crates and planters for life along the street
  for (let i = 0; i < 18; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const x = range(rng, -LAYOUT.worldX + 6, LAYOUT.worldX - 6);
    if (nearBridge(x)) continue;
    const z = side * (LAYOUT.facadeZ - range(rng, 0.6, 1.6));
    if (chance(rng, 0.5)) {
      solid.add(box(shade(COLORS.boatWood, range(rng, 0.85, 1.05)), [0.7, 0.6, 0.6], [x, g + 0.3, z]));
    } else {
      solid.addAll([
        box(COLORS.plinth, [0.7, 0.5, 0.7], [x, g + 0.25, z]),
        { geometry: icoGeo(0.36, 0), color: pick(rng, COLORS.foliage), transform: matrix([x, g + 0.75, z]) },
      ]);
    }
    colliders.push({ x, z, r: 0.5 });
  }
}

/* ------------------------------------------------------------ green & extra */

function grassTuft(rng: Rng, at: Vec3, blades = 4): Piece[] {
  const pieces: Piece[] = [];
  const base = pick(rng, COLORS.grass);
  for (let i = 0; i < blades; i++) {
    const angle = range(rng, 0, Math.PI * 2);
    const height = range(rng, 0.24, 0.52);
    const width = range(rng, 0.05, 0.09);
    pieces.push(
      plane(shade(base, range(rng, 0.85, 1.15)), [width, height], [
        at[0] + Math.cos(angle) * range(rng, 0, 0.17),
        at[1],
        at[2] + Math.sin(angle) * range(rng, 0, 0.17),
      ], [range(rng, -0.1, 0.1), angle, range(rng, -0.22, 0.22)]),
    );
  }
  return pieces;
}

function bushPieces(rng: Rng, at: Vec3, scale = 1): Piece[] {
  const color = pick(rng, COLORS.foliage);
  const pieces: Piece[] = [];
  for (let i = 0; i < 3; i++) {
    pieces.push({
      geometry: icoGeo(range(rng, 0.34, 0.58) * scale, 0),
      color: shade(color, range(rng, 0.88, 1.12)),
      transform: matrix(
        [
          at[0] + range(rng, -0.42, 0.42) * scale,
          at[1] + range(rng, 0.24, 0.6) * scale,
          at[2] + range(rng, -0.42, 0.42) * scale,
        ],
        [rng(), rng(), rng()],
        [1, range(rng, 0.8, 1.1), 1],
      ),
    });
  }
  return pieces;
}

function flowerPieces(rng: Rng, at: Vec3, count = 5): Piece[] {
  const pieces: Piece[] = [];
  for (let i = 0; i < count; i++) {
    pieces.push(
      box(pick(rng, COLORS.tulip), [0.12, range(rng, 0.18, 0.32), 0.12], [
        at[0] + range(rng, -0.55, 0.55),
        at[1] + 0.1,
        at[2] + range(rng, -0.55, 0.55),
      ]),
    );
  }
  return pieces;
}

/** Grass along the quays, hedges, flower beds and greenery around the trees. */
function buildNature(nature: MeshBuilder, colliders: Collider[], rng: Rng): void {
  const g = LAYOUT.groundY;
  const nearBridge = (x: number, pad: number = LAYOUT.bridgeGap) =>
    LAYOUT.bridges.some((bx) => Math.abs(x - bx) < pad);

  for (const side of [1, -1] as const) {
    for (let x = -LAYOUT.worldX + 2; x < LAYOUT.worldX - 2; x += range(rng, 0.55, 1.2)) {
      if (nearBridge(x, 3)) continue;
      nature.addAll(
        grassTuft(rng, [x, g, side * (LAYOUT.canalHalf + range(rng, 0.7, 1.45))], Math.floor(range(rng, 3, 7))),
      );
      if (chance(rng, 0.7)) {
        nature.addAll(
          grassTuft(rng, [x, g, side * (LAYOUT.facadeZ - range(rng, 0.2, 0.6))], Math.floor(range(rng, 2, 5))),
        );
      }
    }

    for (let x = -LAYOUT.worldX + 10; x < LAYOUT.worldX - 10; x += range(rng, 24, 38)) {
      if (nearBridge(x, 8)) continue;
      const z = side * (LAYOUT.canalHalf + 1.75);
      if (chance(rng, 0.5)) {
        nature.addAll(bushPieces(rng, [x, g, z], 1.15));
        colliders.push({ x, z, r: 0.7 });
      } else {
        nature.addAll([
          box(COLORS.boatWood, [1.5, 0.5, 0.8], [x, g + 0.25, z]),
          ...flowerPieces(rng, [x, g + 0.5, z], 6),
        ]);
        colliders.push({ x, z, r: 0.9 });
      }
    }

    for (let x = -LAYOUT.worldX + 8; x < LAYOUT.worldX - 6; x += range(rng, 11, 17)) {
      if (nearBridge(x)) continue;
      const z = side * (LAYOUT.facadeZ - 1.5);
      nature.addAll([
        ...grassTuft(rng, [x + 0.55, g, z + 0.45], 4),
        ...grassTuft(rng, [x - 0.45, g, z - 0.55], 3),
        ...flowerPieces(rng, [x, g, z], 3),
      ]);
    }
  }
}

/** Bunting strung across the street and washing lines across the canal. */
function buildBunting(solid: MeshBuilder, rng: Rng): void {
  for (let x = -LAYOUT.worldX + 24; x < LAYOUT.worldX - 24; x += range(rng, 26, 44)) {
    const top = 5.7;
    const z0 = LAYOUT.roadInner - 0.6;
    const z1 = LAYOUT.facadeZ - 0.6;
    const segments = 14;
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const sag = (t: number) => top - Math.sin(t * Math.PI) * 0.85;
      const y0 = sag(t0);
      const y1 = sag(t1);
      const za = z0 + (z1 - z0) * t0;
      const zb = z0 + (z1 - z0) * t1;
      const dy = y1 - y0;
      const dz = zb - za;
      solid.add(
        box(COLORS.trimDark, [0.05, 0.05, Math.hypot(dy, dz)], [x, (y0 + y1) / 2, (za + zb) / 2], [
          Math.atan2(-dy, dz),
          0,
          0,
        ]),
      );
      if (i % 2 === 0) {
        solid.add({
          geometry: planeGeo(0.32, 0.44),
          color: pick(rng, COLORS.flag),
          transform: matrix([x, (y0 + y1) / 2 - 0.44, (za + zb) / 2], [0, range(rng, -0.2, 0.2), 0]),
        });
      }
    }
  }
}

function buildLaundry(solid: MeshBuilder, rng: Rng): void {
  const washing = [0xf2ebdd, 0x8fb6d8, 0xe0a4a4, 0xd8e0c0, 0xf0c94c, 0xb8a8d8, 0xfaf3e6];
  for (const x of [-98, -64, -12, 26, 74, 112]) {
    const top = 10;
    const depth = LAYOUT.facadeZ - 0.5;
    const segments = 16;
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const sag = (t: number) => top - Math.sin(t * Math.PI) * 1.5;
      const y0 = sag(t0);
      const y1 = sag(t1);
      const za = depth - 2 * depth * t0;
      const zb = depth - 2 * depth * t1;
      const dy = y1 - y0;
      const dz = zb - za;
      solid.add(
        box(COLORS.trimDark, [0.05, 0.05, Math.hypot(dy, dz)], [x, (y0 + y1) / 2, (za + zb) / 2], [
          Math.atan2(-dy, dz),
          0,
          0,
        ]),
      );
      if (i % 2 === 1) {
        solid.add(
          box(pick(rng, washing), [range(rng, 0.5, 0.95), range(rng, 0.7, 1.25), 0.05], [
            x,
            (y0 + y1) / 2 - range(rng, 0.4, 0.65),
            (za + zb) / 2,
          ]),
        );
      }
    }
  }
}

/** Street clutter: potted plants, crates, stacked tiles, A-frame signs. */
function buildClutter(
  solid: MeshBuilder,
  nature: MeshBuilder,
  colliders: Collider[],
  rng: Rng,
): void {
  const g = LAYOUT.groundY;
  for (const side of [1, -1] as const) {
    for (let i = 0; i < 30; i++) {
      const x = range(rng, -LAYOUT.worldX + 8, LAYOUT.worldX - 8);
      if (LAYOUT.bridges.some((bx) => Math.abs(x - bx) < LAYOUT.bridgeGap + 2)) continue;
      const z = side * (LAYOUT.facadeZ - range(rng, 0.5, 1.7));
      const kind = Math.floor(range(rng, 0, 4));
      if (kind === 0) {
        solid.add(cone(0x9c5a41, 0.34, 0.46, [x, g + 0.23, z], [0, 0, 0], 8));
        nature.addAll(bushPieces(rng, [x, g + 0.45, z], 0.6));
        colliders.push({ x, z, r: 0.45 });
      } else if (kind === 1) {
        solid.addAll([
          box(shade(COLORS.boatWood, 0.95), [0.62, 0.5, 0.52], [x, g + 0.25, z], [0, range(rng, -0.3, 0.3), 0]),
          box(shade(COLORS.boatWood, 1.12), [0.52, 0.42, 0.44], [x + 0.12, g + 0.7, z + 0.06], [
            0,
            range(rng, -0.4, 0.4),
            0,
          ]),
        ]);
        colliders.push({ x, z, r: 0.55 });
      } else if (kind === 2) {
        // a stack of paving stones waiting for a repair
        for (let s = 0; s < 3; s++) {
          solid.add(
            box(shade(COLORS.pavement, range(rng, 0.9, 1.05)), [0.9, 0.14, 0.6], [
              x + range(rng, -0.1, 0.1),
              g + 0.07 + s * 0.15,
              z,
            ], [0, range(rng, -0.2, 0.2), 0]),
          );
        }
        colliders.push({ x, z, r: 0.7 });
      } else {
        solid.addAll([
          box(pick(rng, [0xe0544f, 0x2f6b62, 0x3f7fbe]), [0.62, 0.85, 0.05], [x - 0.18, g + 0.85, z], [0, 0, 0.22]),
          box(pick(rng, COLORS.flag), [0.62, 0.85, 0.05], [x + 0.18, g + 0.85, z], [0, 0, -0.22]),
        ]);
        colliders.push({ x, z, r: 0.5 });
      }
    }
  }
}

export type Flyer = {
  group: THREE.Group;
  cx: number;
  cz: number;
  radius: number;
  height: number;
  speed: number;
  phase: number;
  wings: THREE.Object3D[];
};

/** Bike racks with bikes, bins, signs, cellar hatches, mooring rings and gulls. */
function buildFurniture(
  solid: MeshBuilder,
  nature: MeshBuilder,
  colliders: Collider[],
  rng: Rng,
): Flyer[] {
  const g = LAYOUT.groundY;
  const flyers: Flyer[] = [];
  const rackSide = (x: number) => LAYOUT.bridges.some((bx) => Math.abs(x - bx) < LAYOUT.bridgeGap + 1);

  for (const side of [1, -1] as const) {
    // fietsenrek: metal hoops with bikes leaning on them
    for (let r = 0; r < 9; r++) {
      const x = -LAYOUT.worldX + 18 + r * 28 + range(rng, -6, 6);
      if (rackSide(x)) continue;
      const z = side * (LAYOUT.facadeZ - 1.05);
      const hoops = 5;
      for (let i = 0; i < hoops; i++) {
        const hx = x + i * 0.66;
        solid.addAll([
          cyl(COLORS.metalDark, [0.03, 0.03], 0.52, [hx - 0.3, g + 0.26, z], [0, 0, 0], 6),
          cyl(COLORS.metalDark, [0.03, 0.03], 0.52, [hx + 0.3, g + 0.26, z], [0, 0, 0], 6),
          box(COLORS.metalDark, [0.66, 0.06, 0.06], [hx, g + 0.53, z]),
        ]);
      }
      colliders.push({ x: x + hoops * 0.33, z, r: 1.5 });
      for (let i = 0; i < 3; i++) {
        if (!chance(rng, 0.8)) continue;
        solid.addAll(
          place(
            parkedBikePieces(rng),
            matrix([x + i * 1.3, g, z + range(rng, -0.45, 0.45)], [0, Math.PI / 2 + range(rng, -0.25, 0.25), 0]),
          ),
        );
      }
    }

    // cellar hatches in the pavement, very Amsterdam
    for (let i = 0; i < 10; i++) {
      const x = range(rng, -LAYOUT.worldX + 10, LAYOUT.worldX - 10);
      if (rackSide(x)) continue;
      solid.add(box(0x6b6f72, [1.15, 0.05, 0.95], [x, g + 0.03, side * (LAYOUT.facadeZ - 1.05)]));
    }

    // bins, signs and lamp bollards along the quay edge
    for (let i = 0; i < 12; i++) {
      const x = range(rng, -LAYOUT.worldX + 12, LAYOUT.worldX - 12);
      if (rackSide(x)) continue;
      const z = side * (LAYOUT.canalHalf + 1.85);
      const kind = Math.floor(range(rng, 0, 3));
      if (kind === 0) {
        solid.addAll([
          cyl(COLORS.metalDark, [0.3, 0.26], 0.85, [x, g + 0.43, z], [0, 0, 0], 8),
          cyl(shade(COLORS.metalDark, 1.45), [0.34, 0.34], 0.08, [x, g + 0.9, z], [0, 0, 0], 8),
        ]);
        colliders.push({ x, z, r: 0.45 });
      } else if (kind === 1) {
        // blue bicycle-path sign
        solid.addAll([
          cyl(COLORS.metalDark, [0.05, 0.06], 2.3, [x, g + 1.15, z], [0, 0, 0], 6),
          cyl(0x2f6fb0, [0.32, 0.32], 0.05, [x, g + 2.2, z], [0, 0, Math.PI / 2], 14),
          box(0xf2ebdd, [0.03, 0.05, 0.3], [x + 0.04, g + 2.16, z]),
          box(0xf2ebdd, [0.03, 0.16, 0.14], [x + 0.04, g + 2.24, z], [0, 0, -0.3]),
        ]);
        colliders.push({ x, z, r: 0.3 });
      } else {
        // stacked planters
        nature.addAll([
          ...bushPieces(rng, [x, g + 0.3, z], 0.7),
          box(COLORS.boatWood, [0.8, 0.3, 0.5], [x, g + 0.15, z]),
        ]);
        colliders.push({ x, z, r: 0.5 });
      }
    }

    // mooring rings on the canal wall
    for (let x = -LAYOUT.worldX + 6; x < LAYOUT.worldX - 4; x += 7) {
      solid.add({
        geometry: new THREE.TorusGeometry(0.15, 0.032, 5, 10),
        color: COLORS.metalDark,
        transform: matrix([x, -0.3, side * (LAYOUT.canalHalf - 0.06)]),
      });
    }
  }

  // gulls circling over the canal
  const gullBody = new THREE.SphereGeometry(0.12, 8, 6);
  const gullWing = new THREE.BoxGeometry(0.06, 0.02, 0.62);
  const gullMaterial = new MeshStandardNodeMaterial({ color: 0xf4f2ee, flatShading: true, roughness: 0.75 });
  const gullDark = new MeshStandardNodeMaterial({ color: 0x3b3f44, flatShading: true, roughness: 0.7 });
  for (let i = 0; i < 5; i++) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(gullBody, gullMaterial);
    body.scale.set(2.1, 0.8, 0.8);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), gullMaterial);
    head.position.set(0.22, 0.05, 0);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 5), gullDark);
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(0.34, 0.04, 0);
    const wings: THREE.Object3D[] = [];
    for (const sign of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.04, sign * 0.08);
      const wing = new THREE.Mesh(gullWing, gullMaterial);
      wing.position.z = sign * 0.3;
      pivot.add(wing);
      group.add(pivot);
      wings.push(pivot);
    }
    group.add(body, head, beak);
    group.castShadow = true;
    const cx = range(rng, -70, 70);
    const cz = range(rng, -3, 3);
    group.position.set(cx, 12, cz);
    flyers.push({
      group,
      cx,
      cz,
      radius: range(rng, 8, 20),
      height: range(rng, 10, 16),
      speed: range(rng, 0.22, 0.4) * (chance(rng, 0.5) ? 1 : -1),
      phase: rng() * Math.PI * 2,
      wings,
    });
  }

  return flyers;
}

/** Tulip bundles hidden around the city, one per spot. */
function buildCollectibles(root: THREE.Group, rng: Rng): Collectible[] {
  const spots: [number, number][] = [
    [-104, 9.6], [-86, -12.6], [-64, -10.4], [-46, 14.4], [-26, 10.6], [-8, -9.4],
    [10, 12.4], [26, -12.4], [44, 9.4], [62, 14.4], [82, -10.6], [100, 12.6],
    [-14, 6.95], [70, -6.95],
  ];
  const collectibles: Collectible[] = [];
  spots.forEach(([x, z], index) => {
    const group = new THREE.Group();
    const stemColor = 0x5f9a4a;
    const petal = pick(rng, COLORS.tulip);
    const body = new MeshBuilder();
    body.addAll([
      cyl(stemColor, [0.03, 0.04], 0.62, [0, 0.31, 0], [0, 0, 0], 5),
      box(shade(stemColor, 0.9), [0.26, 0.05, 0.1], [0.1, 0.34, 0], [0, 0, 0.4]),
      box(petal, [0.17, 0.3, 0.17], [0, 0.78, 0]),
      box(shade(petal, 1.15), [0.2, 0.16, 0.2], [0, 0.94, 0]),
      box(shade(petal, 0.85), [0.3, 0.1, 0.1], [0, 1.02, 0], [0, 0.7, 0]),
    ]);
    const mesh = new THREE.Mesh(
      body.build(),
      new MeshStandardNodeMaterial({ vertexColors: true, flatShading: true, roughness: 0.7 }),
    );
    mesh.castShadow = true;
    const glow = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.05, 5, 20),
      new MeshBasicNodeMaterial({ color: shade(petal, 1.25) }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.06;
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16, 0),
      new MeshBasicNodeMaterial({ color: shade(petal, 1.2) }),
    );
    diamond.position.y = 1.5;
    group.add(mesh, glow, diamond);
    group.position.set(x, heightAt(x, z) + 0.05, z);
    root.add(group);
    collectibles.push({ id: index, x, z, group, taken: false });
  });
  return collectibles;
}

/** A small market square with striped stalls. */
function buildMarket(
  solid: MeshBuilder,
  glow: MeshBuilder,
  nature: MeshBuilder,
  colliders: Collider[],
  rng: Rng,
): void {
  const mx = -72;
  const g = LAYOUT.groundY;
  for (let i = 0; i < 4; i++) {
    const x = mx + i * 5.4;
    const z = LAYOUT.canalHalf + 4.4;
    const stripe = pick(rng, [0xe0544f, 0x3f7fbe, 0xf0c94c, 0x2f6b62]);
    solid.addAll([
      box(COLORS.boatWood, [3.4, 0.9, 1.6], [x, g + 0.45, z]),
      box(shade(COLORS.boatWood, 1.1), [3.6, 0.12, 1.8], [x, g + 0.96, z]),
      box(stripe, [3.9, 0.14, 2.0], [x, g + 2.5, z + 0.2], [0.14, 0, 0]),
      box(COLORS.metalDark, [3.9, 0.08, 0.08], [x, g + 2.64, z + 1.05]),
      cyl(COLORS.metalDark, [0.05, 0.05], 2.1, [x - 1.75, g + 1.6, z + 0.95], [0, 0, 0], 6),
      cyl(COLORS.metalDark, [0.05, 0.05], 2.1, [x + 1.75, g + 1.6, z + 0.95], [0, 0, 0], 6),
    ]);
    colliders.push({ x, z, r: 1.7 });
    for (let c = 0; c < 3; c++) {
      const cx = x - 1.1 + c * 1.1;
      solid.addAll([
        box(COLORS.boatWood, [0.85, 0.3, 0.7], [cx, g + 1.15, z]),
        box(pick(rng, COLORS.tulip), [0.78, 0.22, 0.62], [cx, g + 1.4, z]),
      ]);
    }
    glow.add(box(COLORS.lampGlass, [1.3, 0.09, 0.09], [x, g + 2.34, z + 1.05]));
  }
  nature.addAll(bushPieces(rng, [mx - 4, g, LAYOUT.canalHalf + 3.2], 1.3));
  nature.addAll(bushPieces(rng, [mx + 20, g, LAYOUT.canalHalf + 3.2], 1.3));
}

const GLYPHS: Record<string, string[]> = {
  N: ["10001", "10001", "11001", "10101", "10011", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00000", "00100"],
};

/** Chunky block letters standing on the quay, the way every portfolio world has them. */
function buildLetters(
  solid: MeshBuilder,
  colliders: Collider[],
  text: string,
  at: Vec3,
  cell: number,
  depth: number,
  rotY: number,
  rng: Rng,
): void {
  const palette = [COLORS.bikeFrameAlt, COLORS.jacket, 0x3f7fbe, COLORS.bikeFrame, COLORS.trim];
  const rows = 7;
  const cols = 5;
  let cursor = 0;
  let index = 0;
  for (const char of text) {
    const glyph = GLYPHS[char];
    if (glyph) {
      const color = palette[index++ % palette.length];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (glyph[r][c] !== "1") continue;
          const along = (cursor * (cols + 1) + c) * cell + cell / 2;
          const up = (rows - r - 1) * cell + cell / 2;
          solid.add(
            box(shade(color, range(rng, 0.96, 1.04)), [cell, cell, depth], [
              at[0] + Math.cos(rotY) * along,
              at[1] + up,
              at[2] - Math.sin(rotY) * along,
            ], [0, rotY, 0]),
          );
        }
      }
    }
    cursor += 1;
  }
  const width = cursor * (cols + 1) * cell;
  for (let along = 0; along < width; along += 2.4) {
    colliders.push({
      x: at[0] + Math.cos(rotY) * along,
      z: at[2] - Math.sin(rotY) * along,
      r: 1.3,
    });
  }
}

/** Materials (TSL): brick streets and walls, swaying greenery. */
export function buildMaterials(): {
  ground: MeshStandardNodeMaterial;
  walls: MeshStandardNodeMaterial;
  solid: MeshStandardNodeMaterial;
  nature: MeshStandardNodeMaterial;
  glow: MeshBasicNodeMaterial;
} {
  const ground = new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
  {
    const p = positionWorld;
    const row = floor(p.z.mul(2.6));
    const shifted = p.x.mul(2.6).add(row.mul(0.5));
    const cell = vec2(floor(shifted), row);
    const local = vec2(fract(shifted), fract(p.z.mul(2.6))).sub(0.5);
    const hash = sin(cell.x.mul(12.9898).add(cell.y.mul(78.233))).mul(43758.5453).fract();
    const edge = smoothstep(float(0.31), float(0.5), max(abs(local.x), abs(local.y)));
    const patch = sin(p.x.mul(0.07)).mul(cos(p.z.mul(0.09))).mul(0.5).add(0.5);
    const tone = hash.mul(0.3).add(0.85).mul(patch.mul(0.18).add(0.91));
    ground.colorNode = vec3(tone).mul(float(1).sub(edge.mul(0.36)));
  }

  // brick courses with mortar joints, on every wall
  const walls = new MeshStandardNodeMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.92,
    metalness: 0,
  });
  {
    const p = positionWorld;
    const course = floor(p.y.mul(4.2));
    const along = p.x.mul(1.7).add(course.mul(0.5));
    const fx = fract(along).sub(0.5);
    const fy = fract(p.y.mul(4.2)).sub(0.5);
    const joint = smoothstep(float(0.4), float(0.5), max(abs(fx), abs(fy)));
    const hash = sin(floor(along).mul(12.9898).add(course.mul(78.233))).mul(43758.5453).fract();
    const patch = sin(p.y.mul(0.6)).mul(cos(p.x.mul(0.22))).mul(0.5).add(0.5);
    const tone = hash.mul(0.16).add(0.94).mul(patch.mul(0.1).add(0.95));
    walls.colorNode = vec3(tone).mul(float(1).sub(joint.mul(0.34)));
  }

  const solid = new MeshStandardNodeMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.88,
    metalness: 0,
  });

  const nature = new MeshStandardNodeMaterial({
    vertexColors: true,
    flatShading: true,
    side: THREE.DoubleSide,
    roughness: 0.86,
    metalness: 0,
  });
  {
    const shear = clamp(positionLocal.y.sub(0.25).mul(0.6), float(0), float(1));
    const sway = sin(time.mul(1.6).add(positionLocal.x.mul(0.45)).add(positionLocal.z.mul(0.33)))
      .mul(0.075)
      .add(sin(time.mul(2.7).add(positionLocal.z.mul(0.9))).mul(0.03));
    nature.positionNode = vec3(
      positionLocal.x.add(sway.mul(shear)),
      positionLocal.y,
      positionLocal.z.add(sway.mul(shear).mul(0.7)),
    );
  }

  const glow = new MeshBasicNodeMaterial({ vertexColors: true });
  return { ground, walls, solid, nature, glow };
}

/* ------------------------------------------------------------ boats & life */

function buildHouseboat(rng: Rng): THREE.Mesh {
  const pieces: Piece[] = [];
  const hull = pick(rng, COLORS.boatHull);
  const length = range(rng, 7, 10);
  pieces.push(
    box(hull, [length, 1.3, 3.1], [0, 0, 0]),
    box(shade(hull, 1.25), [length - 1.2, 1.9, 2.5], [0, 1.4, 0]),
    box(shade(COLORS.boatTrim, 0.9), [length - 0.8, 0.16, 2.8], [0, 2.45, 0]),
    cyl(shade(hull, 0.8), [0.22, 0.26], 1.4, [length * 0.3, 3.0, 0.6], [0, 0, 0], 8),
    box(COLORS.foliage[0], [1.4, 0.4, 0.5], [-length * 0.3, 2.7, 0.9]),
    box(COLORS.boatTrim, [length - 1.6, 0.1, 0.1], [0, 0.75, 1.5]),
  );
  for (let w = 0; w < 3; w++) {
    pieces.push(
      box(chance(rng, 0.7) ? COLORS.windowLit : COLORS.windowDark, [1.0, 0.75, 0.12], [
        -length * 0.3 + w * 2.0,
        1.7,
        1.28,
      ]),
    );
  }
  pieces.push(
    ...place(parkedBikePieces(rng), matrix([length * 0.28, 2.53, -0.4], [0, 0.4, 0], [0.85, 0.85, 0.85])),
  );
  const builder = new MeshBuilder();
  builder.addAll(pieces);
  return new THREE.Mesh(
    builder.build(),
    new MeshStandardNodeMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }),
  );
}

function buildRowboat(): THREE.Mesh {
  const builder = new MeshBuilder();
  const hull = COLORS.boatHull[2];
  builder.addAll([
    box(shade(hull, 1), [2.6, 0.62, 1.25], [0, 0, 0]),
    box(shade(COLORS.boatWood, 0.9), [2.15, 0.16, 0.95], [0, 0.34, 0]),
    box(shade(COLORS.boatWood, 1.05), [0.5, 0.1, 1.0], [0.5, 0.24, 0]),
    box(shade(COLORS.boatWood, 1.05), [0.5, 0.1, 1.0], [-0.5, 0.24, 0]),
    box(shade(COLORS.boatTrim, 0.95), [0.14, 0.66, 1.3], [1.24, 0.1, 0]),
    box(shade(COLORS.boatTrim, 0.95), [0.14, 0.66, 1.3], [-1.24, 0.1, 0]),
  ]);
  return new THREE.Mesh(
    builder.build(),
    new MeshStandardNodeMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }),
  );
}

/* -------------------------------------------------------------- sky & water */

function linear(hex: number): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

function buildSky(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(600, 32, 20);
  const material = new MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  const dir = normalize(positionLocal);
  const base = mix(
    vec3(...linear(COLORS.skyHorizon)),
    vec3(...linear(COLORS.skyZenith)),
    smoothstep(float(-0.03), float(0.55), dir.y),
  );
  const sunDir = vec3(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z);
  const sd = max(dot(dir, sunDir), float(0));
  const glow = pow(sd, float(26)).mul(0.85).add(pow(sd, float(5)).mul(0.3));
  material.colorNode = base.add(vec3(...linear(COLORS.sun)).mul(glow));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

function buildWater(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(LAYOUT.worldX * 2 + 60, LAYOUT.canalHalf * 2 + 6, 220, 18);
  geometry.rotateX(-Math.PI / 2);
  const material = new MeshBasicNodeMaterial();
  const p = positionWorld;
  const t = time;

  const w1 = sin(p.x.mul(0.42).add(t.mul(0.9)));
  const w2 = sin(p.z.mul(1.25).sub(t.mul(1.15)));
  const w3 = sin(p.x.mul(1.7).add(p.z.mul(0.9)).add(t.mul(1.7)));
  const ripple = w1.mul(0.5).add(w2.mul(0.32)).add(w3.mul(0.18));
  const n = ripple.mul(0.5).add(0.5);

  const view = normalize(p.sub(cameraPosition));
  const upness = abs(view.y);
  const fres = pow(float(1).sub(upness), float(4.2));
  const reflected = vec3(view.x, view.y.negate(), view.z);
  const spec = pow(max(dot(normalize(reflected), vec3(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z)), float(0)), float(90));
  const glitter = spec.mul(smoothstep(float(0.45), float(0.95), n).mul(0.7).add(0.3));

  const skyRefl = mix(
    vec3(...linear(COLORS.waterSurface)),
    vec3(...linear(COLORS.skyHorizon)).mul(0.78),
    smoothstep(float(0), float(0.5), upness),
  );
  material.colorNode = mix(vec3(...linear(COLORS.waterDeep)), skyRefl, fres.mul(0.8))
    .mul(mix(float(0.74), float(1.08), n))
    .add(vec3(...linear(COLORS.sun)).mul(glitter).mul(1.8));

  material.positionNode = vec3(
    positionLocal.x,
    sin(positionLocal.x.mul(0.4).add(t.mul(0.9)))
      .mul(0.045)
      .add(sin(positionLocal.z.mul(1.1).add(t.mul(1.4))).mul(0.035)),
    positionLocal.z,
  );

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = LAYOUT.waterY;
  return mesh;
}

/* ------------------------------------------------------------------ builder */

export async function buildCity(onProgress: (label: string, value: number) => void): Promise<City> {
  const rng = makeRng(20261015);
  const root = new THREE.Group();
  const ground = new MeshBuilder();
  const walls = new MeshBuilder();
  const solid = new MeshBuilder();
  const nature = new MeshBuilder();
  const glow = new MeshBuilder();
  const colliders: Collider[] = [];
  const bobbers: { object: THREE.Object3D; phase: number; amp: number; tilt: number; speed: number }[] = [];
  const drifters: { object: THREE.Object3D; phase: number; speed: number; dir: number }[] = [];

  onProgress("quays", 0.08);
  buildQuays(ground, rng);
  await nextFrame();

  onProgress("bridges", 0.2);
  buildBridges(solid, glow);
  await nextFrame();

  onProgress("houses", 0.38);
  buildHouseRow(walls, glow, rng, 1, -98, 98);
  await nextFrame();
  buildHouseRow(walls, glow, rng, -1, -98, 98);
  await nextFrame();

  onProgress("skyline", 0.52);
  root.add(buildSkyline(solid, rng));
  await nextFrame();

  onProgress("props", 0.64);
  buildProps(solid, glow, nature, colliders, rng);
  buildMarket(solid, glow, nature, colliders, rng);
  buildClutter(solid, nature, colliders, rng);
  await nextFrame();

  onProgress("furniture", 0.69);
  const flyers = buildFurniture(solid, nature, colliders, rng);
  for (const flyer of flyers) root.add(flyer.group);
  await nextFrame();

  onProgress("green", 0.74);
  buildNature(nature, colliders, rng);
  await nextFrame();

  onProgress("secrets", 0.79);
  const collectibles = buildCollectibles(root, rng);
  await nextFrame();

  onProgress("decor", 0.82);
  buildBunting(solid, rng);
  buildLaundry(solid, rng);
  buildLetters(solid, colliders, "NIKSON", [-30, LAYOUT.groundY, -(LAYOUT.facadeZ - 1.5)], 0.38, 0.55, 0, rng);
  await nextFrame();

  onProgress("boats", 0.88);
  for (let i = 0; i < 8; i++) {
    const spot = -LAYOUT.worldX + 18 + i * range(rng, 26, 36);
    if (Math.abs(spot) > LAYOUT.worldX - 14) break;
    const side = i % 2 === 0 ? 1 : -1;
    const boat = buildHouseboat(rng);
    boat.position.set(spot, LAYOUT.waterY + 0.75, side * (LAYOUT.canalHalf - 1.6));
    boat.rotation.y = side > 0 ? 0 : Math.PI;
    root.add(boat);
    bobbers.push({
      object: boat,
      phase: rng() * Math.PI * 2,
      amp: range(rng, 0.03, 0.07),
      tilt: range(rng, 0.006, 0.02),
      speed: range(rng, 0.5, 0.9),
    });
  }
  await nextFrame();

  onProgress("boats", 0.93);
  for (let i = 0; i < 2; i++) {
    const dir = i === 0 ? 1 : -1;
    const boat = buildRowboat();
    boat.position.set(rng() * 160 - 80, LAYOUT.waterY + 0.25, (i === 0 ? 1 : -1) * 2.6);
    boat.rotation.y = dir > 0 ? 0 : Math.PI;
    root.add(boat);
    drifters.push({ object: boat, phase: rng() * Math.PI * 2, speed: range(rng, 1.4, 2.2), dir });
  }
  await nextFrame();

  onProgress("materials", 0.97);
  const materials = buildMaterials();
  const groundMesh = new THREE.Mesh(ground.build(), materials.ground);
  groundMesh.receiveShadow = true;
  const wallsMesh = new THREE.Mesh(walls.build(), materials.walls);
  wallsMesh.castShadow = true;
  wallsMesh.receiveShadow = true;
  const solidMesh = new THREE.Mesh(solid.build(), materials.solid);
  solidMesh.castShadow = true;
  solidMesh.receiveShadow = true;
  const natureMesh = new THREE.Mesh(nature.build(), materials.nature);
  natureMesh.castShadow = true;
  natureMesh.receiveShadow = true;
  const glowMesh = new THREE.Mesh(glow.build(), materials.glow);
  for (const mesh of [groundMesh, wallsMesh, solidMesh, natureMesh, glowMesh]) mesh.frustumCulled = false;
  const water = buildWater();
  const sky = buildSky();
  root.add(groundMesh, wallsMesh, solidMesh, natureMesh, glowMesh, water, sky);

  const cameraPosition = new THREE.Vector3();
  const update = (t: number, dt: number) => {
    for (const bobber of bobbers) {
      bobber.object.position.y = LAYOUT.waterY + 0.75 + Math.sin(t * bobber.speed + bobber.phase) * bobber.amp;
      bobber.object.rotation.z = Math.sin(t * bobber.speed * 0.7 + bobber.phase) * bobber.tilt;
    }
    for (const drifter of drifters) {
      drifter.object.position.x += drifter.speed * drifter.dir * dt;
      if (drifter.object.position.x > LAYOUT.worldX + 25) drifter.object.position.x = -LAYOUT.worldX - 25;
      if (drifter.object.position.x < -LAYOUT.worldX - 25) drifter.object.position.x = LAYOUT.worldX + 25;
      drifter.object.position.y = LAYOUT.waterY + 0.25 + Math.sin(t * 1.1 + drifter.phase) * 0.05;
      drifter.object.rotation.z = Math.sin(t * 0.9 + drifter.phase) * 0.04;
    }
    sky.position.copy(cameraPosition);
    for (const flyer of flyers) {
      const angle = t * flyer.speed + flyer.phase;
      flyer.group.position.set(
        flyer.cx + Math.cos(angle) * flyer.radius,
        flyer.height + Math.sin(t * 0.7 + flyer.phase) * 0.7,
        flyer.cz + Math.sin(angle) * flyer.radius,
      );
      const direction = flyer.speed >= 0 ? 1 : -1;
      flyer.group.rotation.y = Math.atan2(-Math.cos(angle) * direction, -Math.sin(angle) * direction);
      for (let i = 0; i < flyer.wings.length; i++) {
        const sign = i === 0 ? 1 : -1;
        flyer.wings[i].rotation.x = Math.sin(t * 9 + flyer.phase) * 0.5 * sign;
      }
    }
    for (const item of collectibles) {
      if (item.taken) continue;
      item.group.rotation.y = t * 1.1 + item.id;
      item.group.position.y = heightAt(item.x, item.z) + 0.05 + Math.sin(t * 2 + item.id) * 0.07;
    }
  };

  return {
    root,
    colliders,
    collectibles,
    update,
    setCamera(position: THREE.Vector3) {
      cameraPosition.copy(position);
    },
  };
}
