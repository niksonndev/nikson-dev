/** Dusk in Amsterdam: warm horizon, cool zenith, brick facades, teal water. */

export const COLORS = {
  // sky & light
  skyZenith: 0x1d2b4d,
  skyHorizon: 0xf3a55f,
  sun: 0xffd2a1,
  ambientSky: 0x5a6b90,
  ambientGround: 0x2b2622,
  fog: 0x8a6f6b,

  // ground
  cobble: 0x6a635d,
  cobbleAlt: 0x726a63,
  pavement: 0x9c958c,
  pavementAlt: 0x8a837b,
  curb: 0x77706a,
  quayStone: 0x585550,
  bridgeStone: 0x736c63,

  // water
  waterDeep: 0x0e2c40,
  waterSurface: 0x2a5f79,

  // houses
  brick: [
    0x7a4b3a, 0x8a5a44, 0x6b3f31, 0xa9714f, 0x5f4a3f, 0xbf7a52, 0x9c6a4a, 0x74513f, 0x8f5a3d,
    0x6f5346,
  ] as readonly number[],
  houseAccent: [0xcfae79, 0x54606b, 0x7d8c76, 0xb0a08c] as readonly number[],
  trim: 0xece2d2,
  trimDark: 0x3a332e,
  roof: [0x3b3940, 0x4a3b34, 0x33323a] as readonly number[],
  plinth: 0x4b4741,
  door: [0x24483f, 0x8f2f2a, 0x22324a, 0x3b3b3b, 0x5c4230] as readonly number[],

  // windows
  windowLit: 0xffab55,
  windowLitAlt: 0xffc98a,
  windowDark: 0x1b2735,

  // nature
  trunk: 0x51402f,
  foliage: [0x3f6b45, 0x4b7a4a, 0x35583c, 0x568152] as readonly number[],
  tulip: [0xd94f4f, 0xe8c04a, 0xd4739a, 0xe9e2d4, 0xa8558f] as readonly number[],

  // props
  metalDark: 0x2b2f33,
  lampPole: 0x2f3a3a,
  lampGlass: 0xffb672,
  bollard: 0x6b3b34,
  bench: 0x6b4a33,
  boatHull: [0x2f3d46, 0x3d4a3f, 0x54392f, 0x2b3540] as readonly number[],
  boatTrim: 0xd8cfc0,
  boatWood: 0x8a6a4a,

  // player
  bikeFrame: 0x2f5d57,
  bikeFrameAlt: 0xe4d9c3,
  tire: 0x1c1e22,
  rim: 0xc9c2b4,
  basket: 0xb08350,
  skin: 0xd8a077,
  hair: 0x2a201a,
  jacket: 0x3a5a8c,
  jacketAlt: 0xc1553f,
  pants: 0x2b303c,
  shoes: 0xe8e4dc,
  helmet: 0xdcd8cf,
} as const;

export function brickColor(index: number): number {
  return COLORS.brick[((index % COLORS.brick.length) + COLORS.brick.length) % COLORS.brick.length];
}
