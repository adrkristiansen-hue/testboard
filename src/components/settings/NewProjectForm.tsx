"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createProject } from "@/server/actions/config";
import { useT } from "../I18nProvider";
import { useToast } from "../ui/Toast";

export function NewProjectForm() {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="card-panel flex flex-wrap items-end gap-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createProject({ name, key });
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
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {t("common.create")}
      </button>
    </form>
  );
}
