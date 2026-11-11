/**
 * UI controller: fixed-step loop, rendering, HUD, menus, sound and persistence.
 * All rules live in src/core; this file only translates between them and the page.
 */

import { BOSS_TYPES } from "./core/bosses.js";
import { DT } from "./core/constants.js";
import { Game } from "./core/game.js";
import { HERO_ORDER, HEROES, weaponInfo } from "./core/heroes.js";
import { PLAYER } from "./core/player.js";
import { STAGES } from "./core/stages.js";
import { MAX_ENERGY, WEAPONS } from "./core/weapons.js";
import { isMuted, isMusicOn, playMusic, setMuted, setMusic, sfx, stopMusic } from "./ui/audio.js";
import { createInput } from "./ui/input.js";
import { createRenderer, Particles } from "./ui/render.js";
import { load, save } from "./ui/storage.js";
import { initAnalytics, track } from "./ui/analytics.js";
import { THEMES } from "./ui/themes.js";

initAnalytics();

const $ = (id) => document.getElementById(id);
const els = {
  canvas: $("screen"),
  hud: $("hud"),
  hpFill: $("hp-fill"),
  energyBar: $("energy-bar"),
  energyFill: $("energy-fill"),
  weaponLabel: $("weapon-label"),
  weapons: $("weapons"),
  lives: $("lives"),
  score: $("score"),
  bossBar: $("boss-bar"),
  bossFill: $("boss-fill"),
  bossName: $("boss-name"),
  overlay: $("overlay"),
  panel: $("panel"),
  pauseBtn: $("pause-btn"),
  soundBtn: $("sound-btn"),
  touch: $("touch"),
};

const STAGE_ICONS = { ember: "🔥", frost: "❄️", storm: "⚡", core: "🌀" };

const game = new Game({ hero: load("hero", "volt") });
/** Weapon names depend on the hero: Volt's gun and shots, Lam Phong's blade and blade techniques. */
const weaponName = (id) => weaponInfo(game.hero, id).name;
const weaponShort = (id) => weaponInfo(game.hero, id).short;
const weaponColor = (id) => weaponInfo(game.hero, id).color;
const particles = new Particles();
const renderer = createRenderer(els.canvas);
let best = load("best", 0);
setMuted(load("muted", false));
setMusic(load("music", true));
let time = 0;
let lastState = null;

const input = createInput({
  isPlaying: () => game.state === "playing" || game.state === "boss-dying",
  onCommand(command) {
    sfx.unlock();
    if (command === "pause") togglePause();
    else if (command === "mute") toggleSound();
    else if (command === "music") {
      setMusic(!isMusicOn());
      save("music", isMusicOn());
      toast(isMusicOn() ? "Nhạc: bật" : "Nhạc: tắt");
    } else if (command === "weapon-next" || command === "weapon-prev") {
      if (game.player && ["playing", "paused", "ready"].includes(game.state)) game.selectWeapon(command === "weapon-next" ? 1 : -1);
    }
  },
});
input.bindTouch(els.touch);

// ------------------------------------------------------------------ events → sound & particles

function handleEvents(events) {
  const theme = game.stage ? THEMES[game.stage.theme] : THEMES.core;
  for (const e of events) {
    switch (e.type) {
      case "shoot":
        if (e.weapon === "buster") sfx.shoot(e.charge);
        else sfx.special();
        break;
      case "charge":
        sfx.charge(e.level);
        break;
      case "slash":
        sfx.slash(e.step, e.charge);
        if (e.weapon) {
          sfx.special();
          particles.burst(e.x + e.facing * 12, e.y, WEAPONS[e.weapon].color, 8, 80, { life: 0.3 });
        }
        if (e.charge === 2) particles.burst(e.x + e.facing * 10, e.y, "#3ff5c8", 8, 70, { life: 0.3 });
        break;
      case "parry":
        sfx.parry();
        particles.burst(e.x, e.y, "#eafff9", 6, 70, { life: 0.2 });
        particles.ring(e.x, e.y, "#3ff5c8", 8, 0.2);
        break;
      case "jump":
      case "walljump":
        sfx.jump();
        if (e.type === "walljump") particles.burst(e.x, e.y - 12, "#ffffff", 5, 40);
        break;
      case "dash":
        sfx.dash();
        particles.burst(e.x, e.y - 2, "#d8d8d8", 6, 40, { gravity: -40 });
        break;
      case "land":
        particles.burst(e.x, e.y - 1, "#cfcfcf", 4, 30, { life: 0.25 });
        break;
      case "hit":
        sfx.hit();
        particles.burst(e.x, e.y, "#ffffff", 4, 60, { life: 0.2 });
        break;
      case "deflect":
        sfx.deflect();
        particles.burst(e.x, e.y, "#ffffff", 3, 50, { life: 0.15 });
        break;
      case "explode":
        sfx.explode();
        particles.burst(e.x, e.y, "#ffb02e", 12, 110);
        particles.ring(e.x, e.y, "#ffffff", 16);
        break;
      case "hurt":
        sfx.hurt();
        renderer.shake(0.15);
        break;
      case "death":
        sfx.death();
        renderer.shake(0.4);
        particles.burst(e.x, e.y, "#f4a52a", 18, 140, { life: 0.9 });
        particles.burst(e.x, e.y, "#5ff2ff", 12, 80, { life: 1.1 });
        particles.ring(e.x, e.y, "#ffffff", 40, 0.6);
        break;
      case "pickup":
        sfx.pickup();
        particles.burst(e.x, e.y - 6, "#ffffff", 6, 50, { life: 0.3 });
        break;
      case "checkpoint":
        sfx.checkpoint();
        particles.add({ shape: "text", text: "CHECKPOINT", x: e.x, y: e.y - 30, vy: -15, color: "#5ff2ff", life: 1.2 });
        break;
      case "empty":
        sfx.empty();
        toast("Hết năng lượng");
        break;
      case "weapon":
        sfx.weapon();
        break;
      case "door":
        sfx.door();
        stopMusic();
        break;
      case "boss-intro":
        sfx.warning();
        playMusic("boss");
        break;
      case "boss-hit":
        sfx.bossHit(e.weak);
        particles.burst(e.x, e.y, e.weak ? "#ffe27a" : "#ffffff", e.weak ? 10 : 5, 90, { life: 0.25 });
        if (e.weak) renderer.shake(0.1);
        break;
      case "boss-defeat":
        sfx.bossDefeat();
        stopMusic();
        renderer.shake(0.6);
        for (let i = 0; i < 5; i += 1) {
          particles.burst(e.x + (Math.random() - 0.5) * 30, e.y + (Math.random() - 0.5) * 30, i % 2 ? "#ffffff" : theme.accent, 14, 120, { life: 0.9 + i * 0.2 });
        }
        particles.ring(e.x, e.y, "#ffffff", 60, 1);
        break;
      case "quake":
        sfx.quake();
        renderer.shake(0.25);
        break;
      case "warning":
        sfx.warning();
        break;
      case "phase":
        renderer.shake(0.5);
        toast("Lõi Tối Thượng nổi giận!");
        break;
      case "splash":
        particles.burst(e.x, e.y - 2, e.kind === "icicle" ? "#bff0ff" : "#ff8a3d", 5, 50, { life: 0.25 });
        break;
      default:
        break;
    }
  }
}

// ------------------------------------------------------------------ HUD

let hudCache = "";

function updateHud() {
  const inStage = Boolean(game.player) && !["title", "select"].includes(game.state);
  els.hud.classList.toggle("hidden", !inStage);
  if (!inStage) return;
  const p = game.player;
  const weapon = WEAPONS[game.weapon];
  const boss = game.boss;
  const key = [game.hero, p.hp, game.weapon, game.energy[game.weapon], game.lives, game.score, boss?.hp, game.unlockedWeapons.join()].join("|");
  if (key === hudCache) return;
  hudCache = key;
  els.hpFill.style.width = `${(p.hp / PLAYER.maxHp) * 100}%`;
  els.hpFill.classList.toggle("low", p.hp <= 6);
  els.energyBar.hidden = weapon.cost === 0;
  els.energyFill.style.width = `${(game.energy[game.weapon] / MAX_ENERGY) * 100}%`;
  els.energyFill.style.background = weapon.color;
  els.weaponLabel.textContent = weaponName(game.weapon);
  els.lives.textContent = `×${game.lives}`;
  els.score.textContent = game.score.toString().padStart(6, "0");
  els.weapons.innerHTML = game.unlockedWeapons
    .map((id) => {
      const name = weaponName(id);
      const active = id === game.weapon ? " active" : "";
      return `<button class="weapon${active}" data-weapon="${id}" style="--wc:${weaponColor(id)}" title="${name}" aria-label="${name}" aria-pressed="${id === game.weapon}">${weaponShort(id)}</button>`;
    })
    .join("");
  els.bossBar.hidden = !boss;
  if (boss) {
    els.bossName.textContent = boss.name;
    els.bossFill.style.width = `${(boss.hp / boss.maxHp) * 100}%`;
  }
}

els.weapons.addEventListener("click", (event) => {
  const button = event.target.closest("[data-weapon]");
  if (button) game.selectWeapon(button.dataset.weapon);
  button?.blur();
});

// ------------------------------------------------------------------ overlays

function showPanel(html, { focus = true } = {}) {
  els.panel.innerHTML = html;
  els.overlay.classList.add("open");
  if (focus) els.panel.querySelector("button:not([disabled])")?.focus();
}

function hidePanel() {
  els.overlay.classList.remove("open");
  els.panel.innerHTML = "";
}

const CONTROLS = `
  <table class="controls">
    <tr><td><kbd>←</kbd><kbd>→</kbd></td><td>Di chuyển</td></tr>
    <tr><td><kbd>Z</kbd> / <kbd>Space</kbd></td><td>Nhảy (giữ để nhảy cao, nhảy khi bám tường)</td></tr>
    <tr><td><kbd>X</kbd></td><td>Bắn / chém (giữ để tụ lực)</td></tr>
    <tr><td><kbd>C</kbd> / <kbd>Shift</kbd></td><td>Lướt</td></tr>
    <tr><td><kbd>Q</kbd> <kbd>E</kbd></td><td>Đổi vũ khí</td></tr>
    <tr><td><kbd>P</kbd> · <kbd>M</kbd> · <kbd>N</kbd></td><td>Tạm dừng · Âm thanh · Nhạc</td></tr>
  </table>`;

/** Two hero cards; the chosen one is remembered for next time. */
function heroPicker() {
  const cards = HERO_ORDER.map((id) => {
    const h = HEROES[id];
    const on = id === game.hero;
    return `
      <button class="hero-card hero-${id}${on ? " chosen" : ""}" data-hero="${id}" aria-pressed="${on}" style="--hc:${h.color}">
        <span class="hero-face" aria-hidden="true"></span>
        <span class="hero-name">${h.name}</span>
        <span class="hero-role">${h.role} · ${h.primaryName}</span>
        <span class="hero-blurb">${h.blurb}</span>
      </button>`;
  }).join("");
  return `<div class="hero-grid" role="group" aria-label="Chọn nhân vật">${cards}</div>`;
}

function titleScreen({ focus = true } = {}) {
  const saved = load("progress", { defeated: [] });
  const canContinue = saved.defeated?.length > 0;
  showPanel(`
    <p class="eyebrow">Run &amp; gun · 2 nhân vật · 4 màn · 4 trùm</p>
    <h1 class="logo">CHIẾN BINH <span>VOLT</span></h1>
    <p class="lead">Ba cỗ máy nổi loạn chiếm lò đúc, đỉnh băng và tháp bão. Hạ từng tên, lấy vũ khí của chúng, rồi tấn công Pháo Đài Lõi.</p>
    ${heroPicker()}
    <div class="buttons">
      <button class="primary" data-action="new">Chơi mới</button>
      ${canContinue ? `<button data-action="continue">Tiếp tục (${saved.defeated.length}/3 trùm)</button>` : ""}
    </div>
    ${CONTROLS}
    <p class="muted">Kỷ lục: ${best.toLocaleString("vi-VN")}</p>
  `, { focus });
}

function selectScreen({ focus = true } = {}) {
  const cards = STAGES.map((stage) => {
    const boss = BOSS_TYPES[stage.boss];
    const done = game.defeated.includes(stage.id);
    const locked = !game.canSelect(stage.id);
    const status = locked ? "🔒 Hạ 3 trùm để mở" : done ? "✓ Đã hạ" : stage.final ? "Trận cuối" : "Sẵn sàng";
    return `
      <button class="stage-card theme-${stage.theme}${done ? " done" : ""}" data-stage="${stage.id}" ${locked ? "disabled" : ""}>
        <span class="icon" aria-hidden="true">${STAGE_ICONS[stage.id]}</span>
        <span class="stage-name">${stage.name}</span>
        <span class="boss-name">${boss.name}</span>
        <span class="status">${status}</span>
      </button>`;
  }).join("");
  showPanel(`
    <h2>Chọn màn</h2>
    ${heroPicker()}
    <div class="stage-grid">${cards}</div>
    <p class="muted">Mạng: ×${game.lives} · Điểm: ${game.score.toLocaleString("vi-VN")}</p>
    <div class="buttons"><button data-action="title" class="ghost">Màn hình chính</button></div>
  `, { focus });
}

function pauseScreen() {
  showPanel(`
    <h2>Tạm dừng</h2>
    <div class="buttons">
      <button class="primary" data-action="resume">Tiếp tục</button>
      <button data-action="quit">Bỏ màn · về chọn màn</button>
    </div>
    ${CONTROLS}
  `);
}

function clearScreen() {
  const info = game.clearInfo;
  const weapon = info.weapon ? weaponInfo(game.hero, info.weapon) : null;
  const blade = game.heroSpec.primary === "blade";
  showPanel(`
    <p class="eyebrow">Hạ gục trùm</p>
    <h2>Màn hoàn thành!</h2>
    ${weapon ? `<p class="reward" style="--wc:${weapon.color}">${blade ? "Lĩnh ngộ kiếm mới" : "Nhận vũ khí"}: <strong>${weapon.name}</strong></p>
      <p class="muted">Nhấn <kbd>Q</kbd>/<kbd>E</kbd> để đổi ${blade ? "kiếm" : "vũ khí"}. Mỗi trùm sợ vũ khí của một trùm khác.</p>` : ""}
    <p>Thời gian: ${formatTime(info.time)} · Điểm: ${game.score.toLocaleString("vi-VN")}</p>
    <div class="buttons"><button class="primary" data-action="select">Tiếp tục</button></div>
  `);
}

function victoryScreen() {
  showPanel(`
    <p class="eyebrow">Pháo Đài Lõi đã sụp đổ</p>
    <h1 class="logo">CHIẾN <span>THẮNG</span></h1>
    <p class="lead">Lõi Tối Thượng tan thành tia lửa. Thành phố lại sáng đèn.</p>
    <p>Điểm: <strong>${game.score.toLocaleString("vi-VN")}</strong> · Kỷ lục: ${best.toLocaleString("vi-VN")}</p>
    <div class="buttons"><button class="primary" data-action="new">Chơi lại từ đầu</button></div>
  `);
}

function gameOverScreen() {
  showPanel(`
    <h2>Hết mạng</h2>
    <p>Điểm: ${game.score.toLocaleString("vi-VN")} · Kỷ lục: ${best.toLocaleString("vi-VN")}</p>
    <p class="muted">Các trùm đã hạ vẫn được giữ.</p>
    <div class="buttons">
      <button class="primary" data-action="retry">Thử lại</button>
      <button data-action="title">Màn hình chính</button>
    </div>
  `);
}

els.panel.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  sfx.unlock();
  sfx.menu();
  const { action, stage, hero } = button.dataset;
  if (hero) {
    if (game.setHero(hero)) {
      save("hero", hero);
      track(`volt/hero-${hero}`);
      if (game.state === "title") titleScreen({ focus: false });
      else selectScreen({ focus: false });
      els.panel.querySelector(`[data-hero="${hero}"]`)?.focus();
    }
    return;
  }
  if (stage) {
    game.selectStage(stage);
    track("volt/stage-start");
    particles.clear();
    hidePanel();
    playMusic(game.stage.theme);
    return;
  }
  switch (action) {
    case "new":
      game.newGame();
      save("progress", game.progress);
      break;
    case "continue":
      game.continueGame(load("progress", { defeated: [] }));
      break;
    case "resume":
      togglePause();
      break;
    case "quit":
      game.toSelect();
      break;
    case "select":
      game.toSelect();
      break;
    case "retry":
      game.retry();
      break;
    case "title":
      game.toSelect();
      game.state = "title";
      break;
    default:
      break;
  }
});

function onStateChange(state, previous) {
  if (state === "title") {
    titleScreen();
    playMusic("title");
  } else if (state === "select") {
    selectScreen();
    playMusic("select");
  } else if (state === "paused") pauseScreen();
  else if (state === "clear" || state === "victory") {
    sfx.clear();
    stopMusic();
    recordScore();
    save("progress", game.progress);
    track(state === "clear" ? "volt/clear" : "volt/victory");
    if (state === "clear") clearScreen();
    else victoryScreen();
  } else if (state === "game-over") {
    sfx.gameOver();
    stopMusic();
    recordScore();
    track("volt/game-over");
    gameOverScreen();
  } else if (state === "ready" && previous === "dying") {
    playMusic(game.stage.theme);
  } else if (previous === "paused") {
    hidePanel();
  }
  if (state === "dying") stopMusic();
}

function recordScore() {
  if (game.score > best) {
    best = game.score;
    save("best", best);
  }
}

// ------------------------------------------------------------------ controls

function togglePause() {
  if (game.state === "playing" || game.state === "paused") {
    game.togglePause();
    input.clear();
  }
}

function toggleSound() {
  setMuted(!isMuted());
  save("muted", isMuted());
  els.soundBtn.textContent = isMuted() ? "🔇" : "🔊";
  els.soundBtn.setAttribute("aria-pressed", String(!isMuted()));
}

els.pauseBtn.addEventListener("click", (event) => {
  togglePause();
  event.currentTarget.blur();
});
els.soundBtn.addEventListener("click", (event) => {
  sfx.unlock();
  toggleSound();
  event.currentTarget.blur();
});
els.soundBtn.textContent = isMuted() ? "🔇" : "🔊";

document.addEventListener("visibilitychange", () => {
  if (document.hidden && game.state === "playing") togglePause();
});
window.addEventListener("pointerdown", () => sfx.unlock(), { once: true });
window.addEventListener("keydown", () => sfx.unlock(), { once: true });

let toastTimer = null;
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 1400);
}

function formatTime(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ loop

const coarse = window.matchMedia("(pointer: coarse)");
const syncTouch = () => document.body.classList.toggle("touch-ui", coarse.matches);
coarse.addEventListener?.("change", syncTouch);
syncTouch();

window.addEventListener("resize", () => renderer.resize());
renderer.resize();

let last = performance.now();
let acc = 0;
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  while (acc >= DT) {
    game.update(input.snapshot(), DT);
    handleEvents(game.takeEvents());
    particles.update(DT);
    time += DT;
    acc -= DT;
    if (game.state !== lastState) {
      const previous = lastState;
      lastState = game.state;
      onStateChange(game.state, previous);
    }
  }
  try {
    renderer.draw(game, particles, time);
    updateHud();
  } finally {
    requestAnimationFrame(frame); // one bad frame must never freeze the game
  }
}
requestAnimationFrame(frame);

// handy for debugging in the console
window.volt = { game };
