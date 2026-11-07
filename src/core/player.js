/**
 * The hero: run, variable-height jump, ground dash, dash-jump, wall slide and wall jump,
 * tap-to-shoot and hold-to-charge. Pure logic — the game turns the returned actions into
 * bullets and sounds.
 *
 * Input is a snapshot of held buttons: { left, right, jump, shoot, dash }. Presses and
 * releases are detected here by comparing with the previous snapshot.
 */

import { moveX, moveY, touchingWall } from "./physics.js";

export const PLAYER = Object.freeze({
  w: 12,
  h: 22,
  maxHp: 20,
  run: 90, // px/s
  dash: 210,
  dashTime: 0.34, // s
  jump: 310, // initial upward speed
  jumpCut: 90, // releasing jump caps upward speed to this
  gravity: 950,
  maxFall: 330,
  wallSlide: 60,
  wallJump: 300,
  kickTime: 0.12, // after a wall jump, horizontal control is locked this long
  kickSpeed: 120,
  coyote: 0.08, // can still jump this long after walking off a ledge
  buffer: 0.1, // a jump pressed this long before landing still counts
  invuln: 1.2,
  hurtTime: 0.3,
  knockback: 50,
  charge1: 0.45, // hold time for a half-charged shot
  charge2: 1.3, // full charge
  shootPose: 0.25,
});

const NO_INPUT = Object.freeze({ left: false, right: false, jump: false, shoot: false, dash: false });

export class Player {
  /** (cx, bottom): spawn with feet at `bottom`, centred on `cx`. */
  constructor(cx, bottom) {
    this.w = PLAYER.w;
    this.h = PLAYER.h;
    this.x = cx - this.w / 2;
    this.y = bottom - this.h;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.hp = PLAYER.maxHp;
    this.onGround = false;
    this.coyoteT = 0;
    this.bufferT = 0;
    this.dashT = 0;
    this.dashJump = false;
    this.kickT = 0;
    this.kickDir = 0;
    this.wallDir = 0;
    this.invulnT = 0;
    this.hurtT = 0;
    this.knockDir = 0;
    this.charge = 0;
    this.charging = false;
    this.shootT = 0;
    this.prev = NO_INPUT;
    this.alive = true;
  }

  clone() {
    return Object.assign(Object.create(Player.prototype), this);
  }

  get cx() {
    return this.x + this.w / 2;
  }

  get cy() {
    return this.y + this.h / 2;
  }

  get dashing() {
    return this.dashT > 0;
  }

  get chargeLevel() {
    if (this.charge >= PLAYER.charge2) return 2;
    if (this.charge >= PLAYER.charge1) return 1;
    return 0;
  }

  /** Where shots leave the arm cannon. */
  muzzle() {
    return { x: this.facing > 0 ? this.x + this.w + 2 : this.x - 2, y: this.y + 10 };
  }

  /**
   * Advance one step. Returns a list of actions:
   * { type: "jump" | "walljump" | "dash" | "land" | "charge", ... } and
   * { type: "shoot", charge: 0 | 1 | 2 } when a shot should be fired.
   */
  update(input, level, dt, { canCharge = true } = {}) {
    const actions = [];
    const P = PLAYER;
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const jumpPressed = input.jump && !this.prev.jump;
    const dashPressed = input.dash && !this.prev.dash;
    const shootPressed = input.shoot && !this.prev.shoot;
    const shootReleased = !input.shoot && this.prev.shoot;

    this.bufferT = jumpPressed ? P.buffer : Math.max(0, this.bufferT - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.shootT = Math.max(0, this.shootT - dt);

    if (this.hurtT > 0) {
      this.hurtT = Math.max(0, this.hurtT - dt);
      this.vx = this.knockDir * P.knockback;
    } else {
      // --- horizontal ---
      if (this.kickT > 0) {
        this.kickT = Math.max(0, this.kickT - dt);
        this.vx = this.kickDir * P.kickSpeed * (this.dashJump ? 1.5 : 1);
      } else {
        if (this.dashT > 0) {
          const stop = !input.dash || !this.onGround || (dir !== 0 && dir !== this.facing);
          this.dashT = stop ? 0 : Math.max(0, this.dashT - dt);
        }
        if (dir !== 0) this.facing = dir;
        if (dashPressed && this.onGround) {
          this.dashT = P.dashTime;
          actions.push({ type: "dash" });
        }
        if (this.dashT > 0) this.vx = this.facing * P.dash;
        else this.vx = dir * (this.dashJump ? P.dash : P.run);
      }

      // --- jumping ---
      if (this.bufferT > 0 && (this.onGround || this.coyoteT > 0)) {
        this.vy = -P.jump;
        this.dashJump = this.dashT > 0 || (input.dash && this.onGround);
        this.dashT = 0;
        this.onGround = false;
        this.coyoteT = 0;
        this.bufferT = 0;
        actions.push({ type: "jump" });
      } else if (this.bufferT > 0 && !this.onGround) {
        const wall = touchingWall(level, this, this.facing)
          ? this.facing
          : touchingWall(level, this, -this.facing)
            ? -this.facing
            : 0;
        if (wall !== 0) {
          this.vy = -P.wallJump;
          this.kickDir = -wall;
          this.kickT = P.kickTime;
          this.facing = -wall;
          this.dashJump = input.dash;
          this.bufferT = 0;
          actions.push({ type: "walljump" });
        }
      }
      if (!input.jump && this.vy < -P.jumpCut) this.vy = -P.jumpCut;
    }

    // --- gravity & wall slide ---
    this.vy = Math.min(this.vy + P.gravity * dt, P.maxFall);
    this.wallDir = 0;
    if (!this.onGround && this.vy > 0 && this.hurtT === 0 && this.kickT === 0 && dir !== 0
      && touchingWall(level, this, dir)) {
      this.vy = Math.min(this.vy, P.wallSlide);
      this.wallDir = dir;
      this.facing = -dir; // shoot away from the wall
      this.dashJump = false;
    }

    // --- move ---
    moveX(level, this, this.vx * dt);
    const hitY = moveY(level, this, this.vy * dt);
    if (hitY === 1) {
      if (!this.onGround) actions.push({ type: "land" });
      this.onGround = true;
      this.vy = 0;
      this.dashJump = false;
      this.coyoteT = P.coyote;
    } else {
      if (hitY === -1) this.vy = 0;
      if (this.onGround && this.vy >= 0) {
        // walked off a ledge: a dash keeps its speed through the fall
        if (this.dashT > 0) this.dashJump = true;
        this.dashT = 0;
      }
      this.onGround = false;
      this.coyoteT = Math.max(0, this.coyoteT - dt);
    }

    // --- shooting ---
    if (shootPressed) {
      actions.push({ type: "shoot", charge: 0 });
      this.shootT = P.shootPose;
      this.charge = 0;
      this.charging = canCharge;
    } else if (input.shoot && this.charging) {
      const before = this.chargeLevel;
      this.charge += dt;
      if (this.chargeLevel > before) actions.push({ type: "charge", level: this.chargeLevel });
    }
    if (shootReleased) {
      if (this.charging && this.chargeLevel > 0) {
        actions.push({ type: "shoot", charge: this.chargeLevel });
        this.shootT = P.shootPose;
      }
      this.charge = 0;
      this.charging = false;
    }

    this.prev = { left: input.left, right: input.right, jump: input.jump, shoot: input.shoot, dash: input.dash };
    return actions;
  }

  /** Take damage from something at `fromX`. Returns false while invulnerable. */
  hurt(damage, fromX) {
    if (!this.alive || this.invulnT > 0) return false;
    this.hp = Math.max(0, this.hp - damage);
    this.invulnT = PLAYER.invuln;
    this.hurtT = PLAYER.hurtTime;
    this.knockDir = fromX <= this.cx ? 1 : -1;
    this.facing = -this.knockDir;
    this.vy = Math.max(this.vy, -60);
    this.dashT = 0;
    this.kickT = 0;
    this.dashJump = false;
    this.charge = 0;
    this.charging = false;
    return true;
  }
}

export { NO_INPUT };
