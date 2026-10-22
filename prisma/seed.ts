// Demo data: one fictional HR system implementation project.
// All people, emails and data are fictional. Run with `npm run db:seed`.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { DEFAULT_COLUMNS, DEFAULT_TYPES, columnStateMap, naturalPath } from "../src/lib/process";
import { DEFAULT_CARD_CONFIG } from "../src/lib/cards";
import { extractMentions, plainTextToMentionDoc } from "../src/lib/mentions";
import { docToText, textToDoc } from "../src/lib/richtext";
import type { SwimlaneConfig } from "../src/lib/swimlanes";
import { templateFromProject } from "../src/server/template-build";
import { DEFAULT_ROLES } from "../src/lib/permissions";

const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" }) });

// Fixed "today" so demo data (overdue items, ageing) looks the same every time it is seeded.
const NOW = new Date();
const DAY = 86_400_000;
const daysAgo = (d: number, hour = 10) => {
  const x = new Date(NOW.getTime() - d * DAY);
  x.setHours(hour, (d * 37) % 60, 0, 0);
  return x;
};
const daysFromNow = (d: number) => {
  const x = new Date(NOW.getTime() + d * DAY);
  x.setHours(0, 0, 0, 0);
  return x;
};

async function reset() {
  // Order matters for SQLite foreign keys.
  await db.processTemplate.deleteMany();
  await db.notification.deleteMany();
  await db.follow.deleteMany();
  await db.mention.deleteMany();
  await db.commentReaction.deleteMany();
  await db.attachment.deleteMany();
  await db.comment.deleteMany();
  await db.historyEntry.deleteMany();
  await db.workItemLink.deleteMany();
  await db.workItem.updateMany({ data: { parentId: null } });
  await db.workItem.deleteMany();
  await db.savedQuery.deleteMany();
  await db.boardColumn.deleteMany();
  await db.teamModule.deleteMany();
  await db.teamMember.deleteMany();
  await db.team.deleteMany();
  await db.workflowState.deleteMany();
  await db.workItemType.deleteMany();
  await db.phase.deleteMany();
  await db.module.updateMany({ data: { parentId: null } });
  await db.module.deleteMany();
  await db.project.deleteMany();
  await db.apiToken.deleteMany();
  await db.auditLog.deleteMany();
  await db.processTemplate.deleteMany();
  await db.user.deleteMany();
  // Reset the work item id counter so demo IDs start at 1.
  await db.$executeRawUnsafe(`DELETE FROM sqlite_sequence WHERE name = 'WorkItem'`).catch(() => undefined);
}

async function main() {
  await reset();
  const passwordHash = bcrypt.hashSync("demo1234", 10);

  const userDefs = [
    { key: "siri", name: "Siri Holmvik", email: "siri.holmvik@demo.test", role: "ADMIN", color: "#0f766e" },
    { key: "erik", name: "Erik Brattland", email: "erik.brattland@demo.test", role: "TEST_LEAD", color: "#1d4ed8" },
    { key: "nora", name: "Nora Lindeberg", email: "nora.lindeberg@demo.test", role: "MEMBER", color: "#9333ea" },
    { key: "jonas", name: "Jonas Fjellstad", email: "jonas.fjellstad@demo.test", role: "MEMBER", color: "#c2410c" },
    { key: "maja", name: "Maja Sørli", email: "maja.sorli@demo.test", role: "MEMBER", color: "#be185d" },
    { key: "lars", name: "Lars Myrvold", email: "lars.myrvold@demo.test", role: "MEMBER", color: "#15803d" },
  ] as const;
  // Organisations: the consultancy (internal) and the customer whose business testers take part.
  const sariba = await db.organization.create({ data: { name: "Sariba", internal: true } });
  const customer = await db.organization.create({ data: { name: "Fjordvik kommune (demo)" } });
  const orgOf: Record<string, string> = { siri: sariba.id, erik: sariba.id, nora: sariba.id, jonas: sariba.id, maja: customer.id, lars: customer.id };
  const U: Record<string, string> = {};
  for (const u of userDefs) {
    const row = await db.user.create({ data: { name: u.name, email: u.email, role: u.role, color: u.color, passwordHash, organizationId: orgOf[u.key] } });
    U[u.key] = row.id;
  }

  const project = await db.project.create({
    data: { key: "HRS", name: "HR system implementation", description: "Fictional SAP SuccessFactors implementation used as demo data." },
  });

  // Project roles and members: Sariba staff as project lead / consultants, the customer's testers as customer testers.
  const R: Record<string, string> = {};
  for (const [i, r] of DEFAULT_ROLES.entries()) {
    R[r.key] = (await db.projectRole.create({ data: { projectId: project.id, name: r.name, permissions: JSON.stringify(r.permissions), order: i } })).id;
  }
  const roleOf: Record<string, string> = { siri: "LEAD", erik: "LEAD", nora: "CONSULTANT", jonas: "CONSULTANT", maja: "CUSTOMER_TESTER", lars: "CUSTOMER_TESTER" };
  for (const u of userDefs) await db.projectMember.create({ data: { projectId: project.id, userId: U[u.key], roleId: R[roleOf[u.key]] } });

  // Modules (Area Paths)
  const M: Record<string, string> = {};
  const mod = async (key: string, name: string, order: number, parent?: string) => {
    const row = await db.module.create({ data: { projectId: project.id, name, order, parentId: parent ? M[parent] : null } });
    M[key] = row.id;
  };
  await mod("ec", "Employee Central", 0);
  await mod("hire", "Hire", 0, "ec");
  await mod("job", "Job change", 1, "ec");
  await mod("term", "Termination", 2, "ec");
  await mod("rec", "Recruiting", 1);
  await mod("onb", "Onboarding", 2);
  await mod("care", "Care", 3);
  await mod("rep", "Reporting", 4);
  await mod("ecp", "ECP", 5);

  // Phases (Iteration Paths): SIT 1 finished, SIT 2 running, UAT upcoming
  const P: Record<string, string> = {};
  const phase = async (key: string, name: string, order: number, start: Date, end: Date) => {
    P[key] = (await db.phase.create({ data: { projectId: project.id, name, order, startDate: start, endDate: end } })).id;
  };
  await phase("sit1", "SIT 1", 0, daysFromNow(-45), daysFromNow(-22));
  await phase("sit2", "SIT 2", 1, daysFromNow(-20), daysFromNow(8));
  await phase("uat", "UAT", 2, daysFromNow(11), daysFromNow(39));

  // Types and workflows
  const T: Record<string, string> = {};
  for (const [i, t] of DEFAULT_TYPES.entries()) {
    const row = await db.workItemType.create({
      data: {
        projectId: project.id,
        key: t.key,
        name: t.name,
        icon: t.icon,
        color: t.color,
        order: i,
        fields: JSON.stringify(t.fields),
        transitions: JSON.stringify(t.workflow.transitions ?? {}),
        states: { create: t.workflow.states.map((s, j) => ({ name: s.name, category: s.category, color: s.color ?? "#94a3b8", order: s.order ?? j })) },
      },
    });
    T[t.key] = row.id;
  }
  const typeIdByKey = new Map(Object.entries(T));

  // Teams with board configuration
  const ecLanes: SwimlaneConfig = {
    mode: "rules",
    defaultLaneName: "Standard",
    rules: [{ id: "expedite", name: "Expedite", color: "#dc2626", when: { logic: "and", clauses: [{ field: "priority", op: "eq", value: 1 }] } }],
  };
  const teamDefs = [
    { key: "ec", name: "EC team", modules: ["ec", "care"], members: ["erik", "nora", "maja"], lanes: ecLanes },
    { key: "talent", name: "Talent team", modules: ["rec", "onb"], members: ["jonas", "maja", "erik"], lanes: { mode: "module" } as SwimlaneConfig },
    // Payroll is locked: pay and termination cases are only visible to the board's members.
    { key: "payroll", name: "Payroll team", modules: ["ecp", "rep", "term"], members: ["lars", "nora", "erik"], lanes: { mode: "assignee" } as SwimlaneConfig, restricted: true },
  ];
  const TEAM: Record<string, string> = {};
  for (const td of teamDefs) {
    const team = await db.team.create({
      data: {
        projectId: project.id,
        name: td.name,
        restricted: "restricted" in td ? !!td.restricted : false,
        swimlanes: JSON.stringify(td.lanes),
        cardConfig: JSON.stringify(DEFAULT_CARD_CONFIG),
        members: { create: td.members.map((m) => ({ userId: U[m] })) },
        modules: { create: td.modules.map((m) => ({ moduleId: M[m], includeChildren: true })) },
        columns: {
          create: DEFAULT_COLUMNS.map((c, i) => ({
            name: c.name,
            order: i,
            wipLimit: c.wipLimit,
            split: c.split,
            stateMap: JSON.stringify(columnStateMap(c, typeIdByKey)),
          })),
        },
      },
    });
    TEAM[td.key] = team.id;
  }

  const directory = {
    users: userDefs.map((u) => ({ id: U[u.key], name: u.name, email: u.email })),
    teams: teamDefs.map((t) => ({ id: TEAM[t.key], name: t.name })),
  };

  // ---------------------------------------------------------------------------
  // Work items
  // ---------------------------------------------------------------------------
  interface ItemDef {
    ref: string;
    type: keyof typeof T | string;
    title: string;
    module: string;
    phase: string;
    state: string;
    assignee?: string;
    priority?: number;
    severity?: number;
    tags?: string[];
    due?: number; // days from now (negative = overdue)
    created: number; // days ago
    parent?: string;
    description?: string;
    fields?: Record<string, unknown>;
    createdBy?: string;
  }

  const steps = (...pairs: [string, string][]) => pairs.map(([action, expected]) => ({ action, expected }));

  const items: ItemDef[] = [
    // Test tasks — Employee Central
    { ref: "tt-hire-perm", type: "TEST_TASK", title: "Hire new permanent employee – Norway", module: "hire", phase: "sit2", state: "Passed", assignee: "maja", priority: 1, created: 19, tags: ["regression"],
      fields: { steps: steps(["Open Add New Employee and select company NO01", "Company and event reason are prefilled"], ["Fill personal, job and compensation info", "All mandatory fields validated"], ["Submit for approval", "Workflow routed to HR"]), expectedResult: "Employee is created with status Active and appears in the org chart.", testData: "Fictional person: Test Testesen" } },
    { ref: "tt-hire-temp", type: "TEST_TASK", title: "Hire temporary employee with contract end date", module: "hire", phase: "sit2", state: "Failed", assignee: "maja", priority: 2, created: 18,
      fields: { steps: steps(["Start Add New Employee with event reason 'Temporary hire'", "Contract type field shows 'Temporary'"], ["Enter contract end date 6 months ahead", "Date is accepted"], ["Save and reopen employee file", "Contract end date is shown"]), expectedResult: "Contract end date is stored and visible in Job Information." } },
    { ref: "tt-rehire", type: "TEST_TASK", title: "Rehire former employee keeping original hire date", module: "hire", phase: "sit2", state: "In test", assignee: "nora", created: 14, tags: ["rehire"],
      fields: { steps: steps(["Search for terminated employee", "Rehire option is available"], ["Rehire with new start date", "Original hire date is retained"]), expectedResult: "Seniority date equals original hire date." } },
    { ref: "tt-hire-future", type: "TEST_TASK", title: "Hire with future start date (pending hire)", module: "hire", phase: "sit2", state: "Not started", assignee: "maja", due: -2, created: 12 },
    { ref: "tt-promo", type: "TEST_TASK", title: "Promotion with pay change", module: "job", phase: "sit2", state: "Passed", assignee: "maja", created: 17 },
    { ref: "tt-transfer", type: "TEST_TASK", title: "Transfer between legal entities", module: "job", phase: "sit2", state: "Blocked", assignee: "nora", priority: 1, created: 16, tags: ["cross-entity"] },
    { ref: "tt-manager", type: "TEST_TASK", title: "Change of manager – approval workflow", module: "job", phase: "sit2", state: "In test", assignee: "maja", created: 9 },
    { ref: "tt-term-vol", type: "TEST_TASK", title: "Voluntary termination with last working day", module: "term", phase: "sit2", state: "Passed", assignee: "lars", created: 15 },
    { ref: "tt-term-holiday", type: "TEST_TASK", title: "Termination – payout of holiday pay", module: "term", phase: "sit2", state: "Failed", assignee: "lars", priority: 1, created: 13, tags: ["payroll-impact"] },
    { ref: "tt-retire", type: "TEST_TASK", title: "Retirement termination reason codes", module: "term", phase: "sit1", state: "Passed", assignee: "nora", created: 40 },
    // Talent
    { ref: "tt-req", type: "TEST_TASK", title: "Create job requisition and route for approval", module: "rec", phase: "sit2", state: "Passed", assignee: "jonas", created: 18 },
    { ref: "tt-apply", type: "TEST_TASK", title: "Candidate applies via career site", module: "rec", phase: "sit2", state: "In test", assignee: "maja", created: 10 },
    { ref: "tt-offer", type: "TEST_TASK", title: "Offer letter generation in Norwegian", module: "rec", phase: "sit2", state: "Failed", assignee: "jonas", created: 11, tags: ["localisation"] },
    { ref: "tt-onb-tasks", type: "TEST_TASK", title: "New hire onboarding tasks for manager", module: "onb", phase: "sit2", state: "Not started", assignee: "jonas", due: 3, created: 8 },
    { ref: "tt-onb-equip", type: "TEST_TASK", title: "Equipment request in onboarding", module: "onb", phase: "sit2", state: "Blocked", assignee: "maja", created: 9 },
    { ref: "tt-care-bank", type: "TEST_TASK", title: "Employee case: change of bank account", module: "care", phase: "sit2", state: "Not started", assignee: "nora", created: 6 },
    // Reporting / ECP
    { ref: "tt-headcount", type: "TEST_TASK", title: "Headcount report by legal entity", module: "rep", phase: "sit2", state: "Passed", assignee: "lars", created: 17 },
    { ref: "tt-payrun", type: "TEST_TASK", title: "Payroll run with new hires", module: "ecp", phase: "sit2", state: "In test", assignee: "lars", priority: 1, created: 12 },
    { ref: "tt-overtime", type: "TEST_TASK", title: "Overtime replication to ECP", module: "ecp", phase: "sit2", state: "Failed", assignee: "lars", created: 11 },
    { ref: "tt-uat-e2e", type: "TEST_TASK", title: "UAT: End-to-end hire to first payslip", module: "hire", phase: "uat", state: "Not started", created: 3, tags: ["e2e"] },

    // Defects
    { ref: "d-enddate", type: "DEFECT", title: "Contract end date not saved for temporary hire", module: "hire", phase: "sit2", state: "Active", assignee: "nora", severity: 2, priority: 2, parent: "tt-hire-temp", created: 12, createdBy: "maja",
      fields: { stepsToReproduce: "1. Hire temporary employee\n2. Enter contract end date\n3. Save and reopen", expected: "End date is saved.", actual: "Field is empty after save.", environment: "TEST" } },
    { ref: "d-probation", type: "DEFECT", title: "Probation period end date calculated wrong", module: "hire", phase: "sit2", state: "Fixed", assignee: "nora", severity: 3, created: 15, createdBy: "maja",
      fields: { expected: "Hire date + 6 months", actual: "Hire date + 6 months + 1 day", environment: "TEST" } },
    { ref: "d-dup-employment", type: "DEFECT", title: "Legal entity transfer creates duplicate employment", module: "job", phase: "sit2", state: "Active", assignee: "nora", severity: 1, priority: 1, due: -3, created: 14, createdBy: "nora", tags: ["cross-entity"],
      fields: { stepsToReproduce: "Transfer employee from NO01 to NO02 with event 'Legal entity transfer'", expected: "One active employment in NO02", actual: "Two active employments", environment: "TEST" } },
    { ref: "d-orgchart", type: "DEFECT", title: "Manager change not reflected in org chart", module: "job", phase: "sit2", state: "Ready for retest", assignee: "maja", severity: 3, created: 8, createdBy: "maja" },
    { ref: "d-holiday", type: "DEFECT", title: "Holiday pay not included in final settlement", module: "term", phase: "sit2", state: "New", assignee: "lars", severity: 1, priority: 1, parent: "tt-term-holiday", created: 5, createdBy: "lars", tags: ["payroll-impact"],
      fields: { expected: "Final settlement includes accrued holiday pay", actual: "Holiday pay line missing", environment: "TEST" } },
    { ref: "d-reason", type: "DEFECT", title: "Termination reason list missing 'End of contract'", module: "term", phase: "sit1", state: "Closed", assignee: "nora", severity: 3, created: 38, createdBy: "nora" },
    { ref: "d-aeoe", type: "DEFECT", title: "Norwegian characters (æøå) broken in offer letter PDF", module: "rec", phase: "sit2", state: "Active", assignee: "jonas", severity: 2, parent: "tt-offer", created: 9, createdBy: "jonas", tags: ["localisation"] },
    { ref: "d-email-twice", type: "DEFECT", title: "Requisition approval email sent twice", module: "rec", phase: "sit2", state: "Rejected", assignee: "jonas", severity: 4, created: 16, createdBy: "maja" },
    { ref: "d-equip-form", type: "DEFECT", title: "Onboarding equipment form not visible for manager", module: "onb", phase: "sit2", state: "New", severity: 2, priority: 2, due: -1, created: 7, createdBy: "maja" },
    { ref: "d-overtime", type: "DEFECT", title: "Overtime hours not replicated to ECP", module: "ecp", phase: "sit2", state: "Active", assignee: "lars", severity: 1, priority: 1, parent: "tt-overtime", created: 9, createdBy: "lars", tags: ["integration"] },
    { ref: "d-costcentre", type: "DEFECT", title: "Payslip shows wrong cost centre", module: "ecp", phase: "sit2", state: "Fixed", assignee: "lars", severity: 2, created: 13, createdBy: "lars" },
    { ref: "d-contingent", type: "DEFECT", title: "Headcount report excludes contingent workers", module: "rep", phase: "sit1", state: "Closed", assignee: "lars", severity: 3, created: 35, createdBy: "lars" },

    // Questions
    { ref: "q-seniority", type: "QUESTION", title: "Should rehires keep their original seniority date?", module: "hire", phase: "sit2", state: "Open", assignee: "erik", created: 4, createdBy: "nora" },
    { ref: "q-holiday", type: "QUESTION", title: "Which termination reasons trigger holiday pay payout?", module: "term", phase: "sit2", state: "Awaiting answer", assignee: "lars", due: 2, created: 6, createdBy: "lars" },
    { ref: "q-linkedin", type: "QUESTION", title: "Is the LinkedIn integration in scope for SIT 2?", module: "rec", phase: "sit2", state: "Answered", assignee: "jonas", created: 12, createdBy: "jonas",
      fields: { answer: "No – LinkedIn integration is planned for UAT. Test with manual applications in SIT 2." } },
    { ref: "q-equip-approval", type: "QUESTION", title: "Who approves equipment requests above 10 000 NOK?", module: "onb", phase: "sit2", state: "Closed", assignee: "maja", created: 15, createdBy: "maja" },

    // Change requests
    { ref: "cr-hybrid", type: "CHANGE_REQUEST", title: "Add 'Hybrid' work location to job information", module: "job", phase: "sit2", state: "New", assignee: "erik", priority: 3, created: 5, createdBy: "maja", fields: { decision: "Pending", estimateHours: 6 } },
    { ref: "cr-approval", type: "CHANGE_REQUEST", title: "Extra approval step for salary increase above 10 %", module: "job", phase: "sit2", state: "Active", assignee: "nora", priority: 2, created: 10, createdBy: "erik", fields: { decision: "Approved", estimateHours: 16 } },
    { ref: "cr-union", type: "CHANGE_REQUEST", title: "Custom field for union membership in ECP", module: "ecp", phase: "sit2", state: "Resolved", assignee: "lars", priority: 3, created: 14, createdBy: "lars", fields: { decision: "Approved", estimateHours: 8 } },

    // Tasks
    { ref: "k-testusers", type: "TASK", title: "Load test users into SIT 2 tenant", module: "ec", phase: "sit2", state: "Closed", assignee: "erik", created: 21, createdBy: "erik" },
    { ref: "k-refresh", type: "TASK", title: "Refresh SIT 2 test data (anonymised copy)", module: "ec", phase: "sit2", state: "Active", assignee: "erik", priority: 2, due: -4, created: 11, createdBy: "erik" },
    { ref: "k-uat-scripts", type: "TASK", title: "Prepare UAT test scripts for HR business partners", module: "ec", phase: "uat", state: "New", assignee: "erik", due: 9, created: 2, createdBy: "erik" },
  ];

  const ID: Record<string, number> = {};
  const orderCounter: Record<string, number> = {};
  for (const def of items) {
    const typeId = T[def.type];
    const typeTpl = DEFAULT_TYPES.find((t) => t.key === def.type)!;
    const createdAt = daysAgo(def.created, 9);
    const creator = U[def.createdBy ?? "erik"];
    const path = naturalPath(def.type, def.state);
    const span = Math.max(1, def.created - 1);
    const transitions = path.slice(1).map((s, i) => ({ state: s, at: new Date(createdAt.getTime() + ((i + 1) / path.length) * span * DAY) }));
    const lastChange = transitions.at(-1)?.at ?? createdAt;
    const fields = { ...(def.fields ?? {}) } as Record<string, unknown>;
    for (const k of ["expectedResult", "stepsToReproduce", "expected", "actual", "answer", "justification"]) {
      if (typeof fields[k] === "string") fields[k] = textToDoc(fields[k] as string);
    }
    if (def.type === "TEST_TASK") {
      fields.outcome = { Passed: "Passed", Failed: "Failed", Blocked: "Blocked" }[def.state] ?? "Not run";
    }
    const descText = def.description ?? `${typeTpl.name} for ${def.title.toLowerCase()}. Part of the fictional demo project.`;
    const description = textToDoc(descText);
    orderCounter[def.state] = (orderCounter[def.state] ?? 0) + 1024;

    const row = await db.workItem.create({
      data: {
        projectId: project.id,
        typeId,
        title: def.title,
        description: JSON.stringify(description),
        descriptionText: docToText(description),
        state: def.state,
        assignedToId: def.assignee ? U[def.assignee] : null,
        moduleId: M[def.module],
        phaseId: P[def.phase],
        parentId: def.parent ? ID[def.parent] : null,
        priority: def.priority ?? 2,
        severity: def.type === "DEFECT" ? (def.severity ?? 3) : null,
        tags: JSON.stringify(def.tags ?? []),
        dueDate: def.due !== undefined ? daysFromNow(def.due) : null,
        fields: JSON.stringify(fields),
        boardOrder: orderCounter[def.state],
        stateChangedAt: lastChange,
        createdById: creator,
        createdAt,
        changedById: def.assignee ? U[def.assignee] : creator,
        changedAt: lastChange,
      },
    });
    ID[def.ref] = row.id;

    // History: creation, then each state transition
    let rev = 1;
    await db.historyEntry.create({ data: { workItemId: row.id, rev, field: "__created", newValue: path[0], changedById: creator, changedAt: createdAt } });
    if (def.assignee) {
      await db.historyEntry.create({ data: { workItemId: row.id, rev, field: "assignedToId", newValue: U[def.assignee], changedById: creator, changedAt: createdAt } });
    }
    let prev = path[0];
    for (const tr of transitions) {
      rev++;
      await db.historyEntry.create({
        data: { workItemId: row.id, rev, field: "state", oldValue: prev, newValue: tr.state, changedById: def.assignee ? U[def.assignee] : creator, changedAt: tr.at },
      });
      prev = tr.state;
    }
    // Followers: creator and assignee
    const followers = new Set([creator, ...(def.assignee ? [U[def.assignee]] : [])]);
    for (const f of followers) await db.follow.create({ data: { userId: f, workItemId: row.id, createdAt } });
  }

  // Links
  const link = (type: string, from: string, to: string) =>
    db.workItemLink.create({ data: { type, sourceId: ID[from], targetId: ID[to], createdById: U.erik } });
  await link("BLOCKS", "d-dup-employment", "tt-transfer");
  await link("BLOCKS", "d-equip-form", "tt-onb-equip");
  await link("RELATED", "q-holiday", "d-holiday");
  await link("RELATED", "q-seniority", "tt-rehire");
  await link("DUPLICATE_OF", "d-email-twice", "tt-req");
  await link("RELATED", "cr-approval", "tt-promo");

  // Comments with @mentions and #ID references
  const comment = async (ref: string, author: string, text: string, daysBack: number, reactions: [string, string][] = [], internal = false) => {
    const doc = plainTextToMentionDoc(text, { ...directory, itemExists: (id) => Object.values(ID).includes(id) });
    const m = extractMentions(doc);
    const c = await db.comment.create({
      data: { workItemId: ID[ref], authorId: U[author], body: JSON.stringify(doc), bodyText: docToText(doc), createdAt: daysAgo(daysBack, 13), internal },
    });
    for (const uid of m.userIds) {
      await db.mention.create({ data: { commentId: c.id, userId: uid } });
      await db.notification.create({
        data: { userId: uid, type: "MENTIONED", workItemId: ID[ref], actorId: U[author], message: `${userDefs.find((u) => U[u.key] === U[author])?.name} mentioned you on #${ID[ref]}`, createdAt: daysAgo(daysBack, 13) },
      });
    }
    for (const tid of m.teamIds) await db.mention.create({ data: { commentId: c.id, teamId: tid } });
    for (const [user, emoji] of reactions) await db.commentReaction.create({ data: { commentId: c.id, userId: U[user], emoji } });
  };

  await comment("tt-hire-temp", "maja", `Failed at step 3 – the end date disappears after save. Logged #${ID["d-enddate"]} for it.`, 12);
  await comment("d-enddate", "nora", "@[Maja Sørli] I can reproduce this. It looks like the field is missing from the Job Info business rule.", 11, [["maja", "👍"]]);
  await comment("d-enddate", "maja", "Thanks! Can we get it into the next transport? @[Erik Brattland]", 10);
  await comment("d-dup-employment", "nora", `This blocks #${ID["tt-transfer"]}. @[EC team] please do not run any legal entity transfers until fixed.`, 13, [["erik", "👀"], ["maja", "👍"]]);
  await comment("d-dup-employment", "erik", "Raised with the SAP partner as priority 1. Target fix in transport 14.", 10);
  await comment("d-dup-employment", "nora", "Internal: root cause is our position-sync job config, not SAP. Fix ourselves before telling the customer the date.", 9, [], true);
  await comment("d-dup-employment", "siri", "@[Erik Brattland] the due date has passed – any update from the partner?", 1);
  await comment("d-holiday", "lars", `Found while running #${ID["tt-term-holiday"]}. See also question #${ID["q-holiday"]}.`, 5);
  await comment("q-holiday", "lars", "@[Siri Holmvik] can you confirm with HR which reasons should pay out holiday pay?", 4);
  await comment("q-seniority", "nora", "@[Erik Brattland] the business needs to decide this before UAT.", 3, [["erik", "👍"]]);
  await comment("tt-transfer", "nora", `Blocked by #${ID["d-dup-employment"]}.`, 12);
  await comment("d-aeoe", "jonas", "Template uses a font without Norwegian glyphs. Swapping to the corporate font.", 6, [["maja", "🎉"]]);
  await comment("d-overtime", "lars", "@[Payroll team] replication job fails with mapping error on wage type 1200.", 8);
  await comment("cr-approval", "erik", "Approved in the change board on Monday.", 7);
  await comment("tt-onb-equip", "maja", `Cannot continue – #${ID["d-equip-form"]} prevents the manager from seeing the form.`, 6);
  await comment("k-refresh", "erik", "Waiting for anonymisation script from the client's IT department.", 3);
  await comment("q-linkedin", "jonas", "Answer added. Closing after confirmation from @[Maja Sørli].", 9);

  // A few assignment notifications so the bell has unread items
  for (const ref of ["d-holiday", "d-overtime", "q-seniority"]) {
    const it = items.find((i) => i.ref === ref)!;
    if (!it.assignee) continue;
    await db.notification.create({
      data: { userId: U[it.assignee], type: "ASSIGNED", workItemId: ID[ref], actorId: U.erik, message: `Erik Brattland assigned you #${ID[ref]} ${it.title}`, createdAt: daysAgo(2) },
    });
  }

  // Shared saved queries
  await db.savedQuery.create({
    data: {
      projectId: project.id,
      ownerId: U.erik,
      name: "Open critical defects",
      shared: true,
      definition: JSON.stringify({
        root: {
          logic: "and",
          clauses: [
            { field: "type", op: "eq", value: "DEFECT" },
            { field: "severity", op: "lte", value: 2 },
            { field: "category", op: "in", value: ["PROPOSED", "IN_PROGRESS", "RESOLVED"] },
          ],
        },
        sort: [{ field: "severity", dir: "asc" }],
      }),
      columns: JSON.stringify(["id", "type", "title", "state", "severity", "assignedTo", "module", "dueDate"]),
    },
  });
  await db.savedQuery.create({
    data: {
      projectId: project.id,
      ownerId: U.erik,
      name: "Test tasks with defects (tree)",
      mode: "TREE",
      shared: true,
      definition: JSON.stringify({ root: { logic: "and", clauses: [{ field: "type", op: "eq", value: "TEST_TASK" }, { field: "childCount", op: "gt", value: 0 }] } }),
      columns: JSON.stringify(["id", "type", "title", "state", "assignedTo", "module"]),
    },
  });

  // A reusable process template built from the demo project (no work items, only the process).
  await db.processTemplate.create({
    data: {
      name: "SuccessFactors SIT/UAT",
      description: "Modules for Employee Central, Recruiting, Onboarding, Care, Reporting and ECP; SIT 1, SIT 2 and UAT; three team boards.",
      content: JSON.stringify(await templateFromProject(db, project.id)),
    },
  });

  const count = await db.workItem.count();
  console.log(`Seeded ${userDefs.length} users, ${count} work items, ${teamDefs.length} teams. Password for all demo users: demo1234`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
