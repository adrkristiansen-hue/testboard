// Expansion of a bulk "create test tasks" request into individual items (pure, unit-tested).

export const BULK_CREATE_MAX = 500;
export const DEFAULT_TITLE_PATTERN = "{title}";

export interface BulkCreateSpec {
  /** Base titles; blank lines are ignored. */
  titles: string[];
  /** Module ids; empty = one task without module. */
  moduleIds: string[];
  /** Phase ids; empty = one task without phase. */
  phaseIds: string[];
  /** Title pattern with {title}, {module} and {phase} placeholders. */
  pattern?: string;
}

export interface BulkCreateRow {
  title: string;
  moduleId: string | null;
  phaseId: string | null;
}

export function applyTitlePattern(pattern: string, vars: { title: string; module: string; phase: string }): string {
  const out = pattern.replace(/\{(title|module|phase)\}/g, (_, k: "title" | "module" | "phase") => vars[k]);
  // Tidy separators left behind by empty placeholders, e.g. "Hire –  – " or "[] Hire".
  return out
    .replace(/\[\s*\]|\(\s*\)/g, "")
    .replace(/\s+[–\-:|/]\s*(?=[–\-:|/]|$)/g, " ")
    .replace(/^\s*[–\-:|/]\s*/, "")
    .replace(/\s*[–:|/]\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 255);
}

export function expandBulkCreate(spec: BulkCreateSpec, names: { module: (id: string) => string; phase: (id: string) => string }): BulkCreateRow[] {
  const titles = [...new Set(spec.titles.map((t) => t.trim()).filter(Boolean))];
  const modules: (string | null)[] = spec.moduleIds.length ? [...new Set(spec.moduleIds)] : [null];
  const phases: (string | null)[] = spec.phaseIds.length ? [...new Set(spec.phaseIds)] : [null];
  const pattern = spec.pattern?.trim() || DEFAULT_TITLE_PATTERN;
  const rows: BulkCreateRow[] = [];
  for (const phaseId of phases) {
    for (const moduleId of modules) {
      for (const base of titles) {
        const title = applyTitlePattern(pattern, { title: base, module: moduleId ? names.module(moduleId) : "", phase: phaseId ? names.phase(phaseId) : "" });
        if (title) rows.push({ title, moduleId, phaseId });
      }
    }
  }
  return rows;
}

/** Key used to detect tasks that already exist. */
export function bulkRowKey(r: { title: string; moduleId: string | null; phaseId: string | null }): string {
  return `${r.title.trim().toLowerCase()}\u0000${r.moduleId ?? ""}\u0000${r.phaseId ?? ""}`;
}
