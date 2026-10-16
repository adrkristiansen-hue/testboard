// Type-specific custom fields. Each work item type carries a list of field
// definitions; values live in WorkItem.fields as JSON.

export type FieldKind = "text" | "richtext" | "select" | "number" | "date" | "steps";

export interface FieldDef {
  key: string;
  label: string;
  /** Norwegian label (optional; falls back to label) */
  labelNb?: string;
  kind: FieldKind;
  options?: string[];
  required?: boolean;
}

export interface TestStep {
  action: string;
  expected: string;
}

export const TEST_OUTCOMES = ["Not run", "Passed", "Failed", "Blocked"] as const;
export type TestOutcome = (typeof TEST_OUTCOMES)[number];

export const DEFAULT_TYPE_FIELDS: Record<string, FieldDef[]> = {
  TEST_TASK: [
    { key: "steps", label: "Test steps", labelNb: "Teststeg", kind: "steps" },
    { key: "expectedResult", label: "Expected result", labelNb: "Forventet resultat", kind: "richtext" },
    { key: "outcome", label: "Outcome", labelNb: "Utfall", kind: "select", options: [...TEST_OUTCOMES] },
    { key: "testData", label: "Test data", labelNb: "Testdata", kind: "text" },
  ],
  DEFECT: [
    { key: "stepsToReproduce", label: "Steps to reproduce", labelNb: "Steg for å reprodusere", kind: "richtext" },
    { key: "expected", label: "Expected behaviour", labelNb: "Forventet oppførsel", kind: "richtext" },
    { key: "actual", label: "Actual behaviour", labelNb: "Faktisk oppførsel", kind: "richtext" },
    { key: "environment", label: "Environment", labelNb: "Miljø", kind: "select", options: ["DEV", "TEST", "PREPROD", "PROD"] },
  ],
  QUESTION: [
    { key: "answer", label: "Answer", labelNb: "Svar", kind: "richtext" },
    { key: "askedOf", label: "Asked of (role/party)", labelNb: "Spørsmål til", kind: "text" },
  ],
  CHANGE_REQUEST: [
    { key: "justification", label: "Business justification", labelNb: "Begrunnelse", kind: "richtext" },
    { key: "estimateHours", label: "Estimate (hours)", labelNb: "Estimat (timer)", kind: "number" },
    { key: "decision", label: "Decision", labelNb: "Beslutning", kind: "select", options: ["Pending", "Approved", "Declined"] },
  ],
  TASK: [],
};

/** Map test task states to outcomes so the board and the outcome field stay in sync. */
export function outcomeForTestState(state: string): TestOutcome | undefined {
  switch (state) {
    case "Passed":
      return "Passed";
    case "Failed":
      return "Failed";
    case "Blocked":
      return "Blocked";
    case "Not started":
      return "Not run";
    default:
      return undefined;
  }
}

export function parseFieldDefs(json: string | null | undefined): FieldDef[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as FieldDef[]) : [];
  } catch {
    return [];
  }
}

export function parseJsonObject(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function parseStringArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}
