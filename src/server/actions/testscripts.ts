"use server";

import { z } from "zod";
import { db } from "../db";
import { ForbiddenError, requireEditor, requireUser, type CurrentUser } from "../auth";
import { can, requirePermission, requireProjectAccess, requireVisibleItem } from "../access";
import { run, type ActionResult } from "../result";
import { createWorkItem, updateWorkItem, UserError } from "../workitems";
import { loadProjectMeta } from "../projects";
import { notifyBulkAssigned } from "../notify";
import { getStorage } from "../storage";
import { audit } from "../audit";
import { canExecuteRun, loadRun, loadScript, parseNumberArray, scriptVisible } from "../testscripts";
import { addComment } from "./items";
import { parseJsonObject, parseStringArray } from "@/lib/fields";
import { textToDoc, type RtDoc } from "@/lib/richtext";
import {
  afterEdit,
  attemptOutcome,
  carriedResults,
  cleanInputs,
  cleanSteps,
  DEFAULT_SCRIPT_INPUTS,
  missingInputs,
  parseInputs,
  parseSteps,
  planBlock,
  raisedFields,
  raisedTitle,
  sameContent,
  scriptKey,
  STEP_OUTCOMES,
  type ScriptStatus,
  type StepOutcome,
} from "@/lib/testscripts";
import type { RunView, ScriptView } from "@/lib/testrun-types";

// ---------------------------------------------------------------------------
// Scripts
// ---------------------------------------------------------------------------

const stepSchema = z.object({ action: z.string().max(4000), expected: z.string().max(4000) });
const scriptSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(200),
  moduleId: z.string().nullable(),
  role: z.string().max(200),
  preconditions: z.string().max(4000),
  testData: z.string().max(2000),
  inputs: z.array(z.string().max(60)).max(10),
  steps: z.array(stepSchema).max(200),
});

async function scriptFor(user: CurrentUser, id: string) {
  const s = await db.testScript.findUnique({ where: { id } });
  if (!s) throw new UserError("Test script not found.", "NOT_FOUND");
  const access = await requireProjectAccess(user, s.projectId);
  if (!scriptVisible(access, s)) throw new UserError("Test script not found.", "NOT_FOUND");
  return { script: s, access };
}

export async function getScript(id: string): Promise<ActionResult<ScriptView>> {
  return run(async () => {
    const user = await requireUser();
    const { access } = await scriptFor(user, id);
    const view = await loadScript(access, id);
    if (!view) throw new UserError("Test script not found.", "NOT_FOUND");
    return view;
  });
}

export async function saveScript(projectId: string, input: z.infer<typeof scriptSchema>): Promise<ActionResult<{ id: string; version: number; status: ScriptStatus }>> {
  return run(async () => {
    const user = await requireEditor();
    const access = await requirePermission(user, projectId, "scripts.edit");
    const p = scriptSchema.parse(input);
    if (p.moduleId) {
      const m = await db.module.findFirst({ where: { id: p.moduleId, projectId } });
      if (!m) throw new UserError("Unknown module.");
      if (access.lockedModules.has(p.moduleId)) throw new ForbiddenError("You cannot use that module.");
    }
    const content = { title: p.title, moduleId: p.moduleId, role: p.role.trim(), preconditions: p.preconditions.trim(), testData: p.testData.trim(), inputs: cleanInputs(p.inputs), steps: cleanSteps(p.steps) };
    const data = { ...content, inputs: JSON.stringify(content.inputs), steps: JSON.stringify(content.steps), updatedById: user.id };
    if (!p.id) {
      const max = await db.testScript.aggregate({ where: { projectId }, _max: { number: true } });
      const s = await db.testScript.create({ data: { ...data, projectId, number: (max._max.number ?? 0) + 1, createdById: user.id } });
      await audit(user.id, "script.create", "TestScript", s.id, { key: scriptKey(s.number) });
      return { id: s.id, version: s.version, status: s.status as ScriptStatus };
    }
    const { script } = await scriptFor(user, p.id);
    if (script.projectId !== projectId) throw new UserError("Test script not found.", "NOT_FOUND");
    const current = { title: script.title, moduleId: script.moduleId, role: script.role, preconditions: script.preconditions, testData: script.testData, inputs: parseInputs(script.inputs), steps: parseSteps(script.steps) };
    const changed = !sameContent(current, content);
    if (!changed) return { id: script.id, version: script.version, status: script.status as ScriptStatus };
    const next = afterEdit({ status: script.status as ScriptStatus, version: script.version }, changed);
    const s = await db.testScript.update({
      where: { id: script.id },
      data: { ...data, status: next.status, version: next.version, ...(next.clearApproval ? { approvedById: null, approvedAt: null } : {}) },
    });
    await audit(user.id, "script.update", "TestScript", s.id, { key: scriptKey(s.number), version: s.version });
    return { id: s.id, version: s.version, status: s.status as ScriptStatus };
  });
}

export async function setScriptStatus(id: string, status: ScriptStatus): Promise<ActionResult> {
  return run(async () => {
    const user = await requireEditor();
    const { script, access } = await scriptFor(user, id);
    if (!["DRAFT", "APPROVED", "RETIRED"].includes(status)) throw new UserError("Unknown status.");
    if (status === "APPROVED") {
      if (!can(access, "scripts.approve")) throw new ForbiddenError("Your role in this project does not allow approving test scripts.");
      if (parseSteps(script.steps).length === 0) throw new UserError("Add at least one step before approving.");
    } else if (!can(access, "scripts.edit")) throw new ForbiddenError("Your role in this project does not allow changing test scripts.");
    await db.testScript.update({
      where: { id },
      data: status === "APPROVED" ? { status, approvedById: user.id, approvedAt: new Date(), reviewNote: null, reviewById: null, reviewAt: null } : { status, approvedById: null, approvedAt: null },
    });
    await audit(user.id, `script.${status.toLowerCase()}`, "TestScript", id, { key: scriptKey(script.number), version: script.version });
    return undefined;
  });
}

export async function clearScriptReview(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireEditor();
    const { access } = await scriptFor(user, id);
    if (!can(access, "scripts.edit")) throw new ForbiddenError("Your role in this project does not allow changing test scripts.");
    await db.testScript.update({ where: { id }, data: { reviewNote: null, reviewById: null, reviewAt: null } });
    return undefined;
  });
}

export async function deleteScript(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireEditor();
    const { script, access } = await scriptFor(user, id);
    if (!can(access, "scripts.edit")) throw new ForbiddenError("Your role in this project does not allow changing test scripts.");
    const runs = await db.workItem.count({ where: { scriptId: id } });
    if (runs) throw new UserError(`${runs} test run(s) were planned from this script. Retire it instead.`, "IN_USE");
    await db.testScript.delete({ where: { id } });
    await audit(user.id, "script.delete", "TestScript", id, { key: scriptKey(script.number) });
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Planning: one test run per script × tester in a phase
// ---------------------------------------------------------------------------

const PLAN_MAX = 500;
const planSchema = z.object({
  projectId: z.string(),
  scriptIds: z.array(z.string()).min(1).max(PLAN_MAX),
  phaseId: z.string().min(1),
  testerIds: z.array(z.string()).min(1).max(100),
  dueDate: z.string().nullable(),
});

export interface PlanResult {
  created: number;
  ids: number[];
  skipped: { key: string; reason: "RETIRED" | "NOT_APPROVED" | "NO_STEPS" | "EXISTS"; tester?: string }[];
}

function runDescription(s: { preconditions: string; role: string }): RtDoc | null {
  const text = [s.role ? `Role: ${s.role}` : "", s.preconditions].filter(Boolean).join("\n");
  return text ? textToDoc(text) : null;
}

export async function planRuns(input: z.infer<typeof planSchema>): Promise<ActionResult<PlanResult>> {
  return run(async () => {
    const user = await requireEditor();
    const p = planSchema.parse(input);
    const access = await requirePermission(user, p.projectId, "items.create");
    if (p.testerIds.some((id) => id !== user.id) && !can(access, "items.assign")) throw new ForbiddenError("Your role does not allow assigning test runs to others.");
    const meta = await loadProjectMeta(p.projectId);
    if (!meta) throw new UserError("Unknown project.");
    const type = meta.types.find((t) => t.key === "TEST_TASK");
    if (!type || type.disabled) throw new UserError("This project has no enabled Test task type.");
    const phase = await db.phase.findFirst({ where: { id: p.phaseId, projectId: meta.id } });
    if (!phase) throw new UserError("Unknown phase.");
    const testers = p.testerIds.map((id) => meta.users.find((u) => u.id === id));
    if (testers.some((u) => !u)) throw new UserError("Testers must be members of this project.");
    if (p.scriptIds.length * p.testerIds.length > PLAN_MAX) throw new UserError(`At most ${PLAN_MAX} test runs at a time.`, "TOO_MANY");
    const scripts = await db.testScript.findMany({ where: { id: { in: p.scriptIds }, projectId: meta.id }, orderBy: { number: "asc" } });
    const existing = new Set(
      (await db.workItem.findMany({ where: { scriptId: { in: scripts.map((s) => s.id) }, phaseId: phase.id }, select: { scriptId: true, assignedToId: true } })).map((r) => `${r.scriptId}|${r.assignedToId}`),
    );

    const result: PlanResult = { created: 0, ids: [], skipped: [] };
    const byAssignee = new Map<string, number[]>();
    for (const s of scripts) {
      if (!scriptVisible(access, s)) continue;
      const steps = parseSteps(s.steps);
      const block = planBlock({ status: s.status as ScriptStatus, stepCount: steps.length }, phase);
      if (block) {
        result.skipped.push({ key: scriptKey(s.number), reason: block });
        continue;
      }
      for (const tester of testers) {
        if (existing.has(`${s.id}|${tester!.id}`)) {
          result.skipped.push({ key: scriptKey(s.number), reason: "EXISTS", tester: tester!.name });
          continue;
        }
        const id = await createWorkItem(
          {
            projectId: meta.id,
            typeId: type.id,
            title: s.title,
            description: runDescription(s),
            moduleId: s.moduleId,
            phaseId: phase.id,
            assignedToId: tester!.id,
            dueDate: p.dueDate,
            fields: { steps, testData: s.testData, scriptInputs: parseInputs(s.inputs), outcome: "Not run" },
          },
          user,
          { suppressAssignedNotification: true },
        );
        await db.workItem.update({ where: { id }, data: { scriptId: s.id, scriptVersion: s.version } });
        result.ids.push(id);
        byAssignee.set(tester!.id, [...(byAssignee.get(tester!.id) ?? []), id]);
      }
    }
    result.created = result.ids.length;
    if (result.created) await notifyBulkAssigned(user, byAssignee);
    await audit(user.id, "script.plan", "Phase", phase.id, { created: result.created, skipped: result.skipped.length });
    return result;
  });
}

// ---------------------------------------------------------------------------
// Running a test
// ---------------------------------------------------------------------------

export async function getRun(itemId: number): Promise<ActionResult<RunView>> {
  return run(async () => {
    const user = await requireUser();
    const { access } = await requireVisibleItem(user, itemId);
    const view = await loadRun(access, itemId, user.id);
    if (!view) throw new UserError("Test run not found.", "NOT_FOUND");
    return view;
  });
}

async function executableRun(user: CurrentUser, itemId: number) {
  const { item, access } = await requireVisibleItem(user, itemId);
  const meta = await loadProjectMeta(item.projectId);
  const type = meta?.types.find((t) => t.id === item.typeId);
  if (!meta || type?.key !== "TEST_TASK") throw new UserError("Only test tasks can be run.");
  if (!canExecuteRun(access, item, user.id)) throw new ForbiddenError("Only the assigned tester (or someone who can edit all work items) can record results.");
  return { item, access, meta, type };
}

async function openAttempt(itemId: number) {
  return db.testAttempt.findFirst({ where: { workItemId: itemId, finishedAt: null }, orderBy: { number: "desc" } });
}

/** Start (or continue) an attempt. Every input, such as the test user, must be filled in first. */
export async function startAttempt(itemId: number, inputs: Record<string, string>): Promise<ActionResult<RunView>> {
  return run(async () => {
    const user = await requireEditor();
    const { item, access, type } = await executableRun(user, itemId);
    const fields = parseJsonObject(item.fields);
    const labels = Array.isArray(fields.scriptInputs) ? parseInputs(fields.scriptInputs) : DEFAULT_SCRIPT_INPUTS;
    const values = Object.fromEntries(labels.map((l) => [l, String(inputs[l] ?? "").trim().slice(0, 500)]));
    const missing = missingInputs(labels, values);
    if (missing.length) throw new UserError(`Fill in ${missing.join(", ")} before you start.`, "MISSING_INPUTS");
    const steps = parseSteps(fields.steps);
    if (steps.length === 0) throw new UserError("This test has no steps.");

    const open = await openAttempt(itemId);
    if (open) {
      await db.testAttempt.update({ where: { id: open.id }, data: { inputs: JSON.stringify(values) } });
    } else {
      const last = await db.testAttempt.findFirst({ where: { workItemId: itemId }, orderBy: { number: "desc" }, include: { results: true } });
      const attempt = await db.testAttempt.create({ data: { workItemId: itemId, number: (last?.number ?? 0) + 1, testerId: user.id, inputs: JSON.stringify(values) } });
      // A retest starts at the failed step; earlier steps are carried over.
      if (last && last.outcome && last.outcome !== "Passed") {
        const carried = carriedResults(last.results.map((r) => ({ ...r, outcome: r.outcome as StepOutcome })), steps.length);
        if (carried.length)
          await db.testStepResult.createMany({ data: carried.map((r) => ({ attemptId: attempt.id, stepIndex: r.stepIndex, outcome: r.outcome, actual: r.actual, attachments: r.attachments, carried: true })) });
      }
      const inTest = type.states.find((s) => s.name === "In test");
      if (inTest && item.state !== inTest.name) await updateWorkItem(itemId, { state: inTest.name }, user);
    }
    return (await loadRun(access, itemId, user.id))!;
  });
}

const resultSchema = z.object({
  stepIndex: z.number().int().min(0),
  /** null clears the result, undefined keeps it */
  outcome: z.enum(STEP_OUTCOMES).nullable().optional(),
  actual: z.string().max(4000).optional(),
  attachmentId: z.string().optional(),
  removeAttachmentId: z.string().optional(),
});

/** Record or clear one step's result (and its actual result / screenshots). Saved immediately. */
export async function recordStep(itemId: number, input: z.infer<typeof resultSchema>): Promise<ActionResult<RunView>> {
  return run(async () => {
    const user = await requireEditor();
    const { item, access } = await executableRun(user, itemId);
    const r = resultSchema.parse(input);
    const steps = parseSteps(parseJsonObject(item.fields).steps);
    if (r.stepIndex >= steps.length) throw new UserError("Unknown step.");
    const attempt = await openAttempt(itemId);
    if (!attempt) throw new UserError("Start the test first.", "NOT_STARTED");
    const existing = await db.testStepResult.findUnique({ where: { attemptId_stepIndex: { attemptId: attempt.id, stepIndex: r.stepIndex } } });
    if (r.attachmentId) {
      const att = await db.attachment.findUnique({ where: { id: r.attachmentId } });
      if (!att || att.workItemId !== itemId) throw new UserError("Attachment not found.");
    }
    let attachments = parseStringArray(existing?.attachments ?? "[]");
    if (r.attachmentId && !attachments.includes(r.attachmentId)) attachments = [...attachments, r.attachmentId];
    if (r.removeAttachmentId) attachments = attachments.filter((a) => a !== r.removeAttachmentId);
    const outcome = r.outcome === undefined ? existing?.outcome : r.outcome;
    if (!outcome) {
      if (!existing) throw new UserError("Choose a result for this step first.");
      if (parseNumberArray(existing.raised).length) throw new UserError("Work items were raised from this step, so its result cannot be cleared.");
      await db.testStepResult.delete({ where: { id: existing.id } });
    } else {
      await db.testStepResult.upsert({
        where: { attemptId_stepIndex: { attemptId: attempt.id, stepIndex: r.stepIndex } },
        create: { attemptId: attempt.id, stepIndex: r.stepIndex, outcome, actual: r.actual ?? "", attachments: JSON.stringify(attachments) },
        update: { outcome, ...(r.actual !== undefined ? { actual: r.actual } : {}), attachments: JSON.stringify(attachments), carried: false },
      });
    }
    return (await loadRun(access, itemId, user.id))!;
  });
}

/** Finish the attempt: the run moves to Passed, Failed or Blocked. */
export async function finishAttempt(itemId: number): Promise<ActionResult<RunView>> {
  return run(async () => {
    const user = await requireEditor();
    const { item, access, type } = await executableRun(user, itemId);
    const steps = parseSteps(parseJsonObject(item.fields).steps);
    const attempt = await db.testAttempt.findFirst({ where: { workItemId: itemId, finishedAt: null }, include: { results: true } });
    if (!attempt) throw new UserError("Start the test first.", "NOT_STARTED");
    const outcome = attemptOutcome(attempt.results.map((r) => ({ stepIndex: r.stepIndex, outcome: r.outcome as StepOutcome })), steps.length);
    if (!outcome) throw new UserError("Record a result for every step first (or mark a step as failed or blocked).", "INCOMPLETE");
    await db.testAttempt.update({ where: { id: attempt.id }, data: { finishedAt: new Date(), outcome } });
    const target = type.states.some((s) => s.name === outcome) ? outcome : undefined;
    await updateWorkItem(itemId, { ...(target ? { state: target } : {}), fields: { outcome } }, user);
    return (await loadRun(access, itemId, user.id))!;
  });
}

const raiseSchema = z.object({
  stepIndex: z.number().int().min(0),
  kind: z.enum(["DEFECT", "CHANGE_REQUEST"]),
  title: z.string().trim().min(1).max(255).optional(),
  severity: z.number().int().min(1).max(4).optional(),
});

/** Create a defect or change request from a step, pre-filled and linked to the run as its child. */
export async function raiseFromStep(itemId: number, input: z.infer<typeof raiseSchema>): Promise<ActionResult<{ id: number }>> {
  return run(async () => {
    const user = await requireEditor();
    const { item, access, meta } = await executableRun(user, itemId);
    const r = raiseSchema.parse(input);
    if (!can(access, "items.create")) throw new ForbiddenError("Your role in this project does not allow creating work items.");
    const type = meta.types.find((t) => t.key === r.kind);
    if (!type || type.disabled) throw new UserError(`This project has no enabled ${r.kind === "DEFECT" ? "Defect" : "Change request"} type.`);
    const fields = parseJsonObject(item.fields);
    const steps = parseSteps(fields.steps);
    if (r.stepIndex >= steps.length) throw new UserError("Unknown step.");
    const attempt = await db.testAttempt.findFirst({ where: { workItemId: itemId }, orderBy: { number: "desc" } });
    if (!attempt) throw new UserError("Start the test first.", "NOT_STARTED");
    const result = await db.testStepResult.findUnique({ where: { attemptId_stepIndex: { attemptId: attempt.id, stepIndex: r.stepIndex } } });
    const script = item.scriptId ? await db.testScript.findUnique({ where: { id: item.scriptId }, select: { number: true } }) : null;
    const ctx = {
      runId: item.id,
      runTitle: item.title,
      scriptKey: script ? scriptKey(script.number) : null,
      preconditions: item.descriptionText ?? "",
      testData: typeof fields.testData === "string" ? fields.testData : "",
      inputs: Object.fromEntries(Object.entries(parseJsonObject(attempt.inputs)).map(([k, v]) => [k, String(v ?? "")])),
      steps,
      stepIndex: r.stepIndex,
      actual: result?.actual ?? "",
    };
    const id = await createWorkItem(
      {
        projectId: item.projectId,
        typeId: type.id,
        title: r.title ?? raisedTitle(ctx, r.kind),
        moduleId: item.moduleId,
        phaseId: item.phaseId,
        parentId: item.id,
        priority: item.priority,
        ...(r.kind === "DEFECT" ? { severity: r.severity ?? 2 } : {}),
        fields: raisedFields(ctx, r.kind),
      },
      user,
    );
    // Copy the step's screenshots so the defect stands on its own.
    for (const attId of parseStringArray(result?.attachments ?? "[]")) {
      const att = await db.attachment.findUnique({ where: { id: attId } });
      if (!att || att.workItemId !== item.id) continue;
      try {
        const storage = getStorage();
        const key = await storage.put(await storage.get(att.storageKey), att.fileName);
        await db.attachment.create({ data: { workItemId: id, fileName: att.fileName, mimeType: att.mimeType, size: att.size, storageKey: key, uploadedById: user.id } });
      } catch {
        // A missing file should not stop the defect from being created.
      }
    }
    if (result) await db.testStepResult.update({ where: { id: result.id }, data: { raised: JSON.stringify([...parseNumberArray(result.raised), id]) } });
    return { id };
  });
}

/** The tester thinks the script itself is wrong: flag it for review and leave a note on the run. */
export async function reportScriptIssue(itemId: number, stepIndex: number, note: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireEditor();
    const { item, access } = await requireVisibleItem(user, itemId);
    if (!can(access, "comments.add")) throw new ForbiddenError("Your role in this project does not allow comments.");
    const text = note.trim().slice(0, 2000);
    if (!text) throw new UserError("Describe what is wrong with the script.");
    if (!item.scriptId) throw new UserError("This test run was not planned from a script.");
    const script = await db.testScript.findUnique({ where: { id: item.scriptId } });
    if (!script) throw new UserError("Test script not found.");
    const line = `Step ${stepIndex + 1} (#${item.id}, ${user.name}): ${text}`;
    await db.testScript.update({
      where: { id: script.id },
      data: { reviewNote: [script.reviewNote, line].filter(Boolean).join("\n").slice(-4000), reviewById: user.id, reviewAt: new Date() },
    });
    const res = await addComment(item.id, textToDoc(`Script ${scriptKey(script.number)} needs review – step ${stepIndex + 1}: ${text}`));
    if (!res.ok) throw new UserError(res.error);
    return undefined;
  });
}
