/** A simple scripted player used to prove bosses can be beaten. */

import { DT, TILE } from "../../src/core/constants.js";
import { idle } from "./helpers.js";

/** Walk the hero from the door corridor into the boss room and wait out the intro. */
export function enterArena(game) {
  const level = game.level;
  game.player.x = (level.doorCol - 2) * TILE;
  game.player.y = 10 * TILE - game.player.h;
  game.state = "playing";
  for (let f = 0; f < 60 * 10 && game.state !== "playing" || !game.boss; f += 1) {
    game.update(game.state === "playing" ? { ...idle, right: true } : idle, DT);
  }
}

/**
 * Fight until the boss falls or `seconds` run out. Keeps a medium distance, faces the boss,
 * jumps when it is above, and taps fire. Returns seconds taken (or Infinity).
 */
export function fightBoss(game, seconds = 120) {
  // specials cost energy: fire them a little slower than the boss's hit invulnerability
  const period = game.weapon === "buster" ? 6 : 30;
  for (let f = 0; f < seconds * 60; f += 1) {
    if (game.state !== "playing") return f / 60;
    const p = game.player;
    const b = game.boss;
    const dx = b.x + b.w / 2 - p.cx;
    const dy = b.y + b.h / 2 - p.cy;
    const toward = Math.sign(dx) || 1;
    let move = 0;
    if (Math.abs(dx) > 90) move = toward;
    else if (Math.abs(dx) < 36) move = -toward;
    if (p.facing !== toward && f % 8 === 0) move = toward; // turn to shoot
    const input = {
      ...idle,
      left: move < 0,
      right: move > 0,
      jump: dy < -14 && f % 40 < 30,
      shoot: f % period < 3,
    };
    game.update(input, DT);
  }
  return Infinity;
}
