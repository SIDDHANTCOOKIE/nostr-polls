import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { DeterministicGame } from "../core/types";
import { Rng, randInt, rngFromHexSeed } from "../core/prng";

export type TetrisAction =
  | "move_left"
  | "move_right"
  | "rotate_cw"
  | "rotate_ccw"
  | "soft_drop"
  | "hard_drop";

const WIDTH = 10;
const HEIGHT = 20;
const BASE_DROP_INTERVAL_MS = 800;
const MIN_DROP_INTERVAL_MS = 120;
const DROP_DECREMENT_PER_LEVEL_MS = 60;
const LINES_PER_LEVEL = 10;
const PIECE_TYPES = ["I", "O", "T", "S", "Z", "J", "L"] as const;
export type PieceType = (typeof PIECE_TYPES)[number];

/**
 * Simplified rotation table: 4 states per piece, each 4 [row,col] offsets in
 * a 4x4 box, no wall-kick fallback. Not official SRS — a deliberate scope cut
 * (see docs/games-feature.md) since exact kick tables aren't needed for a
 * casual daily-seed leaderboard to be self-verifiable, only for it to be
 * deterministic, which this is.
 */
const SHAPES: Record<PieceType, number[][][]> = {
  I: [
    [[1, 0], [1, 1], [1, 2], [1, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 1], [1, 1], [2, 1], [3, 1]],
  ],
  O: [
    [[0, 1], [0, 2], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 1], [1, 2]],
  ],
  T: [
    [[0, 1], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 1]],
    [[0, 1], [1, 0], [1, 1], [2, 1]],
  ],
  S: [
    [[0, 1], [0, 2], [1, 0], [1, 1]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 1], [1, 2], [2, 0], [2, 1]],
    [[0, 0], [1, 0], [1, 1], [2, 1]],
  ],
  Z: [
    [[0, 0], [0, 1], [1, 1], [1, 2]],
    [[0, 2], [1, 1], [1, 2], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[0, 1], [1, 0], [1, 1], [2, 0]],
  ],
  J: [
    [[0, 0], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 0], [2, 1]],
  ],
  L: [
    [[0, 2], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [1, 2], [2, 0]],
    [[0, 0], [0, 1], [1, 1], [2, 1]],
  ],
};

export const PIECE_COLORS: Record<PieceType, string> = {
  I: "#31c7ef",
  O: "#f7d308",
  T: "#ad4d9c",
  S: "#42b642",
  Z: "#ef2029",
  J: "#5a65ad",
  L: "#ef7921",
};

const LINE_SCORES = [0, 100, 300, 500, 800];
const SPAWN_ROW = 0;
const SPAWN_COL = 3;

function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface ActivePiece {
  type: PieceType;
  rotation: number;
  row: number;
  col: number;
}

export class TetrisEngine implements DeterministicGame<TetrisAction> {
  private board: (PieceType | 0)[][] = [];
  private score = 0;
  private rng!: Rng;
  private bag: PieceType[] = [];
  private current: ActivePiece | null = null;
  private gravityAccumulatorMs = 0;
  private gameOver = false;
  /** Bumped on every visible mutation (piece move/rotate/lock, game over) so
   *  the UI can skip re-rendering frames where nothing actually changed. */
  private version = 0;
  /** Cosmetic-only running total (not part of score/hash/replay verification)
   *  so the UI can detect "a line just cleared" and play a flash animation —
   *  purely a rendering signal, doesn't affect determinism. */
  private totalLinesCleared = 0;

  init(seed: string): void {
    this.rng = rngFromHexSeed(seed);
    this.board = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(0));
    this.score = 0;
    this.bag = [];
    this.gravityAccumulatorMs = 0;
    this.gameOver = false;
    this.totalLinesCleared = 0;
    this.spawnNext();
  }

  private nextFromBag(): PieceType {
    if (this.bag.length === 0) this.bag = shuffle(PIECE_TYPES, this.rng);
    return this.bag.pop()!;
  }

  /** Level, and thus gravity speed, is a pure function of an already-tracked
   *  deterministic value (lines cleared) — same pattern as Overdrive's
   *  distance-based speed ramp. No RNG, no wall-clock: identical on replay. */
  private level(): number {
    return Math.floor(this.totalLinesCleared / LINES_PER_LEVEL);
  }

  private dropIntervalMs(): number {
    return Math.max(MIN_DROP_INTERVAL_MS, BASE_DROP_INTERVAL_MS - this.level() * DROP_DECREMENT_PER_LEVEL_MS);
  }

  private spawnNext(): void {
    const type = this.nextFromBag();
    const piece: ActivePiece = { type, rotation: 0, row: SPAWN_ROW, col: SPAWN_COL };
    this.version++;
    if (this.collides(piece)) {
      this.gameOver = true;
      this.current = null;
      return;
    }
    this.current = piece;
  }

  private cells(piece: ActivePiece): [number, number][] {
    return SHAPES[piece.type][piece.rotation].map(
      ([dr, dc]) => [piece.row + dr, piece.col + dc] as [number, number]
    );
  }

  private collides(piece: ActivePiece): boolean {
    for (const [r, c] of this.cells(piece)) {
      if (c < 0 || c >= WIDTH || r < 0 || r >= HEIGHT) return true;
      if (this.board[r][c] !== 0) return true;
    }
    return false;
  }

  private lockPiece(): void {
    if (!this.current) return;
    for (const [r, c] of this.cells(this.current)) {
      if (r >= 0 && r < HEIGHT) this.board[r][c] = this.current.type;
    }
    const cleared = this.clearLines();
    this.score += LINE_SCORES[cleared] ?? 0;
    this.totalLinesCleared += cleared;
    this.gravityAccumulatorMs = 0;
    this.spawnNext();
  }

  private clearLines(): number {
    const remaining = this.board.filter((row) => row.some((cell) => cell === 0));
    const cleared = HEIGHT - remaining.length;
    while (remaining.length < HEIGHT) remaining.unshift(Array(WIDTH).fill(0));
    this.board = remaining;
    return cleared;
  }

  applyInput(action: TetrisAction, _t: number): void {
    if (this.gameOver || !this.current) return;
    const piece = this.current;

    switch (action) {
      case "move_left": {
        const moved = { ...piece, col: piece.col - 1 };
        if (!this.collides(moved)) {
          this.current = moved;
          this.version++;
        }
        break;
      }
      case "move_right": {
        const moved = { ...piece, col: piece.col + 1 };
        if (!this.collides(moved)) {
          this.current = moved;
          this.version++;
        }
        break;
      }
      case "rotate_cw": {
        const rotated = { ...piece, rotation: (piece.rotation + 1) % 4 };
        if (!this.collides(rotated)) {
          this.current = rotated;
          this.version++;
        }
        break;
      }
      case "rotate_ccw": {
        const rotated = { ...piece, rotation: (piece.rotation + 3) % 4 };
        if (!this.collides(rotated)) {
          this.current = rotated;
          this.version++;
        }
        break;
      }
      case "soft_drop": {
        const moved = { ...piece, row: piece.row + 1 };
        if (!this.collides(moved)) {
          this.current = moved;
          this.score += 1;
          this.gravityAccumulatorMs = 0;
          this.version++;
        } else {
          this.lockPiece();
        }
        break;
      }
      case "hard_drop": {
        let dist = 0;
        let moved = piece;
        while (!this.collides({ ...moved, row: moved.row + 1 })) {
          moved = { ...moved, row: moved.row + 1 };
          dist++;
        }
        this.current = moved;
        this.score += dist * 2;
        this.lockPiece();
        break;
      }
    }
  }

  tick(dtMs: number): void {
    if (this.gameOver || !this.current) return;
    this.gravityAccumulatorMs += dtMs;
    const interval = this.dropIntervalMs();
    if (this.gravityAccumulatorMs < interval) return;
    this.gravityAccumulatorMs -= interval;
    const moved = { ...this.current, row: this.current.row + 1 };
    if (!this.collides(moved)) {
      this.current = moved;
      this.version++;
    } else {
      this.lockPiece();
    }
  }

  getScore(): number {
    return this.score;
  }

  isGameOver(): boolean {
    return this.gameOver;
  }

  /** Monotonic counter bumped on every visible mutation — cheap way for the
   *  UI to skip re-rendering rAF frames where nothing actually changed. */
  getVersion(): number {
    return this.version;
  }

  /** See `totalLinesCleared` — cosmetic only, purely for triggering a
   *  line-clear flash animation in the UI. */
  getTotalLinesCleared(): number {
    return this.totalLinesCleared;
  }

  /** Current level (lines cleared / 10) — drives gravity speed; exposed so
   *  the UI can show it. */
  getLevel(): number {
    return this.level();
  }

  /**
   * The upcoming piece, without consuming it — a pure read of the current
   * bag's next draw (same pop-from-end order `nextFromBag` will use), no RNG
   * call, no mutation. The seeded bag has already deterministically decided
   * this; showing it doesn't change anything about what's coming.
   *
   * Returns null only in the rare instant right after the bag has just been
   * fully drawn and hasn't been reshuffled yet — the next reshuffle only
   * happens lazily inside `nextFromBag` itself (preserving the exact
   * original RNG consumption order), so peeking one draw further than that
   * would require consuming RNG state early. A blank preview for that one
   * spawn is a fine tradeoff over touching draw-order determinism.
   */
  getNextPieceType(): PieceType | null {
    return this.bag.length > 0 ? this.bag[this.bag.length - 1] : null;
  }

  getStateHash(): string {
    const p = this.current;
    const pieceStr = p ? `${p.type}:${p.rotation}:${p.row}:${p.col}` : "none";
    const flat = `${this.board.flat().join(",")}|${this.score}|${pieceStr}`;
    return bytesToHex(sha256(new TextEncoder().encode(flat))).slice(0, 16);
  }

  /** Board with the active piece composited in, for rendering. */
  getRenderBoard(): (PieceType | 0)[][] {
    const board = this.board.map((row) => [...row]);
    if (this.current) {
      for (const [r, c] of this.cells(this.current)) {
        if (r >= 0 && r < HEIGHT) board[r][c] = this.current.type;
      }
    }
    return board;
  }
}

/** Cell offsets for a piece's shape at a given rotation — used by the
 *  next-piece preview (rotation 0 is enough for a small preview icon). */
export function getPieceShape(type: PieceType, rotation = 0): number[][] {
  return SHAPES[type][rotation];
}

export { WIDTH as TETRIS_WIDTH, HEIGHT as TETRIS_HEIGHT };
