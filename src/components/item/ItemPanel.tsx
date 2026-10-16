"use client";

import { useEffect, useRef } from "react";
import { WorkItemForm, type WorkItemFormProps } from "./WorkItemForm";
import { useT } from "../I18nProvider";

/** Non-modal side panel with the work item form, used on boards and lists. */
export function ItemPanel(props: Omit<WorkItemFormProps, "variant">) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);
  const { onClose } = props;

  const close = () => {
    if (dirty.current && !confirm("Discard unsaved changes?")) return;
    onClose?.();
  };

  useEffect(() => {
    ref.current?.focus();
  }, [props.itemId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Let popovers and suggestion lists handle Escape first.
      if (document.querySelector("[data-popover-panel], .suggest-popup")) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-label={props.itemId ? `${t("item.details")} #${props.itemId}` : t("item.new")}
      className="fixed inset-0 z-50 flex flex-col border-l border-line-strong bg-white shadow-2xl outline-none sm:inset-y-12 sm:left-auto sm:right-0 sm:bottom-0 sm:w-[min(760px,92vw)] lg:static lg:inset-auto lg:z-auto lg:w-[min(720px,48vw)] lg:shrink-0 lg:shadow-none"
    >
      <WorkItemForm {...props} variant="panel" onClose={close} onDirtyChange={(d) => {
          dirty.current = d;
        }} />
    </aside>
  );
}
