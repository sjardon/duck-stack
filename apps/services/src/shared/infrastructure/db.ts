import postgres from 'postgres';
import type { Sql } from 'postgres';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('Missing required environment variable: DATABASE_URL');
}

export const db: Sql = postgres(databaseUrl);
