import { simulateShot } from '../../../shared/physics';
import type { BotDifficulty, GameState, WeaponType } from '../../../shared/types';

function boxMullerNoise(stddev: number): number {
  // Exact normal distribution via Box-Muller transform
  const u1 = Math.max(Number.EPSILON, Math.random());
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return z * stddev;
}

interface BestShot {
  angle: number;
  power: number;
  distance: number;
  damage: number;
}

/**
 * Search angle 20-160° (1° steps) × power 10-100 (5-unit steps) for the
 * combo that lands closest to the enemy tank centre.
 */
function findBestShot(state: GameState, weapon: WeaponType): BestShot {
  const otherIndex = state.currentPlayerIndex === 0 ? 1 : 0;
  const target = state.tanks[otherIndex];
  let best: BestShot = { angle: 90, power: 50, distance: Infinity, damage: 0 };

  for (let angle = 20; angle <= 160; angle++) {
    for (let power = 10; power <= 100; power += 5) {
      const result = simulateShot(state, angle, power, weapon);
      const dist = Math.hypot(result.hitX - target.x, result.hitY - target.y);
      if (dist < best.distance) {
        best = { angle, power, distance: dist, damage: result.damageDealt };
      }
    }
  }

  return best;
}

function clampAngle(a: number): number {
  return Math.max(0, Math.min(180, Math.round(a)));
}

function clampPower(p: number): number {
  return Math.max(1, Math.min(100, Math.round(p)));
}

export function computeBotShot(
  state: GameState,
  difficulty: BotDifficulty,
): { angle: number; power: number; weaponType: WeaponType } {
  // Easy: random shot, always shell
  if (difficulty === 'easy') {
    return {
      angle: 20 + Math.floor(Math.random() * 141),  // 20-160
      power: 30 + Math.floor(Math.random() * 41),   // 30-70
      weaponType: 'shell',
    };
  }

  // Medium: optimal trajectory + Gaussian noise (±15° angle, ±10 power)
  if (difficulty === 'medium') {
    const weapons: WeaponType[] = ['shell', 'bouncer'];
    const weaponType = weapons[Math.floor(Math.random() * 2)];
    const best = findBestShot(state, weaponType);
    return {
      angle: clampAngle(best.angle + boxMullerNoise(7.5)),
      power: clampPower(best.power + boxMullerNoise(5)),
      weaponType,
    };
  }

  // Hard: exhaustive weapon comparison for max damage, ±3° noise
  const weapons: WeaponType[] = ['shell', 'bouncer', 'cluster'];
  let champion: BestShot & { weaponType: WeaponType } = {
    angle: 90, power: 50, distance: Infinity, damage: 0, weaponType: 'shell',
  };

  for (const weapon of weapons) {
    const shot = findBestShot(state, weapon);
    if (
      shot.damage > champion.damage ||
      (shot.damage === champion.damage && shot.distance < champion.distance)
    ) {
      champion = { ...shot, weaponType: weapon };
    }
  }

  return {
    angle: clampAngle(champion.angle + boxMullerNoise(1.5)),
    power: clampPower(champion.power + boxMullerNoise(1.5)),
    weaponType: champion.weaponType,
  };
}
