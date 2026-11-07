import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DT } from "../src/core/constants.js";
import { Player, PLAYER } from "../src/core/player.js";
import { idle, levelFrom, press, run, standingPlayer } from "./support/helpers.js";

const flat = levelFrom(["....................", "####################", "####################"]);

/** How high the feet rise during a jump held for `holdFrames`. */
function apex(player, level, holdFrames) {
  const startBottom = player.y + player.h;
  let top = startBottom;
  for (let f = 0; f < 90; f += 1) {
    player.update(press({ jump: f < holdFrames }), level, DT);
    top = Math.min(top, player.y + player.h);
  }
  return startBottom - top;
}

describe("running", () => {
  it("runs at constant speed and faces the direction of travel", () => {
    const p = standingPlayer(flat, 5);
    const x0 = p.x;
    run(p, flat, press({ right: true }), 60);
    assert.ok(Math.abs(p.x - x0 - PLAYER.run) < 2);
    assert.equal(p.facing, 1);
    run(p, flat, press({ left: true }), 1);
    assert.equal(p.facing, -1);
  });

  it("stays on the floor", () => {
    const p = standingPlayer(flat, 5);
    run(p, flat, idle, 30);
    assert.ok(p.onGround);
    assert.equal(p.y + p.h, 160);
  });
});

describe("jumping", () => {
  it("a held jump rises about three tiles, a tap much less", () => {
    const high = apex(standingPlayer(flat, 5), flat, 90);
    const low = apex(standingPlayer(flat, 5), flat, 3);
    assert.ok(high > 45 && high < 56, `high jump ${high}`);
    assert.ok(low < 20, `short hop ${low}`);
  });

  it("cannot jump again in mid-air", () => {
    const p = standingPlayer(flat, 5);
    run(p, flat, press({ jump: true }), 10);
    run(p, flat, idle, 1);
    const actions = run(p, flat, press({ jump: true }), 1);
    assert.ok(!actions.some((a) => a.type === "jump"));
  });

  it("coyote time: a jump just after walking off a ledge still works", () => {
    const ledge = levelFrom(["..........", "#####.....", "#####....."]);
    const p = standingPlayer(ledge, 4);
    let frames = 0;
    while (p.onGround && frames < 60) {
      p.update(press({ right: true }), ledge, DT);
      frames += 1;
    }
    assert.ok(!p.onGround);
    p.update(press({ right: true }), ledge, DT);
    const actions = p.update(press({ right: true, jump: true }), ledge, DT);
    assert.ok(actions.some((a) => a.type === "jump"));
  });

  it("jump buffer: pressing just before landing jumps on touchdown", () => {
    const p = standingPlayer(flat, 5);
    run(p, flat, press({ jump: true }), 4);
    run(p, flat, idle, 1);
    while (p.vy <= 0 || p.y + p.h < 152) p.update(idle, flat, DT);
    assert.ok(!p.onGround);
    const actions = run(p, flat, press({ jump: true }), 8);
    assert.equal(actions.filter((a) => a.type === "jump").length, 1);
  });

  it("lands with a land action", () => {
    const p = standingPlayer(flat, 5);
    const actions = run(p, flat, (f) => press({ jump: f < 5 }), 60);
    assert.ok(actions.some((a) => a.type === "land"));
    assert.ok(p.onGround);
  });
});

describe("dash", () => {
  it("dashes faster than running for a limited time", () => {
    const p = standingPlayer(flat, 2);
    const x0 = p.x;
    const actions = run(p, flat, press({ dash: true }), 10);
    assert.ok(actions.some((a) => a.type === "dash"));
    assert.ok(p.x - x0 > PLAYER.run * (10 / 60) * 2);
    run(p, flat, press({ dash: true }), 30);
    assert.ok(!p.dashing, "dash ends even while held");
  });

  it("releasing dash or turning around cancels it", () => {
    const p = standingPlayer(flat, 5);
    run(p, flat, press({ dash: true }), 3);
    run(p, flat, idle, 1);
    assert.ok(!p.dashing);
    const q = standingPlayer(flat, 5);
    run(q, flat, press({ dash: true }), 3);
    run(q, flat, press({ dash: true, left: true }), 1);
    assert.ok(!q.dashing);
  });

  it("a dash-jump keeps dash speed in the air", () => {
    const normal = standingPlayer(flat, 2);
    run(normal, flat, (f) => press({ right: true, jump: f < 60 }), 30);
    const dashed = standingPlayer(flat, 2);
    run(dashed, flat, (f) => press({ right: true, dash: true, jump: f >= 2 && f < 60 }), 30);
    assert.ok(dashed.x - normal.x > 40, `dash-jump ${dashed.x} vs ${normal.x}`);
  });
});

describe("walls", () => {
  const shaft = levelFrom([
    "#.........#",
    "#.........#",
    "#.........#",
    "#.........#",
    "#.........#",
    "#.........#",
    "#.........#",
    "###########",
    "###########",
  ]);

  it("slides slowly down a wall while pushing into it", () => {
    const p = new Player(9 * 16 + 4, 60);
    run(p, shaft, press({ right: true }), 40);
    assert.equal(p.wallDir, 1);
    assert.ok(p.vy <= PLAYER.wallSlide);
    assert.equal(p.facing, -1, "faces away from the wall to shoot");
  });

  it("wall jump kicks away from the wall and upward", () => {
    const p = new Player(9 * 16 + 4, 60);
    run(p, shaft, press({ right: true }), 30);
    const y0 = p.y;
    const actions = run(p, shaft, press({ right: true, jump: true }), 1);
    assert.ok(actions.some((a) => a.type === "walljump"));
    assert.ok(p.vy < 0);
    run(p, shaft, press({ right: true, jump: true }), 5);
    assert.ok(p.x < 10 * 16 - p.w, "pushed away despite holding toward the wall");
    assert.ok(p.y < y0);
  });

  it("repeated wall jumps climb a single wall", () => {
    const p = standingPlayer(shaft, 8);
    const startY = p.y;
    run(p, shaft, (f) => press({ right: true, jump: f % 18 < 12 }), 180);
    assert.ok(startY - p.y > 60, `climbed ${startY - p.y}px`);
  });
});

describe("shooting and charge", () => {
  it("tap fires an uncharged shot", () => {
    const p = standingPlayer(flat, 5);
    const actions = run(p, flat, press({ shoot: true }), 1);
    assert.deepEqual(actions.filter((a) => a.type === "shoot"), [{ type: "shoot", charge: 0 }]);
  });

  it("holding charges in two levels and releasing fires the charged shot", () => {
    const p = standingPlayer(flat, 5);
    const half = run(p, flat, press({ shoot: true }), Math.ceil(PLAYER.charge1 * 60) + 2);
    assert.ok(half.some((a) => a.type === "charge" && a.level === 1));
    const full = run(p, flat, press({ shoot: true }), Math.ceil((PLAYER.charge2 - PLAYER.charge1) * 60) + 2);
    assert.ok(full.some((a) => a.type === "charge" && a.level === 2));
    const release = run(p, flat, idle, 1);
    assert.deepEqual(release.filter((a) => a.type === "shoot"), [{ type: "shoot", charge: 2 }]);
  });

  it("a short hold fires nothing extra on release", () => {
    const p = standingPlayer(flat, 5);
    run(p, flat, press({ shoot: true }), 5);
    assert.equal(run(p, flat, idle, 1).filter((a) => a.type === "shoot").length, 0);
  });

  it("weapons that cannot charge never charge", () => {
    const p = standingPlayer(flat, 5);
    const actions = run(p, flat, press({ shoot: true }), 120, { canCharge: false });
    assert.ok(!actions.some((a) => a.type === "charge"));
    assert.equal(run(p, flat, idle, 1, { canCharge: false }).length, 0);
  });
});

describe("damage", () => {
  it("takes damage, gets knocked back and is briefly invulnerable", () => {
    const p = standingPlayer(flat, 5);
    assert.ok(p.hurt(3, p.cx + 10));
    assert.equal(p.hp, PLAYER.maxHp - 3);
    assert.ok(!p.hurt(3, p.cx + 10), "invulnerable right after a hit");
    const x0 = p.x;
    run(p, flat, press({ right: true }), 10);
    assert.ok(p.x < x0, "knocked away from the source, ignoring input");
    run(p, flat, idle, Math.ceil(PLAYER.invuln * 60));
    assert.ok(p.hurt(1, p.cx));
  });

  it("hp never goes below zero", () => {
    const p = standingPlayer(flat, 5);
    p.hurt(999, 0);
    assert.equal(p.hp, 0);
  });

  it("clone is independent", () => {
    const p = standingPlayer(flat, 5);
    const c = p.clone();
    c.x += 50;
    assert.ok(c instanceof Player);
    assert.notEqual(c.x, p.x);
  });
});
