/** Shared helpers for the test suites. */

import { DT } from "../../src/core/constants.js";
import { Level } from "../../src/core/level.js";
import { Player } from "../../src/core/player.js";

export const idle = Object.freeze({ left: false, right: false, jump: false, shoot: false, dash: false });

export function press(overrides) {
  return { ...idle, ...overrides };
}

/** A small hand-drawn level; rows are padded to 12 with empty rows on top. */
export function levelFrom(rows) {
  const width = rows[0].length;
  const padded = [...Array.from({ length: 12 - rows.length }, () => ".".repeat(width)), ...rows];
  return new Level(padded);
}

/** Player standing on the floor of `level` at column `col` (feet on top of the floor row). */
export function standingPlayer(level, col, floorRow = 10) {
  const p = new Player(col * 16 + 8, floorRow * 16);
  p.onGround = true;
  return p;
}

/** Step a player `frames` times with a fixed input (or a function frame → input). */
export function run(player, level, input, frames, options) {
  const all = [];
  for (let f = 0; f < frames; f += 1) {
    all.push(...player.update(typeof input === "function" ? input(f) : input, level, DT, options));
  }
  return all;
}

/** Step a game `frames` times. */
export function tick(game, input = idle, frames = 1) {
  for (let f = 0; f < frames; f += 1) game.update(typeof input === "function" ? input(f) : input, DT);
}
