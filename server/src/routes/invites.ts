import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { placeTanks } from '../game/terrain';
import type { GameState } from '../../../shared/types';

const router = Router();

router.use(requireAuth);

// GET /api/invites — my pending invites
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Look up the current user's username
    const userResult = await pool.query('SELECT username FROM users WHERE id = $1', [req.userId]);
    const me = userResult.rows[0] as { username: string } | undefined;
    if (!me) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const result = await pool.query(
      `SELECT gi.*, u.username AS from_username
       FROM   game_invites gi
       JOIN   users u ON gi.from_user_id = u.id
       WHERE  gi.to_username = $1
         AND  gi.status = 'pending'
       ORDER BY gi.created_at DESC`,
      [me.username],
    );

    res.json(result.rows);
  } catch (err) {
    console.error('List invites error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/invites/:id/accept
router.post('/:id/accept', async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get the invite
    const inviteResult = await client.query(
      `SELECT gi.*, u.username AS to_username_check
       FROM game_invites gi
       JOIN users u ON u.id = $2
       WHERE gi.id = $1
       FOR UPDATE`,
      [req.params['id'], req.userId],
    );

    const invite = inviteResult.rows[0] as
      | {
          id: string;
          game_id: string;
          to_username: string;
          to_username_check: string;
          status: string;
          from_user_id: string;
        }
      | undefined;

    if (!invite) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Invite not found' });
      return;
    }

    if (invite.to_username !== invite.to_username_check) {
      await client.query('ROLLBACK');
      res.status(403).json({ error: 'This invite is not for you' });
      return;
    }

    if (invite.status !== 'pending') {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Invite is no longer pending' });
      return;
    }

    // Get the game
    const gameResult = await client.query(
      'SELECT * FROM games WHERE id = $1 FOR UPDATE',
      [invite.game_id],
    );
    const game = gameResult.rows[0] as { id: string; game_state: GameState; player1_id: string } | undefined;

    if (!game) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    // Update game state: set player2 and fix tank player IDs
    const state: GameState = game.game_state;
    const updatedTanks = state.tanks.map((t, i) => {
      if (i === 1) return { ...t, playerId: req.userId as string };
      return t;
    });

    const newState: GameState = { ...state, tanks: updatedTanks };

    // We regenerate tank positions using placeTanks to ensure player2 is properly placed
    const updatedWithPlayer2 = placeTanks(
      newState.terrain,
      game.player1_id,
      req.userId as string,
    );
    newState.tanks = updatedWithPlayer2;

    await client.query(
      `UPDATE games
       SET player2_id = $1,
           game_state = $2,
           status = 'active',
           updated_at = NOW()
       WHERE id = $3`,
      [req.userId, JSON.stringify(newState), invite.game_id],
    );

    await client.query(
      `UPDATE game_invites SET status = 'accepted' WHERE id = $1`,
      [invite.id],
    );

    await client.query('COMMIT');

    const updatedResult = await pool.query(
      `SELECT g.*, u1.username AS player1_username, u2.username AS player2_username
       FROM games g
       LEFT JOIN users u1 ON g.player1_id = u1.id
       LEFT JOIN users u2 ON g.player2_id = u2.id
       WHERE g.id = $1`,
      [invite.game_id],
    );

    res.json(updatedResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Accept invite error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// POST /api/invites/:id/decline
router.post('/:id/decline', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userResult = await pool.query('SELECT username FROM users WHERE id = $1', [req.userId]);
    const me = userResult.rows[0] as { username: string } | undefined;
    if (!me) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const result = await pool.query(
      `UPDATE game_invites
       SET status = 'declined'
       WHERE id = $1 AND to_username = $2 AND status = 'pending'
       RETURNING *`,
      [req.params['id'], me.username],
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: 'Invite not found or already resolved' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Decline invite error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
