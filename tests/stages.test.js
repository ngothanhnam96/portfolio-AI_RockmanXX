import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ARENA_COLS, ROWS, TILE } from "../src/core/constants.js";
import { arenaChunk, joinChunks, Level, T_DOOR, T_SOLID } from "../src/core/level.js";
import { buildLevel, STAGES, stageRows } from "../src/core/stages.js";
import { levelFrom } from "./support/helpers.js";
import { findRoute } from "./support/reach.js";

describe("level parsing", () => {
  it("joins chunks side by side and rejects ragged chunks", () => {
    const a = Array.from({ length: ROWS }, () => "ab");
    const b = Array.from({ length: ROWS }, () => "c");
    assert.deepEqual(joinChunks([a, b])[0], "abc");
    assert.throws(() => joinChunks([a.slice(1)]), /rows/);
    assert.throws(() => joinChunks([[...a.slice(1), "abc"]]), /wide/);
  });

  it("reads tiles, entities and markers", () => {
    const level = levelFrom(["P.w.o.C.X.", "##^=D#####"]);
    assert.deepEqual([level.start.col, level.start.row], [0, 10]);
    assert.equal(level.start.y, 11 * TILE, "entities stand on the tile below");
    assert.equal(level.enemies[0].kind, "walker");
    assert.equal(level.pickups[0].kind, "health");
    assert.equal(level.checkpoints.length, 1);
    assert.equal(level.boss.col, 8);
    assert.equal(level.doorCol, 4);
    assert.equal(level.tile(0, 11), T_SOLID);
  });

  it("rejects unknown characters", () => {
    assert.throws(() => levelFrom(["..?.", "####"]), /unknown tile/);
  });

  it("the door only blocks once closed", () => {
    const level = levelFrom(["....", "D###"]);
    assert.equal(level.tile(0, 11), T_DOOR);
    assert.ok(!level.isSolid(0, 11));
    level.doorClosed = true;
    assert.ok(level.isSolid(0, 11));
  });

  it("arena chunk: door column, empty room, back wall, boss spawn", () => {
    const arena = arenaChunk();
    assert.equal(arena.length, ROWS);
    assert.ok(arena.every((row) => row.length === ARENA_COLS));
    const level = new Level(arena);
    assert.equal(level.doorCol, 0);
    assert.ok(level.boss);
  });
});

describe("stage data", () => {
  for (const stage of STAGES) {
    describe(stage.name, () => {
      const level = buildLevel(stage);

      it("is well formed", () => {
        const rows = stageRows(stage);
        assert.equal(rows.length, ROWS);
        assert.ok(level.start, "has a start");
        assert.ok(level.boss, "has a boss spawn");
        assert.equal(level.doorCol, level.cols - ARENA_COLS, "door opens the last screen");
        assert.ok(level.checkpoints.length >= 1, "has a checkpoint");
        assert.ok(level.cols >= 120, "is long enough to be a stage");
      });

      it("only the arena door exists", () => {
        const doors = [];
        for (let c = 0; c < level.cols; c += 1) {
          for (let r = 0; r < ROWS; r += 1) if (level.tile(c, r) === T_DOOR) doors.push(c);
        }
        assert.ok(doors.every((c) => c === level.doorCol));
      });

      it("enemies and pickups sit before the boss door", () => {
        for (const thing of [...level.enemies, ...level.pickups]) assert.ok(thing.col < level.doorCol);
      });

      it("the boss door is reachable from the start (real physics search)", () => {
        assert.ok(findRoute(level, level.start).reached);
      });

      it("the boss door is reachable from every checkpoint", () => {
        for (const checkpoint of level.checkpoints) assert.ok(findRoute(level, checkpoint).reached);
      });
    });
  }
});

describe("route search sanity", () => {
  it("finds a plain walk", () => {
    const level = new Level(joinChunks([
      Array.from({ length: ROWS }, (_, r) => (r === 9 ? "P........." : r >= 10 ? "##########" : "..........")),
      arenaChunk(),
    ]));
    assert.ok(findRoute(level, level.start).reached);
  });

  it("rejects a gap no jump can cross", () => {
    const rows = Array.from({ length: ROWS }, (_, r) => {
      if (r === 9) return "P" + ".".repeat(29);
      if (r >= 10) return "###" + "^".repeat(14) + "#".repeat(13);
      return ".".repeat(30);
    });
    const level = new Level(joinChunks([rows, arenaChunk()]));
    const result = findRoute(level, level.start);
    assert.ok(!result.reached);
  });

  it("needs the dash-jump for a six-tile gap", () => {
    const rows = Array.from({ length: ROWS }, (_, r) => {
      if (r === 9) return "P" + ".".repeat(19);
      if (r >= 10) return "####" + "^".repeat(6) + "#".repeat(10);
      return ".".repeat(20);
    });
    const level = new Level(joinChunks([rows, arenaChunk()]));
    assert.ok(findRoute(level, level.start).reached);
  });
});
