// One-shot local/cloud setup: create .env from .env.example if missing,
// apply migrations, generate the Prisma client and seed demo data.
import { existsSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";

if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  console.log("Created .env from .env.example");
}
const run = (cmd) => execSync(cmd, { stdio: "inherit" });
run("npx prisma migrate deploy");
run("npx prisma generate");
run("npx prisma db seed");
