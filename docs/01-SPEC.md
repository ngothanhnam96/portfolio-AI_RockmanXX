# 01 · Specification — *Chiến Binh Volt* (Volt Ranger)

An original browser game in the classic **run-and-gun action platformer** genre (side-scrolling,
arm-cannon hero, stage select, a weapon from each boss), inspired by the 8/16-bit console era.
The name, hero, enemies, bosses, stages, art and music are all original and drawn or synthesised
in code. No characters, names, sprites, levels or music from any existing game are used.

## Core loop

Pick one of three stages → fight to the end of it → beat the boss in its arena → **take the
boss's weapon** → repeat. Once all three bosses are down, the final fortress unlocks. Each boss
is weak to a weapon taken from another boss.

## Functional requirements

| ID    | Requirement |
|-------|-------------|
| FR-1  | Hero **runs**, does a **variable-height jump** (hold for higher), **dashes** on the ground, **dash-jumps** (keeps dash speed in the air), **wall-slides** and **wall-jumps**. |
| FR-2  | Tap fire for a small shot (max 3 on screen). **Hold to charge**: half charge (0.45 s) and full charge (1.3 s, piercing). |
| FR-3  | 4 enemy types: walker (patrols, turns at ledges), flyer (homes in), turret (shielded while closed, fires aimed shots), hopper (leaps at the player). Enemies respawn when their spawn point scrolls back into view. |
| FR-4  | Hazards (lava / ice spikes / live wire) and pits kill instantly. |
| FR-5  | Every stage has **checkpoints**. Dying costs a life and respawns at the last checkpoint. With no lives left the game is over, but defeated bosses are kept. |
| FR-6  | The boss door at the end scrolls the camera into a locked arena. Then come the boss intro, the fight and the boss health bar. |
| FR-7  | 4 bosses, each with ≥ 3 attack patterns. The final boss has a second, faster phase below 50 % HP. |
| FR-8  | Beating a boss unlocks its weapon: **Hỏa Cầu** (arcing, piercing fireball), **Băng Tiễn** (3-way spread), **Lôi Xà** (fast piercing bolt). Specials spend weapon energy. A boss takes **×3** damage from its weakness. Lam Phong gets each one as a blade technique instead (same energy and weakness): **Hỏa Long Kiếm** (rising flame slash that reaches flying bosses), **Băng Thứ Kiếm** (long ice thrust), **Lôi Toàn Kiếm** (lightning spin hitting both sides). |
| FR-9  | Pickups: small/large health, weapon energy, extra life. Placed in stages and dropped by enemies. |
| FR-10 | Stage select with progress. The fortress is locked until 3 bosses are down. Progress and best score are saved on the device. |
| FR-11 | Pause / resume (auto-pause when the tab is hidden), sound on/off, music on/off. |
| FR-12 | Controls: keyboard, on-screen touch buttons on touch devices, gamepad. |

## Non-functional requirements

| ID    | Requirement |
|-------|-------------|
| NFR-1 | Static site: no build step, no runtime dependencies, no asset files. Works offline once loaded. |
| NFR-2 | Game rules live in pure ES modules with no DOM access, fully unit-tested in Node. |
| NFR-3 | Fixed 60 Hz simulation and seeded RNG: the same inputs replay identically. |
| NFR-4 | **Every stage is provably finishable:** an automated search over the real player physics reaches the boss door from the start and from every checkpoint. |
| NFR-5 | **Every boss is provably beatable** with the starting weapon (scripted bot test). |
| NFR-6 | Crisp pixel rendering at an integer scale. Responsive from 360 px phones to desktop, with no horizontal overflow. |
| NFR-7 | CI runs tests on every push. GitHub Pages deploys from `main`. |

## Out of scope (v1)

Ladders, vertical scrolling, a password/save-slot system, a level editor, online leaderboards.
