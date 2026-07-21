import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { GameRecord, GameState, WeaponType } from 'shared';
import { getTerrainHeight } from 'shared';
import { render, type RenderState } from './renderer';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const ANIM_STEP_PER_FRAME = 4; // path points to advance per animation frame
const MOVE_STEP = 5;           // px per key-press
const MAX_MOVEMENT = 60;       // max px of movement per turn

interface Props {
  game: GameRecord;
  myUserId: string;
  /** When playing vs bot: the intermediate state after the human's shot (before bot fires). */
  preBotState?: GameState;
  onTurnSubmit: (angle: number, power: number, weaponType: WeaponType, movement: number) => Promise<void>;
}

export default function GameCanvas({
  game,
  myUserId,
  preBotState,
  onTurnSubmit,
}: Props): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const stateRef = useRef<RenderState | null>(null);
  // Holds the final game state to animate as the second phase (bot's shot)
  const pendingBotStateRef = useRef<GameState | null>(null);

  const state = game.game_state;
  const myPlayerIndex = state.tanks[0].playerId === myUserId ? 0 : 1;
  const isMyTurn = state.currentPlayerIndex === myPlayerIndex && game.status === 'active';

  const [angle, setAngle] = useState<number>(state.tanks[myPlayerIndex]?.angle ?? 45);
  const [power, setPower] = useState<number>(state.tanks[myPlayerIndex]?.power ?? 50);
  const [weapon, setWeapon] = useState<WeaponType>('shell');
  const [movementDelta, setMovementDelta] = useState<number>(0);
  const [firing, setFiring] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [animPhase, setAnimPhase] = useState<'human' | 'bot' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const movementRemaining = MAX_MOVEMENT - Math.abs(movementDelta);

  // Initialise / update render state when game changes
  useEffect(() => {
    stateRef.current = {
      gameState: state,
      myPlayerIndex,
      animFrame: null,
      animPathIndex: 0,
      explosionFrame: 0,
      myAngle: angle,
      myPower: power,
      myWeapon: weapon,
      displayTerrain: [...state.terrain],
      movementDelta: 0,
      movementRemaining: MAX_MOVEMENT,
    };
    setMovementDelta(0); // reset movement when game resets
  }, [game.id]); // intentionally only reset on game-id change; angle/power updated below

  // Keep angle/power/weapon/movement in render state
  useEffect(() => {
    if (stateRef.current) {
      stateRef.current.myAngle = angle;
      stateRef.current.myPower = power;
      stateRef.current.myWeapon = weapon;
      stateRef.current.movementDelta = movementDelta;
      stateRef.current.movementRemaining = MAX_MOVEMENT - Math.abs(movementDelta);
    }
  }, [angle, power, weapon, movementDelta]);

  // Animation loop
  const startAnimLoop = useCallback(() => {
    function loop() {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const rs = stateRef.current;
      if (!ctx || !rs) return;

      render(ctx, rs);

      if (rs.animFrame !== null) {
        const shot = rs.gameState.lastShot;
        if (shot) {
          if (rs.animPathIndex < shot.path.length) {
            rs.animPathIndex = Math.min(
              rs.animPathIndex + ANIM_STEP_PER_FRAME,
              shot.path.length,
            );
          } else {
            rs.explosionFrame += 1;
            if (rs.explosionFrame > 25) {
              // Apply final terrain for this phase
              rs.displayTerrain = [...shot.terrainAfter];
              rs.animFrame = null;
              rs.animPathIndex = 0;
              rs.explosionFrame = 0;

              const nextBotState = pendingBotStateRef.current;
              if (nextBotState && nextBotState.lastShot) {
                // Switch to bot's shot animation
                pendingBotStateRef.current = null;
                rs.gameState = nextBotState;
                rs.displayTerrain = [...nextBotState.lastShot.terrainAfter];
                rs.animFrame = 0;
                rs.animPathIndex = 0;
                rs.explosionFrame = 0;
                setAnimPhase('bot');
              } else {
                setAnimating(false);
                setAnimPhase(null);
              }
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  useEffect(() => {
    startAnimLoop();
    return () => cancelAnimationFrame(rafRef.current);
  }, [startAnimLoop]);

  // When a new game state arrives (after a turn), kick off replay animation.
  // For bot games, preBotState contains the human's shot; game.game_state has the bot's shot.
  // We animate them sequentially: human first, then bot.
  useEffect(() => {
    if (!stateRef.current) return;
    const rs = stateRef.current;

    // Reset movement delta at the start of each new turn
    setMovementDelta(0);
    if (rs) {
      rs.movementDelta = 0;
      rs.movementRemaining = MAX_MOVEMENT;
    }

    const firstState = preBotState ?? state;
    const hasBotPhase = preBotState !== undefined && state.lastShot !== undefined;

    rs.gameState = firstState;

    if (firstState.lastShot) {
      rs.displayTerrain = [...firstState.lastShot.terrainAfter];
      rs.animFrame = 0;
      rs.animPathIndex = 0;
      rs.explosionFrame = 0;
      pendingBotStateRef.current = hasBotPhase ? state : null;
      setAnimPhase('human');
      setAnimating(true);
    } else {
      rs.displayTerrain = [...state.terrain];
      rs.animFrame = null;
      pendingBotStateRef.current = null;
    }
  }, [game.updated_at]); // preBotState and state captured from closure; both update together

  // Mouse drag on canvas to adjust angle
  const isDragging = useRef(false);

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isMyTurn || animating) return;
    isDragging.current = true;
    updateAngleFromMouse(e.clientX, e.clientY, e.currentTarget);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDragging.current || !isMyTurn || animating) return;
    updateAngleFromMouse(e.clientX, e.clientY, e.currentTarget);
  }

  function handleMouseUp() {
    isDragging.current = false;
  }

  function updateAngleFromMouse(clientX: number, clientY: number, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;

    const tank = state.tanks[myPlayerIndex];
    const dx = cx - tank.x;
    const dy = tank.y - cy; // flip Y

    let deg = (Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI;
    deg = Math.max(0, Math.min(180, deg));
    setAngle(Math.round(deg));
  }

  async function handleFire() {
    if (!isMyTurn || animating || firing) return;
    setFiring(true);
    setError(null);
    try {
      await onTurnSubmit(angle, power, weapon, movementDelta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit turn');
    } finally {
      setFiring(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isMyTurn || animating) return;
    switch (e.key) {
      case 'a':
      case 'A': {
        // Move tank left
        e.preventDefault();
        setMovementDelta((prev) => {
          const tank = state.tanks[myPlayerIndex];
          const remaining = MAX_MOVEMENT - Math.abs(prev);
          const step = Math.min(MOVE_STEP, remaining);
          const newDelta = Math.max(-(tank.x), Math.max(-MAX_MOVEMENT, prev - step));
          return newDelta;
        });
        break;
      }
      case 'd':
      case 'D': {
        // Move tank right
        e.preventDefault();
        setMovementDelta((prev) => {
          const tank = state.tanks[myPlayerIndex];
          const remaining = MAX_MOVEMENT - Math.abs(prev);
          const step = Math.min(MOVE_STEP, remaining);
          const newDelta = Math.min(CANVAS_WIDTH - 1 - tank.x, Math.min(MAX_MOVEMENT, prev + step));
          return newDelta;
        });
        break;
      }
      case 'ArrowLeft':
        setAngle((a) => Math.max(0, a - 1));
        break;
      case 'ArrowRight':
        setAngle((a) => Math.min(180, a + 1));
        break;
      case 'ArrowUp':
        setPower((p) => Math.min(100, p + 1));
        break;
      case 'ArrowDown':
        setPower((p) => Math.max(1, p - 1));
        break;
      case ' ':
      case 'Enter':
        e.preventDefault();
        handleFire();
        break;
    }
  }

  /** Compute the preview position of the player's tank after accumulated movement. */
  function getPreviewTankPos(): { x: number; y: number } {
    const tank = state.tanks[myPlayerIndex];
    const previewX = Math.max(0, Math.min(CANVAS_WIDTH - 1, tank.x + movementDelta));
    const previewY = CANVAS_HEIGHT - getTerrainHeight(state.terrain, previewX);
    return { x: previewX, y: previewY };
  }

  const weapons: WeaponType[] = ['shell', 'bouncer', 'cluster'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        tabIndex={0}
        style={{
          border: '2px solid #3a3a5e',
          borderRadius: 4,
          cursor: isMyTurn && !animating ? 'crosshair' : 'default',
          outline: 'none',
          maxWidth: '100%',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onKeyDown={handleKeyDown}
      />

      {isMyTurn && !animating && (
        <div style={styles.controls}>
          <label style={styles.label}>
            Angle: {angle}°
            <input
              type="range"
              min={0}
              max={180}
              value={angle}
              onChange={(e) => setAngle(Number(e.target.value))}
              style={styles.range}
            />
          </label>

          <label style={styles.label}>
            Power: {power}
            <input
              type="range"
              min={1}
              max={100}
              value={power}
              onChange={(e) => setPower(Number(e.target.value))}
              style={styles.range}
            />
          </label>

          {/* Movement bar */}
          <div style={styles.movementRow}>
            <button
              onClick={() => setMovementDelta((prev) => {
                const tank = state.tanks[myPlayerIndex];
                const remaining = MAX_MOVEMENT - Math.abs(prev);
                const step = Math.min(MOVE_STEP, remaining);
                return Math.max(-MAX_MOVEMENT, Math.max(-(tank.x), prev - step));
              })}
              disabled={movementRemaining === 0 || movementDelta <= -(state.tanks[myPlayerIndex]?.x ?? 0)}
              style={styles.moveBtn}
              title="Move left (A)"
            >
              ◀ A
            </button>
            <div style={styles.movementBarWrap}>
              <div
                style={{
                  ...styles.movementBarFill,
                  width: `${(movementRemaining / MAX_MOVEMENT) * 100}%`,
                  background: movementRemaining > 30 ? '#27ae60' : movementRemaining > 10 ? '#f39c12' : '#e74c3c',
                }}
              />
              <span style={styles.movementLabel}>
                {movementDelta !== 0
                  ? `${movementDelta > 0 ? '+' : ''}${movementDelta}px · ${movementRemaining}px left`
                  : `${movementRemaining}px move`}
              </span>
            </div>
            <button
              onClick={() => setMovementDelta((prev) => {
                const tank = state.tanks[myPlayerIndex];
                const remaining = MAX_MOVEMENT - Math.abs(prev);
                const step = Math.min(MOVE_STEP, remaining);
                return Math.min(MAX_MOVEMENT, Math.min(CANVAS_WIDTH - 1 - (tank.x ?? 0), prev + step));
              })}
              disabled={movementRemaining === 0 || movementDelta >= CANVAS_WIDTH - 1 - (state.tanks[myPlayerIndex]?.x ?? CANVAS_WIDTH - 1)}
              style={styles.moveBtn}
              title="Move right (D)"
            >
              D ▶
            </button>
          </div>

          {movementDelta !== 0 && (
            <div style={{ fontSize: 12, color: '#8b949e', textAlign: 'center' }}>
              Preview pos: x={getPreviewTankPos().x.toFixed(0)}
              &nbsp;·&nbsp;
              <button
                onClick={() => setMovementDelta(0)}
                style={{ ...styles.moveBtn, padding: '2px 8px', fontSize: 11 }}
              >
                Reset
              </button>
            </div>
          )}

          <div style={styles.weaponRow}>
            {weapons.map((w) => (
              <button
                key={w}
                onClick={() => setWeapon(w)}
                style={{
                  ...styles.weaponBtn,
                  background: weapon === w ? '#e67e22' : '#2c3e50',
                  borderColor: weapon === w ? '#f39c12' : '#555',
                }}
              >
                {w.charAt(0).toUpperCase() + w.slice(1)}
              </button>
            ))}
          </div>

          <button
            onClick={handleFire}
            disabled={firing || animating}
            style={styles.fireBtn}
          >
            {firing ? 'Firing…' : '🔥 FIRE!'}
          </button>
        </div>
      )}

      {!isMyTurn && game.status === 'active' && !animating && (
        <p style={{ color: '#aaa', fontStyle: 'italic' }}>
          Waiting for opponent to take their turn…
        </p>
      )}

      {animating && (
        <p style={{ color: animPhase === 'bot' ? '#e67e22' : '#f1c40f' }}>
          {animPhase === 'bot' ? '🤖 Bot is firing…' : '💥 Replaying last shot…'}
        </p>
      )}

      {game.status === 'finished' && (
        <p style={{ color: '#27ae60', fontSize: 18, fontWeight: 'bold' }}>
          {game.winner_id === myUserId ? '🏆 You won!' : '💀 You lost!'}
        </p>
      )}

      {error && <p style={{ color: '#e74c3c' }}>{error}</p>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  controls: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    background: '#1e2a3a',
    padding: 16,
    borderRadius: 8,
    width: CANVAS_WIDTH,
    maxWidth: '100%',
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    color: '#ddd',
    fontSize: 14,
  },
  range: {
    flex: 1,
    accentColor: '#e67e22',
  },
  movementRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  movementBarWrap: {
    flex: 1,
    height: 20,
    background: '#21262d',
    borderRadius: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  movementBarFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    borderRadius: 4,
    transition: 'width 0.1s, background 0.2s',
  },
  movementLabel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    color: '#fff',
    fontWeight: 'bold',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  },
  moveBtn: {
    padding: '4px 10px',
    background: '#2c3e50',
    border: '1px solid #555',
    borderRadius: 4,
    color: '#eee',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 'bold',
  },
  weaponRow: {
    display: 'flex',
    gap: 8,
  },
  weaponBtn: {
    flex: 1,
    padding: '6px 0',
    border: '1px solid',
    borderRadius: 4,
    cursor: 'pointer',
    color: '#eee',
    fontWeight: 'bold',
    fontSize: 13,
  },
  fireBtn: {
    padding: '10px 0',
    background: '#c0392b',
    border: '2px solid #e74c3c',
    borderRadius: 6,
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    cursor: 'pointer',
    letterSpacing: 1,
  },
};
