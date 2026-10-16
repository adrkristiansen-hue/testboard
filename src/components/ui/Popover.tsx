"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Minimal accessible popover/menu: a trigger button that toggles a panel.
 * Closes on Escape (returning focus to the trigger) and on outside click.
 */
export function Popover({
  trigger,
  label,
  children,
  align = "left",
  className = "",
  triggerClassName = "icon-btn",
  panelClassName = "",
}: {
  trigger: ReactNode;
  label: string;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      // Focus the first focusable element inside the panel.
      const el = ref.current?.querySelector<HTMLElement>("[data-popover-panel] button, [data-popover-panel] input, [data-popover-panel] select, [data-popover-panel] a");
      el?.focus();
    }
  }, [open]);

  // Return focus to the trigger when the panel closes from inside (menu item, Escape).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open && ref.current?.contains(document.activeElement) === false && document.activeElement === document.body) btn.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={ref} className={`relative ${className}`} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className={triggerClassName}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={id}
          data-popover-panel
          className={`absolute z-50 mt-1 min-w-48 rounded-md border border-line-strong bg-white p-1 shadow-lg ${align === "right" ? "right-0" : "left-0"} ${panelClassName}`}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ onClick, children, disabled, active }: { onClick: () => void; children: ReactNode; disabled?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50 ${active ? "font-semibold" : ""}`}
    >
      {children}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{children}</div>;
}
