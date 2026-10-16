import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Fallback lets `npm install` (postinstall: prisma generate) run before `npm run setup` has created .env.
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
});
