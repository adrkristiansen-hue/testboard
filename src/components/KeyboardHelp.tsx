"use client";

import { useEffect, useRef, useState } from "react";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "./I18nProvider";
import { useShortcuts } from "./useShortcuts";

const GROUPS: { title: MessageKey; keys: [string, MessageKey][] }[] = [
  { title: "keys.global", keys: [["?", "keys.help"]] },
  { title: "keys.boardList", keys: [["n", "keys.new"], ["/", "keys.filter"]] },
  {
    title: "keys.item",
    keys: [
      ["e", "keys.edit"],
      ["a", "keys.assignMe"],
      ["Ctrl/⌘ + Enter", "keys.save"],
      ["Esc", "keys.close"],
    ],
  },
];

/** "?" opens a list of keyboard shortcuts. Also opened from the user menu via a custom event. */
export function KeyboardHelp() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useShortcuts({ "?": () => setOpen(true) });
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("tb:shortcuts", show);
    return () => window.removeEventListener("tb:shortcuts", show);
  }, []);
  useEffect(() => {
    if (open && ref.current && !ref.current.open) ref.current.showModal();
  }, [open]);
  if (!open) return null;
  return (
    <dialog ref={ref} aria-labelledby="kh-title" onClose={() => setOpen(false)} className="m-auto w-[min(440px,92vw)] rounded-lg p-0 shadow-2xl backdrop:bg-black/40">
      <div className="flex items-center border-b border-line px-4 py-3">
        <h2 id="kh-title" className="mr-auto text-lg font-semibold">
          {t("keys.title")}
        </h2>
        <button type="button" className="icon-btn" aria-label={t("common.close")} onClick={() => ref.current?.close()} autoFocus>
          ✕
        </button>
      </div>
      <div className="space-y-3 px-4 py-3">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t(g.title)}</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {g.keys.map(([k, label]) => (
                <div key={k} className="contents">
                  <dt>
                    <kbd className="rounded border border-line-strong bg-gray-50 px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
                  </dt>
                  <dd>{t(label)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  );
}
