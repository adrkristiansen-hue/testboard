import "server-only";
import { db } from "./db";
import { can, canSeeItem, type ProjectAccess } from "./access";
import { loadProjectMeta } from "./projects";
import { categoryOf } from "@/lib/workflow";
import { parseJsonObject, parseStringArray } from "@/lib/fields";
import { DEFAULT_SCRIPT_INPUTS, parseInputs, parseSteps, readyForRetest, scriptKey, type RunOutcome, type ScriptStatus, type StepOutcome } from "@/lib/testscripts";
import type { RunCounts, RunView, ScriptSummary, ScriptView } from "@/lib/testrun-types";

/** Scripts in modules on locked boards are hidden like the work items there. */
export function scriptVisible(access: ProjectAccess, s: { moduleId: string | null }): boolean {
  return canSeeItem(access, s);
}

function countRuns(states: string[], testTypeStates: Map<string, string>): RunCounts {
  const c: RunCounts = { total: states.length, passed: 0, failed: 0, blocked: 0, open: 0 };
  for (const s of states) {
    const outcome = testTypeStates.get(s);
    if (outcome === "Passed") c.passed++;
    else if (outcome === "Failed") c.failed++;
    else if (outcome === "Blocked") c.blocked++;
    else c.open++;
  }
  return c;
}

export async function loadScriptSummaries(access: ProjectAccess): Promise<ScriptSummary[]> {
  const rows = await db.testScript.findMany({
    where: { projectId: access.projectId },
    orderBy: { number: "asc" },
    include: { runs: { select: { state: true, moduleId: true } } },
  });
  const outcomes = new Map([["Passed", "Passed"], ["Failed", "Failed"], ["Blocked", "Blocked"]]);
  return rows
    .filter((s) => scriptVisible(access, s))
    .map((s) => ({
      id: s.id,
      number: s.number,
      key: scriptKey(s.number),
      title: s.title,
      moduleId: s.moduleId,
      status: s.status as ScriptStatus,
      version: s.version,
      stepCount: parseSteps(s.steps).length,
      reviewNote: s.reviewNote,
      updatedAt: s.updatedAt.toISOString(),
      runs: countRuns(s.runs.filter((r) => canSeeItem(access, r)).map((r) => r.state), outcomes),
    }));
}

async function userNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map();
  const users = await db.user.findMany({ where: { id: { in: list } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

export async function loadScript(access: ProjectAccess, id: string): Promise<ScriptView | null> {
  const s = await db.testScript.findUnique({
    where: { id },
    include: {
      runs: {
        orderBy: { id: "desc" },
        select: { id: true, title: true, state: true, phaseId: true, moduleId: true, assignedToId: true, scriptVersion: true, attempts: { select: { startedAt: true, finishedAt: true } } },
      },
    },
  });
  if (!s || s.projectId !== access.projectId || !scriptVisible(access, s)) return null;
  const names = await userNames([s.approvedById, s.reviewById, s.createdById, s.updatedById]);
  return {
    id: s.id,
    number: s.number,
    key: scriptKey(s.number),
    title: s.title,
    moduleId: s.moduleId,
    role: s.role,
    preconditions: s.preconditions,
    testData: s.testData,
    inputs: parseInputs(s.inputs),
    steps: parseSteps(s.steps),
    status: s.status as ScriptStatus,
    version: s.version,
    approvedBy: s.approvedById ? (names.get(s.approvedById) ?? null) : null,
    approvedAt: s.approvedAt?.toISOString() ?? null,
    reviewNote: s.reviewNote,
    reviewBy: s.reviewById ? (names.get(s.reviewById) ?? null) : null,
    reviewAt: s.reviewAt?.toISOString() ?? null,
    createdBy: names.get(s.createdById) ?? null,
    updatedBy: names.get(s.updatedById) ?? null,
    updatedAt: s.updatedAt.toISOString(),
    runs: s.runs
      .filter((r) => canSeeItem(access, r))
      .map((r) => {
        const times = r.attempts.flatMap((a) => [a.startedAt, a.finishedAt]).filter((d): d is Date => !!d);
        return {
          id: r.id,
          title: r.title,
          state: r.state,
          phaseId: r.phaseId,
          assignedToId: r.assignedToId,
          scriptVersion: r.scriptVersion,
          attempts: r.attempts.length,
          lastActivity: times.length ? new Date(Math.max(...times.map((d) => d.getTime()))).toISOString() : null,
        };
      }),
  };
}

/** Who may record results on a run: the assignee (or anyone when unassigned) with "change state", or editors. */
export function canExecuteRun(access: ProjectAccess, item: { assignedToId: string | null }, userId: string): boolean {
  if (!can(access, "items.changeState")) return false;
  return !item.assignedToId || item.assignedToId === userId || can(access, "items.edit");
}

export async function loadRun(access: ProjectAccess, itemId: number, userId: string): Promise<RunView | null> {
  const item = await db.workItem.findUnique({
    where: { id: itemId },
    include: {
      script: { select: { id: true, number: true, version: true, status: true, reviewNote: true } },
      attempts: { orderBy: { number: "asc" }, include: { results: { orderBy: { stepIndex: "asc" } } } },
      children: { select: { id: true, title: true, typeId: true, state: true, moduleId: true } },
    },
  });
  if (!item || item.projectId !== access.projectId || !canSeeItem(access, item)) return null;
  const meta = await loadProjectMeta(item.projectId);
  if (!meta) return null;
  const type = meta.types.find((t) => t.id === item.typeId);
  if (type?.key !== "TEST_TASK") return null;
  const fields = parseJsonObject(item.fields);
  const testers = await userNames(item.attempts.map((a) => a.testerId));
  const raised = item.children
    .filter((c) => canSeeItem(access, c))
    .map((c) => {
      const t = meta.types.find((x) => x.id === c.typeId);
      return { id: c.id, title: c.title, typeKey: t?.key ?? "", typeName: t?.name ?? "", state: c.state, category: t ? (categoryOf({ states: t.states }, c.state) ?? "") : "" };
    })
    .filter((c) => c.typeKey === "DEFECT" || c.typeKey === "CHANGE_REQUEST");
  const attachmentIds = item.attempts.flatMap((a) => a.results.flatMap((r) => parseStringArray(r.attachments)));
  const attachments = attachmentIds.length
    ? await db.attachment.findMany({ where: { id: { in: attachmentIds }, workItemId: item.id }, select: { id: true, fileName: true, mimeType: true } })
    : [];
  const next =
    item.phaseId
      ? await db.workItem.findFirst({
          where: { projectId: item.projectId, typeId: item.typeId, phaseId: item.phaseId, assignedToId: userId, state: "Not started", id: { not: item.id }, AND: [access.lockedModules.size ? { OR: [{ moduleId: null }, { moduleId: { notIn: [...access.lockedModules] } }] } : {}] },
          orderBy: [{ priority: "asc" }, { id: "asc" }],
          select: { id: true },
        })
      : null;
  const canExecute = canExecuteRun(access, item, userId);
  return {
    item: { id: item.id, title: item.title, state: item.state, assignedToId: item.assignedToId, phaseId: item.phaseId, moduleId: item.moduleId },
    script: item.script
      ? { id: item.script.id, key: scriptKey(item.script.number), version: item.scriptVersion, currentVersion: item.script.version, status: item.script.status as ScriptStatus, reviewNote: item.script.reviewNote }
      : null,
    preconditions: item.descriptionText ?? "",
    testData: typeof fields.testData === "string" ? fields.testData : "",
    inputs: Array.isArray(fields.scriptInputs) ? parseInputs(fields.scriptInputs) : DEFAULT_SCRIPT_INPUTS,
    steps: parseSteps(fields.steps),
    attempts: item.attempts.map((a) => ({
      id: a.id,
      number: a.number,
      testerId: a.testerId,
      testerName: testers.get(a.testerId) ?? "",
      inputs: Object.fromEntries(Object.entries(parseJsonObject(a.inputs)).map(([k, v]) => [k, String(v ?? "")])),
      startedAt: a.startedAt.toISOString(),
      finishedAt: a.finishedAt?.toISOString() ?? null,
      outcome: (a.outcome as RunOutcome | null) ?? null,
      results: a.results.map((r) => ({
        stepIndex: r.stepIndex,
        outcome: r.outcome as StepOutcome,
        actual: r.actual,
        attachments: parseStringArray(r.attachments),
        raised: parseNumberArray(r.raised),
        carried: r.carried,
      })),
    })),
    raised,
    attachments,
    canExecute,
    canRaise: can(access, "items.create"),
    readyForRetest: readyForRetest(item.state, raised.filter((r) => r.typeKey === "DEFECT")),
    nextRunId: next?.id ?? null,
  };
}

export function parseNumberArray(json: string): number[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}
