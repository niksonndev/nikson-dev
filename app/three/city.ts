import * as THREE from "three/webgpu";
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from "three/webgpu";
import {
  abs,
  cameraPosition,
  dot,
  float,
  max,
  mix,
  normalize,
  positionLocal,
  positionWorld,
  pow,
  sin,
  smoothstep,
  time,
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
  range,
  shade,
  shapePiece,
  torus,
  type Piece,
  type Rng,
  type Vec3,
} from "./utils";

/** Direction that points AT the sun. Shared by the sky shader, the water and the lights. */
export const SUN_DIR = new THREE.Vector3(-0.72, 0.2, -0.34).normalize();
export const SUN_COLOR = new THREE.Color(COLORS.sun);

export type City = {
  root: THREE.Group;
  colliders: Collider[];
  update(t: number, dt: number): void;
  /** keeps the sky dome centred on the camera */
  setCamera(position: THREE.Vector3): void;
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
    const arch = new THREE.CylinderGeometry(6.3, 6.3, halfWidth * 2 + 0.3, 20, 1, true, 0, Math.PI);
    arch.rotateZ(-Math.PI / 2);
    builder.addGeometry(arch, COLORS.bridgeStone, matrix([bx, LAYOUT.groundY + 2.1, 0], [0, 0, 0], [1, 0.42, 1]));
    arch.dispose();

    // pilasters framing the landing on both quays
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) {
        builder.add(
          box(
            COLORS.bridgeStone,
            [0.7, 2.7, 0.7],
            [bx + sx * (halfWidth + 0.35), LAYOUT.groundY + 1.35, sz * (span - 0.4)],
          ),
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
    solid.push(box(pick(rng, COLORS.door), [1.18, 2.5, 0.18], [doorX, 1.25, 0.05]));
    solid.push(box(COLORS.trim, [1.5, 0.18, 0.22], [doorX, 2.6, 0.06]));
    solid.push(box(COLORS.trim, [0.16, 2.5, 0.2], [doorX - 0.66, 1.25, 0.05]));
    solid.push(box(COLORS.trim, [0.16, 2.5, 0.2], [doorX + 0.66, 1.25, 0.05]));
    solid.push(box(COLORS.pavement, [1.6, 0.2, 0.8], [doorX, LAYOUT.groundY - 0.02, 0.32]));
    glow.push(box(chance(rng, 0.65) ? COLORS.windowLit : COLORS.windowDark, [0.6, 0.46, 0.08], [doorX, 3.05, 0.09]));

    if (chance(rng, 0.22)) {
      const awning = pick(rng, [0x9c3a34, 0x2f5d57, 0xd8b45c, 0x3a4f7a]);
      solid.push(box(awning, [width * 0.82, 0.12, 1.5], [0, 3.8, 0.75], [0.24, 0, 0]));
      solid.push(box(COLORS.metalDark, [width * 0.82, 0.1, 0.1], [0, 3.56, 1.45]));
    }
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

function buildProps(solid: MeshBuilder, glow: MeshBuilder, colliders: Collider[], rng: Rng): void {
  const g = LAYOUT.groundY;
  const nearBridge = (x: number, pad = LAYOUT.bridgeGap + 1) =>
    LAYOUT.bridges.some((bx) => Math.abs(x - bx) < pad);

  for (const side of [1, -1] as const) {
    // trees on the pavement in front of the houses
    for (let x = -LAYOUT.worldX + 8; x < LAYOUT.worldX - 6; x += range(rng, 11, 17)) {
      if (nearBridge(x)) continue;
      const z = side * (LAYOUT.facadeZ - 1.5);
      solid.addAll(treePieces(rng, [x, g, z]));
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
  builder.addAll([
    box(shade(COLORS.boatWood, 1), [2.6, 0.6, 1.2], [0, 0, 0]),
    box(shade(COLORS.boatTrim, 0.9), [2.2, 0.34, 1.0], [0, 0.4, 0]),
    box(shade(COLORS.boatWood, 0.85), [0.16, 0.6, 1.24], [1.2, 0.1, 0]),
    box(shade(COLORS.boatWood, 0.85), [0.16, 0.6, 1.24], [-1.2, 0.1, 0]),
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
  const solid = new MeshBuilder();
  const glow = new MeshBuilder();
  const colliders: Collider[] = [];
  const bobbers: { object: THREE.Object3D; phase: number; amp: number; tilt: number; speed: number }[] = [];
  const drifters: { object: THREE.Object3D; phase: number; speed: number; dir: number }[] = [];

  onProgress("quays", 0.1);
  buildQuays(solid, rng);
  await nextFrame();

  onProgress("bridges", 0.24);
  buildBridges(solid, glow);
  await nextFrame();

  onProgress("houses", 0.46);
  buildHouseRow(solid, glow, rng, 1, -98, 98);
  await nextFrame();
  buildHouseRow(solid, glow, rng, -1, -98, 98);
  await nextFrame();

  onProgress("skyline", 0.6);
  root.add(buildSkyline(solid, rng));
  await nextFrame();

  onProgress("props", 0.74);
  buildProps(solid, glow, colliders, rng);
  await nextFrame();

  onProgress("boats", 0.86);
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

  onProgress("boats", 0.92);
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
  const solidMesh = new THREE.Mesh(
    solid.build(),
    new MeshStandardNodeMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0 }),
  );
  const glowMesh = new THREE.Mesh(glow.build(), new MeshBasicNodeMaterial({ vertexColors: true }));
  solidMesh.frustumCulled = false;
  glowMesh.frustumCulled = false;
  const water = buildWater();
  const sky = buildSky();
  root.add(solidMesh, glowMesh, water, sky);

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
  };

  return {
    root,
    colliders,
    update,
    setCamera(position: THREE.Vector3) {
      cameraPosition.copy(position);
    },
  };
}
