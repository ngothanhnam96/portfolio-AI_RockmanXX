/**
 * Canvas renderer. The world is 320 × 192 "pixels" drawn at an integer scale so everything
 * stays crisp. All art is procedural (rectangles and arcs) — there are no image files.
 */

import { ROWS, TILE, VIEW_H, VIEW_W } from "../core/constants.js";
import { T_DOOR, T_HAZARD, T_ONEWAY, T_SOLID } from "../core/level.js";
import { WEAPONS } from "../core/weapons.js";
import { HERO, LAM, THEMES } from "./themes.js";

// ------------------------------------------------------------------ particles

export class Particles {
  constructor() {
    this.items = [];
  }

  add(p) {
    this.items.push({ vx: 0, vy: 0, gravity: 0, size: 2, life: 0.5, age: 0, shape: "square", ...p });
  }

  burst(x, y, color, count = 10, speed = 90, extra = {}) {
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const s = speed * (0.5 + Math.random() * 0.7);
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color, life: 0.35 + Math.random() * 0.3, size: 2 + Math.random() * 2, ...extra });
    }
  }

  ring(x, y, color, radius = 18, life = 0.35) {
    this.add({ x, y, color, shape: "ring", size: radius, life });
  }

  update(dt) {
    for (const p of this.items) {
      p.age += dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.items = this.items.filter((p) => p.age < p.life);
  }

  clear() {
    this.items = [];
  }
}

// ------------------------------------------------------------------ renderer

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  let scale = 1;
  let camX = 0;
  let shake = 0;
  let pal = HERO; // palette of the hero being played (for the 1-up icon)

  function resize() {
    // Size from the layout viewport, not the parent: the parent grows with the canvas itself.
    const root = document.documentElement;
    const top = canvas.parentElement.getBoundingClientRect().top;
    const pad = 16;
    const box = { width: root.clientWidth - pad, height: root.clientHeight - top - pad };
    const dpr = window.devicePixelRatio || 1;
    const fit = Math.max(1, Math.min(box.width / VIEW_W, box.height / VIEW_H));
    scale = Math.max(1, Math.floor(fit * dpr));
    canvas.width = VIEW_W * scale;
    canvas.height = VIEW_H * scale;
    const cssScale = Math.min(box.width / VIEW_W, box.height / VIEW_H);
    canvas.style.width = `${Math.floor(VIEW_W * cssScale)}px`;
    canvas.style.height = `${Math.floor(VIEW_H * cssScale)}px`;
    ctx.imageSmoothingEnabled = false;
  }

  const sx = (x) => Math.round(x - camX);
  const sy = (y) => Math.round(y);

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(sx(x), sy(y), Math.round(w), Math.round(h));
  }

  function circle(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x - camX, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Draw rectangles in a sprite's local space (facing right), mirrored when facing left. */
  function sprite(ox, oy, width, facing) {
    return (lx, ly, w, h, color) => {
      const x = facing >= 0 ? ox + lx : ox + width - lx - w;
      rect(x, oy + ly, w, h, color);
    };
  }

  // ---------------------------------------------------------------- background

  function drawBackground(theme, id, time) {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, theme.sky[0]);
    g.addColorStop(0.6, theme.sky[1]);
    g.addColorStop(1, theme.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const far = camX * 0.2;
    const mid = camX * 0.45;
    ctx.fillStyle = theme.far;
    if (id === "ember") {
      for (let i = -1; i < 8; i += 1) {
        const x = i * 64 - (far % 64);
        ctx.fillRect(Math.round(x + 10), 70, 12, 122);
        ctx.fillRect(Math.round(x + 34), 96, 18, 96);
        ctx.fillRect(Math.round(x), 130, 64, 62);
      }
      ctx.fillStyle = theme.mid;
      for (let i = -1; i < 5; i += 1) {
        const x = Math.round(i * 110 - (mid % 110));
        ctx.fillRect(x, 120, 80, 10);
        ctx.fillRect(x + 70, 120, 10, 72);
      }
      for (let i = 0; i < 14; i += 1) {
        const x = (i * 53 + time * 6) % VIEW_W;
        const y = VIEW_H - ((time * (14 + (i % 5) * 6) + i * 37) % VIEW_H);
        ctx.fillStyle = i % 2 ? theme.accent : theme.particle;
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    } else if (id === "frost") {
      for (let i = -1; i < 6; i += 1) {
        const x = i * 90 - (far % 90);
        ctx.beginPath();
        ctx.moveTo(x, 150);
        ctx.lineTo(x + 45, 60 + (i % 2) * 20);
        ctx.lineTo(x + 90, 150);
        ctx.fill();
      }
      ctx.fillStyle = theme.mid;
      for (let i = -1; i < 12; i += 1) {
        const x = i * 34 - (mid % 34);
        ctx.beginPath();
        ctx.moveTo(x, 170);
        ctx.lineTo(x + 10, 128);
        ctx.lineTo(x + 20, 170);
        ctx.fill();
      }
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 26; i += 1) {
        const x = (i * 47 + Math.sin(time + i) * 8 - camX * 0.6) % VIEW_W;
        const y = (time * (12 + (i % 4) * 5) + i * 29) % VIEW_H;
        ctx.fillRect(Math.round((x + VIEW_W) % VIEW_W), Math.round(y), 1, 1);
      }
    } else if (id === "storm") {
      for (let i = -1; i < 6; i += 1) {
        const x = Math.round(i * 80 - (far % 80));
        ctx.fillRect(x + 20, 50, 16, 142);
        ctx.fillRect(x + 14, 46, 28, 6);
      }
      ctx.fillStyle = theme.mid;
      for (let i = -1; i < 5; i += 1) {
        const x = Math.round(i * 120 - (mid % 120));
        ctx.beginPath();
        ctx.ellipse(x + 40, 40, 60, 14, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (Math.sin(time * 0.7) > 0.985) {
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      }
    } else {
      ctx.strokeStyle = theme.far;
      ctx.lineWidth = 1;
      for (let i = -1; i < 12; i += 1) {
        const x = Math.round(i * 32 - (far % 32)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, VIEW_H);
        ctx.stroke();
      }
      for (let y = 8; y < VIEW_H; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(VIEW_W, y + 0.5);
        ctx.stroke();
      }
      ctx.fillStyle = theme.mid;
      for (let i = -1; i < 6; i += 1) {
        const x = Math.round(i * 70 - (mid % 70));
        ctx.fillRect(x, 40, 22, 152);
        ctx.fillStyle = theme.light;
        ctx.fillRect(x + 9, 50 + ((time * 40 + i * 30) % 120), 4, 4);
        ctx.fillStyle = theme.mid;
      }
    }
  }

  // ---------------------------------------------------------------- tiles

  function drawTiles(level, theme, id, time) {
    const first = Math.max(0, Math.floor(camX / TILE));
    const last = Math.min(level.cols - 1, Math.floor((camX + VIEW_W) / TILE));
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = first; col <= last; col += 1) {
        const t = level.tile(col, row);
        const x = col * TILE;
        const y = row * TILE;
        if (t === T_SOLID) drawSolid(level, theme, id, col, row, x, y);
        else if (t === T_ONEWAY) {
          rect(x, y, TILE, 5, theme.platform);
          rect(x, y, TILE, 1, theme.light);
          rect(x, y + 5, TILE, 1, theme.dark);
          rect(x + 3, y + 6, 2, 3, theme.dark);
          rect(x + 11, y + 6, 2, 3, theme.dark);
        } else if (t === T_HAZARD) drawHazard(theme, id, x, y, time, level.tile(col, row - 1) !== T_HAZARD);
        else if (t === T_DOOR) drawDoor(level, theme, x, y, row);
      }
    }
  }

  function drawSolid(level, theme, id, col, row, x, y) {
    rect(x, y, TILE, TILE, theme.base);
    const open = (c, r) => level.tile(c, r) !== T_SOLID;
    if (id === "ember") {
      const offset = row % 2 ? 8 : 0;
      rect(x, y + 7, TILE, 1, theme.line);
      rect(x, y + 15, TILE, 1, theme.line);
      rect(x + ((offset + 4) % 16), y, 1, 7, theme.line);
      rect(x + ((offset + 12) % 16), y + 8, 1, 7, theme.line);
    } else if (id === "frost") {
      rect(x + 2, y + 3, 5, 1, theme.light);
      rect(x + 9, y + 10, 4, 1, theme.line);
    } else if (id === "storm") {
      rect(x + 2, y + 2, 2, 2, theme.light);
      rect(x + 12, y + 2, 2, 2, theme.light);
      rect(x + 2, y + 12, 2, 2, theme.dark);
      rect(x + 12, y + 12, 2, 2, theme.dark);
    } else {
      rect(x + 3, y + 8, 10, 1, theme.line);
      rect(x + 12, y + 4, 1, 5, theme.line);
      rect(x + 3, y + 8, 1, 4, theme.line);
    }
    if (open(col, row - 1)) {
      rect(x, y, TILE, 3, theme.light);
      if (id === "frost") rect(x + ((col * 5) % 10), y + 3, 3, 2, theme.light);
      if (id === "storm" && col % 2 === 0) rect(x, y + 3, 8, 2, theme.line);
    }
    if (open(col, row + 1)) rect(x, y + TILE - 2, TILE, 2, theme.dark);
    if (open(col - 1, row)) rect(x, y, 1, TILE, theme.light);
    if (open(col + 1, row)) rect(x + TILE - 1, y, 1, TILE, theme.dark);
  }

  function drawHazard(theme, id, x, y, time, surface) {
    const [a, b, c] = theme.hazard;
    if (id === "ember") {
      rect(x, y + 4, TILE, TILE - 4, a);
      const wave = Math.round(Math.sin(time * 4 + x * 0.3) * 1.5);
      if (surface) {
        rect(x, y + 4 + wave, TILE, 3, b);
        rect(x + ((time * 12 + x) % 14), y + 5 + wave, 2, 1, c);
      }
    } else if (id === "storm") {
      rect(x, y + 10, TILE, 6, theme.dark);
      ctx.strokeStyle = (Math.floor(time * 10) % 2) ? a : b;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 4; i += 1) {
        const px = sx(x) + i * 4;
        const py = y + 8 + ((i + Math.floor(time * 12)) % 2 ? -3 : 2);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    } else {
      rect(x, y + 13, TILE, 3, id === "core" ? theme.dark : c);
      for (let i = 0; i < 4; i += 1) {
        ctx.fillStyle = i % 2 ? b : a;
        ctx.beginPath();
        ctx.moveTo(sx(x) + i * 4, y + 14);
        ctx.lineTo(sx(x) + i * 4 + 2, y + 5);
        ctx.lineTo(sx(x) + i * 4 + 4, y + 14);
        ctx.fill();
      }
    }
  }

  function drawDoor(level, theme, x, y, row) {
    rect(x, y, TILE, TILE, level.doorClosed ? theme.dark : "rgba(0,0,0,0.35)");
    const bands = level.doorClosed ? 4 : 1;
    for (let i = 0; i < bands; i += 1) rect(x + 1, y + 1 + i * 4, TILE - 2, 2, theme.accent);
    rect(x, y, 2, TILE, theme.light);
    rect(x + TILE - 2, y, 2, TILE, theme.light);
    if (row === 6) rect(x, y, TILE, 2, theme.light);
  }

  // ---------------------------------------------------------------- entities

  function drawHero(p, game, time) {
    if (!p.alive) return;
    if (p.invulnT > 0 && Math.floor(time * 20) % 2 === 0) return;
    const facing = p.facing;
    const lam = p.hero === "lam";
    const C = lam ? LAM : HERO;
    const part = sprite(p.x, p.y, p.w, facing);
    const run = p.onGround && Math.abs(p.vx) > 1 && !p.dashing ? Math.floor(time * 10) % 4 : -1;
    const air = !p.onGround && p.wallDir === 0;
    const legOffset = run === 0 ? 2 : run === 2 ? -2 : 0;

    // after-images while dashing
    if (p.dashing || p.dashJump) {
      ctx.globalAlpha = 0.3;
      rect(p.x - facing * 6, p.y + 6, p.w, p.h - 8, C.visor);
      ctx.globalAlpha = 1;
    }

    // charge aura
    if (p.chargeLevel > 0) {
      const colors = lam
        ? (p.chargeLevel === 2 ? ["#3ff5c8", "#ffffff"] : ["#8ff5df", "#eafff9"])
        : (p.chargeLevel === 2 ? ["#5ff2ff", "#ffffff"] : ["#ffd23f", "#fff3b0"]);
      ctx.globalAlpha = 0.5;
      const pulse = Math.floor(time * 24) % 2;
      rect(p.x - 2, p.y - 2, p.w + 4, p.h + 4, colors[pulse]);
      ctx.globalAlpha = 1;
    }

    // Lam Phong's scarf streams behind the head
    if (lam) {
      const wave = Math.floor(time * 8) % 2;
      const trail = p.dashing || p.dashJump || Math.abs(p.vx) > 1 ? 9 : 5;
      part(-trail + 2, 6 + wave, trail, 2, C.scarf);
      part(-trail, 7 - wave, 3, 2, C.scarf);
    }

    // legs
    if (p.dashing) {
      part(-2, 15, 6, 4, C.suit);
      part(-4, 18, 6, 4, C.armor);
      part(6, 16, 5, 6, C.armor);
    } else if (air) {
      part(1, 15, 4, 5, C.suit);
      part(0, 18, 5, 3, C.armor);
      part(7, 14, 4, 5, C.suit);
      part(7, 17, 5, 3, C.armor);
    } else {
      part(1 + legOffset, 15, 4, 4, C.suit);
      part(0 + legOffset, 18, 6, 4, C.armor);
      part(7 - legOffset, 15, 4, 4, C.suit);
      part(6 - legOffset, 18, 6, 4, C.armor);
      part(0 + legOffset, 21, 6, 1, C.armorDark);
      part(6 - legOffset, 21, 6, 1, C.armorDark);
    }
    // torso
    part(1, 8, 10, 8, C.suit);
    part(3, 9, 6, 4, C.armor);
    part(4, 10, 2, 2, C.armorLight);
    part(1, 14, 10, 2, C.armorDark);
    // head
    part(1, 0, 10, 8, C.armor);
    part(2, -2, 3, 2, C.armorDark);
    part(5, 3, 7, 3, C.outline);
    part(6, 4, 5, 1, C.visor);
    part(1, 0, 10, 1, C.armorLight);
    // arm / cannon (Volt) or sword arm (Lam Phong)
    const shooting = p.shootT > 0 || p.chargeLevel > 0;
    const slashing = lam && game.bullets.some((b) => b.melee);
    if (lam) {
      if (slashing) {
        part(7, 8, 7, 3, C.armor);
        part(13, 7, 2, 5, C.armorDark); // hilt, the blade itself is the slash arc
      } else if (p.chargeLevel > 0) {
        part(7, 10, 5, 3, C.armor);
        part(10, 2, 2, 10, Math.floor(time * 24) % 2 ? C.blade : C.bladeCore); // blade raised, glowing
      } else {
        part(-1, 1, 2, 12, C.armorDark); // sheathed on the back
        part(-2, 12, 4, 2, C.armorDark);
        if (game.weapon !== "buster") part(-1, -1, 2, 2, WEAPONS[game.weapon].color); // the learned technique glows at the pommel
        part(4 - legOffset / 2, 10, 4, 6, C.armorDark);
      }
    } else if (shooting) {
      part(7, 9, 8, 4, C.armor);
      part(14, 9, 2, 4, WEAPONS[game.weapon].color);
    } else if (p.wallDir !== 0) {
      part(8, 6, 4, 6, C.armor);
    } else {
      part(4 - legOffset / 2, 10, 4, 6, C.armorDark);
    }
    if (p.hurtT > 0) {
      ctx.globalAlpha = 0.5;
      rect(p.x, p.y, p.w, p.h, "#ffffff");
      ctx.globalAlpha = 1;
    }
  }

  function drawEnemy(e, theme, time) {
    const part = sprite(e.x, e.y, e.w, e.facing);
    const white = e.flash > 0;
    const c = (color) => (white ? "#ffffff" : color);
    switch (e.kind) {
      case "walker": {
        const step = Math.floor(time * 8) % 2;
        part(1, 2, 12, 7, c("#5f7a3a"));
        part(2, 1, 9, 2, c("#8fae55"));
        part(9, 4, 3, 2, c("#ffef5c"));
        part(2 + step, 9, 3, 3, c("#2b2b2b"));
        part(9 - step, 9, 3, 3, c("#2b2b2b"));
        break;
      }
      case "flyer": {
        const flap = Math.floor(time * 20) % 2;
        ctx.globalAlpha = 0.7;
        part(2, flap ? -3 : -1, 7, 3, c("#e8f6ff"));
        ctx.globalAlpha = 1;
        part(0, 2, 12, 7, c("#ffcf33"));
        part(3, 2, 2, 7, c("#2b2b2b"));
        part(7, 2, 2, 7, c("#2b2b2b"));
        part(9, 4, 2, 2, c("#ff3b3b"));
        part(-2, 6, 2, 2, c("#2b2b2b"));
        break;
      }
      case "turret": {
        part(0, 8, 14, 6, c("#4a5060"));
        part(1, 8, 12, 1, c("#7a8296"));
        part(2, e.open ? 1 : 3, 10, e.open ? 7 : 5, c("#6b7388"));
        if (e.open) {
          part(8, 3, 3, 3, c("#ff3b3b"));
          part(10, 4, 5, 2, c("#2b2b2b"));
        } else {
          part(2, 3, 10, 1, c("#9aa3b8"));
        }
        break;
      }
      case "hopper": {
        const crouch = e.onGround ? 2 : 0;
        part(1, 2 + crouch, 12, 8, c("#3aa85a"));
        part(2, 2 + crouch, 10, 2, c("#7be08f"));
        part(8, 4 + crouch, 3, 3, c("#ffffff"));
        part(9, 5 + crouch, 2, 2, c("#1b1b1b"));
        part(1, 10, 4, 4 - (crouch ? 0 : 1), c("#9aa3b8"));
        part(9, 10, 4, 4 - (crouch ? 0 : 1), c("#9aa3b8"));
        break;
      }
      default:
        rect(e.x, e.y, e.w, e.h, theme.accent);
    }
  }

  function drawBoss(b, time) {
    if (b.hp <= 0) return;
    const part = sprite(b.x, b.y, b.w, b.facing);
    const flash = b.flash > 0 && Math.floor(time * 30) % 2 === 0;
    const c = (color) => (flash ? "#ffffff" : color);
    switch (b.id) {
      case "ember": {
        const glow = Math.floor(time * 6) % 2 ? "#ffe27a" : "#ffb02e";
        part(2, 6, 20, 16, c("#8c2d14"));
        part(0, 8, 5, 10, c("#5a1c0c"));
        part(19, 8, 5, 10, c("#5a1c0c"));
        part(8, 10, 8, 7, c(glow));
        part(5, 0, 14, 8, c("#a63a18"));
        part(4, -3, 3, 4, c("#ff6a1a"));
        part(17, -3, 3, 4, c("#ff6a1a"));
        part(12, 3, 6, 2, c("#ffe27a"));
        part(3, 22, 7, 6, c("#3d1209"));
        part(14, 22, 7, 6, c("#3d1209"));
        break;
      }
      case "frost": {
        const crouch = b.state === "dash" && b.step === 1 ? 3 : 0;
        part(4, 7 + crouch, 14, 12, c("#3f6fa8"));
        part(0, 5 + crouch, 6, 7, c("#bff0ff"));
        part(16, 5 + crouch, 6, 7, c("#bff0ff"));
        part(6, 0 + crouch, 10, 8, c("#d8efff"));
        part(10, 3 + crouch, 6, 2, c("#1a2a44"));
        part(11, 3 + crouch, 4, 1, c("#5ff2ff"));
        part(9, 9 + crouch, 4, 6, c("#9fd8ff"));
        part(5, 19, 5, 7, c("#25466d"));
        part(12, 19, 5, 7, c("#25466d"));
        break;
      }
      case "storm": {
        const flap = Math.floor(time * 24) % 2;
        ctx.globalAlpha = 0.6;
        part(4, flap ? -6 : -3, 14, 6, c("#f1dcff"));
        ctx.globalAlpha = 1;
        part(0, 4, 18, 12, c("#ffd23f"));
        part(4, 4, 3, 12, c("#3a2d63"));
        part(10, 4, 3, 12, c("#3a2d63"));
        part(16, 2, 8, 10, c("#c48bff"));
        part(20, 5, 3, 3, c("#ffffff"));
        part(-4, 9, 5, 3, c("#3a2d63"));
        break;
      }
      case "core": {
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        circle(cx, cy, 18, c(b.phase === 2 ? "#5a1020" : "#1f2a36"));
        circle(cx, cy, 13, c("#2f3e4e"));
        const eye = b.phase === 2 ? "#ff4d6d" : "#4fd1c5";
        circle(cx + b.facing * 3, cy, 6, c(eye));
        circle(cx + b.facing * 4, cy, 2, "#ffffff");
        ctx.strokeStyle = c(eye);
        ctx.lineWidth = 2;
        ctx.beginPath();
        const spin = time * (b.phase === 2 ? 4 : 2);
        ctx.ellipse(cx - camX, cy, 24, 8, spin, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      default:
        rect(b.x, b.y, b.w, b.h, "#ff00ff");
    }
  }

  function drawPlayerBullet(b, time) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    switch (b.kind) {
      case "buster0":
        rect(b.x, b.y + 1, b.w, b.h - 2, "#ffd23f");
        rect(b.x + 1, b.y, b.w - 2, b.h, "#ffd23f");
        rect(b.x + 2, b.y + 2, b.w - 4, b.h - 4, "#fff6c9");
        break;
      case "buster1":
        circle(cx, cy, 6, "#ffb02e");
        circle(cx, cy, 4, "#fff6c9");
        break;
      case "buster2":
        ctx.globalAlpha = 0.5;
        rect(b.x - Math.sign(b.vx) * 10, b.y + 3, b.w, b.h - 6, "#5ff2ff");
        ctx.globalAlpha = 1;
        circle(cx, cy, 9, Math.floor(time * 20) % 2 ? "#5ff2ff" : "#b5fbff");
        circle(cx, cy, 5, "#ffffff");
        break;
      case "slash":
      case "slash-wide":
      case "slash-air":
        drawSlash(b);
        break;
      case "art-ember":
      case "art-frost":
      case "art-storm":
        drawArt(b, time);
        break;
      case "wave": {
        const dir = Math.sign(b.vx) || 1;
        ctx.globalAlpha = 0.5;
        for (const [dy, len] of [[5, 10], [10, 16], [16, 8]]) rect(dir > 0 ? b.x - len : b.x + b.w, b.y + dy, len, 1, LAM.blade);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = Math.floor(time * 20) % 2 ? LAM.blade : LAM.bladeCore;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(b.x - camX + b.w / 2 - dir * 6, cy, b.h / 2, -Math.PI / 2.4, Math.PI / 2.4, dir < 0);
        ctx.stroke();
        break;
      }
      case "ember":
        circle(cx, cy, 6, "#ff5a14");
        circle(cx, cy, 3, "#ffe27a");
        break;
      case "frost":
        ctx.fillStyle = "#bff0ff";
        ctx.beginPath();
        ctx.moveTo(sx(b.x), cy);
        ctx.lineTo(sx(cx), b.y);
        ctx.lineTo(sx(b.x + b.w), cy);
        ctx.lineTo(sx(cx), b.y + b.h);
        ctx.fill();
        break;
      case "storm":
        ctx.strokeStyle = Math.floor(time * 30) % 2 ? "#c48bff" : "#f1dcff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 4; i += 1) {
          const px = sx(b.x) + (i * b.w) / 4;
          const py = cy + (i % 2 ? -3 : 3);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        break;
      default:
        rect(b.x, b.y, b.w, b.h, "#ffffff");
    }
    if (b.deflected) rect(b.x, b.y, b.w, b.h, "rgba(255,255,255,0.6)");
  }

  /** A blade slash: a bright crescent that sweeps and fades while the hitbox is out. */
  function drawSlash(b) {
    const total = b.kind === "slash-wide" ? 0.18 : 0.14;
    const t = 1 - Math.max(0, b.life) / total; // 0 → 1 over the slash
    const cx = b.x - camX + b.w / 2;
    const cy = b.y + b.h / 2;
    ctx.globalAlpha = Math.max(0.15, 1 - t * 0.8);
    ctx.lineCap = "round";
    if (b.kind === "slash-air") {
      const r = Math.min(b.w, b.h) / 2;
      const a = t * Math.PI * 2;
      ctx.strokeStyle = LAM.blade;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, r, a, a + Math.PI * 1.4);
      ctx.stroke();
      ctx.strokeStyle = LAM.bladeCore;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, a + 0.3, a + Math.PI * 1.2);
      ctx.stroke();
    } else {
      // centre the arc on the hero's side of the box so it sweeps outward
      const dir = b.facing;
      const ox = dir > 0 ? b.x - camX : b.x - camX + b.w;
      const r = b.w - 2;
      const down = b.step === 1; // the 2nd hit of the combo sweeps upward instead
      const from = down ? Math.PI / 2.2 : -Math.PI / 2.2;
      const sweep = (down ? -1 : 1) * (Math.PI / 1.1) * Math.min(1, 0.35 + t * 1.3);
      const start = dir > 0 ? from : Math.PI - from;
      const finish = dir > 0 ? from + sweep : Math.PI - from - sweep;
      const ccw = dir > 0 ? sweep < 0 : sweep > 0;
      ctx.strokeStyle = LAM.blade;
      ctx.lineWidth = b.kind === "slash-wide" ? 6 : b.step === 2 ? 5 : 4;
      ctx.beginPath();
      ctx.arc(ox, cy, r, start, finish, ccw);
      ctx.stroke();
      ctx.strokeStyle = LAM.bladeCore;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ox, cy, r - 1, start, finish, ccw);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
    ctx.globalAlpha = 1;
  }

  /** Lam Phong's boss techniques: a rising flame slash, an ice thrust, a lightning spin. */
  function drawArt(b, time) {
    const t = 1 - Math.max(0, b.life) / b.total; // 0 → 1 over the strike
    const dir = b.facing;
    const flick = Math.floor(time * 24) % 2;
    ctx.globalAlpha = Math.max(0.2, 1 - t * 0.75);
    ctx.lineCap = "round";
    if (b.kind === "art-ember") {
      // an upward crescent from the feet to above the head, flames licking up the column
      const ox = dir > 0 ? b.x - camX : b.x - camX + b.w;
      const oy = b.y + b.h;
      const r = b.w;
      const sweep = (Math.PI / 2) * Math.min(1, 0.3 + t * 1.6);
      const start = dir > 0 ? 0 : Math.PI;
      const finish = dir > 0 ? -sweep : Math.PI + sweep;
      for (const [color, width] of [["#ff5a14", 6], ["#ffe27a", 2]]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.arc(ox, oy - 4, r, start, finish, dir > 0);
        ctx.stroke();
      }
      for (let i = 0; i < 4; i += 1) {
        const rise = (time * 90 + i * 13) % (b.h - 6);
        const fh = 4 + ((i + flick) % 2) * 3;
        rect(b.x + 3 + i * 6, b.y + b.h - rise - fh, 3, fh, i % 2 ? "#ffb02e" : "#ff5a14");
      }
    } else if (b.kind === "art-frost") {
      // a long ice lance: wide at the hilt, a bright point at the tip
      const reach = b.w * Math.min(1, 0.4 + t * 2);
      const base = dir > 0 ? b.x : b.x + b.w;
      const tip = base + dir * reach;
      const cy = b.y + b.h / 2;
      for (const [color, half, back] of [["#7fe3ff", 4, 0], ["#ffffff", 1, 2]]) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(sx(base), cy - half);
        ctx.lineTo(sx(tip - dir * back), cy);
        ctx.lineTo(sx(base), cy + half);
        ctx.fill();
      }
      for (const [dx, dy] of [[-6, -5], [-12, 4], [-18, -3]]) rect(tip + dir * dx, cy + dy, 2, 2, flick ? "#bff0ff" : "#ffffff");
    } else {
      // two lightning rings spinning around the hero, bolts crackling out to both sides
      const cx = b.x - camX + b.w / 2;
      const cy = b.y + b.h / 2;
      const spin = t * Math.PI * 4;
      ctx.strokeStyle = flick ? "#c48bff" : "#f1dcff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, b.w / 2 - 2, b.h / 2 - 4, 0, spin, spin + Math.PI * 1.3);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, b.w / 2 - 8, b.h / 2 - 8, 0, spin + Math.PI, spin + Math.PI * 2.1);
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        for (let i = 0; i <= 4; i += 1) {
          const px = cx + side * (8 + i * 5.5);
          const py = cy + (i % 2 ? -4 : 4) * (flick ? 1 : -1);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
    ctx.lineCap = "butt";
    ctx.globalAlpha = 1;
  }

  function drawEnemyBullet(b, game, time) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    switch (b.kind) {
      case "bolt":
        if (b.warnT > 0) {
          if (Math.floor(time * 16) % 2) rect(cx - 1, b.y, 2, b.h, "rgba(255,240,150,0.7)");
          rect(b.x, game.arena.floor - 3, b.w, 3, "#ffd23f");
        } else {
          rect(b.x, b.y, b.w, b.h, "rgba(196,139,255,0.85)");
          rect(cx - 2, b.y, 4, b.h, "#ffffff");
        }
        break;
      case "icicle":
        ctx.fillStyle = b.warnT > 0 && Math.floor(time * 16) % 2 ? "#ffffff" : "#9fd8ff";
        ctx.beginPath();
        ctx.moveTo(sx(b.x), b.y);
        ctx.lineTo(sx(b.x + b.w), b.y);
        ctx.lineTo(sx(cx), b.y + b.h);
        ctx.fill();
        break;
      case "wave":
        for (let i = 0; i < 3; i += 1) {
          const h = 6 + ((Math.floor(time * 20) + i) % 3) * 3;
          rect(b.x + i * 5, b.y + b.h - h, 5, h, i % 2 ? "#ffb02e" : "#ff5a14");
        }
        break;
      case "fireball":
        circle(cx, cy, 5, "#ff5a14");
        circle(cx, cy, 2.5, "#ffe27a");
        break;
      case "shard":
        circle(cx, cy, 4, "#bff0ff");
        circle(cx, cy, 2, "#ffffff");
        break;
      case "spark":
        circle(cx, cy, 4, Math.floor(time * 20) % 2 ? "#c48bff" : "#ffffff");
        break;
      case "orb":
        circle(cx, cy, 4, "#ff4d6d");
        circle(cx, cy, 2, "#ffd0da");
        break;
      default:
        circle(cx, cy, 3, "#ff6a3d");
        circle(cx, cy, 1.5, "#ffe0c2");
    }
  }

  function drawPickup(kind, x, bottom, time, blink = false) {
    if (blink && Math.floor(time * 10) % 2) return;
    const bob = Math.round(Math.sin(time * 4 + x) * 1);
    const y = bottom - 12 + bob;
    if (kind === "health" || kind === "big-health") {
      const big = kind === "big-health";
      const w = big ? 12 : 8;
      const h = big ? 10 : 7;
      const left = x - w / 2;
      const top = bottom - h - 1 + bob;
      rect(left, top, w, h, "#ffffff");
      rect(left, top + h / 2 - 1, w, 3, "#ff3b5c");
      rect(left + 1, top, w - 2, 1, "#ffd0da");
    } else if (kind === "energy") {
      rect(x - 4, y + 2, 8, 9, "#3b82f6");
      rect(x - 3, y + 3, 6, 3, "#ffd23f");
      rect(x - 4, y + 2, 8, 1, "#bfdbfe");
    } else if (kind === "life") {
      rect(x - 5, y, 10, 9, pal.armor);
      rect(x - 1, y + 3, 6, 3, pal.outline);
      rect(x, y + 4, 4, 1, pal.visor);
      rect(x - 5, y, 10, 1, pal.armorLight);
    }
  }

  function drawCheckpoint(cp, active, theme, time) {
    rect(cp.x - 1, cp.y - 24, 2, 24, theme.light);
    rect(cp.x - 4, cp.y - 2, 8, 2, theme.dark);
    const color = active ? (Math.floor(time * 4) % 2 ? "#5ff2ff" : "#b5fbff") : "#6b7280";
    rect(cp.x + 1, cp.y - 24, 9, 6, color);
  }

  function drawParticles(particles) {
    for (const p of particles.items) {
      const t = p.age / p.life;
      ctx.globalAlpha = Math.max(0, 1 - t);
      if (p.shape === "ring") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x - camX, p.y, p.size * (0.3 + t), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.shape === "text") {
        ctx.fillStyle = p.color;
        ctx.font = "bold 8px monospace";
        ctx.textAlign = "center";
        ctx.fillText(p.text, p.x - camX, p.y);
      } else {
        rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size, p.color);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- frame

  function draw(game, particles, time) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!game.level || !game.stage) {
      ctx.fillStyle = "#0b0d16";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const themeId = game.stage.theme;
    const theme = THEMES[themeId];
    shake = Math.max(0, shake - 1 / 60);
    const jolt = shake > 0 ? Math.round((Math.random() - 0.5) * 4) : 0;
    ctx.setTransform(scale, 0, 0, scale, jolt * scale, 0);
    camX = Math.round(game.camX);
    pal = game.player?.hero === "lam" ? LAM : HERO;

    drawBackground(theme, themeId, time);
    drawTiles(game.level, theme, themeId, time);
    game.level.checkpoints.forEach((cp, i) => drawCheckpoint(cp, i <= game.checkpoint, theme, time));
    for (const p of game.level.pickups) {
      if (!game.collected.has(p.id)) drawPickup(p.kind, p.x, p.y, time);
    }
    for (const d of game.drops) drawPickup(d.kind, d.x + d.w / 2, d.y + d.h, time, d.life < 1.5);
    for (const e of game.enemies) drawEnemy(e, theme, time);
    if (game.boss) drawBoss(game.boss, time);
    drawHero(game.player, game, time);
    for (const b of game.bullets) drawPlayerBullet(b, time);
    for (const b of game.enemyBullets) drawEnemyBullet(b, game, time);
    drawParticles(particles);

    if (game.state === "ready" && Math.floor(time * 4) % 2 === 0) banner("SẴN SÀNG");
    if (game.state === "boss-intro") banner(game.boss.name.toUpperCase());
  }

  function banner(text) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, VIEW_H / 2 - 12, VIEW_W, 24);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, VIEW_W / 2, VIEW_H / 2 + 1);
  }

  return {
    resize,
    draw,
    shake(seconds = 0.25) {
      shake = Math.max(shake, seconds);
    },
    get scale() {
      return scale;
    },
  };
}

