/**
 * Tile maps. Stages are authored as ASCII chunks (12 rows each) that are joined left → right.
 *
 *   #  solid        =  one-way platform (stand on it, jump up through it)
 *   ^  hazard (spikes / lava / live wire — instant death)
 *   D  boss door (open until the player walks into the arena)
 *   P  player start        C  checkpoint        X  boss spawn
 *   w  walker   f  flyer   t  turret   h  hopper
 *   o  small health   O  big health   e  weapon energy   +  extra life
 */

import { ARENA_COLS, ROWS, TILE } from "./constants.js";

export const T_EMPTY = 0;
export const T_SOLID = 1;
export const T_ONEWAY = 2;
export const T_HAZARD = 3;
export const T_DOOR = 4;

const TILE_CHARS = { "#": T_SOLID, "=": T_ONEWAY, "^": T_HAZARD, D: T_DOOR };
export const ENEMY_CHARS = { w: "walker", f: "flyer", t: "turret", h: "hopper" };
export const PICKUP_CHARS = { o: "health", O: "big-health", e: "energy", "+": "life" };
const MARKERS = new Set(["P", "C", "X", "."]);

/** Join chunks (arrays of ROWS equal-length strings) side by side. */
export function joinChunks(chunks) {
  const rows = Array.from({ length: ROWS }, () => "");
  chunks.forEach((chunk, index) => {
    if (chunk.length !== ROWS) throw new Error(`chunk ${index} has ${chunk.length} rows, expected ${ROWS}`);
    const width = chunk[0].length;
    chunk.forEach((line, row) => {
      if (line.length !== width) throw new Error(`chunk ${index} row ${row} is ${line.length} wide, expected ${width}`);
      rows[row] += line;
    });
  });
  return rows;
}

/** The standard boss room: door column, 18 empty columns, back wall. */
export function arenaChunk() {
  const inner = ARENA_COLS - 2;
  return Array.from({ length: ROWS }, (_, row) => {
    if (row === 0 || row >= ROWS - 2) return "#".repeat(ARENA_COLS);
    const door = row >= 6 ? "D" : "#";
    let middle = ".".repeat(inner);
    if (row === ROWS - 3) middle = middle.slice(0, 13) + "X" + middle.slice(14);
    return door + middle + "#";
  });
}

export class Level {
  constructor(rows) {
    this.rows = ROWS;
    this.cols = rows[0].length;
    this.width = this.cols * TILE;
    this.height = this.rows * TILE;
    this.grid = new Uint8Array(this.rows * this.cols);
    this.doorClosed = false;
    this.start = null;
    this.checkpoints = [];
    this.enemies = [];
    this.pickups = [];
    this.boss = null;
    this.doorCol = -1;

    rows.forEach((line, row) => {
      if (line.length !== this.cols) throw new Error(`row ${row} is ${line.length} wide, expected ${this.cols}`);
      [...line].forEach((ch, col) => {
        const at = { col, row, x: col * TILE + TILE / 2, y: (row + 1) * TILE };
        if (ch in TILE_CHARS) {
          this.grid[row * this.cols + col] = TILE_CHARS[ch];
          if (ch === "D") this.doorCol = col;
        } else if (ch in ENEMY_CHARS) {
          this.enemies.push({ ...at, kind: ENEMY_CHARS[ch], id: this.enemies.length });
        } else if (ch in PICKUP_CHARS) {
          this.pickups.push({ ...at, kind: PICKUP_CHARS[ch], id: this.pickups.length });
        } else if (ch === "P") {
          this.start = at;
        } else if (ch === "C") {
          this.checkpoints.push(at);
        } else if (ch === "X") {
          this.boss = at;
        } else if (!MARKERS.has(ch)) {
          throw new Error(`unknown tile '${ch}' at ${col},${row}`);
        }
      });
    });
    this.checkpoints.sort((a, b) => a.x - b.x);
  }

  /** Outside the map: walls left/right and above, open pit below. */
  tile(col, row) {
    if (col < 0 || col >= this.cols || row < 0) return T_SOLID;
    if (row >= this.rows) return T_EMPTY;
    return this.grid[row * this.cols + col];
  }

  isSolid(col, row) {
    const t = this.tile(col, row);
    return t === T_SOLID || (t === T_DOOR && this.doorClosed);
  }

  isOneWay(col, row) {
    return this.tile(col, row) === T_ONEWAY;
  }

  /** Left edge (px) of the locked boss camera / arena. */
  get arenaX() {
    return this.doorCol * TILE;
  }
}
