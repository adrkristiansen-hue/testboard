"use client";

import { useEffect, useRef } from "react";

/** True when the key press belongs to a text field, so single-letter shortcuts must not fire. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return !!el.closest("input, textarea, select, [contenteditable=true], [contenteditable=''], .ProseMirror");
}

/**
 * Single-key shortcuts (Azure Boards style). Ignored while typing, with Ctrl/Alt/Meta held,
 * or while a modal dialog is open. Keys are matched on `event.key` ("n", "/", "?").
 */
export function useShortcuts(handlers: Record<string, () => void>, enabled = true) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (isTypingTarget(e.target)) return;
      if (document.querySelector("dialog[open]")) return;
      const fn = ref.current[e.key];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
