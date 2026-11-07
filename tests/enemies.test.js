import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DT } from "../src/core/constants.js";
import { createEnemy, ENEMY_TYPES, isShielded, rollDrop, updateEnemy } from "../src/core/enemies.js";
import { mulberry32 } from "../src/core/rng.js";
import { levelFrom, standingPlayer } from "./support/helpers.js";

function world(rows, playerCol) {
  const level = levelFrom(rows);
  const shots = [];
  return {
    level,
    player: standingPlayer(level, playerCol),
    rng: mulberry32(1),
    shots,
    enemyShot: (b) => shots.push(b),
    emit: () => {},
  };
}

function stepEnemy(enemy, game, seconds) {
  for (let f = 0; f < seconds * 60; f += 1) updateEnemy(enemy, game, DT);
}

describe("enemies", () => {
  it("every type has sane stats", () => {
    for (const [kind, type] of Object.entries(ENEMY_TYPES)) {
      const e = createEnemy(kind, 50, 160);
      assert.equal(e.y + e.h, 160);
      assert.ok(type.hp > 0 && type.damage > 0 && type.score > 0);
    }
    assert.throws(() => createEnemy("dragon", 0, 0));
  });

  it("walker patrols and turns around at a ledge", () => {
    const game = world(["..........", "###.......", "###......."], 9);
    const e = createEnemy("walker", 24, 160);
    const xs = [];
    for (let f = 0; f < 600; f += 1) {
      updateEnemy(e, game, DT);
      xs.push(e.x);
    }
    assert.ok(Math.max(...xs) + e.w <= 48 + 1, "never walks off the ledge");
    assert.ok(Math.min(...xs) <= 1, "reaches the wall on the other side");
    assert.equal(e.y + e.h, 160);
  });

  it("flyer chases the player once close", () => {
    const game = world(["....................", "####################"], 2);
    const e = createEnemy("flyer", 120, 120);
    const start = e.x;
    stepEnemy(e, game, 1);
    assert.ok(e.x < start, "moved toward the player");
    assert.equal(e.state, "chase");
  });

  it("turret is shielded while closed and fires aimed shots while open", () => {
    const game = world(["....................", "####################"], 2);
    const e = createEnemy("turret", 120, 160);
    updateEnemy(e, game, DT);
    assert.ok(isShielded(e));
    stepEnemy(e, game, 1.6);
    assert.ok(!isShielded(e));
    assert.equal(game.shots.length, 1);
    assert.ok(game.shots[0].vx < 0, "aimed left at the player");
    stepEnemy(e, game, 2.2);
    assert.equal(game.shots.length, 2, "one shot per cycle");
  });

  it("turret holds fire when the player is far away", () => {
    const game = world([".".repeat(40), "#".repeat(40)], 1);
    const e = createEnemy("turret", 38 * 16, 160);
    stepEnemy(e, game, 5);
    assert.equal(game.shots.length, 0);
  });

  it("hopper leaps toward the player and lands again", () => {
    const game = world(["....................", "####################"], 2);
    const e = createEnemy("hopper", 160, 160);
    const start = e.x;
    let airborne = false;
    for (let f = 0; f < 120; f += 1) {
      updateEnemy(e, game, DT);
      if (e.y + e.h < 150) airborne = true;
    }
    assert.ok(airborne);
    assert.ok(e.x < start);
    assert.ok(e.onGround);
  });

  it("drops are seeded and roughly a quarter of kills drop something", () => {
    const rng = mulberry32(7);
    const drops = Array.from({ length: 2000 }, () => rollDrop(rng));
    const rate = drops.filter(Boolean).length / drops.length;
    assert.ok(rate > 0.2 && rate < 0.32, `drop rate ${rate}`);
    const again = mulberry32(7);
    assert.deepEqual(drops.slice(0, 20), Array.from({ length: 20 }, () => rollDrop(again)));
  });
});
