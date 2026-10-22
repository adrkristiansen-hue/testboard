"use client";

import { useRef, useState, useTransition } from "react";
import type { AttachmentView } from "@/lib/detail-types";
import { deleteAttachment } from "@/server/actions/items";
import { useI18n } from "../I18nProvider";
import { useProject } from "../ProjectProvider";
import { useSessionUser } from "../SessionProvider";
import { useToast } from "../ui/Toast";
import { formatBytes, uploadFile } from "./upload";
import { formatDateTime } from "@/lib/format";

export function Attachments({ itemId, attachments, onChanged, canEdit }: { itemId: number; attachments: AttachmentView[]; onChanged: () => void; canEdit: boolean }) {
  const { t, locale } = useI18n();
  const { userById } = useProject();
  const { user } = useSessionUser();
  const canEditAll = useProject().can("items.edit");
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [, start] = useTransition();

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    try {
      for (const f of files) await uploadFile(f, itemId);
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string) => {
    if (!confirm(t("common.confirmDelete"))) return;
    start(async () => {
      const res = await deleteAttachment(id);
      if (!res.ok) return toast(res.error, "error");
      onChanged();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {canEdit && (
        <div
          tabIndex={0}
          role="region"
          aria-label={t("item.dropFiles")}
          onPaste={(e) => upload([...e.clipboardData.files])}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void upload([...e.dataTransfer.files]);
          }}
          className={`flex flex-col items-center gap-2 rounded-md border-2 border-dashed p-4 text-sm text-ink-muted ${dragOver ? "border-brand bg-brand-soft" : "border-line-strong"}`}
        >
          <span>{t("item.dropFiles")}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? t("common.saving") : t("item.uploadFile")}
          </button>
          <input ref={input} type="file" multiple className="hidden" onChange={(e) => upload([...(e.target.files ?? [])])} />
        </div>
      )}
      {attachments.length === 0 && <p className="text-sm text-ink-muted">{t("item.noAttachments")}</p>}
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {attachments.map((a) => {
          const isImage = a.mimeType.startsWith("image/") && a.mimeType !== "image/svg+xml";
          return (
            <li key={a.id} className="flex gap-2 rounded-md border border-line bg-white p-2">
              <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="shrink-0">
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/attachments/${a.id}`} alt={a.fileName} className="h-14 w-20 rounded border border-line object-cover" loading="lazy" />
                ) : (
                  <span aria-hidden="true" className="grid h-14 w-20 place-items-center rounded border border-line bg-gray-50 text-xl">
                    📄
                  </span>
                )}
              </a>
              <div className="min-w-0 flex-1 text-sm">
                <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="block truncate font-medium hover:underline">
                  {a.fileName}
                </a>
                <div className="text-xs text-ink-muted">
                  {formatBytes(a.size)} · {userById.get(a.uploadedById)?.name ?? "?"} · {formatDateTime(a.createdAt, locale)}
                  {a.commentId && " · 💬"}
                </div>
              </div>
              {canEdit && (a.uploadedById === user.id || canEditAll) && (
                <button type="button" className="icon-btn" aria-label={`${t("common.delete")} ${a.fileName}`} onClick={() => remove(a.id)}>
                  🗑
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
