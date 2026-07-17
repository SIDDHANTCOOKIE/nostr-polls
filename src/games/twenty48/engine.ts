import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { DeterministicGame } from "../core/types";
import { Rng, randInt, rngFromHexSeed } from "../core/prng";

export type Twenty48Action = "left" | "right" | "up" | "down";

const SIZE = 4;

/** A tile with a stable identity across moves — what makes slide animation
 *  possible: the UI can transition a tile's position instead of just
 *  re-rendering a changed number in a fixed cell. */
export interface Tile {
  id: number;
  value: number;
  row: number;
  col: number;
}

export class Twenty48Engine implements DeterministicGame<Twenty48Action> {
  private tiles: Tile[] = [];
  private nextId = 1;
  private score = 0;
  private rng!: Rng;
  private gameOver = false;

  init(seed: string): void {
    this.rng = rngFromHexSeed(seed);
    this.tiles = [];
    this.nextId = 1;
    this.score = 0;
    this.gameOver = false;
    this.spawnTile();
    this.spawnTile();
  }

  private occupiedGrid(): boolean[][] {
    const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
    for (const t of this.tiles) grid[t.row][t.col] = true;
    return grid;
  }

  private valueGrid(): number[][] {
    const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    for (const t of this.tiles) grid[t.row][t.col] = t.value;
    return grid;
  }

  private emptyCells(): [number, number][] {
    const occupied = this.occupiedGrid();
    const cells: [number, number][] = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) if (!occupied[r][c]) cells.push([r, c]);
    return cells;
  }

  // Same two rng() calls, same order, as the original grid-based
  // implementation (position draw, then value draw) — preserves replay
  // compatibility with anything already recorded/published.
  private spawnTile(): void {
    const empty = this.emptyCells();
    if (empty.length === 0) return;
    const [row, col] = empty[randInt(this.rng, empty.length)];
    const value = this.rng() < 0.9 ? 2 : 4;
    this.tiles.push({ id: this.nextId++, value, row, col });
  }

  /** Maps a line-relative (lineIndex, slot) — slot 0 nearest the edge tiles
   *  collapse toward — to an actual (row, col) for the given direction. */
  private coordAt(action: Twenty48Action, lineIndex: number, slot: number): [number, number] {
    switch (action) {
      case "left":
        return [lineIndex, slot];
      case "right":
        return [lineIndex, SIZE - 1 - slot];
      case "up":
        return [slot, lineIndex];
      case "down":
        return [SIZE - 1 - slot, lineIndex];
    }
  }

  private lineTiles(action: Twenty48Action, lineIndex: number): Tile[] {
    if (action === "left" || action === "right") {
      const line = this.tiles.filter((t) => t.row === lineIndex).sort((a, b) => a.col - b.col);
      return action === "left" ? line : line.reverse();
    }
    const line = this.tiles.filter((t) => t.col === lineIndex).sort((a, b) => a.row - b.row);
    return action === "up" ? line : line.reverse();
  }

  applyInput(action: Twenty48Action, _t: number): void {
    if (this.gameOver) return;

    let moved = false;
    let scoreDelta = 0;
    const toRemove = new Set<number>();

    for (let lineIndex = 0; lineIndex < SIZE; lineIndex++) {
      let slot = 0;
      let mergeTarget: Tile | null = null;

      for (const tile of this.lineTiles(action, lineIndex)) {
        if (mergeTarget && mergeTarget.value === tile.value) {
          mergeTarget.value *= 2;
          scoreDelta += mergeTarget.value;
          toRemove.add(tile.id);
          moved = true;
          mergeTarget = null; // each tile merges at most once per move
          continue;
        }
        const [newRow, newCol] = this.coordAt(action, lineIndex, slot);
        if (tile.row !== newRow || tile.col !== newCol) moved = true;
        tile.row = newRow;
        tile.col = newCol;
        slot++;
        mergeTarget = tile;
      }
    }

    if (toRemove.size > 0) {
      this.tiles = this.tiles.filter((t) => !toRemove.has(t.id));
    }

    if (moved) {
      this.score += scoreDelta;
      this.spawnTile();
      if (this.isBoardStuck()) this.gameOver = true;
    }
  }

  private isBoardStuck(): boolean {
    if (this.emptyCells().length > 0) return false;
    const grid = this.valueGrid();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = grid[r][c];
        if (c + 1 < SIZE && grid[r][c + 1] === v) return false;
        if (r + 1 < SIZE && grid[r + 1][c] === v) return false;
      }
    }
    return true;
  }

  tick(_dtMs: number): void {
    // turn-based — nothing advances without an input
  }

  getScore(): number {
    return this.score;
  }

  isGameOver(): boolean {
    return this.gameOver;
  }

  getStateHash(): string {
    const flat = `${this.valueGrid().flat().join(",")}|${this.score}`;
    return bytesToHex(sha256(new TextEncoder().encode(flat))).slice(0, 16);
  }

  /** Flat value grid — kept for anything that just wants values, and as the
   *  basis of `getStateHash`. Prefer `getTiles()` for rendering. */
  getBoard(): number[][] {
    return this.valueGrid();
  }

  /** Positioned tiles with stable ids, for slide-animated rendering. */
  getTiles(): Tile[] {
    return this.tiles.map((t) => ({ ...t }));
  }
}
