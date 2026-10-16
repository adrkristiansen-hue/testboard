"use client";

import { useState } from "react";

export function TagInput({ id, value, onChange, disabled, label }: { id: string; value: string[]; onChange: (tags: string[]) => void; disabled?: boolean; label: string }) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
    setText("");
  };
  return (
    <div className="input flex min-h-8 flex-wrap items-center gap-1 py-1">
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs">
          {tag}
          {!disabled && (
            <button type="button" aria-label={`Remove tag ${tag}`} className="text-ink-muted hover:text-ink" onClick={() => onChange(value.filter((t) => t !== tag))}>
              ✕
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          id={id}
          aria-label={label}
          className="min-w-20 flex-1 border-0 p-0 text-sm outline-none focus:ring-0"
          value={text}
          onChange={(e) => {
            if (e.target.value.endsWith(",")) add(e.target.value);
            else setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => add(text)}
          placeholder={value.length ? "" : "tag, tag"}
        />
      )}
    </div>
  );
}
