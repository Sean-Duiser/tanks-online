import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, register } from '../api/client';

export default function LoginPage(): React.ReactElement {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let result: { token: string; user: { id: string; username: string } };
      if (tab === 'login') {
        result = await login(email, password);
      } else {
        result = await register(username, email, password);
      }
      localStorage.setItem('token', result.token);
      localStorage.setItem('userId', result.user.id);
      localStorage.setItem('username', result.user.username);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>🎯 Tanks Online</h1>
        <p style={styles.subtitle}>Turn-based artillery combat</p>

        <div style={styles.tabs}>
          <button
            onClick={() => setTab('login')}
            style={{ ...styles.tab, ...(tab === 'login' ? styles.activeTab : {}) }}
          >
            Login
          </button>
          <button
            onClick={() => setTab('register')}
            style={{ ...styles.tab, ...(tab === 'register' ? styles.activeTab : {}) }}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          {tab === 'register' && (
            <input
              style={styles.input}
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
            />
          )}
          <input
            style={styles.input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" disabled={loading} style={styles.submitBtn}>
            {loading ? 'Loading…' : tab === 'login' ? 'Login' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0d1117',
  },
  card: {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 12,
    padding: '40px 48px',
    width: 360,
    textAlign: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#f0f6fc',
    marginBottom: 4,
  },
  subtitle: {
    color: '#8b949e',
    fontSize: 14,
    marginBottom: 28,
  },
  tabs: {
    display: 'flex',
    marginBottom: 20,
    background: '#0d1117',
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    padding: '8px 0',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    background: 'transparent',
    color: '#8b949e',
    fontWeight: 600,
    fontSize: 14,
    transition: 'all 0.2s',
  },
  activeTab: {
    background: '#21262d',
    color: '#f0f6fc',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  input: {
    padding: '10px 14px',
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: 6,
    color: '#f0f6fc',
    fontSize: 14,
    outline: 'none',
  },
  error: {
    color: '#f85149',
    fontSize: 13,
    margin: 0,
  },
  submitBtn: {
    padding: '11px 0',
    background: '#238636',
    border: '1px solid #2ea043',
    borderRadius: 6,
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
    cursor: 'pointer',
    marginTop: 4,
  },
};
