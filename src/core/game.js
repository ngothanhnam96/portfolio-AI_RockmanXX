/**
 * Game state machine. Pure logic, fixed 60 Hz steps; the UI feeds held-button snapshots
 * into update() and drains takeEvents() for sounds and particles.
 *
 *   title → select → ready → playing ⇄ paused
 *                              │ door → boss-intro → playing (boss) → boss-dying → clear → select …
 *                              └ dying → ready (respawn) | game-over
 *   core stage cleared → victory
 */

import { createBoss, damageBoss, updateBoss } from "./bosses.js";
import { ROWS, TILE, VIEW_W } from "./constants.js";
import { createEnemy, isShielded, rollDrop, updateEnemy } from "./enemies.js";
import { BLADE, bladeArt, bladeAttack, heroById, HEROES, placeMelee } from "./heroes.js";
import { inHazard, moveY, overlaps } from "./physics.js";
import { NO_INPUT, Player, PLAYER } from "./player.js";
import { mulberry32, randomSeed } from "./rng.js";
import { buildLevel, STAGES, stageById } from "./stages.js";
import { fireWeapon, MAX_BUSTER_SHOTS, MAX_ENERGY, WEAPON_ORDER, WEAPONS } from "./weapons.js";

export const START_LIVES = 3;
export const MAX_LIVES = 9;
export const READY_TIME = 1.0;
export const DYING_TIME = 1.4;
export const BOSS_INTRO_TIME = 1.5;
export const BOSS_DYING_TIME = 2.5;
export const DOOR_SCROLL_SPEED = 160;
export const BOSS_SCORE = 5000;
export const PICKUP_VALUES = Object.freeze({ health: 4, "big-health": 12, energy: 8 });
const DROP_LIFE = 6;
const SPAWN_MARGIN = 16;
const DESPAWN_MARGIN = 72;
const BOSS_STAGES = STAGES.filter((s) => !s.final).map((s) => s.id);

export class Game {
  constructor({ seed = randomSeed(), invincible = false, hero = "volt" } = {}) {
    this.rng = mulberry32(seed);
    this.invincible = invincible; // tests / bots only
    this.hero = heroById(hero).id;
    this.state = "title";
    this.events = [];
    this.defeated = [];
    this.lives = START_LIVES;
    this.score = 0;
    this.energy = Object.fromEntries(WEAPON_ORDER.map((w) => [w, MAX_ENERGY]));
    this.weapon = "buster";
    this.stage = null;
    this.level = null;
    this.player = null;
    this.boss = null;
    this.clearInfo = null;
    this.time = 0;
  }

  // ------------------------------------------------------------------ progress & menus

  newGame() {
    this.defeated = [];
    this.lives = START_LIVES;
    this.score = 0;
    this.state = "select";
    return this;
  }

  /** Resume from saved progress ({ defeated: [...] }). */
  continueGame(progress = {}) {
    this.newGame();
    this.defeated = (progress.defeated ?? []).filter((id) => BOSS_STAGES.includes(id));
    return this;
  }

  /** Pick the hero (title and stage select only; not in the middle of a stage). */
  setHero(id) {
    if (!HEROES[id] || this.player && !["title", "select"].includes(this.state)) return false;
    this.hero = id;
    return true;
  }

  get heroSpec() {
    return heroById(this.hero);
  }

  get progress() {
    return { defeated: [...this.defeated] };
  }

  get finalUnlocked() {
    return BOSS_STAGES.every((id) => this.defeated.includes(id));
  }

  canSelect(id) {
    const stage = stageById(id);
    return stage.final ? this.finalUnlocked : true;
  }

  get unlockedWeapons() {
    const owned = STAGES.filter((s) => s.weapon && this.defeated.includes(s.id)).map((s) => s.weapon);
    return WEAPON_ORDER.filter((w) => w === "buster" || owned.includes(w));
  }

  selectStage(id) {
    if (!this.canSelect(id)) return false;
    this.stage = stageById(id);
    this.level = buildLevel(this.stage);
    this.checkpoint = -1;
    this.collected = new Set();
    this.weapon = "buster";
    this.time = 0;
    this.spawn();
    return true;
  }

  toSelect() {
    this.state = "select";
    this.stage = null;
    this.level = null;
    this.player = null;
    this.boss = null;
  }

  /** After game over: same bosses defeated, fresh lives and score. */
  retry() {
    this.toSelect();
    this.lives = START_LIVES;
    this.score = 0;
  }

  togglePause() {
    if (this.state === "playing") this.state = "paused";
    else if (this.state === "paused") this.state = "playing";
    return this.state;
  }

  selectWeapon(next) {
    const owned = this.unlockedWeapons;
    const id = typeof next === "number"
      ? owned[(owned.indexOf(this.weapon) + next + owned.length) % owned.length]
      : next;
    if (!owned.includes(id) || id === this.weapon) return false;
    this.weapon = id;
    if (this.player) {
      this.player.charge = 0;
      this.player.charging = false;
    }
    this.emit("weapon", { weapon: id });
    return true;
  }

  takeEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  // ------------------------------------------------------------------ stage lifecycle

  get arena() {
    const level = this.level;
    return { left: (level.doorCol + 1) * TILE, right: (level.cols - 1) * TILE, top: TILE, floor: (ROWS - 2) * TILE };
  }

  spawn() {
    const level = this.level;
    const at = this.checkpoint >= 0 ? level.checkpoints[this.checkpoint] : level.start;
    this.player = new Player(at.x, at.y);
    this.player.onGround = true;
    this.player.hero = this.hero;
    this.player.comboStep = 0;
    this.player.comboT = 0;
    this.player.slashCd = 0;
    this.enemies = [];
    this.bullets = [];
    this.enemyBullets = [];
    this.drops = [];
    this.boss = null;
    this.bossDefeated = false;
    level.doorClosed = false;
    for (const w of WEAPON_ORDER) this.energy[w] = MAX_ENERGY;
    this.spawners = level.enemies.map((s) => ({ ...s, alive: false, armed: true }));
    this.camX = this.cameraTarget();
    this.state = "ready";
    this.timer = READY_TIME;
  }

  cameraTarget() {
    const level = this.level;
    if (level.doorClosed || this.state === "door") return level.arenaX;
    const max = Math.min(level.width - VIEW_W, (level.doorCol + 1) * TILE - VIEW_W);
    return Math.max(0, Math.min(max, this.player.cx - VIEW_W / 2));
  }

  // ------------------------------------------------------------------ main update

  update(input, dt) {
    switch (this.state) {
      case "ready":
        this.timer -= dt;
        if (this.timer <= 0) this.state = "playing";
        break;
      case "playing":
        this.time += dt;
        this.step(input, dt);
        break;
      case "door":
        this.stepDoor(dt);
        break;
      case "boss-intro":
        this.player.update(NO_INPUT, this.level, dt);
        this.timer -= dt;
        if (this.timer <= 0) this.state = "playing";
        break;
      case "boss-dying":
        this.time += dt;
        this.step(input, dt);
        this.timer -= dt;
        if (this.timer <= 0) this.finishStage();
        break;
      case "dying":
        this.updateBullets(dt);
        this.timer -= dt;
        if (this.timer <= 0) {
          this.lives -= 1;
          if (this.lives < 0) {
            this.state = "game-over";
            this.emit("game-over");
          } else {
            this.spawn();
          }
        }
        break;
      default:
        break; // title, select, paused, clear, game-over, victory: waiting for the UI
    }
  }

  step(input, dt) {
    const player = this.player;
    const actions = player.update(input, this.level, dt, { canCharge: WEAPONS[this.weapon].charge });
    player.comboT = Math.max(0, player.comboT - dt);
    player.slashCd = Math.max(0, player.slashCd - dt);
    if (player.comboT === 0) player.comboStep = 0;
    for (const action of actions) {
      if (action.type === "shoot") this.fire(action.charge);
      else this.emit(action.type, { x: player.cx, y: player.y + player.h, level: action.level });
    }

    this.updateCheckpoints();
    this.updateSpawners();
    for (const enemy of this.enemies) updateEnemy(enemy, this, dt);
    if (this.boss && this.boss.hp > 0) updateBoss(this.boss, this, dt);
    this.updateBullets(dt);
    this.updateDrops(dt);
    this.collide();

    if (player.alive && (inHazard(this.level, player) || player.hp <= 0)) this.killPlayer();
    if (this.state === "playing" && !this.level.doorClosed && player.x + player.w > this.level.doorCol * TILE + 2) {
      this.state = "door";
      this.bullets = [];
      this.emit("door");
    }
    if (this.state !== "door") this.camX = this.cameraTarget();
  }

  /** Camera scrolls into the boss room while the hero walks through the door. */
  stepDoor(dt) {
    const player = this.player;
    const target = this.level.arenaX;
    this.camX = Math.min(target, this.camX + DOOR_SCROLL_SPEED * dt);
    const walkTo = target + 2 * TILE;
    const input = { ...NO_INPUT, right: player.x < walkTo };
    player.update(input, this.level, dt);
    if (this.camX >= target && player.x >= walkTo) {
      this.level.doorClosed = true;
      this.enemies = [];
      this.enemyBullets = [];
      this.boss = createBoss(this.stage.boss, this.arena, this.level.boss);
      this.state = "boss-intro";
      this.timer = BOSS_INTRO_TIME;
      this.emit("boss-intro", { boss: this.stage.boss });
    }
  }

  finishStage() {
    const stage = this.stage;
    if (!this.defeated.includes(stage.id) && !stage.final) this.defeated.push(stage.id);
    this.clearInfo = { stage: stage.id, weapon: stage.weapon, time: this.time };
    this.state = stage.final ? "victory" : "clear";
    this.emit(stage.final ? "victory" : "clear", this.clearInfo);
  }

  killPlayer() {
    const player = this.player;
    player.alive = false;
    player.charging = false;
    this.state = "dying";
    this.timer = DYING_TIME;
    this.emit("death", { x: player.cx, y: player.cy });
  }

  // ------------------------------------------------------------------ pieces

  fire(charge) {
    const player = this.player;
    const weapon = this.weapon;
    const spec = WEAPONS[weapon];
    const blade = this.heroSpec.primary === "blade";
    if (weapon === "buster" && blade) {
      this.swing(charge);
      return;
    }
    if (blade && player.slashCd > 0) return;
    if (weapon === "buster" && charge === 0) {
      const pellets = this.bullets.filter((b) => b.kind === "buster0").length;
      if (pellets >= MAX_BUSTER_SHOTS) return;
    }
    if (spec.cost > 0) {
      if (this.energy[weapon] < spec.cost) {
        this.emit("empty");
        return;
      }
      this.energy[weapon] -= spec.cost;
    }
    if (blade) {
      this.strike(weapon);
      return;
    }
    this.bullets.push(...fireWeapon(weapon, player.muzzle(), player.facing, charge));
    this.emit("shoot", { weapon, charge });
  }

  /** Lam Phong's blade: combo slashes on the ground, a spin in the air, charged wide slash / wave. */
  swing(charge) {
    const player = this.player;
    if (charge === 0 && player.slashCd > 0) return;
    const step = player.onGround && player.comboT > 0 ? (player.comboStep + 1) % BLADE.combo.length : 0;
    const boxes = bladeAttack(player, { charge, step });
    for (const box of boxes) if (box.melee) placeMelee(box, player);
    this.bullets = this.bullets.filter((b) => !b.melee); // one slash out at a time
    this.bullets.push(...boxes);
    player.slashCd = BLADE.cooldown;
    if (charge === 0 && player.onGround) {
      player.comboStep = step;
      player.comboT = BLADE.comboWindow;
    } else {
      player.comboStep = 0;
      player.comboT = 0;
    }
    player.slashKind = boxes[0].kind;
    player.slashStep = step;
    this.emit("slash", { kind: boxes[0].kind, charge, step, x: player.cx, y: player.cy, facing: player.facing });
  }

  /** Lam Phong uses a boss weapon as a blade technique: one melee strike that carries its weakness. */
  strike(weapon) {
    const player = this.player;
    const box = placeMelee(bladeArt(weapon, player), player);
    this.bullets = this.bullets.filter((b) => !b.melee);
    this.bullets.push(box);
    player.slashCd = BLADE.artCooldown;
    player.comboStep = 0;
    player.comboT = 0;
    player.slashKind = box.kind;
    player.slashStep = 0;
    this.emit("slash", { kind: box.kind, weapon, charge: 0, step: 0, x: player.cx, y: player.cy, facing: player.facing });
  }

  enemyShot(bullet) {
    this.enemyBullets.push({ gravity: 0, life: 4, warnT: 0, homing: 0, ...bullet });
  }

  updateCheckpoints() {
    const checkpoints = this.level.checkpoints;
    for (let i = this.checkpoint + 1; i < checkpoints.length; i += 1) {
      if (this.player.cx >= checkpoints[i].x) {
        this.checkpoint = i;
        this.emit("checkpoint", { x: checkpoints[i].x, y: checkpoints[i].y });
      }
    }
  }

  updateSpawners() {
    if (this.level.doorClosed) return;
    const left = this.camX;
    const right = this.camX + VIEW_W;
    for (const s of this.spawners) {
      const inView = s.x >= left - SPAWN_MARGIN && s.x <= right + SPAWN_MARGIN;
      if (!s.alive && s.armed && inView) {
        this.enemies.push(createEnemy(s.kind, s.x, s.y, s.id));
        s.alive = true;
        s.armed = false;
      } else if (!s.alive && !s.armed && (s.x < left - DESPAWN_MARGIN || s.x > right + DESPAWN_MARGIN)) {
        s.armed = true; // scrolled away: it comes back next time
      }
    }
    this.enemies = this.enemies.filter((e) => {
      const away = e.x + e.w < left - DESPAWN_MARGIN || e.x > right + DESPAWN_MARGIN || e.y > this.level.height + 32;
      if (away) this.releaseSpawner(e);
      return !away;
    });
  }

  releaseSpawner(enemy) {
    const spawner = this.spawners[enemy.spawnId];
    if (spawner) spawner.alive = false;
  }

  updateBullets(dt) {
    const level = this.level;
    const left = this.camX - 24;
    const right = this.camX + VIEW_W + 24;
    const solidAtCenter = (b) =>
      level.isSolid(Math.floor((b.x + b.w / 2) / TILE), Math.floor((b.y + b.h / 2) / TILE));

    this.bullets = this.bullets.filter((b) => {
      if (b.melee) {
        b.life -= dt;
        if (this.player?.alive) placeMelee(b, this.player);
        return b.life > 0 && this.player?.alive;
      }
      b.vy += b.gravity * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      return b.life > 0 && b.x + b.w > left && b.x < right && b.y < level.height && !solidAtCenter(b);
    });

    const player = this.player;
    const floor = this.level.doorClosed ? this.arena.floor : Infinity;
    this.enemyBullets = this.enemyBullets.filter((b) => {
      b.life -= dt;
      if (b.warnT > 0) {
        b.warnT -= dt;
        return b.life > 0;
      }
      if (b.homing && player.alive) {
        const want = Math.atan2(player.cy - (b.y + b.h / 2), player.cx - (b.x + b.w / 2));
        const have = Math.atan2(b.vy, b.vx);
        let turn = want - have;
        while (turn > Math.PI) turn -= Math.PI * 2;
        while (turn < -Math.PI) turn += Math.PI * 2;
        const angle = have + Math.max(-b.homing * dt, Math.min(b.homing * dt, turn));
        const speed = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(angle) * speed;
        b.vy = Math.sin(angle) * speed;
      }
      b.vy += b.gravity * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.floorDie && b.y + b.h >= floor) {
        this.emit("splash", { x: b.x + b.w / 2, y: floor, kind: b.kind });
        return false;
      }
      if (!b.ghost && solidAtCenter(b)) return false;
      return b.life > 0 && b.x + b.w > left - 40 && b.x < right + 40 && b.y < level.height + 16;
    });
  }

  updateDrops(dt) {
    for (const drop of this.drops) {
      drop.life -= dt;
      drop.vy = Math.min(drop.vy + 600 * dt, 300);
      if (moveY(this.level, drop, drop.vy * dt) !== 0) drop.vy = 0;
    }
    this.drops = this.drops.filter((d) => d.life > 0 && d.y < this.level.height);
  }

  collide() {
    const player = this.player;
    // player bullets → enemies / boss
    for (const b of this.bullets) {
      if (b.dead || b.deflected) continue;
      if (b.melee || b.cuts) this.cutShots(b);
      for (const e of this.enemies) {
        if (e.hp <= 0 || b.hits.has(e) || !overlaps(b, e)) continue;
        if (isShielded(e) && b.melee) {
          b.hits.add(e); // the blade clangs off the shield, but the slash goes on
          this.emit("deflect", { x: b.x + b.w / 2, y: b.y + b.h / 2 });
          continue;
        }
        if (isShielded(e)) {
          b.deflected = true;
          b.vx = -b.vx * 0.6;
          b.vy = -160;
          this.emit("deflect", { x: b.x, y: b.y });
          break;
        }
        e.hp -= b.damage;
        e.flash = 0.1;
        b.hits.add(e);
        if (e.hp <= 0) this.killEnemy(e);
        else this.emit("hit", { x: b.x + b.w / 2, y: b.y + b.h / 2 });
        if (!b.pierce) {
          b.dead = true;
          break;
        }
      }
      const boss = this.boss;
      if (!b.dead && boss && boss.hp > 0 && !b.hits.has(boss) && overlaps(b, boss)) {
        const dealt = damageBoss(boss, b.damage, b.weapon);
        if (dealt > 0) {
          if (b.melee || b.kind === "wave") b.hits.add(boss);
          else b.dead = true;
          this.emit("boss-hit", { x: b.x + b.w / 2, y: b.y + b.h / 2, dealt, weak: b.weapon === boss.weakness });
          if (boss.hp <= 0) this.defeatBoss();
        }
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.enemies = this.enemies.filter((e) => e.hp > 0);

    if (!player.alive) return;
    const hurt = (damage, fromX) => {
      if (this.invincible || this.state === "boss-dying") return false;
      if (player.hurt(damage, fromX)) {
        this.emit("hurt", { x: player.cx, y: player.cy });
        return true;
      }
      return false;
    };
    for (const e of this.enemies) {
      if (overlaps(player, e)) hurt(e.damage, e.x + e.w / 2);
    }
    for (const b of this.enemyBullets) {
      if (b.life <= 0 || b.warnT > 0 || !overlaps(player, b)) continue;
      if (hurt(b.damage, b.x + b.w / 2) && !b.ghost) b.life = 0;
    }
    this.enemyBullets = this.enemyBullets.filter((b) => b.life > 0);
    const boss = this.boss;
    if (boss && boss.hp > 0 && overlaps(player, boss)) hurt(boss.contact, boss.x + boss.w / 2);

    // pickups
    for (const p of this.level.pickups) {
      if (this.collected.has(p.id)) continue;
      const box = { x: p.x - 6, y: p.y - 12, w: 12, h: 12 };
      if (overlaps(player, box)) {
        this.collected.add(p.id);
        this.applyPickup(p.kind, p.x, p.y);
      }
    }
    this.drops = this.drops.filter((d) => {
      if (!overlaps(player, d)) return true;
      this.applyPickup(d.kind, d.x + d.w / 2, d.y + d.h);
      return false;
    });
  }

  /** A slash (or blade wave) destroys ordinary enemy shots it touches; beams and warnings are too big to cut. */
  cutShots(blade) {
    for (const shot of this.enemyBullets) {
      if (shot.life <= 0 || shot.ghost || shot.warnT > 0 || !overlaps(blade, shot)) continue;
      shot.life = 0;
      this.score += 10;
      this.emit("parry", { x: shot.x + shot.w / 2, y: shot.y + shot.h / 2 });
    }
  }

  killEnemy(enemy) {
    this.score += enemy.score;
    this.releaseSpawner(enemy);
    this.emit("explode", { x: enemy.x + enemy.w / 2, y: enemy.y + enemy.h / 2, kind: enemy.kind });
    const drop = rollDrop(this.rng);
    if (drop) {
      this.drops.push({ kind: drop, x: enemy.x + enemy.w / 2 - 6, y: enemy.y + enemy.h - 12, w: 12, h: 12, vy: -120, life: DROP_LIFE });
    }
  }

  defeatBoss() {
    this.score += BOSS_SCORE;
    this.enemyBullets = [];
    this.state = "boss-dying";
    this.timer = BOSS_DYING_TIME;
    this.player.charging = false;
    this.emit("boss-defeat", { x: this.boss.x + this.boss.w / 2, y: this.boss.y + this.boss.h / 2 });
  }

  applyPickup(kind, x, y) {
    const player = this.player;
    if (kind === "health" || kind === "big-health") {
      player.hp = Math.min(PLAYER.maxHp, player.hp + PICKUP_VALUES[kind]);
    } else if (kind === "energy") {
      const specials = this.unlockedWeapons.filter((w) => w !== "buster");
      const target = this.weapon !== "buster"
        ? this.weapon
        : specials.sort((a, b) => this.energy[a] - this.energy[b])[0];
      if (target) this.energy[target] = Math.min(MAX_ENERGY, this.energy[target] + PICKUP_VALUES.energy);
    } else if (kind === "life") {
      this.lives = Math.min(MAX_LIVES, this.lives + 1);
    }
    this.emit("pickup", { kind, x, y });
  }
}
