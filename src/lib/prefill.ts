// Pre-fill a defect from a failed test task (Phase 2 requirement, used by form and page).
import type { TestStep } from "./fields";
import type { RtDoc } from "./richtext";
import type { ItemView, TypeLite } from "./types";

export interface NewItemDefaults {
  typeId?: string;
  title?: string;
  description?: RtDoc | null;
  moduleId?: string | null;
  phaseId?: string | null;
  parentId?: number | null;
  assignedToId?: string | null;
  priority?: number;
  severity?: number | null;
  tags?: string[];
  fields?: Record<string, unknown>;
  state?: string;
}

export function defectDefaultsFromTest(test: Pick<ItemView, "id" | "title" | "moduleId" | "phaseId" | "priority" | "tags" | "fields">, types: TypeLite[]): NewItemDefaults {
  const defect = types.find((t) => t.key === "DEFECT");
  const steps = Array.isArray(test.fields.steps) ? (test.fields.steps as TestStep[]) : [];
  const stepsDoc: RtDoc = {
    type: "doc",
    content: steps.length
      ? [
          {
            type: "orderedList",
            content: steps.map((s) => ({
              type: "listItem",
              content: [{ type: "paragraph", content: s.action ? [{ type: "text", text: s.action }] : [] }],
            })),
          },
        ]
      : [{ type: "paragraph", content: [{ type: "text", text: `See test task #${test.id}.` }] }],
  };
  // Expected result may be rich text (form) or a plain string (imports/seed).
  const raw = test.fields.expectedResult;
  const expected: RtDoc | null =
    typeof raw === "string" && raw.trim()
      ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: raw }] }] }
      : raw && typeof raw === "object" && (raw as RtDoc).type === "doc"
        ? (raw as RtDoc)
        : null;
  return {
    typeId: defect?.id,
    title: `Defect: ${test.title}`,
    moduleId: test.moduleId,
    phaseId: test.phaseId,
    parentId: test.id,
    priority: test.priority,
    severity: 2,
    tags: test.tags,
    fields: {
      stepsToReproduce: stepsDoc,
      ...(expected ? { expected } : {}),
    },
  };
}
