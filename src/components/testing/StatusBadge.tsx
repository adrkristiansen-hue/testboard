"use client";

import type { MessageKey } from "@/lib/i18n";
import type { ScriptStatus } from "@/lib/testscripts";
import { useT } from "../I18nProvider";

const TONE: Record<ScriptStatus, string> = {
  DRAFT: "bg-gray-100 text-ink",
  APPROVED: "bg-green-100 text-ok",
  RETIRED: "bg-gray-100 text-ink-muted line-through",
};

export function StatusBadge({ status }: { status: ScriptStatus }) {
  const t = useT();
  return <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${TONE[status]}`}>{t(`ts.status.${status}` as MessageKey)}</span>;
}
