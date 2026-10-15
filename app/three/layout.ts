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
 * Two bridges cross the canal at x = -48 and x = +48, which is also where
 * the house rows open up into a cross street.
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
  bridgeHalfWidth: 2.8,
  /** how far a bridge deck reaches along Z (it lands on the pavement) */
  bridgeSpan: 15.5,
  bridgeRise: 2.3,
  /** the bike is stopped by the house facades at this |z| */
  blockEdgeZ: 15.5,
  /** width of the gap in the house rows where a bridge lands */
  bridgeGap: 6.4,
} as const;

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
    return LAYOUT.groundY + Math.pow(Math.sin((t * Math.PI) / 2), 1.2) * LAYOUT.bridgeRise;
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
