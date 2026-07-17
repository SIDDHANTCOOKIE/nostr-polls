import { DeterministicGame, FIXED_STEP_MS } from "./types";

/**
 * Keeps a live game's applied-tick count in lockstep with elapsed session
 * time using the same rule `verifyReplay` uses (ticks = floor(elapsedMs /
 * FIXED_STEP_MS)). Call `catchUpTo` with an input's own recorded elapsed
 * time immediately before `engine.applyInput`, and once per animation frame
 * with the frame's elapsed time to drive gravity/motion — never call
 * `engine.tick` directly from a live game loop. Without this, the rAF loop
 * only ticks up to whatever it reached by the *last* frame, which can be up
 * to one frame behind an input's own timestamp, so the engine has applied
 * fewer ticks than `verifyReplay` will when it re-derives ticks purely from
 * that timestamp — a discrepancy invisible in play but fatal on replay:
 * gravity/motion lands the piece or car a tick apart, which for a
 * proximity-based collision (Overdrive) or lock-timing (Tetris) reliably
 * cascades into a different score.
 */
export class TickSync<TAction extends string = string> {
  private ticksApplied = 0;

  catchUpTo(engine: DeterministicGame<TAction>, elapsedMs: number): void {
    const targetTicks = Math.floor(elapsedMs / FIXED_STEP_MS);
    while (this.ticksApplied < targetTicks && !engine.isGameOver()) {
      engine.tick(FIXED_STEP_MS);
      this.ticksApplied++;
    }
  }
}
