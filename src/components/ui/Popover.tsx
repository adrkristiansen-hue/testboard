"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Minimal accessible popover/menu: a trigger button that toggles a panel.
 * Closes on Escape (returning focus to the trigger) and on outside click.
 * The panel is rendered in a portal with fixed positioning so scrolling containers
 * (board cells, tables) never clip it; it flips above the trigger when there is no room below.
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
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const [pos, setPos] = useState<CSSProperties>({ visibility: "hidden" });

  const place = useCallback(() => {
    const b = btn.current?.getBoundingClientRect();
    const p = panel.current;
    if (!b || !p) return;
    const w = p.offsetWidth;
    const h = p.offsetHeight;
    const margin = 4;
    let left = align === "right" ? b.right - w : b.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    const below = b.bottom + margin;
    const top = below + h > window.innerHeight - 8 && b.top - margin - h > 8 ? b.top - margin - h : below;
    setPos({ position: "fixed", top, left, maxHeight: window.innerHeight - top - 8, overflowY: "auto" });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || panel.current?.contains(t)) return;
      setOpen(false);
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
      const el = panel.current?.querySelector<HTMLElement>("button, input, select, a");
      el?.focus();
    }
  }, [open]);

  // Return focus to the trigger when the panel closes from inside (menu item, Escape).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open && document.activeElement === document.body) btn.current?.focus();
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
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            data-popover-panel
            style={pos}
            // Keep clicks inside the panel from reaching drag handles and card click handlers.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className={`z-[150] min-w-48 rounded-md border border-line-strong bg-white p-1 shadow-lg ${panelClassName}`}
          >
            {children(close)}
          </div>,
          document.body,
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
