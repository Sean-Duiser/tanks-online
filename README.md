# 🎯 Tanks Online

An async multiplayer turn-based artillery game inspired by the classic 2004 Flash game. Two players take turns aiming and firing weapons at each other's tanks across procedurally-generated terrain. Because turns are saved to a database, players can fire and come back hours later — the opponent's shot and its animation will be waiting for them.

---

## Table of Contents

1. [What It Is](#what-it-is)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Prerequisites](#prerequisites)
5. [Setup & Running Locally](#setup--running-locally)
6. [How to Play](#how-to-play)
7. [Weapons](#weapons)
8. [API Reference](#api-reference)
9. [Architecture Overview](#architecture-overview)

---

## What It Is

Tanks Online is a two-player artillery game:

- **Procedural terrain** generated server-side using midpoint displacement — every game has a unique landscape.
- **Physics simulation** shared between client and server: gravity, wind, three weapon types.
- **Async multiplayer**: you fire your shot, close the browser, come back tomorrow. Your opponent sees a replay animation of your shot and then takes theirs.
- **JWT auth** with localStorage token storage; no sessions.
- **PostgreSQL** stores full game state as JSONB — simple, portable, auditable.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + HTML5 Canvas (Vite 5) |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL 16 (via `pg` pool + raw SQL) |
| Auth | JWT (7-day access token in localStorage) |
| Dev infra | Docker Compose (Postgres + pgAdmin) |

---

## Project Structure

```
tanks-online/
├── client/               # Vite + React app (port 5173)
│   └── src/
│       ├── api/          # fetch wrappers for all API calls
│       ├── components/   # LoginPage, LobbyPage, GamePage
│       └── game/         # Canvas engine: terrain, renderer, physics, GameCanvas
├── server/               # Express API (port 3001)
│   └── src/
│       ├── db/           # pg pool + migrations
│       ├── game/         # terrain generation, tank placement
│       ├── middleware/   # JWT auth guard
│       └── routes/       # auth, games, invites
├── shared/               # Types + physics shared by both sides
│   ├── types.ts
│   ├── physics.ts
│   └── index.ts
└── docker-compose.yml    # Postgres + pgAdmin
```

---

## Prerequisites

- **Node.js ≥ 20** and **npm ≥ 10**
- **Docker** and **Docker Compose**

---

## Setup & Running Locally

### 1 — Start the database

```bash
docker compose up -d
```

This starts:
- PostgreSQL 16 on `localhost:5432`
- pgAdmin on `http://localhost:5050` (admin@tanks.local / admin)

### 2 — Configure environment

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

The defaults work as-is with Docker Compose. Change `JWT_SECRET` for any real deployment.

### 3 — Install dependencies

```bash
npm install
```

npm workspaces installs everything for `client/`, `server/`, and `shared/` in one shot.

### 4 — Run in development

```bash
npm run dev
```

This uses `concurrently` to start both:
- **Server** at `http://localhost:3001` (ts-node-dev with hot reload)
- **Client** at `http://localhost:5173` (Vite HMR)

The server automatically runs the `001_init.sql` migration on startup.

### 5 — Production build

```bash
npm run build          # builds shared, server TS, and Vite client
npm run start          # serves API + static client from Express on port 3001
```

---

## How to Play

1. **Register** two accounts (open two browser windows / incognito).
2. **Player A** clicks **New Game** in the Lobby.
3. **Player A** clicks **Invite** on the new game and enters Player B's username.
4. **Player B** sees the invite in their Lobby, clicks **Accept**.
5. The game is now **active**. Player A goes first.
6. In the game view:
   - **Drag** on the canvas or use **←/→ arrow keys** to adjust the barrel angle.
   - **↑/↓ arrow keys** or the **Power** slider to adjust shot power.
   - Choose a **weapon** (Shell / Bouncer / Cluster).
   - Click **🔥 FIRE!** or press **Space/Enter**.
7. The server validates and saves the turn. Player B can open the game at any time and will see a **replay animation** of Player A's shot before taking their own.
8. The game ends when a tank reaches 0 HP.

### Controls Summary

| Control | Action |
|---|---|
| Mouse drag on canvas | Aim barrel |
| ← / → | Adjust angle by 1° |
| ↑ / ↓ | Adjust power by 1 |
| Space / Enter | Fire |

---

## Weapons

| Weapon | Crater radius | Notes |
|---|---|---|
| **Shell** | 20 px | Standard direct-fire round |
| **Bouncer** | 15 px | Bounces off terrain up to 3 times before detonating |
| **Cluster** | 10 px × 3 | Splits into 3 sub-projectiles at the apex (-30°, 0°, +30°); each deals independent damage |

**Damage formula**: `damage = round(100 - (dist/35) * 100)`, clamped 0-100, for a hit within 35 px of the tank centre.

---

## API Reference

All routes except `/api/auth/*` require `Authorization: Bearer <token>`.

### Auth

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/auth/register` | `{username, email, password}` | `{token, user}` |
| POST | `/api/auth/login` | `{email, password}` | `{token, user}` |

### Games

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/games` | — | Array of your active/waiting `GameRecord` |
| POST | `/api/games` | — | New `GameRecord` (status=waiting) |
| GET | `/api/games/:id` | — | Full `GameRecord` with state |
| POST | `/api/games/:id/invite` | `{toUsername}` | `GameInvite` record |
| POST | `/api/games/:id/turn` | `{angle, power, weaponType}` | Updated `GameRecord` |

### Invites

| Method | Path | Response |
|---|---|---|
| GET | `/api/invites` | Your pending `GameInvite[]` |
| POST | `/api/invites/:id/accept` | Updated `GameRecord` (status=active) |
| POST | `/api/invites/:id/decline` | Updated `GameInvite` |

---

## Architecture Overview

```
Browser (React + Canvas)
  │  fetch /api/*  (JWT)
  ▼
Express Server
  ├── POST /api/games/:id/turn
  │     ├── Verify JWT → look up game → check it's your turn
  │     ├── simulateShot() from shared/physics.ts
  │     │     └── Gravity + wind integration, crater, damage calc
  │     ├── Apply damage to tank health
  │     ├── Flip currentPlayerIndex, regenerate wind
  │     └── Persist updated GameState JSONB to Postgres
  └── GET /api/games/:id
        └── Return full record; client animates lastShot.path on load

Shared (physics.ts)
  └── Used by server for authoritative simulation
      and by client for replay animation (same code path)

PostgreSQL
  ├── users          — credentials + UUIDs
  ├── games          — JSONB game_state, status, turn ownership
  └── game_invites   — pending/accepted/declined invite records
```

### Key Design Decisions

- **JSONB game state**: the entire `GameState` lives in one column. Avoids complex relational modelling for a game-specific data shape; easy to evolve.
- **Shared physics module**: the server is the single source of truth for physics, but the client runs the same `simulateShot` to drive the projectile replay animation — no extra round-trip needed.
- **Async-first multiplayer**: no WebSockets required. The lobby polls every 10 s; the game page polls every 5 s when waiting for an opponent. This keeps infrastructure simple while supporting the "play at your own pace" flow.
- **No ORM**: raw `pg` queries keep the SQL readable, migrations trivial, and the dependency tree lean.