// Card display configuration: which fields show on a card and colour rules.
import type { Group, QueryContext } from "./query";
import { evaluateClause } from "./query";
import type { ItemView } from "./types";

export const CARD_FIELDS = ["assignee", "module", "priority", "severity", "tags", "dueDate", "phase", "comments", "children", "state"] as const;
export type CardField = (typeof CARD_FIELDS)[number];

export interface CardRule {
  id: string;
  name: string;
  /** border = coloured left border; background = tinted card */
  style: "border" | "background";
  color: string;
  enabled: boolean;
  when: Group;
}

export interface CardConfig {
  fields: CardField[];
  rules: CardRule[];
}

export const DEFAULT_CARD_CONFIG: CardConfig = {
  fields: ["assignee", "module", "priority", "severity", "comments", "children", "dueDate", "tags"],
  rules: [
    {
      id: "sev1",
      name: "Severity 1",
      style: "border",
      color: "#dc2626",
      enabled: true,
      when: { logic: "and", clauses: [{ field: "severity", op: "eq", value: 1 }] },
    },
    {
      id: "overdue",
      name: "Overdue",
      style: "background",
      color: "#fee2e2",
      enabled: true,
      when: { logic: "and", clauses: [{ field: "overdue", op: "eq", value: true }] },
    },
    {
      id: "blocked",
      name: "Blocked",
      style: "border",
      color: "#f59e0b",
      enabled: true,
      when: { logic: "and", clauses: [{ field: "state", op: "eq", value: "Blocked" }] },
    },
  ],
};

export function parseCardConfig(json: string | null | undefined): CardConfig {
  try {
    const v = JSON.parse(json ?? "");
    if (v && Array.isArray(v.fields)) return { fields: v.fields, rules: Array.isArray(v.rules) ? v.rules : [] };
  } catch {
    /* ignore */
  }
  return DEFAULT_CARD_CONFIG;
}

export interface CardStyle {
  borderColor?: string;
  background?: string;
  matched: string[];
}

/** Apply colour rules in order. The first matching rule per style wins. */
export function cardStyle(item: ItemView, rules: CardRule[], ctx: QueryContext): CardStyle {
  const style: CardStyle = { matched: [] };
  for (const r of rules) {
    if (!r.enabled || r.when.clauses.length === 0) continue;
    if (!evaluateClause(item, r.when, ctx)) continue;
    style.matched.push(r.name);
    if (r.style === "border" && !style.borderColor) style.borderColor = r.color;
    if (r.style === "background" && !style.background) style.background = r.color;
  }
  return style;
}
