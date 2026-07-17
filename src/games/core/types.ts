/**
 * Contract every game engine implements so the shared seed/replay/publish
 * infrastructure (prng, replayEngine, scoreEvents) works identically for all
 * games without knowing their rules.
 */
export interface GameInput {
  /** ms elapsed since the play session started */
  t: number;
  /** engine-specific action string, e.g. "left" | "rotate_cw" | "hard_drop" */
  a: string;
}

export interface DeterministicGame<TAction extends string = string> {
  init(seed: string): void;
  applyInput(action: TAction, t: number): void;
  /** advance real-time-driven state (gravity, timers); no-op for turn-based games */
  tick(dtMs: number): void;
  getScore(): number;
  isGameOver(): boolean;
  /** compact digest of current state, used to cross-check replays cheaply */
  getStateHash(): string;
}

export interface ReplayResult {
  score: number;
  stateHash: string;
  gameOver: boolean;
}

/**
 * Fixed logical step used by both live play and replay verification. Live
 * play must accumulate real rAF delta into steps of this size (not call
 * `tick(rafDt)` directly) so replay — which always steps in exact
 * `FIXED_STEP_MS` increments — reproduces identical gravity/timer behavior
 * regardless of the device's actual frame rate.
 */
export const FIXED_STEP_MS = 16;
