/**
 * Playable heroes. Both share the same body (movement, HP, boss weapons) so every stage stays
 * finishable by both; they differ in their main weapon:
 *
 *   Volt       gunner     arm cannon: pellets, two charge levels (weapons.js)
 *   Lam Phong  swordsman  energy blade: 3-hit ground combo, spin slash in the air,
 *                         half charge = wide slash, full charge = a flying blade wave.
 *                         Slashes cut ordinary enemy shots out of the air.
 *
 * Volt fires the weapon he takes from a boss; Lam Phong learns it as a blade technique
 * instead (BLADE_ARTS): same weapon id, energy cost and boss weakness, but a melee strike.
 *
 * Blade hits are "melee bullets": short-lived boxes that follow the hero and hit each target
 * once, so the game's normal bullet collision handles them.
 */

import { WEAPONS } from "./weapons.js";

export const HEROES = Object.freeze({
  volt: Object.freeze({
    id: "volt",
    name: "Volt",
    role: "Xạ thủ",
    primary: "buster",
    primaryName: "Súng Volt",
    short: "V",
    color: "#ffd23f",
    blurb: "Súng tay tụ lực, đánh an toàn từ xa.",
  }),
  lam: Object.freeze({
    id: "lam",
    name: "Lam Phong",
    role: "Kiếm sĩ",
    primary: "blade",
    primaryName: "Kiếm Lam",
    short: "K",
    color: "#3ff5c8",
    blurb: "Kiếm năng lượng: chém liên hoàn 3 nhát, chém xoáy trên không, chém đạn địch. Tụ lực để phóng sóng kiếm.",
  }),
});

export const HERO_ORDER = ["volt", "lam"];

export const heroById = (id) => HEROES[id] ?? HEROES.volt;

export const BLADE = Object.freeze({
  combo: [1, 1, 2], // damage of the 1st, 2nd and 3rd ground slash
  comboWindow: 0.42, // s: slash again within this to continue the combo
  cooldown: 0.12, // s between slashes
  slashTime: 0.14, // how long a slash hitbox stays out
  airDamage: 1,
  wideDamage: 3,
  waveDamage: 4,
  waveSpeed: 230,
  artCooldown: 0.25, // s between blade techniques
});

/**
 * Lam Phong's version of each boss weapon. Box offsets are relative to the hero (22 px tall):
 *   ember  Hỏa Long Kiếm  a rising flame slash, tall enough to reach a flying boss
 *   frost  Băng Thứ Kiếm  a long ice thrust straight ahead
 *   storm  Lôi Toàn Kiếm  a lightning spin that strikes both sides at once
 */
export const BLADE_ARTS = Object.freeze({
  ember: Object.freeze({ name: "Hỏa Long Kiếm", kind: "art-ember", anchor: "front", w: 28, h: 58, oy: -36, damage: 3, life: 0.22 }),
  frost: Object.freeze({ name: "Băng Thứ Kiếm", kind: "art-frost", anchor: "front", w: 50, h: 10, oy: 6, damage: 2, life: 0.18 }),
  storm: Object.freeze({ name: "Lôi Toàn Kiếm", kind: "art-storm", anchor: "center", w: 60, h: 30, oy: -4, damage: 2, life: 0.2 }),
});

/** How a weapon is called and shown for a hero (the main weapon and the blade techniques differ). */
export function weaponInfo(heroId, id) {
  const hero = heroById(heroId);
  if (id === "buster") return { name: hero.primaryName, short: hero.short, color: hero.color };
  const { short, color } = WEAPONS[id];
  const art = hero.primary === "blade" ? BLADE_ARTS[id] : null;
  return { name: art ? art.name : WEAPONS[id].name, short, color };
}

function melee(props) {
  return { weapon: "buster", melee: true, pierce: true, vx: 0, vy: 0, gravity: 0, life: BLADE.slashTime, hits: new Set(), ...props };
}

/**
 * The attack for one press (charge 0) or release (charge 1 | 2) of the blade.
 * `step` is the combo step (0, 1, 2) for ground slashes. Returns the boxes to add.
 */
export function bladeAttack(player, { charge = 0, step = 0 } = {}) {
  const facing = player.facing;
  if (charge === 2) {
    const h = 22;
    const x = facing > 0 ? player.x + player.w : player.x - 10;
    return [{
      weapon: "buster", kind: "wave", x, y: player.y, w: 10, h, vx: BLADE.waveSpeed * facing, vy: 0, gravity: 0,
      damage: BLADE.waveDamage, pierce: true, life: 1.4, hits: new Set(), cuts: true,
    }];
  }
  if (charge === 1) {
    return [melee({ kind: "slash-wide", anchor: "front", facing, w: 34, h: 28, oy: -4, damage: BLADE.wideDamage, life: 0.18 })];
  }
  if (!player.onGround) {
    return [melee({ kind: "slash-air", anchor: "center", facing, w: 34, h: 32, oy: -5, damage: BLADE.airDamage })];
  }
  const finisher = step === 2;
  return [melee({
    kind: "slash", step, anchor: "front", facing,
    w: finisher ? 26 : 22, h: finisher ? 24 : 18, oy: finisher ? -2 : 2,
    damage: BLADE.combo[step] ?? BLADE.combo[0],
  })];
}

/** The melee box for one use of a blade technique (a boss weapon in Lam Phong's hands). */
export function bladeArt(weapon, player) {
  const { name, ...art } = BLADE_ARTS[weapon];
  return melee({ ...art, weapon, facing: player.facing, total: art.life });
}

/** Keep a melee box attached to the hero (it moves with them while the slash is out). */
export function placeMelee(box, player) {
  box.y = player.y + box.oy;
  if (box.anchor === "center") box.x = player.cx - box.w / 2;
  else box.x = box.facing > 0 ? player.x + player.w - 4 : player.x + 4 - box.w;
  return box;
}
