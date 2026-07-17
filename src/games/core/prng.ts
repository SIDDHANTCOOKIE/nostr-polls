/**
 * Deterministic PRNG shared by every game engine. Given the same numeric seed
 * this produces the exact same float sequence on every device — the property
 * the whole self-verifiable replay scheme depends on.
 */
export type Rng = () => number;

/** mulberry32 — small, fast, good-enough distribution for game RNG (not crypto). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Folds a hex seed string (e.g. sha256 of gameId+date) into a uint32 for mulberry32. */
export function seedToUint32(hexSeed: string): number {
  let h = 0;
  for (let i = 0; i < hexSeed.length; i++) {
    h = (Math.imul(h, 31) + hexSeed.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

export function rngFromHexSeed(hexSeed: string): Rng {
  return mulberry32(seedToUint32(hexSeed));
}

/** Integer in [0, max) drawn from an Rng, without modulo bias for our small ranges. */
export function randInt(rng: Rng, max: number): number {
  return Math.floor(rng() * max);
}
