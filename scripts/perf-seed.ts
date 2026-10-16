// Adds many fictional test tasks and defects to the demo project for performance checks.
// Usage: npx tsx scripts/perf-seed.ts [count=600]   (reset afterwards with: npm run db:seed)
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" }) });
const count = Number(process.argv[2] ?? 600);

async function main() {
  const project = await db.project.findFirstOrThrow({ orderBy: { createdAt: "asc" }, include: { types: { include: { states: { orderBy: { order: "asc" } } } }, modules: true, phases: true } });
  const users = await db.user.findMany({ where: { active: true } });
  // Put everything in the EC team's modules so a single board gets the load.
  const team = await db.team.findFirstOrThrow({ where: { projectId: project.id, name: "EC team" }, include: { modules: true } });
  const moduleIds = project.modules.filter((m) => team.modules.some((tm) => tm.moduleId === m.id || tm.moduleId === m.parentId)).map((m) => m.id);
  const types = project.types.filter((t) => t.key === "TEST_TASK" || t.key === "DEFECT");
  const start = Date.now();
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const type = types[i % types.length];
    const state = type.states[i % type.states.length];
    const created = new Date(now - ((i * 7) % 40) * 86_400_000);
    const row = await db.workItem.create({
      data: {
        projectId: project.id,
        typeId: type.id,
        title: `Perf ${type.key === "DEFECT" ? "defect" : "test"} ${i + 1}: ${["hire", "transfer", "termination", "pay change", "leave"][i % 5]} scenario`,
        state: state.name,
        assignedToId: users[i % users.length].id,
        moduleId: moduleIds[i % moduleIds.length],
        phaseId: project.phases[i % project.phases.length].id,
        priority: (i % 4) + 1,
        severity: type.key === "DEFECT" ? (i % 4) + 1 : null,
        tags: JSON.stringify(i % 3 ? [] : ["perf"]),
        fields: JSON.stringify(type.key === "TEST_TASK" ? { outcome: { Passed: "Passed", Failed: "Failed", Blocked: "Blocked" }[state.name] ?? "Not run" } : {}),
        boardOrder: i * 10,
        createdById: users[0].id,
        changedById: users[0].id,
        createdAt: created,
        changedAt: created,
        stateChangedAt: created,
      },
    });
    await db.historyEntry.create({ data: { workItemId: row.id, rev: 1, field: "__created", newValue: type.states[0].name, changedById: users[0].id, changedAt: created } });
    if (state.name !== type.states[0].name) {
      await db.historyEntry.create({ data: { workItemId: row.id, rev: 2, field: "state", oldValue: type.states[0].name, newValue: state.name, changedById: users[0].id, changedAt: new Date(created.getTime() + 86_400_000) } });
    }
  }
  console.log(`Added ${count} work items in ${((Date.now() - start) / 1000).toFixed(1)} s`);
}

main().finally(() => db.$disconnect());
