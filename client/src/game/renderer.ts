import type { BiomeType, GameState, Tank } from 'shared';
import { drawTerrain } from './terrain';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;

const BARREL_LENGTH = 22;

// ─── Sky gradients per biome ────────────────────────────────────────────────

const SKY_GRADIENTS: Record<BiomeType, [string, string]> = {
  earth: ['#87CEEB', '#c8e6c9'],
  fire:  ['#1a0a00', '#8b2500'],
  water: ['#1e90ff', '#87CEEB'],
  air:   ['#0a1628', '#4a6fa5'],
};

const BIOME_LABELS: Record<BiomeType, { text: string; color: string }> = {
  earth: { text: '🌿 Forest',    color: '#4caf50' },
  fire:  { text: '🌋 Volcano',   color: '#ff6b35' },
  water: { text: '🏖 Beach',     color: '#42a5f5' },
  air:   { text: '⛰ Mountains', color: '#90caf9' },
};

// ─── Background layer (sky + biome-specific backdrop) ────────────────────────

export function drawBackground(ctx: CanvasRenderingContext2D, biome: BiomeType): void {
  const [topColor, botColor] = SKY_GRADIENTS[biome];
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  grad.addColorStop(0, topColor);
  grad.addColorStop(1, botColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  if (biome === 'air') {
    drawDistantMountains(ctx);
    drawWindStreaks(ctx);
  } else if (biome === 'fire') {
    // Hellish glow near horizon
    const glow = ctx.createLinearGradient(0, CANVAS_HEIGHT - 130, 0, CANVAS_HEIGHT);
    glow.addColorStop(0, 'rgba(200,40,0,0)');
    glow.addColorStop(1, 'rgba(255,80,0,0.28)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, CANVAS_HEIGHT - 130, CANVAS_WIDTH, 130);
  } else if (biome === 'water') {
    // Deep ocean strip at canvas base (terrain sits on top of it)
    ctx.fillStyle = '#0a5fbe';
    ctx.fillRect(0, CANVAS_HEIGHT - 52, CANVAS_WIDTH, 52);
  }
}

function drawDistantMountains(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#1e2d4a';
  ctx.beginPath();
  const pts: [number, number][] = [
    [0, CANVAS_HEIGHT], [0, 345], [60, 268], [120, 308],
    [180, 198], [240, 272], [300, 138], [360, 228],
    [420, 168], [480, 248], [540, 158], [600, 218],
    [660, 182], [720, 258], [780, 208], [CANVAS_WIDTH, 278],
    [CANVAS_WIDTH, CANVAS_HEIGHT],
  ];
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
}

function drawWindStreaks(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = 'rgba(200,220,255,0.18)';
  ctx.lineWidth = 1;
  const streaks: [number, number, number][] = [
    [20,22,85],[190,38,60],[355,28,95],[510,18,72],[660,44,58],
    [95,58,78],[275,72,88],[435,52,66],[585,32,102],[725,62,52],
    [50,82,42],[405,14,98],[140,96,70],[320,10,55],[475,88,80],
  ];
  for (const [x, y, len] of streaks) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
  }
}

// ─── Decoration helpers ───────────────────────────────────────────────────────

function drawPineTree(ctx: CanvasRenderingContext2D, x: number, baseY: number): void {
  ctx.fillStyle = '#5c3a1e';
  ctx.fillRect(x - 2, baseY - 18, 4, 18);
  ctx.fillStyle = '#1a3d0f';
  const layers: [number, number, number][] = [
    [16, baseY - 12, baseY - 34],
    [12, baseY - 26, baseY - 46],
    [8,  baseY - 40, baseY - 56],
  ];
  for (const [hw, bottom, top] of layers) {
    ctx.beginPath();
    ctx.moveTo(x - hw, bottom);
    ctx.lineTo(x + hw, bottom);
    ctx.lineTo(x, top);
    ctx.closePath();
    ctx.fill();
  }
}

function drawPalmTree(ctx: CanvasRenderingContext2D, x: number, baseY: number): void {
  ctx.strokeStyle = '#8b6914';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.quadraticCurveTo(x + 10, baseY - 35, x + 6, baseY - 62);
  ctx.stroke();
  ctx.strokeStyle = '#2d7a2d';
  ctx.lineWidth = 3;
  const tipX = x + 6;
  const tipY = baseY - 62;
  const fronds: [number, number][] = [[-32,-4],[-18,-22],[0,-28],[18,-22],[32,-4]];
  for (const [dx, dy] of fronds) {
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.quadraticCurveTo(tipX + dx * 0.5, tipY + dy - 8, tipX + dx, tipY + dy);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

function drawEarthDecorations(ctx: CanvasRenderingContext2D, terrain: number[]): void {
  for (let x = 50; x < CANVAS_WIDTH - 50; x += 60) {
    if ((x > 70 && x < 130) || (x > 670 && x < 730)) continue;
    const l = terrain[Math.max(0, x - 12)];
    const r = terrain[Math.min(CANVAS_WIDTH - 1, x + 12)];
    if (Math.abs(l - r) < 18) drawPineTree(ctx, x, CANVAS_HEIGHT - terrain[x]);
  }
  ctx.fillStyle = '#5a4a3a';
  for (let i = 0; i < 18; i++) {
    const tx = (i * 43 + 20) % (CANVAS_WIDTH - 40) + 20;
    const seed = Math.floor(terrain[tx]);
    const rx = tx + (seed % 15) - 7;
    if (rx <= 80 || rx >= 720) continue;
    const ry = CANVAS_HEIGHT - terrain[Math.max(0, Math.min(CANVAS_WIDTH - 1, rx))] - 2;
    ctx.beginPath();
    ctx.ellipse(rx, ry, 5 + (seed % 7), 3 + (seed % 4), 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFireDecorations(ctx: CanvasRenderingContext2D, terrain: number[]): void {
  // Orange glow above lava pools
  for (let x = 0; x < CANVAS_WIDTH; x += 4) {
    if (terrain[x] < 160) {
      const surfY = CANVAS_HEIGHT - terrain[x];
      const glowH = 160 - terrain[x];
      const g = ctx.createLinearGradient(0, surfY - glowH * 0.4, 0, surfY);
      g.addColorStop(0, 'rgba(255,69,0,0)');
      g.addColorStop(1, 'rgba(255,100,0,0.38)');
      ctx.fillStyle = g;
      ctx.fillRect(x, surfY - glowH * 0.4, 4, glowH * 0.4);
    }
  }
  // Ash particles
  ctx.fillStyle = 'rgba(170,160,155,0.55)';
  for (let i = 0; i < 35; i++) {
    const ax = (i * 83 + terrain[i * 22 % CANVAS_WIDTH] * 2.3) % (CANVAS_WIDTH - 20) + 10;
    const ay = (i * 47 + terrain[i * 31 % CANVAS_WIDTH]) % (CANVAS_HEIGHT - 60) + 8;
    ctx.beginPath();
    ctx.arc(ax, ay, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  // Smoke puffs near highest peak (centre zone)
  let peakX = 400, peakH = 0;
  for (let x = 250; x < 550; x++) {
    if (terrain[x] > peakH) { peakH = terrain[x]; peakX = x; }
  }
  const peakY = CANVAS_HEIGHT - peakH;
  const puffs: [number, number, number][] = [[-6,-18,8],[-2,-33,10],[4,-48,9],[0,-62,7],[-4,-76,6]];
  for (const [dx, dy, r] of puffs) {
    const a = Math.max(0, 0.48 - Math.abs(dy) / 200);
    ctx.fillStyle = `rgba(140,130,130,${a.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(peakX + dx, peakY + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWaterDecorations(ctx: CanvasRenderingContext2D, terrain: number[]): void {
  for (let x = 80; x < CANVAS_WIDTH - 80; x += 120) {
    if ((x > 70 && x < 130) || (x > 670 && x < 730)) continue;
    const l = terrain[Math.max(0, x - 15)];
    const r = terrain[Math.min(CANVAS_WIDTH - 1, x + 15)];
    if (Math.abs(l - r) < 20) drawPalmTree(ctx, x, CANVAS_HEIGHT - terrain[x]);
  }
  const shellColors = ['#f5f0e8','#e8c880','#c8a870','#f0d8b0'];
  for (let i = 0; i < 20; i++) {
    const sx = (i * 67 + terrain[i * 38 % CANVAS_WIDTH] * 1.7) % (CANVAS_WIDTH - 40) + 20;
    const sxi = Math.round(sx);
    const sy = CANVAS_HEIGHT - terrain[Math.max(0, Math.min(CANVAS_WIDTH - 1, sxi))] - 3;
    ctx.fillStyle = shellColors[i % shellColors.length];
    ctx.beginPath();
    ctx.ellipse(sx, sy, 4, 2.5, (i * 30 * Math.PI) / 180, 0, Math.PI * 2);
    ctx.fill();
  }
  // Ocean surface overlay at canvas base
  ctx.fillStyle = 'rgba(26,110,204,0.62)';
  ctx.fillRect(0, CANVAS_HEIGHT - 38, CANVAS_WIDTH, 38);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  for (let wx = 0; wx < CANVAS_WIDTH; wx += 45) {
    const wy = CANVAS_HEIGHT - 36;
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.quadraticCurveTo(wx + 12, wy - 3, wx + 24, wy);
    ctx.quadraticCurveTo(wx + 36, wy + 3, wx + 45, wy);
    ctx.stroke();
  }
}

function drawAirDecorations(ctx: CanvasRenderingContext2D, terrain: number[]): void {
  const snowThreshold = 340;
  ctx.fillStyle = '#e8f0ff';
  for (let x = 0; x < CANVAS_WIDTH; x++) {
    if (terrain[x] > snowThreshold) {
      const depth = Math.min(30, (terrain[x] - snowThreshold) * 0.5);
      ctx.fillRect(x, CANVAS_HEIGHT - terrain[x], 1, depth);
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 40; i++) {
    const sx = (i * 19 + 5) % (CANVAS_WIDTH - 10);
    if (terrain[sx] > snowThreshold + 5) {
      const sy = CANVAS_HEIGHT - terrain[sx] + (terrain[sx] % 8);
      ctx.beginPath();
      ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Draw all biome-specific surface decorations (trees, smoke, snow, etc.). */
export function drawDecorations(
  ctx: CanvasRenderingContext2D,
  terrain: number[],
  biome: BiomeType,
): void {
  switch (biome) {
    case 'earth': drawEarthDecorations(ctx, terrain); break;
    case 'fire':  drawFireDecorations(ctx, terrain);  break;
    case 'water': drawWaterDecorations(ctx, terrain); break;
    case 'air':   drawAirDecorations(ctx, terrain);   break;
  }
}


function drawTankBody(
  ctx: CanvasRenderingContext2D,
  tank: Tank,
  isCurrentPlayer: boolean,
): void {
  const { x, y, color, angle } = tank;
  const direction = color === 'red' ? 1 : -1;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 22, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = color === 'red' ? '#c0392b' : '#2980b9';
  ctx.fillRect(x - 18, y - 10, 36, 14);

  // Treads
  ctx.fillStyle = '#333';
  ctx.fillRect(x - 20, y - 4, 40, 8);
  ctx.fillStyle = '#555';
  for (let i = -18; i < 20; i += 6) {
    ctx.fillRect(x + i, y - 3, 4, 6);
  }

  // Turret
  ctx.fillStyle = color === 'red' ? '#922b21' : '#1a6090';
  ctx.beginPath();
  ctx.arc(x, y - 10, 10, 0, Math.PI * 2);
  ctx.fill();

  // Barrel — angle 0=horizontal outward, 90=vertical up
  const rad = (angle * Math.PI) / 180;
  const barrelEndX = x + direction * Math.cos(rad) * BARREL_LENGTH;
  const barrelEndY = y - 10 - Math.sin(rad) * BARREL_LENGTH;

  ctx.strokeStyle = color === 'red' ? '#7b241c' : '#154360';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x, y - 10);
  ctx.lineTo(barrelEndX, barrelEndY);
  ctx.stroke();

  // Selection ring for current player
  if (isCurrentPlayer) {
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 8, 24, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawHealthBar(ctx: CanvasRenderingContext2D, tank: Tank): void {
  const BAR_W = 50;
  const BAR_H = 8;
  const bx = tank.x - BAR_W / 2;
  const by = tank.y - 36;

  ctx.fillStyle = '#333';
  ctx.fillRect(bx - 1, by - 1, BAR_W + 2, BAR_H + 2);

  const pct = tank.health / 100;
  const fill = pct > 0.5 ? '#27ae60' : pct > 0.25 ? '#f39c12' : '#e74c3c';
  ctx.fillStyle = fill;
  ctx.fillRect(bx, by, BAR_W * pct, BAR_H);

  ctx.fillStyle = '#eee';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${tank.health}`, tank.x, by - 2);
}

function drawHUD(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  myPlayerIndex: number,
  myAngle: number,
  myPower: number,
  myWeapon: string,
  biome: BiomeType,
  movementRemaining: number,
): void {
  const isMyTurn = state.currentPlayerIndex === myPlayerIndex;

  // Biome badge — top-left
  const { text: biomeText, color: biomeColor } = BIOME_LABELS[biome];
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(6, 6, 112, 20);
  ctx.fillStyle = biomeColor;
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(biomeText, 11, 21);

  // Wind indicator — centred top
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(CANVAS_WIDTH / 2 - 80, 8, 160, 28);
  ctx.fillStyle = '#fff';
  ctx.font = '13px monospace';
  ctx.textAlign = 'center';
  const windDir = state.wind >= 0 ? '→' : '←';
  ctx.fillText(`Wind: ${windDir} ${Math.abs(state.wind).toFixed(1)}`, CANVAS_WIDTH / 2, 28);

  // Turn label
  const turnText = isMyTurn ? '⚡ YOUR TURN' : "⏳ Opponent's turn";
  ctx.fillStyle = isMyTurn ? '#f1c40f' : '#aaa';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(turnText, 10, 42);

  // Angle / power / weapon / movement stats — only when it's your turn
  if (isMyTurn) {
    const BLOCK_COUNT = 10;
    const filledBlocks = Math.round((movementRemaining / 60) * BLOCK_COUNT);
    const bar = '█'.repeat(filledBlocks) + '░'.repeat(BLOCK_COUNT - filledBlocks);

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(8, 50, 220, 62);
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Angle: ${myAngle}°`, 14, 67);
    ctx.fillText(`Power: ${myPower}`, 14, 82);
    ctx.fillText(`Weapon: ${myWeapon}`, 14, 97);
    // Movement bar
    ctx.fillStyle = movementRemaining > 30 ? '#27ae60' : movementRemaining > 10 ? '#f39c12' : '#e74c3c';
    ctx.fillText(`Move: ${bar} ${movementRemaining}px`, 14, 112);
  }

  // Turn counter — top-right
  ctx.fillStyle = '#ccc';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`Turn ${state.turnNumber + 1}`, CANVAS_WIDTH - 10, 20);
}

function drawProjectile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  weapon: string,
): void {
  ctx.fillStyle = weapon === 'bouncer' ? '#3498db' : weapon === 'cluster' ? '#9b59b6' : '#e67e22';
  ctx.beginPath();
  ctx.arc(x, y, weapon === 'cluster' ? 4 : 6, 0, Math.PI * 2);
  ctx.fill();

  // Glow
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawExplosion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
): void {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(255,255,200,${alpha})`);
  gradient.addColorStop(0.4, `rgba(255,140,0,${alpha * 0.8})`);
  gradient.addColorStop(1, `rgba(255,0,0,0)`);

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

export interface RenderState {
  gameState: GameState;
  myPlayerIndex: number;
  /** If non-null, we're replaying the last shot frame by frame */
  animFrame: number | null;
  /** Index into lastShot.path being animated */
  animPathIndex: number;
  explosionFrame: number;
  myAngle: number;
  myPower: number;
  myWeapon: string;
  /** Terrain as it currently appears (mid-animation vs post-animation) */
  displayTerrain: number[];
  /** Accumulated movement this turn (px, negative=left, positive=right) */
  movementDelta: number;
  /** Remaining movement budget for this turn (60 - |movementDelta|) */
  movementRemaining: number;
}

export function render(
  ctx: CanvasRenderingContext2D,
  rs: RenderState,
): void {
  const { gameState, myPlayerIndex, myAngle, myPower, myWeapon, displayTerrain, movementDelta, movementRemaining } = rs;
  const { tanks } = gameState;
  const biome: BiomeType = gameState.biome ?? 'earth';

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  drawBackground(ctx, biome);
  drawTerrain(ctx, displayTerrain, biome);
  drawDecorations(ctx, displayTerrain, biome);

  for (let i = 0; i < tanks.length; i++) {
    // During the player's active turn (not animating), preview movement position for the current player's tank
    const isCurrentPlayerTank = i === myPlayerIndex;
    const shouldPreview = isCurrentPlayerTank && rs.animFrame === null && movementDelta !== 0;
    let tankToDraw = tanks[i];

    if (shouldPreview) {
      const previewX = Math.max(0, Math.min(CANVAS_WIDTH - 1, tanks[i].x + movementDelta));
      const previewY = CANVAS_HEIGHT - displayTerrain[Math.round(previewX)];
      tankToDraw = { ...tanks[i], x: previewX, y: previewY };
    }

    drawTankBody(ctx, tankToDraw, i === gameState.currentPlayerIndex);
    drawHealthBar(ctx, tankToDraw);
  }

  // Animate projectile path
  if (rs.animFrame !== null && gameState.lastShot) {
    const { path, weaponType } = gameState.lastShot;
    const idx = rs.animPathIndex;
    if (idx < path.length) {
      drawProjectile(ctx, path[idx].x, path[idx].y, weaponType);
    } else {
      const ef = rs.explosionFrame;
      const maxRadius = weaponType === 'shell' ? 40 : weaponType === 'bouncer' ? 30 : 20;
      if (ef < 20) {
        drawExplosion(
          ctx,
          gameState.lastShot.hitX,
          gameState.lastShot.hitY,
          maxRadius * (ef / 20),
          1 - ef / 20,
        );
      }
    }
  }

  drawHUD(ctx, gameState, myPlayerIndex, myAngle, myPower, myWeapon, biome, movementRemaining);
}
