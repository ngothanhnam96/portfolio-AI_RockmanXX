/**
 * Bosses: one per stage, each a timer-driven state machine confined to the arena.
 * `game` exposes { level, player, rng, arena, enemyShot(b), emit(type, data) }.
 *
 * Enemy-bullet extensions used here (handled by the game):
 *   gravity        px/s² pulling the bullet down
 *   warnT          seconds the bullet is a harmless telegraph before it becomes live
 *   life           seconds before it disappears
 *   homing         turn rate (rad/s) toward the player
 *   floorDie       vanish on touching the arena floor
 */

import { centerX, centerY, moveX, moveY } from "./physics.js";

export const BOSS_HIT_INVULN = 0.4;
export const WEAKNESS_MULTIPLIER = 3;
const GRAVITY = 950;

export const BOSS_TYPES = Object.freeze({
  ember: { name: "Hỏa Thần Lò Rèn", w: 24, h: 28, hp: 28, weakness: "frost", contact: 4, flying: false },
  frost: { name: "Vệ Binh Băng", w: 22, h: 26, hp: 28, weakness: "storm", contact: 4, flying: false },
  storm: { name: "Ong Chúa Bão", w: 24, h: 20, hp: 28, weakness: "ember", contact: 4, flying: true },
  core: { name: "Lõi Tối Thượng", w: 36, h: 36, hp: 40, weakness: null, contact: 5, flying: true },
});

export function createBoss(id, arena, spawn) {
  const type = BOSS_TYPES[id];
  if (!type) throw new Error(`unknown boss ${id}`);
  const boss = {
    id,
    name: type.name,
    weakness: type.weakness,
    contact: type.contact,
    flying: type.flying,
    w: type.w,
    h: type.h,
    x: spawn.x - type.w / 2,
    y: spawn.y - type.h,
    vx: 0,
    vy: 0,
    hp: type.hp,
    maxHp: type.hp,
    facing: -1,
    state: "idle",
    t: 0,
    step: 0,
    invulnT: 0,
    flash: 0,
    onGround: false,
    phase: 1,
    turn: 0,
  };
  if (boss.flying) {
    boss.homeY = arena.floor - 64 - boss.h / 2;
    boss.y = boss.homeY;
  }
  return boss;
}

/** Apply a hit. Returns the damage dealt (0 while invulnerable after the previous hit). */
export function damageBoss(boss, damage, weapon) {
  if (boss.invulnT > 0 || boss.hp <= 0) return 0;
  const dealt = damage * (weapon && weapon === boss.weakness ? WEAKNESS_MULTIPLIER : 1);
  boss.hp = Math.max(0, boss.hp - dealt);
  boss.invulnT = BOSS_HIT_INVULN;
  boss.flash = 0.15;
  return dealt;
}

function face(boss, player) {
  boss.facing = centerX(player) < centerX(boss) ? -1 : 1;
}

function setState(boss, state) {
  boss.state = state;
  boss.t = 0;
  boss.step = 0;
}

/** Walk-and-fall physics for grounded bosses (arena walls keep them in). */
function groundPhysics(boss, game, dt) {
  if (moveX(game.level, boss, boss.vx * dt) !== 0) boss.hitWall = true;
  boss.vy = Math.min(boss.vy + GRAVITY * dt, 400);
  const hit = moveY(game.level, boss, boss.vy * dt, { oneWay: false });
  const landed = hit === 1 && !boss.onGround;
  boss.onGround = hit === 1;
  if (hit !== 0) boss.vy = 0;
  return landed;
}

/** Keep flying bosses inside the arena box. */
function clampToArena(boss, arena) {
  boss.x = Math.max(arena.left, Math.min(arena.right - boss.w, boss.x));
  boss.y = Math.max(arena.top, Math.min(arena.floor - boss.h, boss.y));
}

function aimed(from, to, speed) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { vx: (dx / len) * speed, vy: (dy / len) * speed };
}

function lob(game, boss, targetX, flight = 1.0) {
  const ox = centerX(boss);
  const oy = boss.y + 6;
  game.enemyShot({
    kind: "fireball", x: ox - 5, y: oy - 5, w: 10, h: 10,
    vx: (targetX - ox) / flight, vy: -300, gravity: 600, damage: 3, floorDie: true, life: 3,
  });
}

function lightning(game, x) {
  const { top, floor } = game.arena;
  game.enemyShot({ kind: "bolt", x: x - 6, y: top, w: 12, h: floor - top, vx: 0, vy: 0, warnT: 0.6, life: 0.85, damage: 4, ghost: true });
}

const AI = {
  ember(boss, game, dt) {
    const player = game.player;
    boss.t += dt;
    let landed = false;
    if (boss.state !== "leap") boss.vx = 0;
    landed = groundPhysics(boss, game, dt);
    switch (boss.state) {
      case "idle":
        face(boss, player);
        if (boss.t >= 0.7) {
          boss.turn += 1;
          setState(boss, boss.turn % 2 === 1 ? "leap" : "lob");
        }
        break;
      case "leap":
        if (boss.step === 0) {
          face(boss, player);
          const flight = 0.88;
          boss.vx = Math.max(-170, Math.min(170, (centerX(player) - centerX(boss)) / flight));
          boss.vy = -420;
          boss.onGround = false;
          boss.step = 1;
          game.emit("boss-jump");
        } else if (landed && boss.t > 0.1) {
          boss.vx = 0;
          const y = game.arena.floor - 12;
          for (const dir of [-1, 1]) {
            game.enemyShot({ kind: "wave", x: centerX(boss) - 8, y, w: 16, h: 12, vx: dir * 120, vy: 0, damage: 3, life: 2.2 });
          }
          game.emit("quake");
          setState(boss, "idle");
        }
        break;
      case "lob":
        if (boss.t >= 0.3 * (boss.step + 1) && boss.step < 3) {
          face(boss, player);
          lob(game, boss, centerX(player) + (boss.step - 1) * 24);
          boss.step += 1;
        } else if (boss.t >= 1.3) {
          setState(boss, "idle");
        }
        break;
      default:
        setState(boss, "idle");
    }
  },

  frost(boss, game, dt) {
    const player = game.player;
    boss.t += dt;
    if (boss.state !== "dash") boss.vx = 0;
    boss.hitWall = false;
    groundPhysics(boss, game, dt);
    switch (boss.state) {
      case "idle":
        face(boss, player);
        if (boss.t >= 0.6) {
          boss.turn += 1;
          setState(boss, ["dash", "shards", "icicles"][boss.turn % 3]);
        }
        break;
      case "dash":
        if (boss.step === 0) {
          face(boss, player);
          boss.step = 1; // crouch telegraph
        } else if (boss.step === 1 && boss.t >= 0.45) {
          boss.vx = boss.facing * 210;
          boss.step = 2;
          game.emit("boss-dash");
        } else if (boss.step === 2 && (boss.hitWall || boss.t > 2.5)) {
          boss.vx = 0;
          setState(boss, "idle");
        }
        break;
      case "shards":
        if (boss.step < 2 && boss.t >= 0.25 + boss.step * 0.55) {
          face(boss, player);
          const from = { x: centerX(boss), y: boss.y + 10 };
          const aim = aimed(from, { x: centerX(player), y: centerY(player) }, 150);
          const base = Math.atan2(aim.vy, aim.vx);
          for (const spread of [-0.28, 0, 0.28]) {
            const a = base + spread;
            game.enemyShot({ kind: "shard", x: from.x - 4, y: from.y - 4, w: 8, h: 8, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, damage: 3, life: 3 });
          }
          boss.step += 1;
        } else if (boss.t >= 1.5) {
          setState(boss, "idle");
        }
        break;
      case "icicles":
        if (boss.step === 0) {
          boss.vy = -380;
          boss.onGround = false;
          boss.step = 1;
        } else if (boss.step === 1 && boss.vy >= 0) {
          const px = centerX(player);
          for (const offset of [-40, 0, 40]) {
            const x = Math.max(game.arena.left + 6, Math.min(game.arena.right - 6, px + offset));
            game.enemyShot({ kind: "icicle", x: x - 5, y: game.arena.top, w: 10, h: 14, vx: 0, vy: 0, warnT: 0.45, gravity: 700, damage: 3, floorDie: true, life: 3 });
          }
          boss.step = 2;
        } else if (boss.step === 2 && boss.onGround && boss.t > 1.2) {
          setState(boss, "idle");
        }
        break;
      default:
        setState(boss, "idle");
    }
  },

  storm(boss, game, dt) {
    const player = game.player;
    const arena = game.arena;
    boss.t += dt;
    boss.clock = (boss.clock || 0) + dt;
    switch (boss.state) {
      case "idle": {
        // hover in a lazy figure-eight across the arena
        face(boss, player);
        const mid = (arena.left + arena.right) / 2;
        const targetX = mid + Math.sin(boss.clock * 0.9) * ((arena.right - arena.left) / 2 - 30) - boss.w / 2;
        boss.x += Math.sign(targetX - boss.x) * Math.min(Math.abs(targetX - boss.x), 90 * dt);
        boss.y += Math.sign(boss.homeY - boss.y) * Math.min(Math.abs(boss.homeY - boss.y), 80 * dt);
        boss.y += Math.sin(boss.clock * 5) * 0.4;
        if (boss.t >= 1.4) {
          boss.turn += 1;
          setState(boss, ["dive", "bolt", "sparks"][boss.turn % 3]);
        }
        break;
      }
      case "dive":
        if (boss.step === 0) {
          face(boss, player);
          boss.target = { x: centerX(player) - boss.w / 2, y: arena.floor - boss.h };
          boss.step = 1;
          game.emit("boss-dash");
        } else if (boss.step === 1) {
          const dx = boss.target.x - boss.x;
          const dy = boss.target.y - boss.y;
          const len = Math.hypot(dx, dy);
          const move = 230 * dt;
          if (len <= move) {
            boss.x = boss.target.x;
            boss.y = boss.target.y;
            boss.step = 2;
            boss.t = 0;
          } else {
            boss.x += (dx / len) * move;
            boss.y += (dy / len) * move;
          }
        } else if (boss.step === 2 && boss.t >= 0.5) {
          setState(boss, "idle"); // idle climbs back to hover height
        }
        break;
      case "bolt":
        if (boss.step < 2 && boss.t >= 0.2 + boss.step * 0.8) {
          lightning(game, centerX(player));
          game.emit("warning");
          boss.step += 1;
        } else if (boss.t >= 2.0) {
          setState(boss, "idle");
        }
        break;
      case "sparks":
        if (boss.step < 2 && boss.t >= 0.3 + boss.step * 0.4) {
          const from = { x: centerX(boss), y: centerY(boss) };
          const aim = aimed(from, { x: centerX(player), y: centerY(player) }, 85);
          game.enemyShot({ kind: "spark", x: from.x - 4, y: from.y - 4, w: 8, h: 8, vx: aim.vx, vy: aim.vy, damage: 3, life: 2.6, homing: 1.6 });
          boss.step += 1;
        } else if (boss.t >= 1.4) {
          setState(boss, "idle");
        }
        break;
      default:
        setState(boss, "idle");
    }
    clampToArena(boss, arena);
  },

  core(boss, game, dt) {
    const player = game.player;
    const arena = game.arena;
    if (boss.phase === 1 && boss.hp <= boss.maxHp / 2) {
      boss.phase = 2;
      game.emit("phase");
    }
    const fast = boss.phase === 2 ? 0.6 : 1;
    boss.t += dt;
    boss.clock = (boss.clock || 0) + dt;
    face(boss, player);
    switch (boss.state) {
      case "idle": {
        // drift between the two upper corners, bobbing so jump-shots can reach
        const side = boss.turn % 2 === 0 ? 1 : -1;
        const targetX = (side > 0 ? arena.right - 56 : arena.left + 56) - boss.w / 2;
        boss.x += Math.sign(targetX - boss.x) * Math.min(Math.abs(targetX - boss.x), 70 * dt);
        const targetY = boss.homeY + Math.sin(boss.clock * 2) * 14;
        boss.y += Math.sign(targetY - boss.y) * Math.min(Math.abs(targetY - boss.y), 60 * dt);
        if (boss.t >= 1.3 * fast) {
          boss.turn += 1;
          const attacks = boss.phase === 2 ? ["ring", "lob", "bolt", "dive"] : ["ring", "lob", "bolt"];
          setState(boss, attacks[boss.turn % attacks.length]);
        }
        break;
      }
      case "ring":
        if (boss.step === 0 && boss.t >= 0.3) {
          const count = boss.phase === 2 ? 12 : 8;
          const spin = boss.turn * 0.4;
          for (let i = 0; i < count; i += 1) {
            const a = spin + (i / count) * Math.PI * 2;
            game.enemyShot({ kind: "orb", x: centerX(boss) - 4, y: centerY(boss) - 4, w: 8, h: 8, vx: Math.cos(a) * 85, vy: Math.sin(a) * 85, damage: 3, life: 4 });
          }
          boss.step = 1;
        } else if (boss.t >= 1.0) {
          setState(boss, "idle");
        }
        break;
      case "lob":
        if (boss.step < 3 && boss.t >= 0.25 * (boss.step + 1) * fast) {
          lob(game, boss, centerX(player) + (boss.step - 1) * 30, 0.9);
          boss.step += 1;
        } else if (boss.t >= 1.2) {
          setState(boss, "idle");
        }
        break;
      case "bolt": {
        const strikes = boss.phase === 2 ? 3 : 2;
        if (boss.step < strikes && boss.t >= 0.2 + boss.step * 0.7 * fast) {
          lightning(game, centerX(player));
          game.emit("warning");
          boss.step += 1;
        } else if (boss.t >= 0.4 + strikes * 0.7 * fast) {
          setState(boss, "idle");
        }
        break;
      }
      case "dive":
        if (boss.step === 0) {
          boss.target = { x: centerX(player) - boss.w / 2, y: arena.floor - boss.h };
          boss.step = 1;
          game.emit("boss-dash");
        } else if (boss.step === 1) {
          const dx = boss.target.x - boss.x;
          const dy = boss.target.y - boss.y;
          const len = Math.hypot(dx, dy);
          const move = 200 * dt;
          if (len <= move) {
            boss.step = 2;
            boss.t = 0;
            game.emit("quake");
          } else {
            boss.x += (dx / len) * move;
            boss.y += (dy / len) * move;
          }
        } else if (boss.step === 2 && boss.t >= 0.6) {
          setState(boss, "idle");
        }
        break;
      default:
        setState(boss, "idle");
    }
    clampToArena(boss, arena);
  },
};

export function updateBoss(boss, game, dt) {
  boss.invulnT = Math.max(0, boss.invulnT - dt);
  boss.flash = Math.max(0, boss.flash - dt);
  AI[boss.id](boss, game, dt);
}
