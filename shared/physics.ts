import { GameState, WeaponType } from './types';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
/** Gravity in pixels per tick (60 ticks/sec equivalent). */
const GRAVITY = 9.8 / 60;
const MAX_TICKS = 5000;

/**
 * Return the terrain height (pixels from canvas bottom) at a given x position.
 * x is clamped to valid array bounds.
 */
export function getTerrainHeight(terrain: number[], x: number): number {
  const xi = Math.max(0, Math.min(terrain.length - 1, Math.round(x)));
  return terrain[xi];
}

export interface ShotResult {
  path: Array<{ x: number; y: number }>;
  hitX: number;
  hitY: number;
  damageDealt: number;
  terrainAfter: number[];
}

function applyCrater(terrain: number[], hitX: number, craterRadius: number): void {
  const cx = Math.round(hitX);
  for (let dx = -craterRadius; dx <= craterRadius; dx++) {
    const x = cx + dx;
    if (x < 0 || x >= CANVAS_WIDTH) continue;
    const depth = Math.sqrt(Math.max(0, craterRadius * craterRadius - dx * dx));
    terrain[x] = Math.max(0, terrain[x] - depth);
  }
}

function hitsTerrainAt(x: number, y: number, terrain: number[]): boolean {
  const xi = Math.round(x);
  if (xi < 0 || xi >= CANVAS_WIDTH) return false;
  return y >= CANVAS_HEIGHT - terrain[xi];
}

function calcDamage(hitX: number, hitY: number, tankX: number, tankY: number): number {
  const dist = Math.sqrt((hitX - tankX) ** 2 + (hitY - tankY) ** 2);
  if (dist > 35) return 0;
  return Math.max(0, Math.min(100, Math.round(100 - (dist / 35) * 100)));
}

interface SubSim {
  path: Array<{ x: number; y: number }>;
  hitX: number;
  hitY: number;
}

function runProjectile(
  startX: number,
  startY: number,
  initVx: number,
  initVy: number,
  terrain: number[],
  wind: number,
  maxBounces: number,
): SubSim {
  let x = startX;
  let y = startY;
  let vx = initVx;
  let vy = initVy;
  const path: Array<{ x: number; y: number }> = [{ x, y }];
  let bounces = 0;

  for (let tick = 0; tick < MAX_TICKS; tick++) {
    vx += wind * 0.01;
    vy += GRAVITY;
    x += vx;
    y += vy;

    if (x < 0 || x >= CANVAS_WIDTH || y > CANVAS_HEIGHT + 50) break;

    path.push({ x, y });

    if (hitsTerrainAt(x, y, terrain)) {
      if (bounces < maxBounces) {
        // Bounce: reflect vertical velocity with damping
        vy = -Math.abs(vy) * 0.7;
        vx *= 0.9;
        // Snap up to terrain surface
        const xi = Math.max(0, Math.min(CANVAS_WIDTH - 1, Math.round(x)));
        y = CANVAS_HEIGHT - terrain[xi] - 1;
        bounces++;
        continue;
      }
      break;
    }
  }

  return { path, hitX: x, hitY: y };
}

/**
 * Simulate a shot from the current player's tank.
 * Used on both server (authoritative validation) and client (replay animation).
 *
 * @param state  - current GameState (terrain will NOT be mutated; a copy is made)
 * @param angle  - barrel angle 0-180°: 0=horizontal-outward, 90=vertical-up
 * @param power  - shot power 0-100
 * @param weapon - weapon type
 */
export function simulateShot(
  state: GameState,
  angle: number,
  power: number,
  weapon: WeaponType,
): ShotResult {
  const shootingTank = state.tanks[state.currentPlayerIndex];
  const otherPlayerIndex = state.currentPlayerIndex === 0 ? 1 : 0;
  const otherTank = state.tanks[otherPlayerIndex];

  // Work on a copy of terrain so state is not mutated
  const terrain = [...state.terrain];

  const rad = (angle * Math.PI) / 180;
  const speedScale = power * 0.15;

  // Player 0 (left) shoots toward the right; Player 1 (right) shoots toward the left.
  const direction = state.currentPlayerIndex === 0 ? 1 : -1;
  const vx0 = direction * Math.cos(rad) * speedScale;
  const vy0 = -Math.sin(rad) * speedScale; // negative = upward in canvas coords

  // Start slightly above the tank's base
  const startX = shootingTank.x;
  const startY = shootingTank.y - 15;

  if (weapon === 'cluster') {
    return simulateCluster(
      startX, startY, vx0, vy0, terrain, state.wind, otherTank.x, otherTank.y,
    );
  }

  const maxBounces = weapon === 'bouncer' ? 3 : 0;
  const sim = runProjectile(startX, startY, vx0, vy0, terrain, state.wind, maxBounces);

  const craterRadius = weapon === 'shell' ? 20 : 15;
  applyCrater(terrain, sim.hitX, craterRadius);

  const damage = calcDamage(sim.hitX, sim.hitY, otherTank.x, otherTank.y);

  return {
    path: sim.path,
    hitX: sim.hitX,
    hitY: sim.hitY,
    damageDealt: damage,
    terrainAfter: terrain,
  };
}

function simulateCluster(
  startX: number,
  startY: number,
  vx0: number,
  vy0: number,
  terrain: number[],
  wind: number,
  otherTankX: number,
  otherTankY: number,
): ShotResult {
  let x = startX;
  let y = startY;
  let vx = vx0;
  let vy = vy0;
  const prePath: Array<{ x: number; y: number }> = [{ x, y }];
  let splitPoint: { x: number; y: number; vx: number; vy: number } | null = null;

  // Fly until apex (vy sign changes from neg to pos) or terrain hit
  for (let tick = 0; tick < MAX_TICKS; tick++) {
    const prevVy = vy;
    vx += wind * 0.01;
    vy += GRAVITY;
    x += vx;
    y += vy;

    if (x < 0 || x >= CANVAS_WIDTH || y > CANVAS_HEIGHT + 50) break;
    prePath.push({ x, y });

    if (hitsTerrainAt(x, y, terrain)) break;

    if (prevVy < 0 && vy >= 0) {
      // Apex reached — split here
      splitPoint = { x, y, vx, vy };
      break;
    }
  }

  if (!splitPoint) {
    // Hit terrain before apex — detonate immediately
    applyCrater(terrain, x, 10);
    const damage = calcDamage(x, y, otherTankX, otherTankY);
    return { path: prePath, hitX: x, hitY: y, damageDealt: damage, terrainAfter: terrain };
  }

  const speed = Math.sqrt(splitPoint.vx ** 2 + splitPoint.vy ** 2) * 0.9;
  const baseAngle = Math.atan2(-splitPoint.vy, splitPoint.vx);
  const subAngles = [-30, 0, 30].map((d) => baseAngle + (d * Math.PI) / 180);

  const allPaths: Array<{ x: number; y: number }> = [...prePath];
  let totalDamage = 0;
  let lastHitX = splitPoint.x;
  let lastHitY = splitPoint.y;

  for (const splitAngle of subAngles) {
    const svx = Math.cos(splitAngle) * speed;
    const svy = -Math.sin(splitAngle) * speed;
    const sub = runProjectile(splitPoint.x, splitPoint.y, svx, svy, terrain, wind, 0);
    allPaths.push(...sub.path);
    applyCrater(terrain, sub.hitX, 10);
    totalDamage += calcDamage(sub.hitX, sub.hitY, otherTankX, otherTankY);
    lastHitX = sub.hitX;
    lastHitY = sub.hitY;
  }

  return {
    path: allPaths,
    hitX: lastHitX,
    hitY: lastHitY,
    damageDealt: Math.min(100, totalDamage),
    terrainAfter: terrain,
  };
}
