import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { pool } from './db/pool';
import { INIT_SQL } from './db/migrations/init';
import authRouter from './routes/auth';
import gamesRouter from './routes/games';
import invitesRouter from './routes/invites';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

// API routes
app.use('/api/auth', authRouter);
app.use('/api/games', gamesRouter);
app.use('/api/invites', invitesRouter);

// Serve built client in production — find dist regardless of cwd or __dirname depth
const possibleClientDists = [
  path.resolve(__dirname, '../../../../client/dist'),  // prod: server/dist/server/src/ → up 4 to root
  path.resolve(__dirname, '../../../client/dist'),     // fallback
  path.resolve(process.cwd(), '../client/dist'),       // cwd-relative
];
const clientDist = possibleClientDists.find(fs.existsSync);
if (clientDist) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

async function runMigrations(): Promise<void> {
  await pool.query(INIT_SQL);
  console.log('Migrations applied.');
}

async function start(): Promise<void> {
  try {
    await runMigrations();
    app.listen(PORT, () => {
      console.log(`Tanks Online server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
