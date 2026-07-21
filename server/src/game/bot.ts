import { simulateShot, getTerrainHeight } from '../../../shared/physics';
import type { BotDifficulty, GameState, WeaponType } from '../../../shared/types';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;

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

/** Return a new GameState with the current player's tank moved by `movement` px. */
function applyMovement(state: GameState, movement: number): GameState {
  const tankIndex = state.currentPlayerIndex;
  const tank = state.tanks[tankIndex];
  const newX = Math.max(0, Math.min(CANVAS_WIDTH - 1, tank.x + movement));
  const newY = CANVAS_HEIGHT - getTerrainHeight(state.terrain, newX);
  return {
    ...state,
    tanks: state.tanks.map((t, i) => (i === tankIndex ? { ...t, x: newX, y: newY } : t)),
  };
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

/**
 * Try each candidate movement offset and return the one whose best-shot
 * distance to the enemy is smallest.
 */
function findBestMoveAndShot(
  state: GameState,
  weapon: WeaponType,
  movements: number[],
): BestShot & { movement: number } {
  let best: BestShot & { movement: number } = {
    angle: 90, power: 50, distance: Infinity, damage: 0, movement: 0,
  };

  for (const movement of movements) {
    const movedState = applyMovement(state, movement);
    const shot = findBestShot(movedState, weapon);
    if (
      shot.distance < best.distance ||
      (shot.distance === best.distance && shot.damage > best.damage)
    ) {
      best = { ...shot, movement };
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
): { angle: number; power: number; weaponType: WeaponType; movement: number } {
  // Easy: random shot + small random movement, always shell
  if (difficulty === 'easy') {
    const movement = (Math.floor(Math.random() * 7) - 3) * 5; // -15 to +15 in 5px steps
    return {
      angle: 20 + Math.floor(Math.random() * 141),  // 20-160
      power: 30 + Math.floor(Math.random() * 41),   // 30-70
      weaponType: 'shell',
      movement,
    };
  }

  // Medium: try ±30px (10px steps) with shell/bouncer, add Gaussian noise
  if (difficulty === 'medium') {
    const weapons: WeaponType[] = ['shell', 'bouncer'];
    const movements = [-30, -20, -10, 0, 10, 20, 30];
    let champion: BestShot & { movement: number; weaponType: WeaponType } = {
      angle: 90, power: 50, distance: Infinity, damage: 0, movement: 0, weaponType: 'shell',
    };

    for (const weapon of weapons) {
      const shot = findBestMoveAndShot(state, weapon, movements);
      if (
        shot.distance < champion.distance ||
        (shot.distance === champion.distance && shot.damage > champion.damage)
      ) {
        champion = { ...shot, weaponType: weapon };
      }
    }

    return {
      angle: clampAngle(champion.angle + boxMullerNoise(7.5)),
      power: clampPower(champion.power + boxMullerNoise(5)),
      weaponType: champion.weaponType,
      movement: champion.movement,
    };
  }

  // Hard: exhaustive weapon comparison for max damage across ±60px (10px steps), ±3° noise
  const weapons: WeaponType[] = ['shell', 'bouncer', 'cluster'];
  const movements = [-60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60];
  let champion: BestShot & { movement: number; weaponType: WeaponType } = {
    angle: 90, power: 50, distance: Infinity, damage: 0, movement: 0, weaponType: 'shell',
  };

  for (const weapon of weapons) {
    const shot = findBestMoveAndShot(state, weapon, movements);
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
    movement: champion.movement,
  };
}
