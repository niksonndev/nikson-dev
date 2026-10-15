import * as THREE from "three/webgpu";

/** Deterministic PRNG so the city looks the same on every visit. */
export type Rng = () => number;

export function makeRng(seed = 20261015): Rng {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function range(rng: Rng, a: number, b: number): number {
  return a + (b - a) * rng();
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

/** Multiplies a colour's linear channels — used for subtle per-tile variation. */
export function shade(color: THREE.ColorRepresentation, factor: number): THREE.Color {
  return new THREE.Color(color as THREE.Color).multiplyScalar(factor);
}

export type Vec3 = [number, number, number];

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();

export function matrix(
  at: Vec3,
  rot: Vec3 = [0, 0, 0],
  scale: Vec3 = [1, 1, 1],
): THREE.Matrix4 {
  _pos.set(at[0], at[1], at[2]);
  _euler.set(rot[0], rot[1], rot[2]);
  _quat.setFromEuler(_euler);
  _scale.set(scale[0], scale[1], scale[2]);
  return new THREE.Matrix4().compose(_pos, _quat, _scale);
}

/** A single coloured piece of geometry, positioned by an optional transform. */
export type Piece = {
  geometry: THREE.BufferGeometry;
  color: THREE.ColorRepresentation;
  transform?: THREE.Matrix4;
};

const geoCache = new Map<string, THREE.BufferGeometry>();

function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const hit = geoCache.get(key);
  if (hit) return hit;
  const g = make();
  geoCache.set(key, g);
  return g;
}

export function boxGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  return cached(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
}

export function box(
  color: THREE.ColorRepresentation,
  size: Vec3,
  at: Vec3,
  rot: Vec3 = [0, 0, 0],
): Piece {
  return {
    geometry: boxGeo(size[0], size[1], size[2]),
    color,
    transform: matrix(at, rot),
  };
}

export function cylGeo(rTop: number, rBot: number, h: number, seg = 10): THREE.BufferGeometry {
  return cached(`cyl:${rTop}:${rBot}:${h}:${seg}`, () => {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    return g;
  });
}

export function cyl(
  color: THREE.ColorRepresentation,
  radii: [number, number],
  h: number,
  at: Vec3,
  rot: Vec3 = [0, 0, 0],
  seg = 10,
): Piece {
  return {
    geometry: cylGeo(radii[0], radii[1], h, seg),
    color,
    transform: matrix(at, rot),
  };
}

export function sphereGeo(r: number, detail = 8): THREE.BufferGeometry {
  return cached(`sph:${r}:${detail}`, () => new THREE.SphereGeometry(r, detail, Math.max(4, detail / 2)));
}

export function icoGeo(r: number, detail = 0): THREE.BufferGeometry {
  return cached(`ico:${r}:${detail}`, () => new THREE.IcosahedronGeometry(r, detail));
}

export function cone(
  color: THREE.ColorRepresentation,
  r: number,
  h: number,
  at: Vec3,
  rot: Vec3 = [0, 0, 0],
  seg = 8,
): Piece {
  return {
    geometry: cached(`cone:${r}:${h}:${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
    color,
    transform: matrix(at, rot),
  };
}

export function torus(
  color: THREE.ColorRepresentation,
  r: number,
  tube: number,
  at: Vec3,
  rot: Vec3 = [0, 0, 0],
  seg = [8, 20] as [number, number],
): Piece {
  return {
    geometry: cached(`torus:${r}:${tube}:${seg[0]}:${seg[1]}`, () =>
      new THREE.TorusGeometry(r, tube, seg[0], seg[1]),
    ),
    color,
    transform: matrix(at, rot),
  };
}

/** Unit plane, base at y = 0, facing +Z — used for grass blades and cloth. */
export function planeGeo(w: number, h: number): THREE.BufferGeometry {
  return cached(`plane:${w}:${h}`, () => new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0));
}

export function plane(
  color: THREE.ColorRepresentation,
  size: [number, number],
  at: Vec3,
  rot: Vec3 = [0, 0, 0],
): Piece {
  return { geometry: planeGeo(size[0], size[1]), color, transform: matrix(at, rot) };
}

export function shapePiece(
  color: THREE.ColorRepresentation,
  shape: THREE.Shape,
  depth: number,
  at: Vec3,
  rot: Vec3 = [0, 0, 0],
): Piece {
  return {
    geometry: new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 }),
    color,
    transform: matrix(at, rot),
  };
}

/**
 * Accumulates pieces into a single non-indexed geometry with vertex colours.
 * Keeps the whole city at a handful of draw calls instead of thousands of meshes.
 * With `chunkSize` the pieces are split into per-segment geometries so the
 * frustum can drop what the camera is not looking at (towns are wide, views are not).
 */
export class MeshBuilder {
  private readonly buckets = new Map<string, { positions: number[]; normals: number[]; colors: number[] }>();
  private readonly tint = new THREE.Color();
  private readonly chunkSize: number;

  constructor(chunkSize = 0) {
    this.chunkSize = chunkSize;
  }

  private bucketFor(x: number, z: number): { positions: number[]; normals: number[]; colors: number[] } {
    const key =
      this.chunkSize > 0 ? `${Math.floor(x / this.chunkSize)}:${Math.floor(z / this.chunkSize)}` : "all";
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { positions: [], normals: [], colors: [] };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  add(piece: Piece): void {
    this.addGeometry(piece.geometry, piece.color, piece.transform);
  }

  addAll(pieces: Piece[]): void {
    for (const piece of pieces) this.add(piece);
  }

  addGeometry(
    geometry: THREE.BufferGeometry,
    color: THREE.ColorRepresentation,
    transform?: THREE.Matrix4,
  ): void {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (transform) g.applyMatrix4(transform);
    const position = g.getAttribute("position");
    const normal = g.getAttribute("normal");
    this.tint.set(color as THREE.Color);
    const { r, g: gg, b } = this.tint;
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < position.count; i++) {
      cx += position.getX(i);
      cz += position.getZ(i);
    }
    const bucket = this.bucketFor(cx / position.count, cz / position.count);
    for (let i = 0; i < position.count; i++) {
      bucket.positions.push(position.getX(i), position.getY(i), position.getZ(i));
      if (normal) bucket.normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      else bucket.normals.push(0, 1, 0);
      bucket.colors.push(r, gg, b);
    }
    g.dispose();
  }

  get vertexCount(): number {
    let total = 0;
    for (const bucket of this.buckets.values()) total += bucket.positions.length / 3;
    return total;
  }

  private toGeometry(bucket: { positions: number[]; normals: number[]; colors: number[] }): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(bucket.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(bucket.normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(bucket.colors, 3));
    geometry.computeBoundingSphere();
    return geometry;
  }

  build(): THREE.BufferGeometry {
    const count = this.vertexCount;
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    let offset = 0;
    for (const bucket of this.buckets.values()) {
      positions.set(bucket.positions, offset);
      normals.set(bucket.normals, offset);
      colors.set(bucket.colors, offset);
      offset += bucket.positions.length;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    return geometry;
  }

  /** One geometry per chunk (sorted left to right, both canals included). */
  buildChunks(): THREE.BufferGeometry[] {
    const entries = [...this.buckets.entries()].sort((a, b) => {
      const [ax, az] = a[0].split(":").map(Number);
      const [bx, bz] = b[0].split(":").map(Number);
      return ax - bx || az - bz;
    });
    return entries.map(([, bucket]) => this.toGeometry(bucket));
  }
}

/** Small radial glow used for lamp halos and marker sparks. */
export function makeGlowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(255,255,255,0.55)");
  gradient.addColorStop(0.6, "rgba(255,255,255,0.12)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Soft dark blob used as a fake contact shadow. */
export function makeShadowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(0,0,0,0.55)");
  gradient.addColorStop(0.55, "rgba(0,0,0,0.22)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}
