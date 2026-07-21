import type { Tank } from '../../../shared/types';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const HEIGHT_MIN = 150;
const HEIGHT_MAX = 450;

/**
 * Generate terrain heights using 1D midpoint displacement (diamond-square variant).
 * Returns an array of `canvasWidth` values representing the height from the
 * bottom of the canvas at each x column.
 */
export function generateTerrain(canvasWidth: number = CANVAS_WIDTH): number[] {
  const size = nextPowerOfTwo(canvasWidth - 1) + 1;
  const heights = new Array<number>(size).fill(0);

  heights[0] = lerp(HEIGHT_MIN, HEIGHT_MAX, 0.5);
  heights[size - 1] = lerp(HEIGHT_MIN, HEIGHT_MAX, 0.5);

  let step = size - 1;
  let roughness = 120;

  while (step > 1) {
    const half = Math.floor(step / 2);

    // Midpoint pass
    for (let i = 0; i < size - 1; i += step) {
      const mid = i + half;
      if (mid < size) {
        const avg = (heights[i] + heights[i + step < size ? i + step : size - 1]) / 2;
        heights[mid] = avg + (Math.random() * 2 - 1) * roughness;
      }
    }

    roughness *= 0.55;
    step = half;
  }

  // Slice to exactly canvasWidth
  const raw = heights.slice(0, canvasWidth);

  // 5-point moving average smoothing
  const smoothed = [...raw];
  for (let x = 2; x < canvasWidth - 2; x++) {
    smoothed[x] = (raw[x - 2] + raw[x - 1] + raw[x] + raw[x + 1] + raw[x + 2]) / 5;
  }

  // Clamp to valid height range
  return smoothed.map((h) => Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, h)));
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Build the initial two tanks placed at x=100 and x=700, sitting on the terrain.
 */
export function placeTanks(
  terrain: number[],
  player1Id: string,
  player2Id: string,
): Tank[] {
  const p1x = 100;
  const p2x = 700;

  return [
    {
      playerId: player1Id,
      x: p1x,
      y: CANVAS_HEIGHT - terrain[p1x],
      health: 100,
      color: 'red',
      angle: 45,
      power: 50,
    },
    {
      playerId: player2Id,
      x: p2x,
      y: CANVAS_HEIGHT - terrain[p2x],
      health: 100,
      color: 'blue',
      angle: 45,
      power: 50,
    },
  ];
}
