"use client";

import type { TestStep } from "@/lib/fields";
import { useT } from "../I18nProvider";

export function StepsEditor({ value, onChange, readOnly }: { value: TestStep[]; onChange: (steps: TestStep[]) => void; readOnly?: boolean }) {
  const t = useT();
  const update = (i: number, patch: Partial<TestStep>) => onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-muted">
            <th scope="col" className="w-8 py-1">
              #
            </th>
            <th scope="col" className="py-1">
              {t("item.stepAction")}
            </th>
            <th scope="col" className="py-1">
              {t("item.stepExpected")}
            </th>
            {!readOnly && <th scope="col" className="w-24 py-1">
              <span className="sr-only">{t("common.actions")}</span>
            </th>}
          </tr>
        </thead>
        <tbody>
          {value.map((s, i) => (
            <tr key={i} className="border-b border-line align-top">
              <td className="py-1 pr-1 font-semibold text-ink-muted">{i + 1}</td>
              <td className="py-1 pr-1">
                {readOnly ? (
                  <div className="whitespace-pre-wrap">{s.action}</div>
                ) : (
                  <textarea aria-label={`${t("item.stepAction")} ${i + 1}`} className="input min-h-14" value={s.action} onChange={(e) => update(i, { action: e.target.value })} />
                )}
              </td>
              <td className="py-1 pr-1">
                {readOnly ? (
                  <div className="whitespace-pre-wrap">{s.expected}</div>
                ) : (
                  <textarea aria-label={`${t("item.stepExpected")} ${i + 1}`} className="input min-h-14" value={s.expected} onChange={(e) => update(i, { expected: e.target.value })} />
                )}
              </td>
              {!readOnly && (
                <td className="py-1 whitespace-nowrap">
                  <button type="button" className="icon-btn" aria-label={`${t("common.moveUp")} ${i + 1}`} onClick={() => move(i, -1)} disabled={i === 0}>
                    ↑
                  </button>
                  <button type="button" className="icon-btn" aria-label={`${t("common.moveDown")} ${i + 1}`} onClick={() => move(i, 1)} disabled={i === value.length - 1}>
                    ↓
                  </button>
                  <button type="button" className="icon-btn" aria-label={`${t("common.remove")} ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && (
        <button type="button" className="btn btn-ghost btn-sm mt-1" onClick={() => onChange([...value, { action: "", expected: "" }])}>
          + {t("item.addStep")}
        </button>
      )}
    </div>
  );
}
