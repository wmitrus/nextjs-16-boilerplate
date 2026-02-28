import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/authorization/infrastructure/drizzle/schema.ts',
  out: './src/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
