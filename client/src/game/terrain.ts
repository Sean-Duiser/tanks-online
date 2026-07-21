const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;

/**
 * Draw the terrain polygon onto the canvas context.
 */
export function drawTerrain(ctx: CanvasRenderingContext2D, terrain: number[]): void {
  ctx.fillStyle = '#4a7c2f';
  ctx.beginPath();
  ctx.moveTo(0, CANVAS_HEIGHT);
  for (let x = 0; x < CANVAS_WIDTH; x++) {
    ctx.lineTo(x, CANVAS_HEIGHT - terrain[x]);
  }
  ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.closePath();
  ctx.fill();

  // Darker grass stroke on top
  ctx.strokeStyle = '#2d5a1b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, CANVAS_HEIGHT - terrain[0]);
  for (let x = 1; x < CANVAS_WIDTH; x++) {
    ctx.lineTo(x, CANVAS_HEIGHT - terrain[x]);
  }
  ctx.stroke();
}

/**
 * Apply a circular crater to the terrain array in-place.
 * (mirrors the server-side applyCrater for client rendering consistency)
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
