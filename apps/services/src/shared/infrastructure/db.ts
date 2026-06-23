import postgres from 'postgres';
import type { Sql } from 'postgres';
import { dbConfig } from '../configs/dbConfig.js';

if (!dbConfig.databaseUrl) {
  throw new Error('Missing required environment variable: DATABASE_URL');
}

export const db: Sql = postgres(dbConfig.databaseUrl);
