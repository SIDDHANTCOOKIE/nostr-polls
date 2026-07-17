import { GameInput } from "./types";

/**
 * Records player inputs with timestamps relative to session start. The
 * resulting log IS the replay — publishing it alongside the seed is what
 * lets any other client independently recompute the score.
 */
export class InputRecorder {
  private startedAt = performance.now();
  private log: GameInput[] = [];

  reset() {
    this.startedAt = performance.now();
    this.log = [];
  }

  record(action: string) {
    this.log.push({ t: Math.round(performance.now() - this.startedAt), a: action });
  }

  getLog(): GameInput[] {
    return this.log;
  }
}
