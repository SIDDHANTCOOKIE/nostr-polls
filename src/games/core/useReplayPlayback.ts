import { useCallback, useEffect, useRef, useState } from "react";
import { DeterministicGame, FIXED_STEP_MS, GameInput } from "./types";

/** ~60 minutes of FIXED_STEP_MS ticks — a safety bound on the trailing
 *  passive-simulation loop below, not a limit on legitimate sessions. */
const MAX_TICKS = 225_000;

export interface ReplayPlayback<TEngine extends DeterministicGame> {
  engine: TEngine | null;
  clockMs: number;
  durationMs: number;
  playing: boolean;
  done: boolean;
  speed: number;
  play: () => void;
  pause: () => void;
  restart: () => void;
  setSpeed: (speed: number) => void;
}

/**
 * Drives a recorded input log through a fresh engine instance on a timer,
 * instead of live input — the visual counterpart to `replayEngine.verifyReplay`
 * (which does the same simulation headlessly for score checking). Steps the
 * engine in the same FIXED_STEP_MS increments as live play/verification so
 * what's shown here is exactly what the replay-verified score corresponds to.
 */
export function useReplayPlayback<TEngine extends DeterministicGame>(
  gameFactory: () => TEngine,
  seed: string,
  inputLog: GameInput[]
): ReplayPlayback<TEngine> {
  const sorted = useRef<GameInput[]>([]);
  sorted.current = [...inputLog].sort((a, b) => a.t - b.t);
  const durationMs = sorted.current.length ? sorted.current[sorted.current.length - 1].t : 0;

  const engineRef = useRef<TEngine | null>(null);
  const clockRef = useRef(0);
  const nextIdxRef = useRef(0);
  const ticksRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [done, setDone] = useState(false);
  const [, forceRender] = useState(0);

  const restart = useCallback(() => {
    const engine = gameFactory();
    engine.init(seed);
    engineRef.current = engine;
    clockRef.current = 0;
    nextIdxRef.current = 0;
    ticksRef.current = 0;
    setDone(false);
    forceRender((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  useEffect(() => {
    restart();
    setPlaying(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, inputLog]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const engine = engineRef.current;
      if (!engine) return;
      let acc = (now - last) * speed;
      last = now;

      // Keep ticking past the last recorded input if the game hasn't ended
      // yet — passive tick-driven state (gravity, continuous motion) keeps
      // changing after the player's last keypress in real play too, so
      // stopping exactly at `durationMs` would cut the replay short of the
      // actual ending. `durationMs` still drives the progress bar (clamped
      // to 100 by callers), it just isn't the simulation's stop condition.
      while (acc >= FIXED_STEP_MS && !engine.isGameOver() && ticksRef.current < MAX_TICKS) {
        engine.tick(FIXED_STEP_MS);
        clockRef.current += FIXED_STEP_MS;
        ticksRef.current++;
        acc -= FIXED_STEP_MS;
        while (
          nextIdxRef.current < sorted.current.length &&
          sorted.current[nextIdxRef.current].t <= clockRef.current
        ) {
          const input = sorted.current[nextIdxRef.current];
          engine.applyInput(input.a, input.t);
          nextIdxRef.current++;
        }
      }

      forceRender((n) => n + 1);

      if (engine.isGameOver() || ticksRef.current >= MAX_TICKS) {
        setPlaying(false);
        setDone(true);
        return;
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, durationMs]);

  return {
    engine: engineRef.current,
    clockMs: clockRef.current,
    durationMs,
    playing,
    done,
    speed,
    play: () => {
      if (done) restart();
      setPlaying(true);
    },
    pause: () => setPlaying(false),
    restart,
    setSpeed,
  };
}
