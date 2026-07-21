import type { BiomeType, Tank } from '../../../shared/types';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;

type BiomeConfig = {
  roughness: number;
  minH: number;
  maxH: number;
  smoothPasses: number;
};

const BIOME_CONFIGS: Record<BiomeType, BiomeConfig> = {
  earth: { roughness: 60,  minH: 200, maxH: 380, smoothPasses: 3 },
  fire:  { roughness: 150, minH: 100, maxH: 480, smoothPasses: 1 },
  water: { roughness: 25,  minH: 300, maxH: 430, smoothPasses: 5 },
  air:   { roughness: 180, minH: 80,  maxH: 420, smoothPasses: 0 },
};

/**
 * Generate terrain heights using 1D midpoint displacement with biome-specific parameters.
 * Returns an array of `canvasWidth` values representing pixel height from the canvas bottom.
 */
export function generateTerrain(
  biome: BiomeType,
  canvasWidth: number = CANVAS_WIDTH,
): number[] {
  const config = BIOME_CONFIGS[biome];
  const size = nextPowerOfTwo(canvasWidth - 1) + 1;
  const heights = new Array<number>(size).fill(0);

  const midH = (config.minH + config.maxH) / 2;
  heights[0] = midH;
  heights[size - 1] = midH;

  let step = size - 1;
  let roughness = config.roughness;

  while (step > 1) {
    const half = Math.floor(step / 2);
    for (let i = 0; i < size - 1; i += step) {
      const mid = i + half;
      if (mid < size) {
        const right = i + step < size ? i + step : size - 1;
        const avg = (heights[i] + heights[right]) / 2;
        heights[mid] = avg + (Math.random() * 2 - 1) * roughness;
      }
    }
    roughness *= 0.55;
    step = half;
  }

  // Slice to exactly canvasWidth
  const raw = heights.slice(0, canvasWidth);

  // Fire: force a volcanic cone near the centre before smoothing
  if (biome === 'fire') {
    const peakX = Math.floor(canvasWidth / 2);
    const spikeWidth = 90;
    for (let x = peakX - spikeWidth; x <= peakX + spikeWidth; x++) {
      if (x >= 0 && x < canvasWidth) {
        const dist = Math.abs(x - peakX);
        const coneH = config.maxH * (1 - dist / spikeWidth);
        raw[x] = Math.max(raw[x], coneH);
      }
    }
  }

  // Smoothing passes
  for (let pass = 0; pass < config.smoothPasses; pass++) {
    const prev = [...raw];
    for (let x = 2; x < canvasWidth - 2; x++) {
      raw[x] = (prev[x - 2] + prev[x - 1] + prev[x] + prev[x + 1] + prev[x + 2]) / 5;
    }
  }

  // Clamp to biome height range
  return raw.map((h) => Math.max(config.minH, Math.min(config.maxH, h)));
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
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
