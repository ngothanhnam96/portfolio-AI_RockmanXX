# 04 · Testing

```bash
npm test          # node --test, no dependencies
```

101 tests across 27 suites, all deterministic (fixed step + seeded RNG), ~2 s.

| File                | What it proves                                                                  | Spec |
|---------------------|----------------------------------------------------------------------------------|------|
| `physics.test.js`   | Landing, walls on both sides, ceilings, map edges, one-way platforms (land from above, pass from below), hazard zone, pit | FR-4 |
| `player.test.js`    | Run speed, jump height (held ≈ 3 tiles, tap < 20 px), no double jump, coyote time, jump buffer, dash duration/cancel, dash-jump distance, wall slide cap, wall-jump kick, climbing a single wall, tap/half/full charge, knockback + i-frames | FR-1, FR-2 |
| `stages.test.js`    | Parser and chunk joiner, door behaviour, arena layout; per stage: well-formed, a single door, entities before it, **door reachable from the start and every checkpoint (route search over real physics)**; search sanity (rejects an impossible gap, needs the dash-jump for a 6-tile gap) | FR-5, NFR-4 |
| `enemies.test.js`   | Walker never walks off a ledge, flyer chases, turret shield cycle + aimed shots + range, hopper leaps and lands, seeded drop rate | FR-3, FR-9 |
| `bosses.test.js`    | Weakness ×3 + post-hit invulnerability, weakness chain covers every weapon; each boss stays inside the arena for 60 s and uses several attacks; final phase 2; **a scripted bot beats every boss with the plain buster**; the weakness weapon wins faster | FR-7, FR-8, NFR-5 |
| `game.test.js`      | Menus, fortress lock, saved progress, READY freeze, pause, weapon cycling, pellet limit, charged shot, energy spend/empty, frost spread, spawning, kill + score, contact damage, turret deflect, pickups + caps, death → respawn, checkpoint respawn, game over → retry keeps bosses, door → camera → intro, boss clear unlocks the weapon, fortress → victory, identical replays, 2 min random-input fuzz per stage | FR-1–FR-12, NFR-3 |

## Browser end-to-end check (v0.1.0)

Headless Edge driven over the DevTools protocol: real key presses and touch events, plus a few
console shortcuts (teleport to the door, set boss HP to 1) to reach late states quickly.

| Check | Result |
|-------|--------|
| Title → new game → stage select (fortress card locked) | ✅ |
| Run, tap-shoot, jump, 1.5 s charge → full-charge shot | ✅ |
| Pause dialog with `P` | ✅ |
| Door → camera scroll → boss intro banner + boss HP bar | ✅ |
| Boss defeat → explosion → "Nhận vũ khí: Hỏa Cầu", progress saved to `localStorage` | ✅ |
| Back to select, then the glacier and storm stages render | ✅ |
| `E` switches to the new weapon, energy drops 28 → 26, HUD highlights it | ✅ |
| Fall into a pit → death burst → respawn, lives 3 → 2 | ✅ |
| Phone 844 × 390 and 390 × 844 with touch emulation: on-screen pad shown, holding ▶ moves the hero, no horizontal overflow | ✅ |
| JavaScript exceptions / console errors | none (after the fixes below) |

## Bugs found and fixed while testing

| Found | Fix |
|-------|-----|
| **Game froze after the first boss:** "Tiếp tục" cleared `game.stage` but left `game.level`, the renderer read `stage.theme` of `null`, and the exception stopped the `requestAnimationFrame` loop | `toSelect()` clears level/player/boss too, the renderer checks both, and the loop schedules the next frame in `finally`. A regression assertion was added |
| **Blank page on every touch device:** the body got class `touch`, and the rule `.touch { display: none }` meant for the control pad hid the whole body | Renamed the body class to `touch-ui` |
| HUD energy bar and boss bar showed while `hidden`: a `display: grid` rule overrode the attribute | Global `[hidden] { display: none !important }` |
| Canvas sized from its parent overflowed the viewport | Size from `documentElement.clientWidth/Height` minus the HUD |
| The touch pad overflowed 390 px phones | Smaller pads under 480 px |
| Special weapons ran dry before beating a boss (frost 3-way at 2 energy) and the fireball lob was too flat to reach the flying boss | Frost costs 1, the fireball flies higher and pierces |
| A test loop never ran (its exit condition was already true) | Fixed the test; the engine was right |
