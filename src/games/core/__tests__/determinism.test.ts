import { TetrisEngine, TetrisAction } from "../../tetris/engine";
import { RacerEngine, RacerAction } from "../../racer/engine";
import { verifyReplay } from "../replayEngine";
import { DeterministicGame, GameInput } from "../types";
import { TickSync } from "../tickSync";
import { InputRecorder } from "../inputRecorder";

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

/**
 * Reproduces Board.tsx's live loop using the REAL InputRecorder (the class the
 * boards use for both input timestamps AND the frame clock via elapsedNow), so
 * pause is exercised end-to-end. performance.now is mocked by a `wall` counter
 * we advance manually. Pauses are scheduled at game-time positions; while
 * paused, wall time keeps flowing (as it does in real life) but the recorder's
 * clock is frozen, so no ticks fire and no gap leaks into timestamps.
 */
function simulateLiveWithPauses<TAction extends string>(
  gameFactory: () => DeterministicGame<TAction>,
  seed: string,
  scriptedInputs: { atGameMs: number; action: TAction }[],
  pauseWindows: { atGameMs: number; wallDurationMs: number }[],
  frameIntervalMs: number
): { score: number; stateHash: string; inputLog: GameInput[]; pauseCount: number } {
  let wall = 0;
  const spy = jest.spyOn(performance, "now").mockImplementation(() => wall);
  try {
    const engine = gameFactory();
    engine.init(seed);
    const recorder = new InputRecorder();
    const tickSync = new TickSync<TAction>();

    let paused = false;
    let resumeWall = 0;
    let nextInput = 0;
    let nextPause = 0;
    let pauseCount = 0;
    let frames = 0;

    while (!engine.isGameOver() && frames < 2_000_000) {
      wall += frameIntervalMs;
      frames++;

      if (paused && wall >= resumeWall) {
        recorder.resume();
        paused = false;
      }
      if (paused) {
        // The rAF loop keeps running while paused; elapsedNow is frozen so
        // catchUpTo is a no-op — this asserts nothing advances during a pause.
        tickSync.catchUpTo(engine, recorder.elapsedNow());
        continue;
      }

      const gameTime = recorder.elapsedNow();

      if (nextPause < pauseWindows.length && gameTime >= pauseWindows[nextPause].atGameMs) {
        recorder.pause();
        paused = true;
        pauseCount++;
        resumeWall = wall + pauseWindows[nextPause].wallDurationMs;
        nextPause++;
        continue;
      }

      while (nextInput < scriptedInputs.length && scriptedInputs[nextInput].atGameMs <= gameTime) {
        const action = scriptedInputs[nextInput].action;
        recorder.record(action);
        const log = recorder.getLog();
        const t = log[log.length - 1].t;
        tickSync.catchUpTo(engine, t);
        engine.applyInput(action, t);
        nextInput++;
      }

      if (!engine.isGameOver()) {
        tickSync.catchUpTo(engine, recorder.elapsedNow());
      }
    }

    return {
      score: engine.getScore(),
      stateHash: engine.getStateHash(),
      inputLog: recorder.getLog(),
      pauseCount,
    };
  } finally {
    spy.mockRestore();
  }
}

describe("InputRecorder pause clock", () => {
  test("freezes elapsed time while paused and resumes continuously", () => {
    let wall = 0;
    const spy = jest.spyOn(performance, "now").mockImplementation(() => wall);
    try {
      wall = 1000;
      const r = new InputRecorder(); // startedAt = 1000
      wall = 1100;
      expect(r.elapsedNow()).toBe(100);

      r.pause(); // pausedAt = 1100
      wall = 5100; // 4s of real time pass while paused
      expect(r.isPaused()).toBe(true);
      expect(r.elapsedNow()).toBe(100); // frozen, not 4100
      r.record("x");
      expect(r.getLog()[0].t).toBe(100); // timestamped at frozen game-time

      r.resume(); // folds the 4000ms pause into pausedTotal
      expect(r.isPaused()).toBe(false);
      expect(r.elapsedNow()).toBe(100); // continues from where it froze
      wall = 5150;
      expect(r.elapsedNow()).toBe(150);

      // a second pause accumulates on top of the first
      r.pause();
      wall = 6150;
      r.resume();
      wall = 6200;
      expect(r.elapsedNow()).toBe(200);
    } finally {
      spy.mockRestore();
    }
  });

  test("reset clears pause state", () => {
    let wall = 0;
    const spy = jest.spyOn(performance, "now").mockImplementation(() => wall);
    try {
      const r = new InputRecorder();
      r.pause();
      wall = 1000;
      r.reset(); // startedAt = 1000, pause cleared
      expect(r.isPaused()).toBe(false);
      wall = 1050;
      expect(r.elapsedNow()).toBe(50);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("pause is transparent to game outcome", () => {
  // Pauses land early in game-time so they fire before the run ends; wall
  // durations are large to prove even a long pause changes nothing.
  const pauseWindows = [
    { atGameMs: 250, wallDurationMs: 4000 },
    { atGameMs: 900, wallDurationMs: 1500 },
    { atGameMs: 1800, wallDurationMs: 9000 },
  ];

  test("tetris: run with pauses == run without, and both verify", () => {
    const seed = TEST_SEED;
    const actions: TetrisAction[] = ["move_left", "move_right", "rotate_cw", "soft_drop", "hard_drop"];
    for (let trial = 0; trial < 100; trial++) {
      let rngState = trial + 1;
      const rand = () => {
        rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
        return rngState / 0x7fffffff;
      };
      const scripted: { atGameMs: number; action: TetrisAction }[] = [];
      let t = 0;
      for (let i = 0; i < 200; i++) {
        t += 30 + rand() * 250;
        scripted.push({ atGameMs: t, action: actions[Math.floor(rand() * actions.length)] });
      }
      const frameInterval = 16.0 + rand() * 1.4;

      const noPause = simulateLiveWithPauses(() => new TetrisEngine(), seed, scripted, [], frameInterval);
      const withPause = simulateLiveWithPauses(() => new TetrisEngine(), seed, scripted, pauseWindows, frameInterval);

      expect(withPause.pauseCount).toBeGreaterThan(0); // pauses actually fired
      expect(withPause.inputLog).toEqual(noPause.inputLog); // identical recorded log
      expect(withPause.score).toBe(noPause.score);
      expect(withPause.stateHash).toBe(noPause.stateHash);

      const replay = verifyReplay(() => new TetrisEngine(), seed, withPause.inputLog);
      expect(replay.score).toBe(withPause.score);
      expect(replay.stateHash).toBe(withPause.stateHash);
    }
  });

  test("racer: run with pauses == run without, and both verify", () => {
    const seed = TEST_SEED;
    for (let trial = 0; trial < 100; trial++) {
      let rngState = trial + 101;
      const rand = () => {
        rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
        return rngState / 0x7fffffff;
      };
      const scripted: { atGameMs: number; action: RacerAction }[] = [];
      let t = 0;
      let leftHeld = false;
      let rightHeld = false;
      for (let i = 0; i < 120; i++) {
        t += 80 + rand() * 400;
        const side: "left" | "right" = rand() < 0.5 ? "left" : "right";
        if (side === "left") {
          scripted.push({ atGameMs: t, action: leftHeld ? "left_up" : "left_down" });
          leftHeld = !leftHeld;
        } else {
          scripted.push({ atGameMs: t, action: rightHeld ? "right_up" : "right_down" });
          rightHeld = !rightHeld;
        }
      }
      const frameInterval = 16.0 + rand() * 1.4;

      const noPause = simulateLiveWithPauses(() => new RacerEngine(), seed, scripted, [], frameInterval);
      const withPause = simulateLiveWithPauses(() => new RacerEngine(), seed, scripted, pauseWindows, frameInterval);

      expect(withPause.pauseCount).toBeGreaterThan(0);
      expect(withPause.inputLog).toEqual(noPause.inputLog);
      expect(withPause.score).toBe(noPause.score);
      expect(withPause.stateHash).toBe(noPause.stateHash);

      const replay = verifyReplay(() => new RacerEngine(), seed, withPause.inputLog);
      expect(replay.score).toBe(withPause.score);
      expect(replay.stateHash).toBe(withPause.stateHash);
    }
  });
});
