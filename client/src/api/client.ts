/// <reference types="vite/client" />
import type { GameRecord, GameInvite, GameState, User } from 'shared';

const BASE = import.meta.env.VITE_API_URL ?? '';

function getToken(): string {
  return localStorage.getItem('token') ?? '';
}

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options);
  const data = (await res.json()) as T | { error: string };
  if (!res.ok) {
    throw new Error((data as { error: string }).error ?? `HTTP ${res.status}`);
  }
  return data as T;
}

// Auth
export function register(
  username: string,
  email: string,
  password: string,
): Promise<{ token: string; user: User }> {
  return request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
}

export function login(
  email: string,
  password: string,
): Promise<{ token: string; user: User }> {
  return request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

// Games
export interface TurnResponse {
  game: GameRecord;
  humanShotSnapshot: GameState | null;
}

export function listGames(): Promise<GameRecord[]> {
  return request('/api/games', { headers: authHeaders() });
}

export function createGame(opts?: {
  biome?: string;
  vsBot?: boolean;
  botDifficulty?: string;
}): Promise<GameRecord> {
  return request('/api/games', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(opts ?? {}),
  });
}

export function getGame(id: string): Promise<GameRecord> {
  return request(`/api/games/${id}`, { headers: authHeaders() });
}

export function invitePlayer(gameId: string, toUsername: string): Promise<GameInvite> {
  return request(`/api/games/${gameId}/invite`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ toUsername }),
  });
}

export function submitTurn(
  gameId: string,
  angle: number,
  power: number,
  weaponType: string,
): Promise<TurnResponse> {
  return request(`/api/games/${gameId}/turn`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ angle, power, weaponType }),
  });
}

// Invites
export function listInvites(): Promise<GameInvite[]> {
  return request('/api/invites', { headers: authHeaders() });
}

export function acceptInvite(inviteId: string): Promise<GameRecord> {
  return request(`/api/invites/${inviteId}/accept`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function declineInvite(inviteId: string): Promise<GameInvite> {
  return request(`/api/invites/${inviteId}/decline`, {
    method: 'POST',
    headers: authHeaders(),
  });
}
