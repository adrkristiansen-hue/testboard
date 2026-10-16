"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { TeamLite } from "@/lib/types";
import { saveTeam } from "@/server/actions/config";
import { useProject } from "../ProjectProvider";
import { useT } from "../I18nProvider";
import { useToast } from "../ui/Toast";

/** Create a new team board: name, modules it shows, members, and optionally the setup of an existing board. */
export function NewBoardDialog({ boards, currentBoardId, onClose }: { boards: TeamLite[]; currentBoardId: string; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const { meta } = useProject();
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [moduleIds, setModuleIds] = useState<string[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [copyFrom, setCopyFrom] = useState(currentBoardId);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || moduleIds.length === 0) return;
    setBusy(true);
    const res = await saveTeam(meta.id, {
      name: name.trim(),
      memberIds,
      // A module includes its sub-modules, like an Azure Boards area path.
      modules: moduleIds.map((moduleId) => ({ moduleId, includeChildren: true })),
      copyFromTeamId: copyFrom || undefined,
    });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    toast(t("newBoard.created"), "success");
    onClose();
    router.push(`/p/${meta.id}/boards/${res.data.id}`);
  };

  const box = "max-h-48 overflow-y-auto rounded border border-line p-2";
  return (
    <dialog ref={ref} aria-labelledby="nb-title" onClose={onClose} onCancel={(e) => busy && e.preventDefault()} className="m-auto w-[min(640px,95vw)] rounded-lg p-0 shadow-2xl backdrop:bg-black/40">
      <form onSubmit={submit} className="flex max-h-[90vh] flex-col">
        <div className="border-b border-line px-4 py-3">
          <h2 id="nb-title" className="text-lg font-semibold">
            {t("newBoard.title")}
          </h2>
          <p className="text-sm text-ink-muted">{t("newBoard.intro")}</p>
        </div>
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto px-4 py-3 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label htmlFor="nb-name" className="mb-1 block text-sm font-semibold">
                {t("common.name")}
              </label>
              <input id="nb-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus />
            </div>
            <div>
              <label htmlFor="nb-copy" className="mb-1 block text-sm font-semibold">
                {t("newBoard.copyFrom")}
              </label>
              <select id="nb-copy" className="input" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} aria-describedby="nb-copy-hint">
                <option value="">{t("newBoard.defaultSetup")}</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <p id="nb-copy-hint" className="text-xs text-ink-muted">
                {t("newBoard.copyHint")}
              </p>
            </div>
            <fieldset>
              <legend className="mb-1 text-sm font-semibold">{t("settings.members")}</legend>
              <div className={box}>
                {meta.users.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 py-0.5 text-sm">
                    <input type="checkbox" checked={memberIds.includes(u.id)} onChange={() => toggle(memberIds, setMemberIds, u.id)} />
                    {u.name}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">{t("newBoard.modules")}</legend>
            <p className="mb-1 text-xs text-ink-muted">{t("newBoard.modulesHint")}</p>
            <div className={`${box} max-h-72`}>
              {meta.modules.map((m) => (
                <label key={m.id} className="flex items-center gap-2 py-0.5 text-sm" style={{ paddingLeft: (m.path.split(" > ").length - 1) * 16 }}>
                  <input type="checkbox" checked={moduleIds.includes(m.id)} onChange={() => toggle(moduleIds, setModuleIds, m.id)} />
                  {m.name}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim() || moduleIds.length === 0}>
            {busy ? t("common.saving") : t("newBoard.create")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
