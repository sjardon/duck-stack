const env = process.env || {};

export const dbConfig = {
  databaseUrl: env.DATABASE_URL,
};
