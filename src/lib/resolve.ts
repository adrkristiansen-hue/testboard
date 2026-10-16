// Resolve human-friendly values (names, e-mails, paths, keys) to ids. Shared by Excel/CSV import and the REST API.
import type { ProjectMeta, TypeLite } from "./types";
import type { TestStep } from "./fields";

const norm = (s: string) => s.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");

export type Resolved<T> = { ok: true; value: T } | { ok: false; error: string };

export interface Resolver {
  type(v: string): Resolved<TypeLite>;
  state(type: TypeLite, v: string): Resolved<string>;
  user(v: string): Resolved<string | null>;
  module(v: string): Resolved<string | null>;
  phase(v: string): Resolved<string | null>;
}

export function makeResolver(meta: Pick<ProjectMeta, "types" | "users" | "modules" | "phases">): Resolver {
  return {
    /** Type key ("DEFECT"), English name ("Defect") or common Norwegian names. */
    type(v) {
      const n = norm(v);
      const alias: Record<string, string> = { feil: "DEFECT", testoppgave: "TEST_TASK", "test case": "TEST_TASK", testcase: "TEST_TASK", spørsmål: "QUESTION", endringsforespørsel: "CHANGE_REQUEST", oppgave: "TASK", bug: "DEFECT" };
      const t = meta.types.find((x) => norm(x.key) === n || norm(x.name) === n || norm(x.key) === n.replace(/ /g, "_")) ?? meta.types.find((x) => x.key === alias[n]);
      if (!t) return { ok: false, error: `Unknown type "${v}"` };
      if (t.disabled) return { ok: false, error: `Type "${t.name}" is disabled` };
      return { ok: true, value: t };
    },
    state(type, v) {
      const s = type.states.find((x) => norm(x.name) === norm(v));
      return s ? { ok: true, value: s.name } : { ok: false, error: `"${v}" is not a state of ${type.name}` };
    },
    /** E-mail or full name; blank = unassigned. */
    user(v) {
      const n = norm(v);
      if (!n) return { ok: true, value: null };
      const byEmail = meta.users.find((u) => norm(u.email) === n);
      if (byEmail) return { ok: true, value: byEmail.id };
      const byName = meta.users.filter((u) => norm(u.name) === n);
      if (byName.length === 1) return { ok: true, value: byName[0].id };
      return { ok: false, error: byName.length > 1 ? `"${v}" matches several users – use the e-mail` : `Unknown user "${v}"` };
    },
    /** Full path ("Employee Central > Hire", "/" or "\" also accepted) or a unique module name. */
    module(v) {
      const n = norm(v).replace(/\s*[>/\\]\s*/g, " > ");
      if (!n) return { ok: true, value: null };
      const byPath = meta.modules.find((m) => norm(m.path) === n);
      if (byPath) return { ok: true, value: byPath.id };
      const byName = meta.modules.filter((m) => norm(m.name) === n);
      if (byName.length === 1) return { ok: true, value: byName[0].id };
      return { ok: false, error: byName.length > 1 ? `"${v}" matches several modules – use the full path` : `Unknown module "${v}"` };
    },
    phase(v) {
      const n = norm(v);
      if (!n) return { ok: true, value: null };
      const p = meta.phases.find((x) => norm(x.name) === n || norm(x.name).replace(/ /g, "") === n.replace(/ /g, ""));
      return p ? { ok: true, value: p.id } : { ok: false, error: `Unknown phase "${v}"` };
    },
  };
}

/** Accepts 2026-10-31, 31.10.2026, 31/10/2026 or an Excel date serial. Returns yyyy-mm-dd or null. */
export function parseDateValue(v: string | number | Date | null | undefined): Resolved<string | null> {
  if (v === null || v === undefined || v === "") return { ok: true, value: null };
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? { ok: false, error: "Invalid date" } : { ok: true, value: v.toISOString().slice(0, 10) };
  if (typeof v === "number" || /^\d{5}(\.\d+)?$/.test(String(v).trim())) {
    // Excel serial date (days since 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(Number(v)) * 86_400_000);
    return { ok: true, value: d.toISOString().slice(0, 10) };
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return validYmd(+m[1], +m[2], +m[3], s);
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s);
  if (m) return validYmd(+m[3], +m[2], +m[1], s);
  return { ok: false, error: `Invalid date "${s}" (use yyyy-mm-dd or dd.mm.yyyy)` };
}

function validYmd(y: number, mo: number, d: number, raw: string): Resolved<string> {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return { ok: false, error: `Invalid date "${raw}"` };
  return { ok: true, value: dt.toISOString().slice(0, 10) };
}

/** 1–4, or words like "Critical"/"Kritisk", "High"/"Høy", "Medium"/"Middels", "Low"/"Lav". */
export function parseLevel(v: string | number | null | undefined, field: string): Resolved<number | null> {
  if (v === null || v === undefined || v === "") return { ok: true, value: null };
  const s = norm(String(v));
  const words: Record<string, number> = { critical: 1, kritisk: 1, high: 2, høy: 2, hoy: 2, medium: 3, middels: 3, normal: 3, low: 4, lav: 4 };
  const lead = /^([1-4])\b/.exec(s);
  const n = lead ? Number(lead[1]) : (words[s] ?? words[s.split(/[\s-]+/).pop() ?? ""]);
  return n ? { ok: true, value: n } : { ok: false, error: `${field} must be 1–4 (got "${v}")` };
}

export function parseTags(v: string | null | undefined): string[] {
  return (v ?? "")
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Test steps from a single cell: one step per line, "action | expected" (or "action => expected").
 * Numbering like "1." or "1)" at the start of a line is removed.
 */
export function parseSteps(v: string | null | undefined): TestStep[] {
  return (v ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\d+\s*[.)]\s*/, "").trim())
    .filter(Boolean)
    .map((l) => {
      const [action, ...rest] = l.split(/\s*(?:\||=>)\s*/);
      return { action: action.trim(), expected: rest.join(" | ").trim() };
    });
}
