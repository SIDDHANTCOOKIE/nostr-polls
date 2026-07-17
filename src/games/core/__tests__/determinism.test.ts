import { TetrisEngine, TetrisAction } from "../../tetris/engine";
import { RacerEngine, RacerAction } from "../../racer/engine";
import { verifyReplay } from "../replayEngine";
import { DeterministicGame, GameInput } from "../types";
import { TickSync } from "../tickSync";

// `rngFromHexSeed` (src/games/core/prng.ts) only folds the string's char
// codes — it doesn't require a real sha256 hex digest — so any fixed string
// is a valid, reproducible seed here without pulling in @noble/hashes
// (avoids an ESM parse error under CRA's default Jest transform config).
const TEST_SEED = "determinism-test-seed";

/**
 * Reproduces Board.tsx's live-play model exactly: an rAF-style loop calls
 * TickSync.catchUpTo once per frame (real elapsed time), and "keydown"
 * inputs call TickSync.catchUpTo with their own timestamp immediately
 * before applyInput — the same production class both game boards use, not
 * a parallel reimplementation, so this test exercises the real fix.
 */
function simulateLive<TAction extends string>(
  gameFactory: () => DeterministicGame<TAction>,
  seed: string,
  scriptedInputs: { atMs: number; action: TAction }[],
  frameIntervalMs: number
): { score: number; inputLog: GameInput[] } {
  const engine = gameFactory();
  engine.init(seed);
  const tickSync = new TickSync<TAction>();

  let now = 0;
  let nextInputIdx = 0;
  const inputLog: GameInput[] = [];
  let frames = 0;

  while (!engine.isGameOver() && frames < 500_000) {
    now += frameIntervalMs;
    frames++;

    while (nextInputIdx < scriptedInputs.length && scriptedInputs[nextInputIdx].atMs <= now) {
      const { atMs, action } = scriptedInputs[nextInputIdx];
      const t = Math.round(atMs);
      tickSync.catchUpTo(engine, t);
      engine.applyInput(action, t);
      inputLog.push({ t, a: action });
      nextInputIdx++;
    }

    if (!engine.isGameOver()) {
      tickSync.catchUpTo(engine, now);
    }
  }

  return { score: engine.getScore(), inputLog };
}

describe("live-vs-replay determinism", () => {
  test("tetris: live play score matches verifyReplay for realistic input timing", () => {
    const seed = TEST_SEED;
    const actions: TetrisAction[] = ["move_left", "move_right", "rotate_cw", "soft_drop", "hard_drop"];
    let mismatches = 0;
    for (let trial = 0; trial < 500; trial++) {
      let rngState = trial + 1;
      const rand = () => {
        rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
        return rngState / 0x7fffffff;
      };
      const scripted: { atMs: number; action: TetrisAction }[] = [];
      let t = 0;
      for (let i = 0; i < 200; i++) {
        t += 30 + rand() * 250; // human-ish spacing, not aligned to 16ms
        scripted.push({ atMs: t, action: actions[Math.floor(rand() * actions.length)] });
      }
      // realistic rAF interval jitter around 16.7ms
      const frameInterval = 16.0 + rand() * 1.4;
      const live = simulateLive(() => new TetrisEngine(), seed, scripted, frameInterval);
      const replay = verifyReplay(() => new TetrisEngine(), seed, live.inputLog);
      if (live.score !== replay.score) {
        mismatches++;
        console.log(`tetris trial ${trial}: live=${live.score} replay=${replay.score} frameInterval=${frameInterval}`);
      }
    }
    expect(mismatches).toBe(0);
  });

  test("racer: live play score matches verifyReplay for realistic input timing", () => {
    const seed = TEST_SEED;
    let mismatches = 0;
    for (let trial = 0; trial < 500; trial++) {
      let rngState = trial + 101;
      const rand = () => {
        rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
        return rngState / 0x7fffffff;
      };
      const scripted: { atMs: number; action: RacerAction }[] = [];
      let t = 0;
      let leftHeld = false;
      let rightHeld = false;
      for (let i = 0; i < 120; i++) {
        t += 80 + rand() * 400;
        // toggle steering like a real player holding/releasing arrow keys
        const side: "left" | "right" = rand() < 0.5 ? "left" : "right";
        if (side === "left") {
          scripted.push({ atMs: t, action: leftHeld ? "left_up" : "left_down" });
          leftHeld = !leftHeld;
        } else {
          scripted.push({ atMs: t, action: rightHeld ? "right_up" : "right_down" });
          rightHeld = !rightHeld;
        }
      }
      const frameInterval = 16.0 + rand() * 1.4;
      const live = simulateLive(() => new RacerEngine(), seed, scripted, frameInterval);
      const replay = verifyReplay(() => new RacerEngine(), seed, live.inputLog);
      if (live.score !== replay.score) {
        mismatches++;
        console.log(`racer trial ${trial}: live=${live.score} replay=${replay.score} frameInterval=${frameInterval}`);
      }
    }
    expect(mismatches).toBe(0);
  });
});
