import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { DeterministicGame } from "../core/types";
import { Rng, rngFromHexSeed } from "../core/prng";

/**
 * Steering is analogue (a continuous road-relative position, not 3 fixed
 * lanes) but the *input log* only ever carries discrete press/release
 * transitions — like a held key. The engine integrates continuous motion
 * from those transitions every fixed tick, so replay only needs to replay a
 * handful of down/up events (small log) to reproduce smooth movement
 * exactly, same as everything else in this game set.
 */
export type RacerAction = "left_down" | "left_up" | "right_down" | "right_up";

/** Game-unit length of the visible track ahead of the player. */
export const TRACK_LENGTH = 100;

const SPAWN_SPACING = 20; // distance units between obstacle spawns
const BASE_SPEED = 16; // units/sec at the start
const SPEED_RAMP_DISTANCE = 140; // speed increases every this many units traveled
const SPEED_INCREMENT = 2.5; // units/sec added per ramp step
const MAX_SPEED = 45; // units/sec cap — keeps the late game brutal, not impossible

const STEER_RATE = 2.0; // road-widths per second, over the -1..1 range
const OBSTACLE_HALF_WIDTH = 0.16;
const PLAYER_HALF_WIDTH = 0.13;
const COLLISION_THRESHOLD = OBSTACLE_HALF_WIDTH + PLAYER_HALF_WIDTH;
const OBSTACLE_X_RANGE = 0.85; // obstacles spawn within [-range, range], never flush on the edge

export interface Obstacle {
  id: number;
  /** road-relative position, -1 (left edge) .. 1 (right edge) */
  x: number;
  /** distanceTraveled value at which this obstacle reaches the player's row */
  triggerDistance: number;
  resolved: boolean;
}

export class RacerEngine implements DeterministicGame<RacerAction> {
  private rng!: Rng;
  private distance = 0;
  private playerX = 0;
  private leftHeld = false;
  private rightHeld = false;
  private obstacles: Obstacle[] = [];
  private nextObstacleId = 1;
  private nextSpawnAt = SPAWN_SPACING;
  private gameOver = false;

  init(seed: string): void {
    this.rng = rngFromHexSeed(seed);
    this.distance = 0;
    this.playerX = 0;
    this.leftHeld = false;
    this.rightHeld = false;
    this.obstacles = [];
    this.nextObstacleId = 1;
    this.nextSpawnAt = SPAWN_SPACING;
    this.gameOver = false;
  }

  private currentSpeed(): number {
    const ramps = Math.floor(this.distance / SPEED_RAMP_DISTANCE);
    return Math.min(MAX_SPEED, BASE_SPEED + ramps * SPEED_INCREMENT);
  }

  private spawnObstacle(): void {
    const x = (this.rng() * 2 - 1) * OBSTACLE_X_RANGE;
    this.obstacles.push({
      id: this.nextObstacleId++,
      x,
      triggerDistance: this.distance + TRACK_LENGTH,
      resolved: false,
    });
  }

  applyInput(action: RacerAction, _t: number): void {
    switch (action) {
      case "left_down":
        this.leftHeld = true;
        break;
      case "left_up":
        this.leftHeld = false;
        break;
      case "right_down":
        this.rightHeld = true;
        break;
      case "right_up":
        this.rightHeld = false;
        break;
    }
  }

  tick(dtMs: number): void {
    if (this.gameOver) return;

    const steerDir = (this.rightHeld ? 1 : 0) - (this.leftHeld ? 1 : 0);
    if (steerDir !== 0) {
      const dt = dtMs / 1000;
      this.playerX = Math.max(-1, Math.min(1, this.playerX + steerDir * STEER_RATE * dt));
    }

    this.distance += this.currentSpeed() * (dtMs / 1000);

    while (this.distance >= this.nextSpawnAt) {
      this.spawnObstacle();
      this.nextSpawnAt += SPAWN_SPACING;
    }

    for (const ob of this.obstacles) {
      if (!ob.resolved && ob.triggerDistance <= this.distance) {
        ob.resolved = true;
        if (Math.abs(ob.x - this.playerX) < COLLISION_THRESHOLD) {
          this.gameOver = true;
        }
      }
    }

    if (this.obstacles.length > 64) {
      this.obstacles = this.obstacles.filter((ob) => ob.triggerDistance > this.distance - TRACK_LENGTH);
    }
  }

  getScore(): number {
    return Math.floor(this.distance);
  }

  /** -1/0/1 — purely cosmetic (drives a UI tilt effect), not part of
   *  score/hash/replay. */
  getSteerDirection(): number {
    return (this.rightHeld ? 1 : 0) - (this.leftHeld ? 1 : 0);
  }

  isGameOver(): boolean {
    return this.gameOver;
  }

  getStateHash(): string {
    const obstacleSummary = this.obstacles
      .filter((o) => !o.resolved)
      .map((o) => `${o.x.toFixed(3)}:${o.triggerDistance.toFixed(1)}`)
      .join(",");
    const flat = `${this.distance.toFixed(1)}|${this.playerX.toFixed(3)}|${obstacleSummary}`;
    return bytesToHex(sha256(new TextEncoder().encode(flat))).slice(0, 16);
  }

  getDistance(): number {
    return this.distance;
  }

  getSpeed(): number {
    return this.currentSpeed();
  }

  getPlayerX(): number {
    return this.playerX;
  }

  /** Unresolved obstacles with 0..1 progress down the visible track. */
  getVisibleObstacles(): { id: number; x: number; progress: number }[] {
    return this.obstacles
      .filter((o) => !o.resolved)
      .map((o) => ({
        id: o.id,
        x: o.x,
        progress: 1 - (o.triggerDistance - this.distance) / TRACK_LENGTH,
      }))
      .filter((o) => o.progress >= -0.05 && o.progress <= 1.05);
  }
}
