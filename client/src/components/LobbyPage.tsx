import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GameRecord, GameInvite } from 'shared';
import {
  listGames,
  createGame,
  listInvites,
  acceptInvite,
  declineInvite,
  invitePlayer,
} from '../api/client';

export default function LobbyPage(): React.ReactElement {
  const navigate = useNavigate();
  const [games, setGames] = useState<GameRecord[]>([]);
  const [invites, setInvites] = useState<GameInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [inviteGameId, setInviteGameId] = useState<string | null>(null);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);

  const myUserId = localStorage.getItem('userId') ?? '';
  const myUsername = localStorage.getItem('username') ?? '';

  const load = useCallback(async () => {
    try {
      const [g, inv] = await Promise.all([listGames(), listInvites()]);
      setGames(g);
      setInvites(inv);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleCreateGame() {
    setCreating(true);
    setError(null);
    try {
      const game = await createGame();
      setGames((prev) => [game, ...prev]);
      setInviteGameId(game.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game');
    } finally {
      setCreating(false);
    }
  }

  async function handleSendInvite(gameId: string) {
    if (!inviteUsername.trim()) return;
    setInviteError(null);
    try {
      await invitePlayer(gameId, inviteUsername.trim());
      setInviteGameId(null);
      setInviteUsername('');
      alert(`Invite sent to ${inviteUsername}!`);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invite');
    }
  }

  async function handleAccept(inviteId: string) {
    try {
      const game = await acceptInvite(inviteId);
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      navigate(`/game/${game.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invite');
    }
  }

  async function handleDecline(inviteId: string) {
    try {
      await declineInvite(inviteId);
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decline invite');
    }
  }

  function handleLogout() {
    localStorage.clear();
    navigate('/login');
  }

  function gameLabel(g: GameRecord): string {
    const opponent =
      g.player1_id === myUserId
        ? (g.player2_username ?? 'Waiting for opponent…')
        : (g.player1_username ?? '?');
    return `vs ${opponent}`;
  }

  function turnLabel(g: GameRecord): string {
    if (g.status === 'waiting') return '⏳ Waiting for opponent';
    if (g.current_turn_player_id === myUserId) return '⚡ Your turn';
    return "⏳ Opponent's turn";
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.logo}>🎯 Tanks Online</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#8b949e', fontSize: 14 }}>👤 {myUsername}</span>
          <button onClick={handleLogout} style={styles.logoutBtn}>
            Logout
          </button>
        </div>
      </header>

      <main style={styles.main}>
        {error && <p style={styles.errorBanner}>{error}</p>}

        {/* Invites section */}
        {invites.length > 0 && (
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>📬 Pending Invites</h2>
            {invites.map((inv) => (
              <div key={inv.id} style={styles.inviteCard}>
                <span style={{ color: '#f0f6fc' }}>
                  <strong>{inv.from_username}</strong> challenged you!
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleAccept(inv.id)} style={styles.acceptBtn}>
                    Accept
                  </button>
                  <button onClick={() => handleDecline(inv.id)} style={styles.declineBtn}>
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* My games */}
        <section style={styles.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={styles.sectionTitle}>🎮 My Games</h2>
            <button onClick={handleCreateGame} disabled={creating} style={styles.createBtn}>
              {creating ? 'Creating…' : '+ New Game'}
            </button>
          </div>

          {loading ? (
            <p style={{ color: '#8b949e' }}>Loading…</p>
          ) : games.length === 0 ? (
            <p style={{ color: '#8b949e' }}>No active games. Create one to start!</p>
          ) : (
            <div style={styles.gameList}>
              {games.map((g) => (
                <div key={g.id} style={styles.gameCard}>
                  <div>
                    <p style={styles.gameVs}>{gameLabel(g)}</p>
                    <p style={styles.gameTurn}>{turnLabel(g)}</p>
                    <p style={{ color: '#8b949e', fontSize: 12, marginTop: 2 }}>
                      Turn {g.turn_number}
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button onClick={() => navigate(`/game/${g.id}`)} style={styles.openBtn}>
                      Open
                    </button>
                    {g.status === 'waiting' && g.player1_id === myUserId && (
                      <button
                        onClick={() => {
                          setInviteGameId(g.id);
                          setInviteUsername('');
                          setInviteError(null);
                        }}
                        style={styles.inviteBtn}
                      >
                        Invite
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Inline invite form */}
          {inviteGameId && (
            <div style={styles.inviteForm}>
              <p style={{ color: '#f0f6fc', marginBottom: 8 }}>Invite a player by username:</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  style={styles.inviteInput}
                  type="text"
                  placeholder="Username"
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendInvite(inviteGameId);
                  }}
                />
                <button
                  onClick={() => handleSendInvite(inviteGameId)}
                  style={styles.acceptBtn}
                >
                  Send
                </button>
                <button
                  onClick={() => setInviteGameId(null)}
                  style={styles.declineBtn}
                >
                  Cancel
                </button>
              </div>
              {inviteError && <p style={styles.error}>{inviteError}</p>}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0d1117',
    color: '#f0f6fc',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 32px',
    background: '#161b22',
    borderBottom: '1px solid #30363d',
  },
  logo: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#f0f6fc',
  },
  logoutBtn: {
    padding: '6px 14px',
    background: 'transparent',
    border: '1px solid #30363d',
    borderRadius: 6,
    color: '#8b949e',
    cursor: 'pointer',
    fontSize: 13,
  },
  main: {
    maxWidth: 760,
    margin: '0 auto',
    padding: '32px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 32,
  },
  section: {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 10,
    padding: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#f0f6fc',
  },
  errorBanner: {
    background: '#3d1f1f',
    border: '1px solid #f85149',
    borderRadius: 6,
    padding: '10px 16px',
    color: '#f85149',
  },
  error: {
    color: '#f85149',
    fontSize: 13,
    marginTop: 6,
  },
  gameList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  gameCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#0d1117',
    border: '1px solid #21262d',
    borderRadius: 8,
    padding: '14px 18px',
  },
  gameVs: {
    fontWeight: 'bold',
    fontSize: 15,
    color: '#f0f6fc',
  },
  gameTurn: {
    fontSize: 13,
    color: '#8b949e',
    marginTop: 2,
  },
  inviteCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#0d1117',
    border: '1px solid #3d2800',
    borderRadius: 8,
    padding: '14px 18px',
    marginBottom: 8,
  },
  createBtn: {
    padding: '8px 16px',
    background: '#238636',
    border: '1px solid #2ea043',
    borderRadius: 6,
    color: '#fff',
    fontWeight: 'bold',
    cursor: 'pointer',
    fontSize: 14,
  },
  openBtn: {
    padding: '6px 14px',
    background: '#1f6feb',
    border: '1px solid #388bfd',
    borderRadius: 6,
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 'bold',
  },
  inviteBtn: {
    padding: '5px 12px',
    background: '#b08800',
    border: '1px solid #d29922',
    borderRadius: 6,
    color: '#fff',
    cursor: 'pointer',
    fontSize: 12,
  },
  acceptBtn: {
    padding: '7px 16px',
    background: '#238636',
    border: '1px solid #2ea043',
    borderRadius: 6,
    color: '#fff',
    fontWeight: 'bold',
    cursor: 'pointer',
    fontSize: 13,
  },
  declineBtn: {
    padding: '7px 16px',
    background: '#21262d',
    border: '1px solid #30363d',
    borderRadius: 6,
    color: '#8b949e',
    cursor: 'pointer',
    fontSize: 13,
  },
  inviteForm: {
    marginTop: 16,
    padding: 16,
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: 8,
  },
  inviteInput: {
    flex: 1,
    padding: '8px 12px',
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 6,
    color: '#f0f6fc',
    fontSize: 14,
    outline: 'none',
    minWidth: 0,
  },
};
