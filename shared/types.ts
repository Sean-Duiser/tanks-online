export interface Tank {
  playerId: string;
  x: number;              // pixel position on terrain
  y: number;              // pixel position (base of tank, sits on terrain)
  health: number;         // 0-100
  color: string;          // 'red' | 'blue'
  angle: number;          // degrees, 0-180 (barrel angle)
  power: number;          // 0-100
  movementRemaining: number; // px of movement budget remaining this turn (starts at 60)
}

export interface TerrainSegment {
  heights: number[];  // pixel height at each x column, array length = canvas width
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  weaponType: WeaponType;
}

export type WeaponType = 'shell' | 'bouncer' | 'cluster';

export type BiomeType = 'earth' | 'fire' | 'water' | 'air';

export type BotDifficulty = 'easy' | 'medium' | 'hard';

export interface GameState {
  tanks: Tank[];           // exactly 2 tanks
  terrain: number[];       // height array (same as TerrainSegment.heights)
  wind: number;            // -10 to 10 (negative = left, positive = right)
  biome: BiomeType;
  isBot?: boolean;
  botDifficulty?: BotDifficulty;
  turnNumber: number;
  currentPlayerIndex: number; // 0 or 1
  lastShot?: {
    angle: number;
    power: number;
    weaponType: WeaponType;
    path: Array<{ x: number; y: number }>; // for replay animation
    hitX: number;
    hitY: number;
    damageDealt: number;
    terrainAfter: number[]; // terrain post-destruction
  };
}

export interface User {
  id: string;
  username: string;
  email: string;
}

export interface GameRecord {
  id: string;
  player1_id: string;
  player2_id: string | null;
  current_turn_player_id: string;
  game_state: GameState;
  status: 'waiting' | 'active' | 'finished';
  winner_id: string | null;
  turn_number: number;
  created_at: string;
  updated_at: string;
  // joined fields
  player1_username?: string;
  player2_username?: string;
}

export interface GameInvite {
  id: string;
  from_user_id: string;
  to_username: string;
  game_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  from_username?: string;
}

export interface ApiError {
  error: string;
}
