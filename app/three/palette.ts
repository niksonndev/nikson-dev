/**
 * Golden hour in Amsterdam: a low warm sun, teal canal water, saturated brick,
 * and enough ambient bounce that nothing crushes to black.
 */

export const COLORS = {
  // sky & light
  skyZenith: 0x3f7fbe,
  skyHorizon: 0xffc178,
  sun: 0xffe2b0,
  ambientSky: 0x9dc4e8,
  ambientGround: 0x6b5a45,
  fog: 0xdda577,

  // ground (Amsterdam streets are warm brick, the walkways grey flagstone)
  cobble: 0x9b6f57,
  cobbleAlt: 0xa87a5f,
  pavement: 0xb3a696,
  pavementAlt: 0xa2957f,
  curb: 0x8d8171,
  quayStone: 0x7c7266,
  bridgeStone: 0x9c9284,

  // water
  waterDeep: 0x12566b,
  waterSurface: 0x2f8fa3,

  // houses
  brick: [
    0x9c5a41, 0xb06a4a, 0x8a4c38, 0xc07c52, 0x7d5c4a, 0xd08a5c, 0xb4795a, 0x94604a, 0xa9603f, 0x876253,
  ] as readonly number[],
  houseAccent: [0xe0bc86, 0x6d7f8c, 0x93a37f, 0xc4b39a] as readonly number[],
  trim: 0xfaf3e6,
  trimDark: 0x4a4038,
  roof: [0x5a565e, 0x6b5346, 0x4c4a52] as readonly number[],
  plinth: 0x5f584f,
  door: [0x2c5a4e, 0xb03a33, 0x2a3d5c, 0x4a4a4a, 0x6e5039] as readonly number[],

  // windows
  windowLit: 0xffb763,
  windowLitAlt: 0xffd79a,
  windowDark: 0x35506b,

  // nature
  trunk: 0x6b5540,
  foliage: [0x5c8f4a, 0x6ca055, 0x4a7a41, 0x7fae60, 0x8f9b45] as readonly number[],
  grass: [0x7fa64e, 0x8fb45c, 0x6f9a48, 0x9ec06a] as readonly number[],
  tulip: [0xe0544f, 0xf0c94c, 0xe07fa4, 0xf2ebdd, 0xb35f96, 0xf08a3c] as readonly number[],

  // props
  metalDark: 0x3b3f44,
  lampPole: 0x37474a,
  lampGlass: 0xffc98a,
  bollard: 0x7a4438,
  bench: 0x8a6440,
  boatHull: [0x3f5a63, 0x4f6350, 0x6d4a3a, 0x3a4d5c] as readonly number[],
  boatTrim: 0xe8dfcc,
  boatWood: 0xa07a52,
  flag: [0xe0544f, 0xf0c94c, 0x3f7fbe, 0xf2ebdd, 0xe07fa4] as readonly number[],

  // player
  bikeFrame: 0x2f6b62,
  bikeFrameAlt: 0xf0e6d2,
  tire: 0x24262a,
  rim: 0xe0d8c8,
  basket: 0xc09055,
  skin: 0xe0a97c,
  hair: 0x33261d,
  jacket: 0xd4584a,
  jacketAlt: 0x2f6b62,
  pants: 0x3a4152,
  shoes: 0xf2eee6,
  helmet: 0xe4dfd5,
} as const;

export function brickColor(index: number): number {
  return COLORS.brick[((index % COLORS.brick.length) + COLORS.brick.length) % COLORS.brick.length];
}
