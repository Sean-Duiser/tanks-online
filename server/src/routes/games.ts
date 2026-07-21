import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { generateTerrain, placeTanks } from '../game/terrain';
import { simulateShot } from '../../../shared/physics';
import type { GameState, WeaponType } from '../../../shared/types';

const router = Router();

router.use(requireAuth);

// GET /api/games — list my active + waiting games
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT g.*,
              u1.username AS player1_username,
              u2.username AS player2_username
       FROM   games g
       LEFT JOIN users u1 ON g.player1_id = u1.id
       LEFT JOIN users u2 ON g.player2_id = u2.id
       WHERE  (g.player1_id = $1 OR g.player2_id = $1)
         AND  g.status IN ('waiting', 'active')
       ORDER BY g.updated_at DESC`,
      [req.userId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List games error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/games — create new game
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const terrain = generateTerrain();
    const tanks = placeTanks(terrain, req.userId as string, '__tbd__');

    const initialState: GameState = {
      tanks,
      terrain,
      wind: Math.round((Math.random() * 20 - 10) * 10) / 10,
      turnNumber: 0,
      currentPlayerIndex: 0,
    };

    const result = await pool.query(
      `INSERT INTO games
         (player1_id, current_turn_player_id, game_state, status)
       VALUES ($1, $1, $2, 'waiting')
       RETURNING *`,
      [req.userId, JSON.stringify(initialState)],
    );

    const row = result.rows[0] as { id: string };
    const fullResult = await pool.query(
      `SELECT g.*, u1.username AS player1_username, u2.username AS player2_username
       FROM games g
       LEFT JOIN users u1 ON g.player1_id = u1.id
       LEFT JOIN users u2 ON g.player2_id = u2.id
       WHERE g.id = $1`,
      [row.id],
    );

    res.status(201).json(fullResult.rows[0]);
  } catch (err) {
    console.error('Create game error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/games/:id
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT g.*, u1.username AS player1_username, u2.username AS player2_username
       FROM games g
       LEFT JOIN users u1 ON g.player1_id = u1.id
       LEFT JOIN users u2 ON g.player2_id = u2.id
       WHERE g.id = $1`,
      [req.params['id']],
    );

    const game = result.rows[0];
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    if (game.player1_id !== req.userId && game.player2_id !== req.userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json(game);
  } catch (err) {
    console.error('Get game error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/games/:id/invite
router.post('/:id/invite', async (req: AuthRequest, res: Response): Promise<void> => {
  const { toUsername } = req.body as { toUsername?: string };

  if (!toUsername) {
    res.status(400).json({ error: 'toUsername is required' });
    return;
  }

  try {
    const gameResult = await pool.query('SELECT * FROM games WHERE id = $1', [req.params['id']]);
    const game = gameResult.rows[0];

    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    if (game.player1_id !== req.userId) {
      res.status(403).json({ error: 'Only the game creator can invite' });
      return;
    }
    if (game.status !== 'waiting') {
      res.status(400).json({ error: 'Game is not in waiting state' });
      return;
    }

    // Check target user exists
    const targetResult = await pool.query('SELECT id FROM users WHERE username = $1', [
      toUsername,
    ]);
    if (!targetResult.rows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const invite = await pool.query(
      `INSERT INTO game_invites (from_user_id, to_username, game_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.userId, toUsername, req.params['id']],
    );

    res.status(201).json(invite.rows[0]);
  } catch (err) {
    console.error('Invite error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/games/:id/turn
router.post('/:id/turn', async (req: AuthRequest, res: Response): Promise<void> => {
  const { angle, power, weaponType } = req.body as {
    angle?: number;
    power?: number;
    weaponType?: WeaponType;
  };

  if (angle === undefined || power === undefined || !weaponType) {
    res.status(400).json({ error: 'angle, power, and weaponType are required' });
    return;
  }

  if (angle < 0 || angle > 180) {
    res.status(400).json({ error: 'angle must be 0-180' });
    return;
  }
  if (power < 0 || power > 100) {
    res.status(400).json({ error: 'power must be 0-100' });
    return;
  }
  if (!['shell', 'bouncer', 'cluster'].includes(weaponType)) {
    res.status(400).json({ error: 'invalid weaponType' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const gameResult = await client.query(
      `SELECT g.*, u1.username AS player1_username, u2.username AS player2_username
       FROM games g
       LEFT JOIN users u1 ON g.player1_id = u1.id
       LEFT JOIN users u2 ON g.player2_id = u2.id
       WHERE g.id = $1
       FOR UPDATE`,
      [req.params['id']],
    );

    const game = gameResult.rows[0];
    if (!game) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    if (game.status !== 'active') {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Game is not active' });
      return;
    }

    if (game.current_turn_player_id !== req.userId) {
      await client.query('ROLLBACK');
      res.status(403).json({ error: "It is not your turn" });
      return;
    }

    const state: GameState = game.game_state as GameState;

    // Run physics
    const shotResult = simulateShot(state, angle, power, weaponType);

    // Update tank health
    const shooterIndex = state.currentPlayerIndex;
    const targetIndex = shooterIndex === 0 ? 1 : 0;
    const newTanks = state.tanks.map((t, i) => {
      if (i === targetIndex) {
        return { ...t, health: Math.max(0, t.health - shotResult.damageDealt) };
      }
      return t;
    });

    const nextPlayerIndex = shooterIndex === 0 ? 1 : 0;
    const newWind = Math.round((Math.random() * 20 - 10) * 10) / 10;

    const newState: GameState = {
      tanks: newTanks,
      terrain: shotResult.terrainAfter,
      wind: newWind,
      turnNumber: state.turnNumber + 1,
      currentPlayerIndex: nextPlayerIndex,
      lastShot: {
        angle,
        power,
        weaponType,
        path: shotResult.path,
        hitX: shotResult.hitX,
        hitY: shotResult.hitY,
        damageDealt: shotResult.damageDealt,
        terrainAfter: shotResult.terrainAfter,
      },
    };

    const isFinished = newTanks[targetIndex].health <= 0;
    const newStatus = isFinished ? 'finished' : 'active';
    const winnerId = isFinished ? req.userId : null;
    const nextTurnPlayerId = isFinished
      ? req.userId
      : game[nextPlayerIndex === 0 ? 'player1_id' : 'player2_id'];

    await client.query(
      `UPDATE games
       SET game_state = $1,
           status = $2,
           winner_id = COALESCE($3, winner_id),
           turn_number = turn_number + 1,
           current_turn_player_id = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [
        JSON.stringify(newState),
        newStatus,
        winnerId,
        nextTurnPlayerId,
        req.params['id'],
      ],
    );

    await client.query('COMMIT');

    const updatedResult = await pool.query(
      `SELECT g.*, u1.username AS player1_username, u2.username AS player2_username
       FROM games g
       LEFT JOIN users u1 ON g.player1_id = u1.id
       LEFT JOIN users u2 ON g.player2_id = u2.id
       WHERE g.id = $1`,
      [req.params['id']],
    );

    res.json(updatedResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Turn error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

export default router;
