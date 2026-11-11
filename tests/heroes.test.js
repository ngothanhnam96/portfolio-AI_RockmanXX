import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BOSS_TYPES } from "../src/core/bosses.js";
import { DT } from "../src/core/constants.js";
import { createEnemy } from "../src/core/enemies.js";
import { Game, READY_TIME } from "../src/core/game.js";
import { BLADE, BLADE_ARTS, HERO_ORDER, HEROES, heroById, weaponInfo } from "../src/core/heroes.js";
import { STAGES } from "../src/core/stages.js";
import { MAX_ENERGY, WEAPONS } from "../src/core/weapons.js";
import { enterArena } from "./support/bot.js";
import { idle, press, tick } from "./support/helpers.js";

const frames = (seconds) => Math.ceil(seconds * 60) + 1;

function playing(hero = "lam", stage = "ember", options = {}) {
  const game = new Game({ seed: 11, hero, ...options });
  game.continueGame({ defeated: options.defeated ?? [] });
  game.selectStage(stage);
  tick(game, idle, frames(READY_TIME));
  game.enemies = [];
  game.spawners = [];
  return game;
}

/** An enemy standing `dx` px in front of (or behind, if negative) the hero. */
function enemyAt(game, dx, kind = "walker") {
  const p = game.player;
  const e = createEnemy(kind, p.cx + dx, p.y + p.h, 99);
  e.hp = 50;
  e.vx = 0;
  game.enemies.push(e);
  return e;
}

const tap = (game) => {
  tick(game, press({ shoot: true }));
  tick(game, idle);
};

describe("heroes", () => {
  it("there are two heroes and an unknown id falls back to Volt", () => {
    assert.deepEqual(HERO_ORDER, ["volt", "lam"]);
    assert.equal(heroById("nobody").id, "volt");
    assert.equal(new Game({ hero: "lam" }).hero, "lam");
    assert.equal(new Game({ hero: "???" }).hero, "volt");
  });

  it("the hero can be changed on the menus but not in the middle of a stage", () => {
    const game = new Game({ seed: 1 }).newGame();
    assert.ok(game.setHero("lam"));
    assert.equal(game.heroSpec.name, HEROES.lam.name);
    game.selectStage("ember");
    assert.equal(game.player.hero, "lam");
    assert.equal(game.setHero("volt"), false);
    assert.equal(game.hero, "lam");
    assert.equal(game.setHero("nobody"), false);
  });

  it("Volt still shoots pellets", () => {
    const game = playing("volt");
    tick(game, press({ shoot: true }));
    assert.equal(game.bullets[0].kind, "buster0");
  });
});

describe("Lam Phong's blade", () => {
  it("a slash hits an enemy in front, not one behind", () => {
    const game = playing();
    const front = enemyAt(game, 16);
    const behind = enemyAt(game, -20);
    tap(game);
    assert.equal(front.hp, 50 - BLADE.combo[0]);
    assert.equal(behind.hp, 50);
    assert.ok(game.takeEvents().some((e) => e.type === "slash"));
  });

  it("a slash hits each enemy once, then disappears", () => {
    const game = playing();
    const e = enemyAt(game, 16);
    tap(game);
    tick(game, idle, frames(BLADE.slashTime));
    assert.equal(e.hp, 50 - BLADE.combo[0]);
    assert.equal(game.bullets.length, 0);
  });

  it("taps in rhythm chain a 3-hit combo, then it starts again", () => {
    const game = playing();
    const steps = [];
    for (let i = 0; i < 4; i += 1) {
      tap(game);
      steps.push(game.player.slashStep);
      tick(game, idle, frames(BLADE.cooldown));
    }
    assert.deepEqual(steps, [0, 1, 2, 0]);
  });

  it("the combo resets after a pause, and slashes are rate-limited", () => {
    const game = playing();
    tap(game);
    tick(game, idle, frames(BLADE.comboWindow));
    tap(game);
    assert.equal(game.player.slashStep, 0);
    const before = game.takeEvents().filter((e) => e.type === "slash").length;
    tap(game); // too soon after the last one
    assert.equal(game.takeEvents().filter((e) => e.type === "slash").length, 0);
    assert.ok(before > 0);
  });

  it("in the air the slash spins and also reaches behind", () => {
    const game = playing();
    tick(game, press({ jump: true }), 10);
    const behind = enemyAt(game, -14);
    behind.y = game.player.y;
    tick(game, press({ jump: true, shoot: true }));
    assert.equal(game.bullets[0].kind, "slash-air");
    assert.ok(behind.hp < 50);
  });

  it("half charge releases a wide slash, full charge a blade wave that flies", () => {
    const game = playing();
    tick(game, press({ shoot: true }), frames(0.6));
    tick(game, idle, frames(BLADE.cooldown));
    assert.ok(game.bullets.some((b) => b.kind === "slash-wide"));

    tick(game, idle, frames(0.3));
    tick(game, press({ shoot: true }), frames(1.4));
    tick(game, idle);
    const wave = game.bullets.find((b) => b.kind === "wave");
    assert.ok(wave, "a wave was thrown");
    const x = wave.x;
    tick(game, idle, 10);
    assert.ok(Math.abs(wave.x - x) > 20, "the wave travels");
  });

  it("cuts ordinary enemy shots, but not beams", () => {
    const game = playing();
    const p = game.player;
    game.enemyShot({ kind: "pellet", x: p.x + p.w + 6, y: p.y + 6, w: 6, h: 6, vx: 0, vy: 0, damage: 2 });
    game.enemyShot({ kind: "bolt", x: p.x + p.w + 8, y: 0, w: 12, h: 200, vx: 0, vy: 0, damage: 4, ghost: true, warnT: 1, life: 2 });
    tap(game);
    assert.equal(game.enemyBullets.length, 1);
    assert.equal(game.enemyBullets[0].kind, "bolt");
    assert.ok(game.takeEvents().some((e) => e.type === "parry"));
    assert.equal(p.hp, 20);
  });

  it("clangs off a closed turret shield without damage", () => {
    const game = playing();
    const turret = enemyAt(game, 16, "turret");
    turret.open = false;
    turret.hp = 3;
    tap(game);
    assert.equal(turret.hp, 3);
    assert.ok(game.takeEvents().some((e) => e.type === "deflect"));
  });

});

describe("Lam Phong learns a new blade from each boss", () => {
  const ALL = ["ember", "frost", "storm"];

  it("each boss weapon becomes a named blade technique for Lam Phong, Volt keeps the shot", () => {
    for (const id of ALL) {
      assert.equal(weaponInfo("lam", id).name, BLADE_ARTS[id].name);
      assert.equal(weaponInfo("volt", id).name, WEAPONS[id].name);
      assert.notEqual(BLADE_ARTS[id].name, WEAPONS[id].name);
    }
    assert.equal(weaponInfo("lam", "buster").name, HEROES.lam.primaryName);
  });

  for (const id of ALL) {
    it(`${id}: a melee strike carrying the weapon (for weakness), spending its energy, no projectile`, () => {
      const game = playing("lam", "ember", { defeated: ALL });
      game.selectWeapon(id);
      tap(game);
      assert.equal(game.bullets.length, 1);
      const [box] = game.bullets;
      assert.equal(box.kind, BLADE_ARTS[id].kind);
      assert.equal(box.weapon, id);
      assert.ok(box.melee);
      assert.equal(game.energy[id], MAX_ENERGY - WEAPONS[id].cost);
      assert.ok(game.takeEvents().some((e) => e.type === "slash" && e.weapon === id));
    });
  }

  it("techniques are rate-limited and stop when energy runs out", () => {
    const game = playing("lam", "ember", { defeated: ALL });
    game.selectWeapon("frost");
    tap(game);
    tap(game); // still on cooldown
    assert.equal(game.energy.frost, MAX_ENERGY - 1);
    game.energy.frost = 0;
    tick(game, idle, frames(BLADE.artCooldown));
    tap(game);
    assert.equal(game.bullets.length, 0);
    assert.ok(game.takeEvents().some((e) => e.type === "empty"));
  });

  it("Hỏa Long Kiếm reaches high above the head, Băng Thứ Kiếm far ahead, Lôi Toàn Kiếm both sides", () => {
    const hit = (weapon, dx, dy) => {
      const game = playing("lam", "ember", { defeated: ALL });
      game.selectWeapon(weapon);
      const e = enemyAt(game, dx);
      e.y += dy;
      tap(game);
      return e.hp < 50;
    };
    assert.ok(hit("ember", 14, -36), "flame slash reaches up");
    assert.ok(!hit("buster", 14, -36), "a plain slash does not");
    assert.ok(hit("frost", 44, 0), "ice thrust reaches far");
    assert.ok(!hit("buster", 44, 0), "a plain slash does not");
    assert.ok(hit("storm", 24, 0) && hit("storm", -24, 0), "lightning spin hits both sides");
  });

  it("cuts enemy shots like the plain blade", () => {
    const game = playing("lam", "ember", { defeated: ALL });
    game.selectWeapon("storm");
    const p = game.player;
    game.enemyShot({ kind: "pellet", x: p.x - 16, y: p.y + 6, w: 6, h: 6, vx: 0, vy: 0, damage: 2 });
    tap(game);
    assert.equal(game.enemyBullets.length, 0);
  });
});

/** Close in and slash; charge a wave when the boss is high up. */
function bladeFight(game, seconds = 150) {
  for (let f = 0; f < seconds * 60; f += 1) {
    if (game.state !== "playing") return f / 60;
    const p = game.player;
    const b = game.boss;
    const dx = b.x + b.w / 2 - p.cx;
    const dy = b.y + b.h / 2 - p.cy;
    const toward = Math.sign(dx) || 1;
    const reach = b.w / 2 + 14;
    const move = Math.abs(dx) > reach ? toward : p.facing !== toward ? toward : 0;
    const high = dy < -30;
    game.update({
      ...idle,
      left: move < 0,
      right: move > 0,
      jump: dy < -10 && f % 40 < 30,
      shoot: high ? f % 100 < 90 : f % 10 < 3, // hold for a wave when it flies high, else tap
    }, DT);
  }
  return Infinity;
}

describe("Lam Phong can beat every boss with the blade alone (scripted bot)", () => {
  for (const stage of STAGES) {
    it(`${stage.boss}`, () => {
      const game = new Game({ seed: 3, invincible: true, hero: "lam" });
      game.continueGame({ defeated: stage.final ? ["ember", "frost", "storm"] : [] });
      game.selectStage(stage.id);
      enterArena(game);
      const seconds = bladeFight(game);
      assert.equal(game.state, "boss-dying");
      assert.ok(seconds < 150, `took too long (${seconds}s), boss hp ${game.boss.hp}`);
    });
  }

  for (const stage of STAGES.filter((s) => !s.final)) {
    const weakness = BOSS_TYPES[stage.boss].weakness;
    it(`${stage.boss} falls faster to the blade learned from its weakness (${BLADE_ARTS[weakness].name})`, () => {
      const fight = (weapon) => {
        const game = new Game({ seed: 3, invincible: true, hero: "lam" });
        game.continueGame({ defeated: ["ember", "frost", "storm"] });
        game.selectStage(stage.id);
        enterArena(game);
        game.selectWeapon(weapon);
        const seconds = bladeFight(game);
        assert.equal(game.state, "boss-dying");
        return seconds;
      };
      const plain = fight("buster");
      const weak = fight(weakness);
      assert.ok(weak < plain, `${weakness} ${weak}s vs blade ${plain}s`);
    });
  }
});
