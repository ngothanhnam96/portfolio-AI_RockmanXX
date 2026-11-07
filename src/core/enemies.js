/**
 * Regular enemies. Each kind is a small state machine updated once per step.
 * `game` gives access to { level, player, rng, enemyShot(bullet), emit(type, data) }.
 */

import { TILE } from "./constants.js";
import { centerX, centerY, moveX, moveY } from "./physics.js";

const GRAVITY = 900;

export const ENEMY_TYPES = Object.freeze({
  walker: { name: "Bọ Thép", w: 14, h: 12, hp: 2, damage: 2, score: 100 },
  flyer: { name: "Ong Máy", w: 12, h: 10, hp: 1, damage: 2, score: 150 },
  turret: { name: "Tháp Pháo", w: 14, h: 14, hp: 3, damage: 2, score: 200 },
  hopper: { name: "Ếch Lò Xo", w: 14, h: 14, hp: 3, damage: 3, score: 200 },
});

export const ENEMY_BULLET_DAMAGE = 2;

/** Create an enemy standing with its feet at `bottom`, centred on `cx`. */
export function createEnemy(kind, cx, bottom, spawnId = -1) {
  const type = ENEMY_TYPES[kind];
  if (!type) throw new Error(`unknown enemy ${kind}`);
  return {
    kind,
    spawnId,
    x: cx - type.w / 2,
    y: bottom - type.h,
    w: type.w,
    h: type.h,
    vx: 0,
    vy: 0,
    hp: type.hp,
    damage: type.damage,
    score: type.score,
    facing: -1,
    t: 0,
    state: "idle",
    onGround: false,
    baseY: bottom - type.h,
    homeY: bottom - type.h,
    flash: 0,
    open: kind !== "turret",
  };
}

/** Bullets that hit a closed turret bounce off. */
export function isShielded(enemy) {
  return enemy.kind === "turret" && !enemy.open;
}

function facePlayer(enemy, player) {
  enemy.facing = centerX(player) < centerX(enemy) ? -1 : 1;
}

function fall(enemy, level, dt) {
  enemy.vy = Math.min(enemy.vy + GRAVITY * dt, 330);
  const hit = moveY(level, enemy, enemy.vy * dt);
  enemy.onGround = hit === 1;
  if (hit !== 0) enemy.vy = 0;
}

const UPDATE = {
  walker(e, game, dt) {
    if (e.state === "idle") {
      facePlayer(e, game.player);
      e.state = "walk";
    }
    const speed = 32;
    const blocked = moveX(game.level, e, e.facing * speed * dt);
    fall(e, game.level, dt);
    if (e.onGround) {
      // turn at walls and at ledges
      const aheadCol = Math.floor((e.facing > 0 ? e.x + e.w + 1 : e.x - 1) / TILE);
      const footRow = Math.floor((e.y + e.h + 1) / TILE);
      const level = game.level;
      const floorAhead = level.isSolid(aheadCol, footRow) || level.isOneWay(aheadCol, footRow);
      if (blocked !== 0 || !floorAhead) e.facing = -e.facing;
    }
  },

  flyer(e, game, dt) {
    const player = game.player;
    e.t += dt;
    const dx = centerX(player) - centerX(e);
    if (e.state === "idle" && Math.abs(dx) < 150) e.state = "chase";
    if (e.state === "chase") {
      facePlayer(e, player);
      e.x += Math.sign(dx) * Math.min(Math.abs(dx), 45 * dt);
      const targetY = Math.max(e.homeY - 24, Math.min(centerY(player) - e.h / 2, e.homeY + 64));
      e.baseY += Math.sign(targetY - e.baseY) * Math.min(Math.abs(targetY - e.baseY), 25 * dt);
    }
    e.y = e.baseY + Math.sin(e.t * 4) * 10;
  },

  turret(e, game, dt) {
    const player = game.player;
    facePlayer(e, player);
    e.t += dt;
    const inRange = Math.abs(centerX(player) - centerX(e)) < 160;
    const cycle = e.t % 2.2; // closed 0–1.2 s, open 1.2–2.2 s, fires at 1.5 s
    const wasOpen = e.open;
    e.open = cycle >= 1.2;
    if (e.open && !wasOpen) e.fired = false;
    if (e.open && cycle >= 1.5 && !e.fired && inRange) {
      e.fired = true;
      const ox = centerX(e);
      const oy = e.y + 4;
      const ax = centerX(player) - ox;
      const ay = centerY(player) - oy;
      const len = Math.hypot(ax, ay) || 1;
      game.enemyShot({ x: ox - 3, y: oy - 3, w: 6, h: 6, vx: (ax / len) * 110, vy: (ay / len) * 110, damage: ENEMY_BULLET_DAMAGE, kind: "pellet" });
    }
    fall(e, game.level, dt);
  },

  hopper(e, game, dt) {
    const player = game.player;
    if (e.onGround) {
      e.vx = 0;
      e.t += dt;
      if (e.t >= 0.9 && Math.abs(centerX(player) - centerX(e)) < 170) {
        facePlayer(e, player);
        e.t = 0;
        e.vy = -280;
        e.vx = e.facing * 65;
        e.onGround = false;
      }
    }
    if (moveX(game.level, e, e.vx * dt) !== 0) e.vx = -e.vx;
    fall(e, game.level, dt);
  },
};

export function updateEnemy(enemy, game, dt) {
  enemy.flash = Math.max(0, enemy.flash - dt);
  UPDATE[enemy.kind](enemy, game, dt);
}

/** Random drop on death, or null. Rolls once with the game's seeded RNG. */
export function rollDrop(rng) {
  const r = rng();
  if (r < 0.01) return "life";
  if (r < 0.04) return "big-health";
  if (r < 0.16) return "health";
  if (r < 0.26) return "energy";
  return null;
}
