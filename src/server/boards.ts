import "server-only";
import { db } from "./db";
import { parseStateMap, type ColumnDef } from "@/lib/board";
import type { PhaseLite } from "@/lib/types";

export async function loadColumns(teamId: string): Promise<ColumnDef[]> {
  const cols = await db.boardColumn.findMany({ where: { teamId }, orderBy: { order: "asc" } });
  return cols.map((c) => ({ id: c.id, name: c.name, order: c.order, wipLimit: c.wipLimit, split: c.split, stateMap: parseStateMap(c.stateMap) }));
}

/** The phase running today, else the next upcoming one, else the last one. */
export function currentPhase(phases: PhaseLite[], now = new Date()): PhaseLite | undefined {
  const t = now.getTime();
  const running = phases.find((p) => p.startDate && p.endDate && new Date(p.startDate).getTime() <= t && t <= new Date(p.endDate).getTime() + 86_400_000);
  if (running) return running;
  const upcoming = phases.filter((p) => p.startDate && new Date(p.startDate).getTime() > t).sort((a, b) => new Date(a.startDate!).getTime() - new Date(b.startDate!).getTime())[0];
  return upcoming ?? phases.at(-1);
}
