import type { BiomeType, Tank } from 'shared';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;

type BiomeStyle = {
  fill: string;
  capColor: string | null;
  capHeight: number;
};

const BIOME_STYLES: Record<BiomeType, BiomeStyle> = {
  earth: { fill: '#4a3728', capColor: '#2d5a1b', capHeight: 8 },
  fire:  { fill: '#2a2020', capColor: null,      capHeight: 0 },
  water: { fill: '#c2a04a', capColor: '#a08030', capHeight: 6 },
  air:   { fill: '#666677', capColor: null,      capHeight: 0 },
};

/**
 * Draw the terrain polygon with biome-appropriate colours.
 */
export function drawTerrain(
  ctx: CanvasRenderingContext2D,
  terrain: number[],
  biome: BiomeType,
): void {
  const { fill, capColor, capHeight } = BIOME_STYLES[biome];

  // Main terrain body
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(0, CANVAS_HEIGHT);
  for (let x = 0; x < CANVAS_WIDTH; x++) {
    ctx.lineTo(x, CANVAS_HEIGHT - terrain[x]);
  }
  ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.closePath();
  ctx.fill();

  // Top cap layer (grass for earth, wet sand for water)
  if (capColor) {
    ctx.fillStyle = capColor;
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT - terrain[0]);
    for (let x = 0; x < CANVAS_WIDTH; x++) {
      ctx.lineTo(x, CANVAS_HEIGHT - terrain[x]);
    }
    for (let x = CANVAS_WIDTH - 1; x >= 0; x--) {
      ctx.lineTo(x, CANVAS_HEIGHT - terrain[x] + capHeight);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Fire: glowing lava cracks at terrain surface where height is low
  if (biome === 'fire') {
    ctx.lineWidth = 1;
    for (let x = 0; x < CANVAS_WIDTH - 2; x += 2) {
      if (terrain[x] < 170) {
        const nextX = x + 2 < CANVAS_WIDTH ? x + 2 : x;
        ctx.strokeStyle = '#ff4500';
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.moveTo(x, CANVAS_HEIGHT - terrain[x]);
        ctx.lineTo(nextX, CANVAS_HEIGHT - terrain[nextX]);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * Apply a circular crater to the terrain array in-place.
 */
export function applyCrater(terrain: number[], hitX: number, craterRadius: number): void {
  const cx = Math.round(hitX);
  for (let dx = -craterRadius; dx <= craterRadius; dx++) {
    const x = cx + dx;
    if (x < 0 || x >= CANVAS_WIDTH) continue;
    const depth = Math.sqrt(Math.max(0, craterRadius * craterRadius - dx * dx));
    terrain[x] = Math.max(0, terrain[x] - depth);
  }
}

// Re-export Tank type so callers can import from one place if needed
export type { Tank };

