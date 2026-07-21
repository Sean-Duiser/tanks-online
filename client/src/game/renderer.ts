import type { GameState, Tank } from 'shared';
import { drawTerrain } from './terrain';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;

const BARREL_LENGTH = 22;

function drawSky(ctx: CanvasRenderingContext2D): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, '#0d1b4b');
  gradient.addColorStop(0.6, '#1a3a6e');
  gradient.addColorStop(1, '#2a5298');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
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
): void {
  const currentTank = state.tanks[state.currentPlayerIndex];
  const isMyTurn = state.currentPlayerIndex === myPlayerIndex;

  // Wind indicator
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
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(turnText, 10, 22);

  // Current player stats (angle, power, weapon) — only show when it's your turn
  if (isMyTurn) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(8, 30, 220, 48);
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Angle: ${myAngle}°`, 14, 47);
    ctx.fillText(`Power: ${myPower}`, 14, 62);
    ctx.fillText(`Weapon: ${myWeapon}`, 14, 77);
  }

  // Turn counter
  ctx.fillStyle = '#ccc';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`Turn ${state.turnNumber + 1}`, CANVAS_WIDTH - 10, 20);

  void currentTank;
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
}

export function render(
  ctx: CanvasRenderingContext2D,
  rs: RenderState,
): void {
  const { gameState, myPlayerIndex, myAngle, myPower, myWeapon, displayTerrain } = rs;
  const { tanks, wind } = gameState;

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  drawSky(ctx);
  drawTerrain(ctx, displayTerrain);

  for (let i = 0; i < tanks.length; i++) {
    drawTankBody(ctx, tanks[i], i === gameState.currentPlayerIndex);
    drawHealthBar(ctx, tanks[i]);
  }

  // Animate projectile path
  if (rs.animFrame !== null && gameState.lastShot) {
    const { path, weaponType } = gameState.lastShot;
    const idx = rs.animPathIndex;
    if (idx < path.length) {
      drawProjectile(ctx, path[idx].x, path[idx].y, weaponType);
    } else {
      // Explosion phase
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

  drawHUD(ctx, gameState, myPlayerIndex, myAngle, myPower, myWeapon);
  void wind;
}
