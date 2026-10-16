"use client";

import type { HistoryRev } from "@/lib/detail-types";
import type { TypeLite } from "@/lib/types";
import type { MessageKey } from "@/lib/i18n";
import { useProject } from "../ProjectProvider";
import { useI18n } from "../I18nProvider";
import { Avatar } from "../ui/Avatar";
import { formatDate, formatDateTime } from "@/lib/format";

export function History({ history, type }: { history: HistoryRev[]; type: TypeLite | undefined }) {
  const { t, locale } = useI18n();
  const { userById, moduleById, phaseById } = useProject();

  const label = (field: string): string => {
    if (field.startsWith("fields.")) {
      const def = type?.fields.find((f) => f.key === field.slice(7));
      return (locale === "nb" ? def?.labelNb : undefined) ?? def?.label ?? field.slice(7);
    }
    const map: Record<string, MessageKey> = {
      title: "field.title",
      description: "field.description",
      state: "field.state",
      assignedToId: "field.assignedTo",
      moduleId: "field.module",
      phaseId: "field.phase",
      priority: "field.priority",
      severity: "field.severity",
      tags: "field.tags",
      dueDate: "field.dueDate",
      parentId: "field.parent",
      columnDone: "field.boardColumn",
      link: "item.links",
    };
    return map[field] ? t(map[field]) : field;
  };

  const value = (field: string, v: string | null): string => {
    if (v === null || v === "") return "—";
    switch (field) {
      case "assignedToId":
        return userById.get(v)?.name ?? v;
      case "moduleId":
        return moduleById.get(v)?.path ?? v;
      case "phaseId":
        return phaseById.get(v)?.name ?? v;
      case "priority":
        return t(`priority.${v}` as MessageKey);
      case "severity":
        return t(`severity.${v}` as MessageKey);
      case "dueDate":
        return formatDate(v, locale);
      case "parentId":
        return `#${v}`;
      case "columnDone":
        return v === "true" ? t("board.done") : t("board.doing");
      case "fields.steps":
        try {
          return `${(JSON.parse(v) as unknown[]).length} steps`;
        } catch {
          return v;
        }
    }
    if (v.startsWith('{"type":"doc"')) return "(rich text)";
    return v.length > 160 ? v.slice(0, 160) + "…" : v;
  };

  if (history.length === 0) return <p className="text-sm text-ink-muted">{t("item.historyEmpty")}</p>;

  return (
    <ol className="flex flex-col gap-3">
      {history.map((rev) => {
        const user = userById.get(rev.changedById);
        const created = rev.changes.some((c) => c.field === "__created");
        const changes = rev.changes.filter((c) => c.field !== "__created");
        return (
          <li key={rev.rev} className="flex gap-2">
            <Avatar user={user} size={26} />
            <div className="min-w-0 flex-1">
              <div className="text-sm">
                <span className="font-semibold">{user?.name ?? "?"}</span>{" "}
                <span className="text-ink-muted">
                  {created ? t("item.createdItem") : t("item.changedFields", { count: changes.length })} · <time dateTime={rev.changedAt}>{formatDateTime(rev.changedAt, locale)}</time>
                </span>
              </div>
              {changes.length > 0 && (
                <table className="mt-1 w-full text-sm">
                  <tbody>
                    {changes.map((c, i) => (
                      <tr key={i} className="align-top">
                        <th scope="row" className="w-36 py-0.5 pr-2 text-left font-medium text-ink-muted">
                          {label(c.field)}
                        </th>
                        <td className="py-0.5 break-words">
                          <span className="text-ink-muted line-through decoration-gray-400">{value(c.field, c.oldValue)}</span>
                          <span aria-hidden="true" className="px-1 text-ink-muted">
                            →
                          </span>
                          <span className="sr-only"> to </span>
                          <span className="font-medium">{value(c.field, c.newValue)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
