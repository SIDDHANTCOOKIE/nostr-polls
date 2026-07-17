import { GameInput } from "./types";

/**
 * Wire-compact encoding for an input log: distinct action strings are
 * deduped into a small `codes` dictionary (a game only has a handful of
 * distinct actions repeated hundreds of times), and each entry becomes a
 * `[t, codeIndex]` tuple instead of a `{t, a}` object — no repeated key
 * names, no repeated action strings, no quoting on the index. Roughly
 * halves the published event size for a typical session. See
 * docs/nip-game-scores.md "content" schema.
 */
export interface CompactInputLog {
  codes: string[];
  log: [number, number][];
}

export function encodeInputLog(inputLog: GameInput[]): CompactInputLog {
  const codes: string[] = [];
  const codeIndex = new Map<string, number>();
  const log: [number, number][] = inputLog.map(({ t, a }) => {
    let idx = codeIndex.get(a);
    if (idx === undefined) {
      idx = codes.length;
      codes.push(a);
      codeIndex.set(a, idx);
    }
    return [t, idx];
  });
  return { codes, log };
}

export function decodeInputLog(compact: CompactInputLog): GameInput[] {
  return compact.log.map(([t, idx]) => ({ t, a: compact.codes[idx] }));
}

export function isCompactInputLog(value: unknown): value is CompactInputLog {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.codes) &&
    v.codes.every((c) => typeof c === "string") &&
    Array.isArray(v.log) &&
    v.log.every((e) => Array.isArray(e) && e.length === 2 && e.every((n) => typeof n === "number"))
  );
}
