// Serialisable shapes for test scripts and test runs, shared by server and client.
import type { TestStep } from "./fields";
import type { RunOutcome, ScriptStatus, StepOutcome } from "./testscripts";

export interface RunCounts {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  open: number;
}

export interface ScriptSummary {
  id: string;
  number: number;
  key: string;
  title: string;
  moduleId: string | null;
  status: ScriptStatus;
  version: number;
  stepCount: number;
  reviewNote: string | null;
  updatedAt: string;
  runs: RunCounts;
}

export interface ScriptRunRow {
  id: number;
  title: string;
  state: string;
  phaseId: string | null;
  assignedToId: string | null;
  scriptVersion: number | null;
  attempts: number;
  lastActivity: string | null;
}

export interface ScriptView {
  id: string;
  number: number;
  key: string;
  title: string;
  moduleId: string | null;
  role: string;
  preconditions: string;
  testData: string;
  inputs: string[];
  steps: TestStep[];
  status: ScriptStatus;
  version: number;
  approvedBy: string | null;
  approvedAt: string | null;
  reviewNote: string | null;
  reviewBy: string | null;
  reviewAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  updatedAt: string;
  runs: ScriptRunRow[];
}

export interface StepResultView {
  stepIndex: number;
  outcome: StepOutcome;
  actual: string;
  attachments: string[];
  raised: number[];
  carried: boolean;
}

export interface AttemptView {
  id: string;
  number: number;
  testerId: string;
  testerName: string;
  inputs: Record<string, string>;
  startedAt: string;
  finishedAt: string | null;
  outcome: RunOutcome | null;
  results: StepResultView[];
}

export interface RaisedItem {
  id: number;
  title: string;
  typeKey: string;
  typeName: string;
  state: string;
  category: string;
}

export interface RunView {
  item: { id: number; title: string; state: string; assignedToId: string | null; phaseId: string | null; moduleId: string | null };
  script: { id: string; key: string; version: number | null; currentVersion: number; status: ScriptStatus; reviewNote: string | null } | null;
  preconditions: string;
  testData: string;
  inputs: string[];
  steps: TestStep[];
  attempts: AttemptView[];
  raised: RaisedItem[];
  attachments: { id: string; fileName: string; mimeType: string }[];
  canExecute: boolean;
  canRaise: boolean;
  readyForRetest: boolean;
  /** The next test run assigned to the current user in the same phase that has not started */
  nextRunId: number | null;
}
