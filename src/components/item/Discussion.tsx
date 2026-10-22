"use client";

import { useState, useTransition } from "react";
import type { CommentView } from "@/lib/detail-types";
import { REACTION_EMOJIS } from "@/lib/detail-types";
import { isDocEmpty, type RtDoc } from "@/lib/richtext";
import { addComment, deleteComment, editComment, toggleReaction } from "@/server/actions/items";
import { RichText } from "../editor/RichText";
import { RichTextEditor } from "../editor/RichTextEditor";
import { Avatar } from "../ui/Avatar";
import { Popover } from "../ui/Popover";
import { useProject } from "../ProjectProvider";
import { useI18n } from "../I18nProvider";
import { useSessionUser } from "../SessionProvider";
import { useToast } from "../ui/Toast";
import { formatDateTime, formatRelative } from "@/lib/format";

export function Discussion({ itemId, comments, onChanged }: { itemId: number; comments: CommentView[]; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const { meta, userById, can } = useProject();
  const { user } = useSessionUser();
  const canEdit = can("comments.add");
  const canInternal = can("comments.internal");
  const canModerate = can("access.manage");
  const [internal, setInternal] = useState(false);
  const toast = useToast();
  const [draft, setDraft] = useState<RtDoc | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<RtDoc | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    if (!draft || isDocEmpty(draft)) return;
    start(async () => {
      const res = await addComment(itemId, draft, internal);
      if (!res.ok) return toast(res.error, "error");
      setDraft(null);
      setEditorKey((k) => k + 1);
      onChanged();
    });
  };

  const saveEdit = (id: string) => {
    if (!editDraft) return setEditing(null);
    start(async () => {
      const res = await editComment(id, editDraft);
      if (!res.ok) return toast(res.error, "error");
      setEditing(null);
      onChanged();
    });
  };

  const remove = (id: string) => {
    if (!confirm(t("common.confirmDelete"))) return;
    start(async () => {
      const res = await deleteComment(id);
      if (!res.ok) return toast(res.error, "error");
      onChanged();
    });
  };

  const react = (id: string, emoji: string) =>
    start(async () => {
      const res = await toggleReaction(id, emoji);
      if (!res.ok) return toast(res.error, "error");
      onChanged();
    });

  return (
    <section aria-labelledby={`disc-${itemId}`} className="flex flex-col gap-3">
      <h2 id={`disc-${itemId}`} className="text-sm font-semibold">
        {t("item.discussion")} <span className="font-normal text-ink-muted">({comments.length})</span>
      </h2>
      {canEdit && (
        <div>
          <RichTextEditor
            key={editorKey}
            value={null}
            onChange={setDraft}
            workItemId={itemId}
            placeholder={t("item.addComment")}
            ariaLabel={t("item.addComment")}
            onSubmitShortcut={submit}
            minHeight={60}
          />
          <div className="mt-1 flex items-center justify-end gap-3">
            {canInternal && (
              <label className="flex items-center gap-1.5 text-xs" title={t("comment.internalHint")}>
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                🔒 {t("comment.internal")}
              </label>
            )}
            <button type="button" className={`btn btn-sm ${internal ? "btn-secondary border-amber-400" : "btn-primary"}`} disabled={pending || !draft || isDocEmpty(draft)} onClick={submit}>
              {internal ? t("comment.addInternal") : t("item.comment")}
            </button>
          </div>
        </div>
      )}
      {comments.length === 0 && <p className="text-sm text-ink-muted">{t("item.noComments")}</p>}
      <ol className="flex flex-col gap-3">
        {[...comments].reverse().map((c) => {
          const author = userById.get(c.authorId);
          const mine = c.authorId === user.id;
          return (
            <li key={c.id} className="flex gap-2">
              <Avatar user={author} size={28} />
              <div className={`min-w-0 flex-1 rounded-md border ${c.internal ? "border-amber-300 bg-amber-50" : "border-line bg-white"}`}>
                <div className="flex flex-wrap items-center gap-x-2 border-b border-line px-3 py-1.5 text-xs">
                  <span className="font-semibold text-ink">{author?.name ?? "?"}</span>
                  <time dateTime={c.createdAt} title={formatDateTime(c.createdAt, locale)} className="text-ink-muted">
                    {formatRelative(c.createdAt, locale)}
                  </time>
                  {c.editedAt && <span className="text-ink-muted">({t("item.edited")})</span>}
                  {c.internal && (
                    <span className="rounded bg-amber-200 px-1.5 font-semibold text-[#5c3a00]" title={t("comment.internalHint")}>
                      🔒 {t("comment.internal")}
                    </span>
                  )}
                  {canEdit && (
                    <div className="ml-auto flex items-center">
                      {mine && (
                        <button type="button" className="icon-btn h-6 w-6" aria-label={t("item.editComment")} title={t("item.editComment")} onClick={() => { setEditing(c.id); setEditDraft(c.body); }}>
                          ✎
                        </button>
                      )}
                      {(mine || canModerate) && (
                        <button type="button" className="icon-btn h-6 w-6" aria-label={t("item.deleteComment")} title={t("item.deleteComment")} onClick={() => remove(c.id)}>
                          🗑
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="px-3 py-2 text-sm">
                  {editing === c.id ? (
                    <div>
                      <RichTextEditor value={c.body} onChange={setEditDraft} workItemId={itemId} ariaLabel={t("item.editComment")} autoFocus onSubmitShortcut={() => saveEdit(c.id)} />
                      <div className="mt-1 flex justify-end gap-2">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>
                          {t("common.cancel")}
                        </button>
                        <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => saveEdit(c.id)}>
                          {t("common.save")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <RichText doc={c.body} projectId={meta.id} />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1 px-2 pb-1.5" aria-label={t("item.reactions")}>
                  {c.reactions.map((r) => {
                    const mineR = r.userIds.includes(user.id);
                    const names = r.userIds.map((id) => userById.get(id)?.name ?? "?").join(", ");
                    return (
                      <button
                        key={r.emoji}
                        type="button"
                        disabled={!canEdit}
                        aria-pressed={mineR}
                        title={names}
                        aria-label={`${r.emoji} ${r.userIds.length}: ${names}`}
                        onClick={() => react(c.id, r.emoji)}
                        className={`rounded-full border px-2 py-0.5 text-xs ${mineR ? "border-brand bg-brand-soft" : "border-line bg-white hover:bg-gray-50"}`}
                      >
                        {r.emoji} {r.userIds.length}
                      </button>
                    );
                  })}
                  {canEdit && (
                    <Popover label={t("item.reactions")} trigger={<span className="text-xs">☺+</span>} triggerClassName="rounded-full px-2 py-0.5 text-ink-muted hover:bg-gray-100">
                      {(close) => (
                        <div className="flex gap-1 p-1">
                          {REACTION_EMOJIS.map((e) => (
                            <button key={e} type="button" className="rounded p-1 text-lg hover:bg-gray-100" aria-label={e} onClick={() => { react(c.id, e); close(); }}>
                              {e}
                            </button>
                          ))}
                        </div>
                      )}
                    </Popover>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
