# 02 · Design (plan + analysis)

## Architecture

```text
index.html ─► src/main.js  (loop, HUD, menus, events → sound/particles, storage)
                  │ update(input, dt) / takeEvents()          src/ui/
                  ▼                                            render.js  canvas, procedural art
             src/core/game.js  — state machine                 audio.js   WebAudio sfx + music
                  │                                            input.js   keys / touch / gamepad
   ┌──────────┬───┴──────┬───────────┬───────────┬──────────┐ themes.js  palettes
   ▼          ▼          ▼           ▼           ▼          ▼
player.js  enemies.js  bosses.js  weapons.js  stages.js  physics.js ── level.js
 movement   4 kinds     4 AIs      bullets     ASCII maps  AABB vs tiles  tile grid
```

`src/core/*` never touches the DOM. The UI sends a held-button snapshot each 1/60 s step and
drains an event list (`shoot`, `explode`, `boss-hit`, …) for sounds and particles.

## Game states

```text
title → select → ready → playing ⇄ paused
                            ├─ door → boss-intro → playing (boss) → boss-dying → clear → select
                            └─ dying → ready (respawn at checkpoint) | game-over → select
fortress cleared → victory
```

## World and collision

- The screen is **320 × 192** px = 20 × 12 tiles of 16 px. Every stage is exactly 12 rows tall,
  so the game only scrolls horizontally.
- Stages are written as **ASCII chunks** joined left → right, and the standard 20-column boss
  arena is appended. Legend: `#` solid, `=` one-way, `^` hazard, `D` door, `P C X` markers,
  `w f t h` enemies, `o O e +` pickups.
- Outside the map, the left, right and top edges are solid and below the map is a pit.
- Collision is axis-separated AABB. Each move checks only the tiles the leading edge sweeps over,
  and no speed in the game moves more than a tile per step, so nothing tunnels. One-way
  platforms only stop a body that starts above them and is moving down.

## Player tuning

| Constant | Value | Effect |
|----------|-------|--------|
| run / dash | 90 / 210 px/s | dash lasts 0.34 s |
| jump / gravity | 310 px/s / 950 px/s² | ≈ 3.2 tile apex, ≈ 3.7 tile flat jump, ≈ 8 tile dash-jump |
| jump cut | 90 px/s | releasing jump early gives a short hop |
| coyote / buffer | 0.08 s / 0.1 s | forgiving edges and landings |
| wall slide / wall jump | 60 px/s / 300 px/s, 0.12 s kick | a single wall can be climbed |
| invulnerability | 1.2 s after a hit, 0.3 s knockback | |
| charge | 0.45 s / 1.3 s | damage 1 / 2 / 4 (full charge pierces) |

## Level design rules (enforced by tests)

- Normal rises ≤ 2 tiles. Taller cliffs teach the wall-climb.
- Gaps ≤ 4 tiles for normal jumps. 6-tile gaps over hazards teach the dash-jump.
- Every stage has a checkpoint, and the door opens the last screen.

**Proof of completion:** `tests/support/reach.js` runs a breadth-first search whose nodes are
standing or wall-sliding player states (quantised to 4 px). Its edges are input macros (step,
walk, jumps with 3 hold lengths and early/late drift, dash, dash-jump, wall-jump climb/away/let
go), each simulated frame by frame with the real `Player.update`. Hazards and pits prune a
branch. It reaches every door in ~0.3 s. As a sanity check it rejects a 14-tile lava gap and
accepts a 6-tile gap only via the dash-jump.

## Bosses

| Boss | Stage | Attacks | Weak to |
|------|-------|---------|---------|
| Hỏa Thần Lò Rèn | Lò Đúc Dung Nham | leap at the player → two floor fire-waves · lob 3 aimed fireballs | Băng Tiễn |
| Vệ Binh Băng | Đỉnh Băng Giá | telegraphed wall-to-wall dash · two 3-shard fans · jump + 3 falling icicles | Lôi Xà |
| Ong Chúa Bão | Tháp Bão Sét | hover drift · dive at the player · 2 telegraphed lightning columns · 2 homing sparks | Hỏa Cầu |
| Lõi Tối Thượng | Pháo Đài Lõi | radial orb ring · fireball lob · lightning; **phase 2** (≤ 50 %): faster, 12-orb ring, dive | — |

- HP 28 (final 40). 0.4 s invulnerability after each hit, so spraying shots doesn't shred a boss.
- Every dangerous attack is telegraphed: a crouch before the dash, a warning line before the
  lightning, flashing icicles.
- Flying bosses hover with their centre about 64 px above the floor, so jump-shots reach them.

Scripted-bot fight times (invincible bot, buster vs. weakness):

| Boss | Buster | Weakness |
|------|--------|----------|
| Hỏa Thần | 21.6 s | 10.1 s |
| Vệ Binh Băng | 15.6 s | 2.7 s |
| Ong Chúa Bão | 39.6 s | 6.2 s |
| Lõi Tối Thượng | 39.6 s | — |

## Weapons and economy

| Weapon | Shot | Damage | Energy / shot (of 28) |
|--------|------|--------|-----------------------|
| Súng Volt | pellet / half / full charge | 1 / 2 / 4 | — |
| Hỏa Cầu | arcing, piercing | 3 | 2 |
| Băng Tiễn | 3-way spread | 2 each | 1 |
| Lôi Xà | fast, piercing | 2 | 1 |

Lam Phong's versions (melee boxes like his slashes: hit each target once, cut enemy shots, 0.25 s cooldown):

| Blade technique | From | Strike | Box (w × h) | Damage | Energy |
|-----------------|------|--------|-------------|--------|--------|
| Hỏa Long Kiếm | Hỏa Cầu | rising flame slash, reaches 36 px above the head | 28 × 58 | 3 | 2 |
| Băng Thứ Kiếm | Băng Tiễn | long ice thrust ahead | 50 × 10 | 2 | 1 |
| Lôi Toàn Kiếm | Lôi Xà | lightning spin, both sides | 60 × 30 | 2 | 1 |

Energy refills on every stage start and respawn. Pickups: health +4 / +12, energy +8 (to the
current special, or the emptiest one if the buster is held), extra life (max 9). Each kill drops
something about 26 % of the time (seeded RNG).

## Rendering and audio

- Canvas backing store = 320 × 192 × integer scale (DPR-aware), with `imageSmoothing` off. The
  size comes from the layout viewport (lesson from the previous project: the parent box grows
  with its own content).
- All sprites are code-drawn rectangles and arcs, and the hero is mirrored by facing. Each theme
  has a palette and two parallax layers (smokestacks, mountains and snow, pylons and clouds,
  circuit grid).
- WebAudio: synthesised sfx and a tiny step-sequencer with 7 original 16-step loops (title,
  select, 4 stages, boss).

## Risks

| Risk | Mitigation |
|------|------------|
| Unfinishable stage after a map edit | Route-search test over real physics for every start and checkpoint |
| Unbeatable or broken boss pattern | Bot fight test and a 60 s "stays in arena, uses several attacks" test per boss |
| Spawn camping / enemy flood | One live enemy per spawn point. It re-arms only after scrolling well out of view |
| ES modules blocked on `file://` | `npm start` serves over http. Pages serves over https |
| IP: the genre's classics are trademarked | Original name, hero, bosses, levels, art and music. No franchise names in the game |
