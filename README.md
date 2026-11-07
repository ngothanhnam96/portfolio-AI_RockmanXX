# Chiến Binh Volt — Volt Ranger

An original browser game in the classic **run-and-gun action platformer** genre. Run, jump, dash
and climb walls through three stages, charge your arm cannon, defeat each boss and **take its
weapon**, then storm the final fortress.

- 4 stages: lava foundry, glacier, storm tower and the fortress core, each with checkpoints and a boss arena
- Movement: variable jump, dash, dash-jump, wall slide and wall jump, coyote time and jump buffer
- Buster with two charge levels plus 3 boss weapons. Each boss is weak to another boss's weapon
- 4 enemy types and 4 bosses with telegraphed attack patterns (the final boss has 2 phases)
- Keyboard, touch buttons and gamepad · saved progress and best score · synthesised sfx and chiptune music
- All art and sound are generated in code: zero dependencies, no build step, no asset files

## Play

```bash
npm start      # http://127.0.0.1:5173
```

| Key                   | Action                                   |
|-----------------------|------------------------------------------|
| `←` `→`               | Move                                     |
| `Z` / `Space`         | Jump (hold = higher; press on a wall = wall jump) |
| `X`                   | Shoot (hold to charge)                   |
| `C` / `Shift`         | Dash (jump while dashing = dash-jump)    |
| `Q` / `E`             | Previous / next weapon                   |
| `P` / `Esc`           | Pause                                    |
| `M` / `N`             | Sound / music on/off                     |

Gamepad: D-pad/stick to move, A to jump, X/Y to shoot, B/RT to dash, LB/RB to switch weapons, Start to pause.

## Test

```bash
npm test       # 101 tests, ~2 s
```

The suite includes two proofs. A **route search over the real player physics** shows every stage can
be finished from the start and from every checkpoint, and a **scripted bot** beats every boss with
the starting weapon.

## Project layout

```text
index.html, styles.css        UI shell
src/main.js                   loop, HUD, menus, events → sound/particles, storage
src/ui/                       render.js (canvas, procedural art) · audio.js · input.js · themes.js · storage.js
src/core/                     pure game rules (no DOM), fully unit-tested
  constants.js, rng.js        screen size, fixed step, seeded RNG
  level.js, stages.js         ASCII tile maps, chunk joiner, boss arena, the 4 stages
  physics.js                  AABB vs tiles, one-way platforms, hazards
  player.js                   movement, shooting, charge, damage
  weapons.js                  buster + 3 boss weapons
  enemies.js, bosses.js       enemy and boss AI
  game.js                     state machine: select, stage, door, boss, death, clear, victory
tests/                        node:test suites + support/ (route search, boss bot)
scripts/serve.mjs             zero-dependency static dev server
```

## Engineering process

1. [Spec](docs/01-SPEC.md): rules and requirements
2. [Design](docs/02-DESIGN.md): architecture, physics tuning, level rules, bosses, weapon economy
3. [Tasks](docs/03-TASKS.md): traceable task list and backlog
4. Implementation: `src/`
5. [Testing](docs/04-TESTING.md): unit suites, route search, boss bot, browser e2e, bugs found
6. [Deploy](docs/05-DEPLOY.md): GitHub Pages, CI

## Credits & license

Game design, characters, levels, art and music are original. It's a tribute to the genre, not a
copy of any specific game. Licensed under MIT.
