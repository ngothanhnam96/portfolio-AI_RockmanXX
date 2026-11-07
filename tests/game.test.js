import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TILE } from "../src/core/constants.js";
import { createEnemy } from "../src/core/enemies.js";
import {
  BOSS_SCORE,
  DYING_TIME,
  Game,
  MAX_LIVES,
  PICKUP_VALUES,
  READY_TIME,
  START_LIVES,
} from "../src/core/game.js";
import { PLAYER } from "../src/core/player.js";
import { mulberry32 } from "../src/core/rng.js";
import { MAX_BUSTER_SHOTS, MAX_ENERGY, WEAPONS } from "../src/core/weapons.js";
import { enterArena, fightBoss } from "./support/bot.js";
import { idle, press, tick } from "./support/helpers.js";

const frames = (seconds) => Math.ceil(seconds * 60) + 1;

function playing(stage = "ember", options = {}) {
  const game = new Game({ seed: 11, ...options });
  game.continueGame({ defeated: options.defeated ?? [] });
  game.selectStage(stage);
  tick(game, idle, frames(READY_TIME));
  return game;
}

describe("menus and progress", () => {
  it("starts on the title, a new game goes to stage select", () => {
    const game = new Game({ seed: 1 });
    assert.equal(game.state, "title");
    game.newGame();
    assert.equal(game.state, "select");
    assert.equal(game.lives, START_LIVES);
    assert.deepEqual(game.unlockedWeapons, ["buster"]);
  });

  it("the fortress is locked until the three bosses are defeated", () => {
    const game = new Game({ seed: 1 }).newGame();
    assert.ok(!game.canSelect("core"));
    assert.equal(game.selectStage("core"), false);
    game.continueGame({ defeated: ["ember", "frost", "storm"] });
    assert.ok(game.finalUnlocked);
    assert.ok(game.selectStage("core"));
  });

  it("saved progress unlocks weapons and ignores junk", () => {
    const game = new Game({ seed: 1 }).continueGame({ defeated: ["storm", "core", "nope"] });
    assert.deepEqual(game.progress, { defeated: ["storm"] });
    assert.deepEqual(game.unlockedWeapons, ["buster", "storm"]);
  });

  it("selecting a stage shows READY, then play begins", () => {
    const game = new Game({ seed: 1 }).newGame();
    game.selectStage("ember");
    assert.equal(game.state, "ready");
    tick(game, press({ right: true }), frames(READY_TIME) - 2);
    assert.equal(game.state, "ready");
    const x = game.player.x;
    tick(game, idle, 3);
    assert.equal(game.state, "playing");
    assert.equal(game.player.x, x, "no movement during READY");
  });

  it("pause freezes the world", () => {
    const game = playing();
    assert.equal(game.togglePause(), "paused");
    const x = game.player.x;
    tick(game, press({ right: true }), 30);
    assert.equal(game.player.x, x);
    assert.equal(game.togglePause(), "playing");
    tick(game, press({ right: true }), 30);
    assert.ok(game.player.x > x);
  });
});

describe("weapons", () => {
  it("cycles only through unlocked weapons", () => {
    const game = playing("ember", { defeated: ["ember", "storm"] });
    assert.equal(game.weapon, "buster");
    game.selectWeapon(1);
    assert.equal(game.weapon, "ember");
    game.selectWeapon(1);
    assert.equal(game.weapon, "storm");
    game.selectWeapon(1);
    assert.equal(game.weapon, "buster");
    game.selectWeapon(-1);
    assert.equal(game.weapon, "storm");
    assert.equal(game.selectWeapon("frost"), false);
  });

  it("at most three uncharged pellets on screen", () => {
    const game = playing();
    tick(game, (f) => press({ shoot: f % 2 === 0 }), 12);
    assert.equal(game.bullets.length, MAX_BUSTER_SHOTS);
  });

  it("a held charge fires one big piercing shot", () => {
    const game = playing();
    tick(game, press({ shoot: true }), frames(PLAYER.charge2));
    game.bullets = [];
    tick(game, idle, 1);
    assert.equal(game.bullets.length, 1);
    assert.equal(game.bullets[0].kind, "buster2");
    assert.ok(game.bullets[0].pierce);
  });

  it("special weapons spend energy and stop when empty", () => {
    const game = playing("ember", { defeated: ["ember"] });
    game.selectWeapon("ember");
    const cost = WEAPONS.ember.cost;
    tick(game, (f) => press({ shoot: f % 2 === 0 }), 2);
    assert.equal(game.energy.ember, MAX_ENERGY - cost);
    game.energy.ember = 1;
    game.takeEvents();
    tick(game, (f) => press({ shoot: f % 2 === 0 }), 2);
    assert.equal(game.energy.ember, 1);
    assert.ok(game.takeEvents().some((e) => e.type === "empty"));
  });

  it("frost fires a three-way spread", () => {
    const game = playing("ember", { defeated: ["frost"] });
    game.selectWeapon("frost");
    tick(game, press({ shoot: true }), 1);
    assert.equal(game.bullets.length, 3);
  });
});

describe("enemies in play", () => {
  it("enemies spawn when their spot scrolls into view", () => {
    const game = playing();
    assert.ok(game.enemies.length >= 1, "the walker near the start is already there");
    const spawned = game.enemies.length;
    game.player.x = 60 * TILE;
    tick(game, idle, 2);
    assert.ok(game.spawners.some((s) => s.alive && s.x > 50 * TILE));
    assert.ok(game.enemies.length >= 1);
    assert.ok(spawned >= 1);
  });

  it("shooting an enemy kills it and scores", () => {
    const game = playing();
    game.enemies = [createEnemy("walker", game.player.cx + 40, game.player.y + game.player.h)];
    game.enemies[0].update = null;
    const before = game.score;
    for (let i = 0; i < 4; i += 1) tick(game, (f) => press({ shoot: f === 0 }), 20);
    assert.equal(game.enemies.filter((e) => e.kind === "walker" && e.spawnId === -1).length, 0);
    assert.ok(game.score >= before + 100);
  });

  it("touching an enemy hurts", () => {
    const game = playing();
    const p = game.player;
    game.enemies = [createEnemy("hopper", p.cx, p.y + p.h)];
    tick(game, idle, 1);
    assert.ok(p.hp < PLAYER.maxHp);
    assert.ok(game.takeEvents().some((e) => e.type === "hurt"));
  });

  it("closed turrets deflect shots", () => {
    const game = playing();
    const p = game.player;
    const turret = createEnemy("turret", p.cx + 50, p.y + p.h);
    game.enemies = [turret];
    game.spawners.forEach((s) => { s.armed = false; });
    tick(game, press({ shoot: true }), 1);
    tick(game, idle, 20);
    assert.equal(turret.hp, 3);
    assert.ok(game.takeEvents().some((e) => e.type === "deflect"));
  });
});

describe("pickups", () => {
  it("health, energy and lives apply and are capped", () => {
    const game = playing("ember", { defeated: ["ember", "frost"] });
    const p = game.player;
    p.hp = 5;
    game.applyPickup("health");
    assert.equal(p.hp, 5 + PICKUP_VALUES.health);
    game.applyPickup("big-health");
    game.applyPickup("big-health");
    assert.equal(p.hp, PLAYER.maxHp);
    game.energy.frost = 3;
    game.energy.ember = 20;
    game.applyPickup("energy"); // buster held → lowest special
    assert.equal(game.energy.frost, 3 + PICKUP_VALUES.energy);
    game.lives = MAX_LIVES;
    game.applyPickup("life");
    assert.equal(game.lives, MAX_LIVES);
  });

  it("placed pickups are collected once", () => {
    const game = playing();
    const pickup = game.level.pickups[0];
    game.player.x = pickup.x - 6;
    game.player.y = pickup.y - game.player.h;
    tick(game, idle, 2);
    assert.ok(game.collected.has(pickup.id));
  });
});

describe("death and checkpoints", () => {
  it("falling into a hazard costs a life and respawns at the start", () => {
    const game = playing();
    const start = { x: game.player.x, y: game.player.y };
    game.player.y = game.level.height + 20;
    tick(game, idle, 1);
    assert.equal(game.state, "dying");
    tick(game, idle, frames(DYING_TIME));
    assert.equal(game.lives, START_LIVES - 1);
    assert.equal(game.state, "ready");
    assert.ok(Math.abs(game.player.x - start.x) < 1);
    assert.equal(game.player.hp, PLAYER.maxHp);
  });

  it("passing a checkpoint moves the respawn point", () => {
    const game = playing();
    const cp = game.level.checkpoints[0];
    game.player.x = cp.x + 4;
    game.player.y = cp.y - game.player.h;
    tick(game, idle, 1);
    assert.equal(game.checkpoint, 0);
    game.player.hp = 0;
    tick(game, idle, 1 + frames(DYING_TIME));
    assert.ok(Math.abs(game.player.cx - cp.x) < 1);
  });

  it("losing the last life is game over; retry keeps defeated bosses", () => {
    const game = playing("frost", { defeated: ["ember"] });
    game.lives = 0;
    game.player.hp = 0;
    tick(game, idle, 1 + frames(DYING_TIME));
    assert.equal(game.state, "game-over");
    game.retry();
    assert.equal(game.state, "select");
    assert.equal(game.lives, START_LIVES);
    assert.deepEqual(game.progress.defeated, ["ember"]);
  });
});

describe("boss room", () => {
  it("walking into the door scrolls the camera, closes the door and starts the intro", () => {
    const game = playing();
    game.player.x = (game.level.doorCol - 1) * TILE;
    const states = new Set();
    for (let f = 0; f < 600 && !(game.boss && game.state === "playing"); f += 1) {
      tick(game, press({ right: true }));
      states.add(game.state);
    }
    tick(game, press({ right: true }), 300);
    assert.ok(states.has("door") && states.has("boss-intro"));
    assert.ok(game.level.doorClosed);
    assert.equal(game.camX, game.level.arenaX);
    assert.ok(game.boss);
    assert.ok(game.player.x >= game.arena.left, "cannot leave through the closed door");
  });

  it("defeating a boss unlocks its weapon and returns a clear result", () => {
    const game = new Game({ seed: 5, invincible: true }).newGame();
    game.selectStage("frost");
    enterArena(game);
    const score = game.score;
    assert.ok(fightBoss(game, 150) < 150);
    assert.equal(game.state, "boss-dying");
    tick(game, idle, frames(3));
    assert.equal(game.state, "clear");
    assert.deepEqual(game.clearInfo.weapon, "frost");
    assert.ok(game.score >= score + BOSS_SCORE);
    assert.deepEqual(game.unlockedWeapons, ["buster", "frost"]);
    game.toSelect();
    assert.equal(game.state, "select");
    assert.equal(game.level, null, "no stale level is left for the renderer");
    assert.equal(game.player, null);
  });

  it("beating the fortress core is victory", () => {
    const game = new Game({ seed: 5, invincible: true }).continueGame({ defeated: ["ember", "frost", "storm"] });
    game.selectStage("core");
    enterArena(game);
    assert.ok(fightBoss(game, 150) < 150);
    tick(game, idle, frames(3));
    assert.equal(game.state, "victory");
  });

  it("the same seed and inputs replay identically", () => {
    const script = (f) => press({ right: f % 90 < 70, jump: f % 45 < 20, shoot: f % 10 < 2, dash: f % 120 < 15 });
    const runOnce = () => {
      const game = playing("storm");
      tick(game, script, 1500);
      return [game.player.x, game.player.y, game.score, game.state, game.enemies.length];
    };
    assert.deepEqual(runOnce(), runOnce());
  });
});

describe("robustness", () => {
  it("two minutes of random input on every stage never breaks the state", () => {
    for (const stage of ["ember", "frost", "storm", "core"]) {
      const rng = mulberry32(stage.length * 97);
      const game = new Game({ seed: 4 }).continueGame({ defeated: ["ember", "frost", "storm"] });
      game.selectStage(stage);
      let input = idle;
      for (let f = 0; f < 60 * 120; f += 1) {
        if (f % 10 === 0) input = press({ left: rng() < 0.15, right: rng() < 0.8, jump: rng() < 0.4, shoot: rng() < 0.5, dash: rng() < 0.2 });
        if (f % 300 === 0) game.selectWeapon(1);
        tick(game, input);
        if (game.state === "game-over") {
          game.retry();
          game.selectStage(stage);
        }
        const p = game.player;
        assert.ok(Number.isFinite(p.x + p.y + p.vx + p.vy), `${stage} frame ${f}`);
        assert.ok(p.hp >= 0 && p.hp <= PLAYER.maxHp);
        assert.ok(game.camX >= 0 && game.camX <= game.level.width - 320);
      }
    }
  });
});
