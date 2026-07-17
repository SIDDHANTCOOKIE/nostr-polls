import { DeterministicGame, FIXED_STEP_MS, GameInput, ReplayResult } from "./types";

/** ~60 minutes of FIXED_STEP_MS ticks — a generous safety bound on the
 *  trailing tick loop below, not a real limit on legitimate sessions. */
const MAX_TICKS = 225_000;

/**
 * Headless re-simulation of a recorded session: create a fresh engine, seed
 * it, then replay the input log advancing the logical clock in fixed steps
 * between inputs (matching how live play accumulates real time — see
 * `FIXED_STEP_MS`). Any client can call this against a published
 * `{seed, inputLog}` and compare the result to the claimed score.
 *
 * Ticking doesn't stop at the last input: a game with passive tick-driven
 * state (Tetris gravity, Overdrive's continuous motion) keeps changing after
 * the player's last keypress until it actually ends — stopping at the last
 * input would under-simulate that trailing stretch and produce a wrong
 * score/hash for any session that didn't happen to end exactly on an input.
 */
export function verifyReplay<TAction extends string = string>(
  gameFactory: () => DeterministicGame<TAction>,
  seed: string,
  inputLog: GameInput[]
): ReplayResult {
  const game = gameFactory();
  game.init(seed);

  const sorted = [...inputLog].sort((a, b) => a.t - b.t);
  let clock = 0;
  let ticks = 0;

  for (const { t, a } of sorted) {
    while (clock + FIXED_STEP_MS <= t && ticks < MAX_TICKS && !game.isGameOver()) {
      game.tick(FIXED_STEP_MS);
      clock += FIXED_STEP_MS;
      ticks++;
    }
    game.applyInput(a as TAction, t);
  }

  while (!game.isGameOver() && ticks < MAX_TICKS) {
    game.tick(FIXED_STEP_MS);
    clock += FIXED_STEP_MS;
    ticks++;
  }

  return {
    score: game.getScore(),
    stateHash: game.getStateHash(),
    gameOver: game.isGameOver(),
  };
}
