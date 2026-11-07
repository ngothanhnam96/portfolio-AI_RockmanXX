/**
 * Route search over the real player physics. Nodes are "standing" or "wall-sliding"
 * snapshots (quantised to 4 px); edges are short input macros (walk, jump with different
 * hold times, dash-jump, wall jumps) simulated frame by frame with Player.update. Enemies
 * are ignored; hazards and pits kill. The goal is passing the boss door.
 */

import { DT, TILE } from "../../src/core/constants.js";
import { inHazard } from "../../src/core/physics.js";
import { Player } from "../../src/core/player.js";

const MAX_AIR_FRAMES = 300;

function key(p) {
  return `${Math.round(p.x / 4)},${Math.round(p.y / 4)},${p.onGround ? "g" : p.wallDir}`;
}

function input(dir, jump = false, dash = false) {
  return { left: dir < 0, right: dir > 0, jump, dash, shoot: false };
}

/**
 * Run `script(frame) → input` until the player settles (lands, grabs a wall after
 * `minFrames`, dies, reaches the goal, or times out). Returns { player, goal }.
 */
function simulate(start, level, script, goalX, minFrames = 4) {
  const p = start.clone();
  p.prev = input(0);
  for (let frame = 0; frame < MAX_AIR_FRAMES; frame += 1) {
    p.update(script(frame), level, DT);
    if (inHazard(level, p)) return null;
    if (p.x >= goalX) return { player: p, goal: true };
    if (frame >= minFrames && (p.onGround || p.wallDir !== 0)) return { player: p, goal: false };
  }
  return null;
}

function groundMacros() {
  const macros = [];
  for (const dir of [-1, 1]) {
    macros.push((f) => input(f < 6 ? dir : 0)); // step
    macros.push((f) => input(dir)); // walk until something changes
    for (const hold of [4, 10, 60]) {
      macros.push((f) => input(dir, f < hold)); // jump with drift
      macros.push((f) => input(f < 8 ? 0 : dir, f < hold)); // jump, drift late
    }
    macros.push((f) => input(dir, f >= 2 && f < 60, true)); // dash-jump
    macros.push((f) => input(dir, false, f < 20)); // dash (and maybe fall off)
  }
  macros.push((f) => input(0, f < 60)); // straight up
  return macros;
}

function wallMacros(side) {
  return [
    (f) => input(side, f < 60), // climb: kick off and come back to the wall
    (f) => input(-side, f < 60), // leap away
    (f) => input(-side, f < 60, true), // dash leap away
    (f) => input(f < 10 ? -side : side, f < 60), // late return
    (f) => input(0), // let go
  ];
}

/** Breadth-first search from (cx, bottom). Returns { reached, nodes }. */
export function findRoute(level, from, { maxNodes = 40000 } = {}) {
  const goalX = (level.doorCol + 1) * TILE;
  const start = new Player(from.x, from.y);
  // settle onto the floor
  const settled = simulate(start, level, () => input(0), goalX, 0);
  if (!settled) return { reached: false, nodes: 0 };
  const queue = [settled.player];
  const seen = new Set([key(settled.player)]);
  const ground = groundMacros();
  for (let head = 0; head < queue.length && seen.size < maxNodes; head += 1) {
    const node = queue[head];
    const macros = node.onGround ? ground : wallMacros(node.wallDir);
    for (const macro of macros) {
      const result = simulate(node, level, macro, goalX);
      if (!result) continue;
      if (result.goal) return { reached: true, nodes: seen.size };
      const k = key(result.player);
      if (!seen.has(k)) {
        seen.add(k);
        queue.push(result.player);
      }
    }
  }
  return { reached: false, nodes: seen.size, furthest: Math.max(...queue.map((p) => p.x)) };
}
