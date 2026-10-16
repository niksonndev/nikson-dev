/**
 * Shared world layout. Every module (city, bike, physics, camera) reads the
 * same numbers so the geometry and the collisions can never drift apart.
 *
 * Cross-section of the world (looking along X, the canal runs along X):
 *
 *   |z| = 6.0   canal wall / quay edge
 *   |z| = 6.0 – 7.6   pavement
 *   |z| = 7.6 – 13.6  cobbled street
 *   |z| = 13.6 – 16   pavement with trees, lamps, parked bikes
 *   |z| = 16          house facades
 *
 * Two bridges cross the canal at x = -48 and x = +48. A deck only spans the
 * water and lands on the cobbles, so the house rows run unbroken right up to
 * the bridgeheads on both quays.
 */

export const LAYOUT = {
  /** half length of the world along X */
  worldX: 132,
  /** the water spans |z| <= canalHalf */
  canalHalf: 6,
  waterY: -1.25,
  /** top of the cobbles/pavement on the quays */
  groundY: 0.2,
  roadInner: 7.6,
  roadOuter: 13.6,
  facadeZ: 16,
  houseDepth: 7,
  /** x positions of the two canal bridges */
  bridges: [-48, 48] as readonly number[],
  /** half width of a bridge deck along X */
  bridgeHalfWidth: 2.4,
  /** how far a bridge deck reaches along Z: over the water and onto the cobbles */
  bridgeSpan: 8.8,
  /** how high the arch rises in the middle */
  bridgeRise: 1.75,
  /** the bike is stopped by the house facades at this |z| */
  blockEdgeZ: 15.5,
  /** size of the merged world chunks, so the frustum can drop most of the city */
  chunkSize: 20,
  /** how far either side of a bridge the street props stand back */
  bridgeClearance: 3,
  /** side streets that cut perpendicular into the block, each ending in a small square */
  sideStreets: [-18, 74] as readonly number[],
  sideStreetHalf: 4.6,
  sideStreetDepth: 30,
  squareHalf: 7.4,
  squareZ: 23.5,
} as const;

/** How deep the rider may go at this spot: the quay, a side street, or its square. */
export function depthLimitAt(x: number, z: number): number {
  for (const sx of LAYOUT.sideStreets) {
    const dx = Math.abs(x - sx);
    if (dx <= LAYOUT.sideStreetHalf - 0.45) return LAYOUT.sideStreetDepth;
    if (dx <= LAYOUT.squareHalf - 0.45 && Math.abs(z) > LAYOUT.squareZ) return LAYOUT.sideStreetDepth;
  }
  return LAYOUT.blockEdgeZ;
}

/** Half width of the walkable strip at this depth (narrow street, then the square). */
export function sideStreetHalfAt(z: number): number {
  return Math.abs(z) > LAYOUT.squareZ ? LAYOUT.squareHalf - 0.45 : LAYOUT.sideStreetHalf - 0.45;
}

export function isOnBridge(x: number): boolean {
  for (const bx of LAYOUT.bridges) {
    if (Math.abs(x - bx) <= LAYOUT.bridgeHalfWidth) return true;
  }
  return false;
}

/** Terrain height: flat on the quays, a smooth arch over the bridges. */
export function heightAt(x: number, z: number): number {
  for (const bx of LAYOUT.bridges) {
    if (Math.abs(x - bx) > LAYOUT.bridgeHalfWidth + 0.6) continue;
    const az = Math.abs(z);
    if (az > LAYOUT.bridgeSpan) continue;
    const t = 1 - az / LAYOUT.bridgeSpan;
    // raised cosine: no kink where the deck meets the street
    return LAYOUT.groundY + ((1 - Math.cos(t * Math.PI)) / 2) * LAYOUT.bridgeRise;
  }
  return LAYOUT.groundY;
}

/** Slope of the terrain along Z, used to pitch the bike on the bridges. */
export function slopeAt(x: number, z: number): number {
  const d = 0.35;
  return (heightAt(x, z + d) - heightAt(x, z - d)) / (2 * d);
}

/**
 * Where the points of interest live. The city decorates around these spots and
 * the world logic puts a marker on top of them.
 */
export const POI_ANCHORS = {
  projects: { x: -30, z: 13.2 },
  about: { x: 6, z: 12.4 },
  stack: { x: 48, z: 0 },
  contact: { x: -20, z: -13.2 },
  made: { x: 30, z: -13.2 },
} as const;

export type PoiId = keyof typeof POI_ANCHORS;

/** A round obstacle the bike bumps into. */
export type Collider = { x: number; z: number; r: number };
