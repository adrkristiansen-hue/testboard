"use client";

import { useState } from "react";
import { useProject } from "../ProjectProvider";
import { useT } from "../I18nProvider";
import { useToast } from "../ui/Toast";
import { Popover, MenuItem } from "../ui/Popover";

/** Download the shown rows/columns as Excel or CSV. */
export function ExportMenu({ ids, columns, name }: { ids: number[]; columns: string[]; name?: string }) {
  const t = useT();
  const toast = useToast();
  const { meta } = useProject();
  const [busy, setBusy] = useState(false);

  const download = async (format: "xlsx" | "csv") => {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${meta.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, ids, columns, name }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const fileName = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `export.${format}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast(t("common.error"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover label={t("list.export")} triggerClassName="btn btn-ghost btn-sm" trigger={<>{busy ? t("common.loading") : t("list.export")} ▾</>}>
      {(close) => (
        <div className="w-48">
          <MenuItem disabled={busy || ids.length === 0} onClick={() => { close(); void download("xlsx"); }}>
            {t("list.exportExcel")}
          </MenuItem>
          <MenuItem disabled={busy || ids.length === 0} onClick={() => { close(); void download("csv"); }}>
            {t("list.exportCsv")}
          </MenuItem>
        </div>
      )}
    </Popover>
  );
}
