import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { inHazard, moveX, moveY, overlaps, standingOn, touchingWall } from "../src/core/physics.js";
import { levelFrom } from "./support/helpers.js";

const box = (x, y, w = 12, h = 22) => ({ x, y, w, h });

describe("tile collision", () => {
  const level = levelFrom([
    "....#.....",
    "....#.....",
    "..........",
    ".......===",
    "..........",
    "##########",
    "##########",
  ]);
  // floor top is row 10 → y = 160; wall column 4 occupies rows 5–6 (y 80–112);
  // one-way platform on row 8 (y = 128), columns 7–9

  it("lands on the floor and reports it", () => {
    const b = box(16, 130);
    assert.equal(moveY(level, b, 20), 1);
    assert.equal(b.y + b.h, 160);
    assert.ok(standingOn(level, b));
  });

  it("free movement when nothing is in the way", () => {
    const b = box(16, 100);
    assert.equal(moveY(level, b, 5), 0);
    assert.equal(b.y, 105);
    assert.equal(moveX(level, b, -3), 0);
    assert.equal(b.x, 13);
  });

  it("stops against a wall on either side", () => {
    const right = box(40, 85);
    assert.equal(moveX(level, right, 20), 1);
    assert.equal(right.x + right.w, 64);
    assert.ok(touchingWall(level, right, 1));
    const left = box(84, 85);
    assert.equal(moveX(level, left, -10), -1);
    assert.equal(left.x, 80);
    assert.ok(touchingWall(level, left, -1));
    assert.ok(!touchingWall(level, left, 1));
  });

  it("bumps its head on a ceiling", () => {
    const b = box(66, 114);
    assert.equal(moveY(level, b, -10), -1);
    assert.equal(b.y, 112);
  });

  it("the map edges are walls and the top is a ceiling", () => {
    const b = box(2, 100);
    assert.equal(moveX(level, b, -5), -1);
    assert.equal(b.x, 0);
    const top = box(20, 2);
    assert.equal(moveY(level, top, -5), -1);
    assert.equal(top.y, 0);
  });

  it("one-way platforms: land from above, pass from below", () => {
    const above = box(116, 100);
    assert.equal(moveY(level, above, 10), 1);
    assert.equal(above.y + above.h, 128);
    const below = box(116, 130);
    assert.equal(moveY(level, below, -10), 0);
    assert.equal(below.y, 120);
    const inside = box(116, 120); // straddling it: keeps falling through
    assert.equal(moveY(level, inside, 4), 0);
  });

  it("one-way platforms can be ignored (bosses)", () => {
    const b = box(116, 100);
    assert.equal(moveY(level, b, 10, { oneWay: false }), 0);
  });
});

describe("hazards", () => {
  const level = levelFrom(["..........", "##^^^^####", "##########"]);
  // hazard row 10 (y 160–176), deadly from y = 166

  it("touching the deadly part of a hazard kills, standing beside it does not", () => {
    assert.ok(inHazard(level, box(40, 150)));
    assert.ok(!inHazard(level, box(40, 140)));
    assert.ok(!inHazard(level, box(4, 138)));
  });

  it("falling out of the map counts as a hazard", () => {
    assert.ok(inHazard(level, box(40, level.height + 20)));
  });
});

describe("overlaps", () => {
  it("is strict at the edges", () => {
    assert.ok(overlaps(box(0, 0, 10, 10), box(5, 5, 10, 10)));
    assert.ok(!overlaps(box(0, 0, 10, 10), box(10, 0, 10, 10)));
  });
});
