/**
 * Player weapons. The buster is always available and can charge; each defeated boss
 * unlocks its weapon, which spends energy per shot.
 */

export const MAX_ENERGY = 28;
export const MAX_BUSTER_SHOTS = 3; // uncharged pellets allowed on screen at once

export const WEAPONS = Object.freeze({
  buster: { id: "buster", name: "Súng Volt", short: "V", color: "#ffd23f", cost: 0, charge: true },
  ember: { id: "ember", name: "Hỏa Cầu", short: "H", color: "#ff7a2f", cost: 2, charge: false },
  frost: { id: "frost", name: "Băng Tiễn", short: "B", color: "#7fe3ff", cost: 1, charge: false },
  storm: { id: "storm", name: "Lôi Xà", short: "L", color: "#c48bff", cost: 1, charge: false },
});

export const WEAPON_ORDER = ["buster", "ember", "frost", "storm"];

function bullet(props) {
  return { vy: 0, gravity: 0, pierce: false, life: 2, hits: new Set(), ...props };
}

/** Bullets for one trigger pull. `origin` is the muzzle point, `facing` ±1. */
export function fireWeapon(weapon, origin, facing, charge = 0) {
  const { x, y } = origin;
  switch (weapon) {
    case "ember":
      return [bullet({ weapon, kind: "ember", x: x - 5, y: y - 5, w: 10, h: 10, vx: 150 * facing, vy: -250, gravity: 480, damage: 3, pierce: true })];
    case "frost":
      return [-55, 0, 55].map((vy) =>
        bullet({ weapon, kind: "frost", x: x - 4, y: y - 3, w: 8, h: 6, vx: 200 * facing, vy, damage: 2 }),
      );
    case "storm":
      return [bullet({ weapon, kind: "storm", x: x - 7, y: y - 3, w: 14, h: 6, vx: 300 * facing, damage: 2, pierce: true })];
    default: {
      const sizes = [
        { w: 8, h: 6, damage: 1, speed: 240 },
        { w: 12, h: 10, damage: 2, speed: 250 },
        { w: 18, h: 14, damage: 4, speed: 260, pierce: true },
      ];
      const s = sizes[charge];
      return [
        bullet({
          weapon: "buster",
          kind: `buster${charge}`,
          charge,
          x: x - s.w / 2,
          y: y - s.h / 2,
          w: s.w,
          h: s.h,
          vx: s.speed * facing,
          damage: s.damage,
          pierce: Boolean(s.pierce),
        }),
      ];
    }
  }
}
