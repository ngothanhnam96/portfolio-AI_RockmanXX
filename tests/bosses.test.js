import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BOSS_HIT_INVULN, BOSS_TYPES, createBoss, damageBoss, WEAKNESS_MULTIPLIER } from "../src/core/bosses.js";
import { Game } from "../src/core/game.js";
import { STAGES } from "../src/core/stages.js";
import { enterArena, fightBoss } from "./support/bot.js";
import { idle, tick } from "./support/helpers.js";

const BOSS_IDS = Object.keys(BOSS_TYPES);

function arenaGame(stageId, { defeated = ["ember", "frost", "storm"], seed = 3 } = {}) {
  const game = new Game({ seed, invincible: true });
  game.continueGame({ defeated });
  game.selectStage(stageId);
  enterArena(game);
  return game;
}

describe("boss damage", () => {
  it("weakness weapons deal triple damage, then a short invulnerability", () => {
    const boss = createBoss("ember", { left: 0, right: 300, top: 16, floor: 160 }, { x: 100, y: 160 });
    assert.equal(damageBoss(boss, 1, "buster"), 1);
    assert.equal(damageBoss(boss, 3, "frost"), 0, "invulnerable right after a hit");
    boss.invulnT = 0;
    assert.equal(damageBoss(boss, 3, "frost"), 3 * WEAKNESS_MULTIPLIER);
    assert.equal(boss.hp, boss.maxHp - 1 - 9);
    assert.ok(Math.abs(boss.invulnT - BOSS_HIT_INVULN) < 1e-9);
  });

  it("weakness chain: each stage weapon beats another boss", () => {
    const weapons = STAGES.filter((s) => s.weapon).map((s) => s.weapon);
    const weaknesses = BOSS_IDS.map((id) => BOSS_TYPES[id].weakness).filter(Boolean);
    assert.deepEqual([...weaknesses].sort(), [...weapons].sort());
    for (const id of BOSS_IDS) assert.notEqual(BOSS_TYPES[id].weakness, id, "not weak to its own weapon");
  });
});

describe("boss behaviour", () => {
  for (const stage of STAGES) {
    it(`${stage.boss}: spawns in the arena after the door and stays inside for 60 s`, () => {
      const game = arenaGame(stage.id);
      assert.equal(game.state, "playing");
      assert.ok(game.level.doorClosed);
      const arena = game.arena;
      const kinds = new Set();
      for (let f = 0; f < 60 * 60; f += 1) {
        tick(game, idle);
        const b = game.boss;
        assert.ok(b.x >= arena.left - 0.01 && b.x + b.w <= arena.right + 0.01, `x ${b.x}`);
        assert.ok(b.y >= arena.top - 0.01 && b.y + b.h <= arena.floor + 0.01, `y ${b.y}`);
        for (const s of game.enemyBullets) kinds.add(s.kind);
      }
      assert.ok(kinds.size >= 2, `uses several attacks: ${[...kinds]}`);
    });
  }

  it("final boss enters phase 2 at half health", () => {
    const game = arenaGame("core");
    game.boss.hp = game.boss.maxHp / 2;
    tick(game, idle);
    assert.equal(game.boss.phase, 2);
    assert.ok(game.takeEvents().some((e) => e.type === "phase"));
  });
});

describe("bosses can be beaten (scripted bot)", () => {
  for (const stage of STAGES) {
    it(`${stage.boss} falls to the plain buster`, () => {
      const game = arenaGame(stage.id, { defeated: stage.final ? ["ember", "frost", "storm"] : [] });
      const seconds = fightBoss(game, 150);
      assert.ok(seconds < 150, `took too long (${seconds}s), boss hp ${game.boss.hp}`);
      assert.equal(game.state, "boss-dying");
    });
  }

  it("the weakness weapon wins much faster", () => {
    const plain = arenaGame("frost", { defeated: [] });
    const weak = arenaGame("frost");
    weak.selectWeapon("storm");
    const slow = fightBoss(plain, 150);
    const fast = fightBoss(weak, 150);
    assert.ok(fast < slow, `weakness ${fast}s vs buster ${slow}s`);
  });
});
