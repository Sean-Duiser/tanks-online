import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { generateTerrain, placeTanks } from '../game/terrain';
import { computeBotShot } from '../game/bot';
import { simulateShot, getTerrainHeight } from '../../../shared/physics';
import type { BiomeType, BotDifficulty, GameState, WeaponType } from '../../../shared/types';

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
    const { biome: requestedBiome, vsBot, botDifficulty: rawDiff } = req.body as {
      biome?: string;
      vsBot?: boolean;
      botDifficulty?: string;
    };
    const BIOMES: BiomeType[] = ['earth', 'fire', 'water', 'air'];
    const biome: BiomeType = BIOMES.includes(requestedBiome as BiomeType)
      ? (requestedBiome as BiomeType)
      : BIOMES[Math.floor(Math.random() * BIOMES.length)];

    const isBotGame = vsBot === true;
    const DIFFS: BotDifficulty[] = ['easy', 'medium', 'hard'];
    const botDiff: BotDifficulty = DIFFS.includes(rawDiff as BotDifficulty)
      ? (rawDiff as BotDifficulty)
      : 'medium';

    const terrain = generateTerrain(biome);
    // Bot tank uses '__bot__' as player ID so it's never confused with a real user
    const p2Id = isBotGame ? '__bot__' : '__tbd__';
    const tanks = placeTanks(terrain, req.userId as string, p2Id);

    const initialState: GameState = {
      tanks,
      terrain,
      biome,
      isBot: isBotGame,
      ...(isBotGame ? { botDifficulty: botDiff } : {}),
      wind: Math.round((Math.random() * 20 - 10) * 10) / 10,
      turnNumber: 0,
      currentPlayerIndex: 0,
    };

    // Bot games start active immediately — no invite needed
    const status = isBotGame ? 'active' : 'waiting';

    const result = await pool.query(
      `INSERT INTO games
         (player1_id, current_turn_player_id, game_state, status, bot_difficulty)
       VALUES ($1, $1, $2, $3, $4)
       RETURNING *`,
      [req.userId, JSON.stringify(initialState), status, isBotGame ? botDiff : null],
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
  const { angle, power, weaponType, movement } = req.body as {
    angle?: number;
    power?: number;
    weaponType?: WeaponType;
    movement?: number;
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

  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 500;
  const MAX_MOVEMENT = 60;

  // Validate movement if provided
  const moveDelta = movement ?? 0;
  if (Math.abs(moveDelta) > MAX_MOVEMENT) {
    res.status(400).json({ error: `movement must be within ±${MAX_MOVEMENT}px` });
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
       FOR UPDATE OF g`,
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
    const shooterIndex = state.currentPlayerIndex;
    const currentTank = state.tanks[shooterIndex];

    // Apply movement: clamp to canvas bounds
    const newX = Math.max(0, Math.min(CANVAS_WIDTH - 1, currentTank.x + moveDelta));
    if (newX !== currentTank.x + moveDelta && moveDelta !== 0) {
      // Movement would push tank out of bounds — clamp silently (client already clamps)
    }
    const newY = CANVAS_HEIGHT - getTerrainHeight(state.terrain, newX);

    // Build state with moved tank before simulating the shot
    const movedState: GameState = {
      ...state,
      tanks: state.tanks.map((t, i) =>
        i === shooterIndex ? { ...t, x: newX, y: newY, movementRemaining: 0 } : t,
      ),
    };

    // Run physics
    const shotResult = simulateShot(movedState, angle, power, weaponType);

    // Update tank health
    const targetIndex = shooterIndex === 0 ? 1 : 0;
    const nextPlayerIndex = shooterIndex === 0 ? 1 : 0;
    const newWind = Math.round(Math.max(-10, Math.min(10, state.wind + (Math.random() * 4 - 2))) * 10) / 10;

    const newTanks = movedState.tanks.map((t, i) => {
      if (i === targetIndex) {
        return { ...t, health: Math.max(0, t.health - shotResult.damageDealt), movementRemaining: 60 };
      }
      return { ...t, movementRemaining: i === nextPlayerIndex ? 60 : 0 };
    });

    const newState: GameState = {
      tanks: newTanks,
      terrain: shotResult.terrainAfter,
      wind: newWind,
      biome: state.biome,
      ...(state.isBot ? { isBot: true, botDifficulty: state.botDifficulty } : {}),
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

    const isFinishedByHuman = newTanks[targetIndex].health <= 0;

    // For bot games: auto-fire the bot in the same request cycle
    let finalState: GameState = newState;
    let humanShotSnapshot: GameState | null = null;
    let isFinishedByBot = false;

    if (!isFinishedByHuman && state.isBot === true) {
      humanShotSnapshot = newState; // save human's intermediate state for client animation
      const botDifficulty: BotDifficulty = (state.botDifficulty as BotDifficulty) ?? 'medium';
      const botMove = computeBotShot(newState, botDifficulty);

      // Apply bot movement before simulating shot (guard against undefined if cached old bot)
      const botTankIndex = newState.currentPlayerIndex;
      const botTank = newState.tanks[botTankIndex];
      const botMoveDelta = botMove.movement ?? 0;
      const botNewX = Math.max(0, Math.min(CANVAS_WIDTH - 1, botTank.x + botMoveDelta));
      const botNewY = CANVAS_HEIGHT - getTerrainHeight(newState.terrain, botNewX);
      const botMovedState: GameState = {
        ...newState,
        tanks: newState.tanks.map((t, i) =>
          i === botTankIndex ? { ...t, x: botNewX, y: botNewY } : t,
        ),
      };

      const botResult = simulateShot(botMovedState, botMove.angle, botMove.power, botMove.weaponType);

      // Bot (index 1) always shoots at the human (index 0)
      const botTargetIndex = 0;
      const afterBotTanks = botMovedState.tanks.map((t, i) => ({
        ...t,
        health: i === botTargetIndex ? Math.max(0, t.health - botResult.damageDealt) : t.health,
        movementRemaining: 60,
      }));

      isFinishedByBot = afterBotTanks[botTargetIndex].health <= 0;
      const windAfterBot = Math.round(Math.max(-10, Math.min(10, newState.wind + (Math.random() * 4 - 2))) * 10) / 10;

      finalState = {
        tanks: afterBotTanks,
        terrain: botResult.terrainAfter,
        wind: windAfterBot,
        biome: state.biome,
        isBot: true,
        botDifficulty: state.botDifficulty,
        turnNumber: newState.turnNumber + 1,
        currentPlayerIndex: 0, // always back to human after bot fires
        lastShot: {
          angle: botMove.angle,
          power: botMove.power,
          weaponType: botMove.weaponType,
          path: botResult.path,
          hitX: botResult.hitX,
          hitY: botResult.hitY,
          damageDealt: botResult.damageDealt,
          terrainAfter: botResult.terrainAfter,
        },
      };
    }

    const isFinished = isFinishedByHuman || isFinishedByBot;
    const newStatus = isFinished ? 'finished' : 'active';
    // Human win → winner_id = human; bot win → winner_id stays NULL
    const winnerId = isFinishedByHuman ? req.userId : null;

    const nextTurnPlayerId: string = state.isBot
      ? (game.player1_id as string) // bot games: human always goes next
      : isFinished
        ? (req.userId as string)
        : (game[nextPlayerIndex === 0 ? 'player1_id' : 'player2_id'] as string);

    await client.query(
      `UPDATE games
       SET game_state             = $1,
           status                 = $2,
           winner_id              = COALESCE($3, winner_id),
           turn_number            = $4,
           current_turn_player_id = $5,
           updated_at             = NOW()
       WHERE id = $6`,
      [
        JSON.stringify(finalState),
        newStatus,
        winnerId,
        finalState.turnNumber,
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

    // Include humanShotSnapshot so the client can animate both shots sequentially
    res.json({ game: updatedResult.rows[0], humanShotSnapshot });
  } catch (err) {
    await client.query('ROLLBACK');
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Turn error:', err);
    res.status(500).json({ error: `Internal server error: ${msg}` });
  } finally {
    client.release();
  }
});

export default router;
