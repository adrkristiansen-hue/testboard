"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createProject } from "@/server/actions/config";
import { useT } from "../I18nProvider";
import { useToast } from "../ui/Toast";

export interface TemplateOption {
  id: string;
  name: string;
  description: string | null;
  summary: { modules: number; phases: number; types: number; boards: number };
}

export function NewProjectForm({ templates }: { templates: TemplateOption[] }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [templateId, setTemplateId] = useState("");
  const tpl = templates.find((x) => x.id === templateId);
  const [pending, start] = useTransition();
  return (
    <form
      className="card-panel flex flex-wrap items-end gap-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createProject({ name, key, templateId: templateId || undefined });
          if (!res.ok) return toast(res.error, "error");
          router.push(`/p/${res.data.id}/settings`);
        });
      }}
    >
      <div className="min-w-60 flex-1">
        <label className="label" htmlFor="np-name">
          {t("settings.projectName")}
        </label>
        <input id="np-name" className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Client X – SuccessFactors" />
      </div>
      <div className="w-32">
        <label className="label" htmlFor="np-key">
          {t("settings.projectKey")}
        </label>
        <input id="np-key" className="input font-mono uppercase" required value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} placeholder="CLX" maxLength={10} />
      </div>
      <div className="min-w-60">
        <label className="label" htmlFor="np-tpl">
          {t("template.startFrom")}
        </label>
        <select id="np-tpl" className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)} aria-describedby="np-tpl-hint">
          <option value="">{t("template.standard")}</option>
          {templates.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {t("common.create")}
      </button>
      <p id="np-tpl-hint" className="w-full text-xs text-ink-muted">
        {tpl ? `${tpl.description ? `${tpl.description} · ` : ""}${t("template.summary", tpl.summary)}` : t("template.standardHint")}
      </p>
    </form>
  );
}
