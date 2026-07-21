import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { GameRecord, GameState, WeaponType } from 'shared';
import { getGame, submitTurn } from '../api/client';
import GameCanvas from '../game/GameCanvas';

export default function GamePage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<GameRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preBotState, setPreBotState] = useState<GameState | undefined>();

  const myUserId = localStorage.getItem('userId') ?? '';

  const loadGame = useCallback(async () => {
    if (!id) return;
    try {
      const g = await getGame(id);
      setGame(g);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load game');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadGame();
  }, [loadGame]);

  // Poll when it's not our turn and game is still active (skip for bot games — bot fires instantly)
  useEffect(() => {
    if (!game) return;
    if (game.game_state.isBot) return;
    const myPlayerIndex = game.game_state.tanks[0].playerId === myUserId ? 0 : 1;
    const isMyTurn = game.game_state.currentPlayerIndex === myPlayerIndex;

    if (!isMyTurn && game.status === 'active') {
      const interval = setInterval(loadGame, 5_000);
      return () => clearInterval(interval);
    }
  }, [game, myUserId, loadGame]);

  async function handleTurnSubmit(
    angle: number,
    power: number,
    weaponType: WeaponType,
  ): Promise<void> {
    if (!id) return;
    setPreBotState(undefined); // clear previous bot snapshot
    const response = await submitTurn(id, angle, power, weaponType);
    if (response.humanShotSnapshot) {
      setPreBotState(response.humanShotSnapshot);
    }
    setGame(response.game);
  }

  if (loading) {
    return (
      <div style={styles.centered}>
        <p style={{ color: '#8b949e' }}>Loading game…</p>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div style={styles.centered}>
        <p style={{ color: '#f85149' }}>{error ?? 'Game not found'}</p>
        <button onClick={() => navigate('/')} style={styles.backBtn}>
          ← Back to Lobby
        </button>
      </div>
    );
  }

  const state = game.game_state;
  const myPlayerIndex = state.tanks[0].playerId === myUserId ? 0 : 1;
  const opponentIndex = myPlayerIndex === 0 ? 1 : 0;
  const opponentName = state.isBot
    ? `CPU (${(state.botDifficulty ?? 'medium').charAt(0).toUpperCase() + (state.botDifficulty ?? 'medium').slice(1)})`
    : myPlayerIndex === 0
      ? (game.player2_username ?? 'Waiting…')
      : (game.player1_username ?? '?');
  const myTank = state.tanks[myPlayerIndex];
  const oppTank = state.tanks[opponentIndex];
  const isMyTurn = state.currentPlayerIndex === myPlayerIndex;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <button onClick={() => navigate('/')} style={styles.backBtn}>
          ← Lobby
        </button>
        <h2 style={styles.heading}>
          🎯 Tanks Online — vs{' '}
          <span style={{ color: isMyTurn ? '#f1c40f' : '#8b949e' }}>{opponentName}</span>
        </h2>
        <span style={{ color: '#8b949e', fontSize: 13 }}>Turn {state.turnNumber + 1}</span>
      </header>

      <div style={styles.layout}>
        {/* Game canvas */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {game.status === 'waiting' ? (
            <div style={styles.waiting}>
              <p style={{ fontSize: 20, marginBottom: 12 }}>⏳ Waiting for opponent to join</p>
              <p style={{ color: '#8b949e' }}>Share your game ID with a friend:</p>
              <code style={styles.gameId}>{game.id}</code>
              <p style={{ color: '#8b949e', marginTop: 12, fontSize: 13 }}>
                Go to Lobby → open this game → click Invite to send a challenge.
              </p>
            </div>
          ) : (
            <GameCanvas
              game={game}
              myUserId={myUserId}
              preBotState={preBotState}
              onTurnSubmit={handleTurnSubmit}
            />
          )}
        </div>

        {/* Sidebar */}
        <aside style={styles.sidebar}>
          <h3 style={styles.sidebarTitle}>Game Info</h3>

          <div style={styles.playerInfo}>
            <div
              style={{
                ...styles.playerBox,
                borderColor: myTank.color === 'red' ? '#c0392b' : '#2980b9',
                background: isMyTurn ? '#1a2030' : '#0d1117',
              }}
            >
              <strong>You</strong>
              <div style={styles.hpBar}>
                <div
                  style={{
                    ...styles.hpFill,
                    width: `${myTank.health}%`,
                    background: myTank.health > 50 ? '#27ae60' : myTank.health > 25 ? '#f39c12' : '#e74c3c',
                  }}
                />
              </div>
              <span style={{ fontSize: 13, color: '#aaa' }}>{myTank.health} HP</span>
              {isMyTurn && (
                <span style={{ fontSize: 11, color: '#f1c40f', marginTop: 4 }}>⚡ Your turn</span>
              )}
            </div>

            <div style={{ fontSize: 22, alignSelf: 'center' }}>⚔</div>

            <div
              style={{
                ...styles.playerBox,
                borderColor: oppTank.color === 'red' ? '#c0392b' : '#2980b9',
                background: !isMyTurn && game.status === 'active' ? '#1a2030' : '#0d1117',
              }}
            >
              <strong>{opponentName}</strong>
              <div style={styles.hpBar}>
                <div
                  style={{
                    ...styles.hpFill,
                    width: `${oppTank.health}%`,
                    background: oppTank.health > 50 ? '#27ae60' : oppTank.health > 25 ? '#f39c12' : '#e74c3c',
                  }}
                />
              </div>
              <span style={{ fontSize: 13, color: '#aaa' }}>{oppTank.health} HP</span>
              {!isMyTurn && game.status === 'active' && (
                <span style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>⏳ Their turn</span>
              )}
            </div>
          </div>

          {state.lastShot && (
            <div style={styles.lastShot}>
              <p style={{ fontWeight: 'bold', marginBottom: 6 }}>Last Shot</p>
              <p>Weapon: {state.lastShot.weaponType}</p>
              <p>Angle: {state.lastShot.angle}°</p>
              <p>Power: {state.lastShot.power}</p>
              <p>Damage: {state.lastShot.damageDealt}</p>
            </div>
          )}

          <div style={styles.windBox}>
            <p style={{ fontWeight: 'bold', marginBottom: 4 }}>🌬 Wind</p>
            <p style={{ fontSize: 22 }}>
              {state.wind >= 0 ? '→' : '←'}{' '}
              <span style={{ fontSize: 16 }}>{Math.abs(state.wind).toFixed(1)}</span>
            </p>
          </div>

          {game.status === 'finished' && (
            <div
              style={{
                textAlign: 'center',
                padding: 16,
                background: game.winner_id === myUserId ? '#1a3a1a' : '#3a1a1a',
                borderRadius: 8,
                border: `1px solid ${game.winner_id === myUserId ? '#27ae60' : '#e74c3c'}`,
              }}
            >
              {game.winner_id === myUserId ? (
                <p style={{ color: '#27ae60', fontWeight: 'bold', fontSize: 18 }}>🏆 You Won!</p>
              ) : (
                <p style={{ color: '#e74c3c', fontWeight: 'bold', fontSize: 18 }}>💀 You Lost</p>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0d1117',
    color: '#f0f6fc',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 24px',
    background: '#161b22',
    borderBottom: '1px solid #30363d',
  },
  heading: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  layout: {
    display: 'flex',
    gap: 24,
    padding: 24,
    flex: 1,
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  centered: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    background: '#0d1117',
    color: '#f0f6fc',
  },
  backBtn: {
    padding: '6px 14px',
    background: 'transparent',
    border: '1px solid #30363d',
    borderRadius: 6,
    color: '#8b949e',
    cursor: 'pointer',
    fontSize: 13,
  },
  waiting: {
    textAlign: 'center',
    padding: 48,
    color: '#f0f6fc',
  },
  gameId: {
    display: 'block',
    margin: '8px auto 0',
    padding: '8px 16px',
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 6,
    fontSize: 13,
    color: '#58a6ff',
    maxWidth: 520,
    wordBreak: 'break-all',
    textAlign: 'left',
  },
  sidebar: {
    width: 220,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 10,
    padding: 16,
    flexShrink: 0,
  },
  sidebarTitle: {
    fontWeight: 'bold',
    fontSize: 15,
    color: '#f0f6fc',
    marginBottom: 0,
  },
  playerInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  playerBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 10,
    borderRadius: 8,
    border: '2px solid',
    fontSize: 14,
    color: '#f0f6fc',
  },
  hpBar: {
    height: 8,
    background: '#21262d',
    borderRadius: 4,
    overflow: 'hidden',
  },
  hpFill: {
    height: '100%',
    borderRadius: 4,
    transition: 'width 0.4s',
  },
  lastShot: {
    padding: 12,
    background: '#0d1117',
    borderRadius: 8,
    border: '1px solid #21262d',
    fontSize: 13,
    color: '#8b949e',
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  windBox: {
    padding: 12,
    background: '#0d1117',
    borderRadius: 8,
    border: '1px solid #21262d',
    color: '#f0f6fc',
  },
};
