"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardData } from "@/lib/dashboard";
import { FLOW_CATEGORIES } from "@/lib/dashboard";
import { TEST_OUTCOMES } from "@/lib/fields";
import type { MessageKey } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { useProject } from "../ProjectProvider";
import { useI18n } from "../I18nProvider";

// Validated with the dataviz palette validator (light surface).
// Ordered state categories -> one-hue ordinal ramp, light to dark.
const CATEGORY_COLORS: Record<(typeof FLOW_CATEGORIES)[number], string> = { PROPOSED: "#86b6ef", IN_PROGRESS: "#3987e5", RESOLVED: "#1c5cab", COMPLETED: "#0d366b" };
// Test outcomes mean good/bad -> reserved status colours, always paired with an icon + label.
const OUTCOME_STYLE: Record<(typeof TEST_OUTCOMES)[number], { color: string; icon: string }> = {
  Passed: { color: "#0ca30c", icon: "✓" },
  Failed: { color: "#d03b3b", icon: "✕" },
  Blocked: { color: "#fab219", icon: "!" },
  "Not run": { color: "#c3c2b7", icon: "○" },
};
const SERIES_1 = "#2a78d6";
const short = (s: string) => (s.length > 13 ? `${s.slice(0, 12)}…` : s);
const MUTED = "#898781";
const GRID = "#e1e0d9";
const AXIS = { fontSize: 12, fill: "#52514e" };

function Card({ title, subtitle, children, table, className = "" }: { title: string; subtitle?: string; children: ReactNode; table?: ReactNode; className?: string }) {
  const { t } = useI18n();
  const id = useId();
  const [showTable, setShowTable] = useState(false);
  return (
    <section aria-labelledby={id} className={`card-panel flex flex-col p-3 ${className}`}>
      <div className="mb-2 flex items-start gap-2">
        <div className="mr-auto">
          <h2 id={id} className="text-sm font-semibold">
            {title}
          </h2>
          {subtitle && <p className="text-xs text-ink-muted">{subtitle}</p>}
        </div>
        {table && (
          <button type="button" className="text-xs font-semibold text-brand hover:underline" aria-pressed={showTable} onClick={() => setShowTable((s) => !s)}>
            {showTable ? t("dash.showChart") : t("dash.showTable")}
          </button>
        )}
      </div>
      {showTable && table ? <div className="max-h-72 overflow-auto">{table}</div> : children}
    </section>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={i} scope="col" className={`border-b border-line px-2 py-1 text-xs font-semibold text-ink-muted ${i ? "text-right" : "text-left"}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-line last:border-0">
            {r.map((c, j) => (
              <td key={j} className={`px-2 py-1 ${j ? "text-right" : ""}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: "critical" }) {
  return (
    <div className="card-panel p-3">
      <div className="text-xs font-semibold text-ink-muted">{label}</div>
      <div className={`text-3xl font-semibold ${tone === "critical" && value !== 0 ? "text-danger" : ""}`}>{value}</div>
      {hint && <div className="text-xs text-ink-muted">{hint}</div>}
    </div>
  );
}

/** Legend in stack order; text in ink, the swatch carries identity. */
function LegendRow({ items }: { items: { label: string; color: string; dashed?: boolean; icon?: string }[] }) {
  return (
    <ul className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-ink-muted">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          {i.dashed ? (
            <span aria-hidden="true" className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: i.color }} />
          ) : (
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          )}
          {i.icon && <span aria-hidden="true">{i.icon}</span>}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

const tooltipStyle = { contentStyle: { borderRadius: 6, border: "1px solid rgba(11,11,11,0.10)", fontSize: 12 }, cursor: { fill: "rgba(11,11,11,0.04)" } };

export function Dashboard({ data, phaseId, flowType, flowDays, flowDayOptions }: { data: DashboardData; phaseId: string; flowType: string; flowDays: number; flowDayOptions: number[] }) {
  const { t, locale } = useI18n();
  const { meta } = useProject();
  const router = useRouter();
  const sp = useSearchParams();
  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    router.push(`?${p}`, { scroll: false });
  };
  const catLabel = (c: string) => t(`category.${c}` as MessageKey);
  const outcomeLabel = (o: string) => t(`dash.outcome.${o.replace(" ", "")}` as MessageKey);
  const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(locale === "nb" ? "nb-NO" : "en-GB", { day: "numeric", month: "short" });
  const k = data.kpis;
  const assigneeHeight = Math.max(160, data.defectsByAssignee.length * 28 + 30);

  return (
    <main className="w-full space-y-3 overflow-auto p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">{t("nav.dashboard")}</h1>
        <label className="flex items-center gap-2 text-sm">
          {t("field.phase")}
          <select className="rounded border border-line-strong bg-white px-2 py-1" value={phaseId} onChange={(e) => setParam("phase", e.target.value)}>
            <option value="all">{t("dash.allPhases")}</option>
            {meta.phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t("dash.openDefects")} value={k.openDefects} />
        <Stat label={t("dash.criticalDefects")} value={k.criticalDefects} hint={t("dash.criticalHint")} tone="critical" />
        <Stat label={t("dash.passRate")} value={k.passRate === null ? "–" : `${k.passRate} %`} hint={t("dash.executedOf", { executed: k.testsExecuted, total: k.testsTotal })} />
        <Stat label={t("field.overdue")} value={k.overdue} tone="critical" />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card
          title={t("dash.stateByModule")}
          subtitle={t("dash.stateByModuleHint")}
          table={<DataTable head={[t("field.module"), ...FLOW_CATEGORIES.map(catLabel)]} rows={data.stateByModule.map((r) => [r.module, ...FLOW_CATEGORIES.map((c) => r[c])])} />}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.stateByModule} margin={{ top: 4, right: 8, bottom: 0, left: -16 }} barCategoryGap="25%">
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="module" tick={AXIS} tickLine={false} axisLine={{ stroke: "#c3c2b7" }} interval={0} tickFormatter={short} />
              <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} />
              {FLOW_CATEGORIES.map((c, i) => (
                <Bar key={c} dataKey={c} name={catLabel(c)} stackId="s" fill={CATEGORY_COLORS[c]} stroke="#fff" strokeWidth={2} radius={i === FLOW_CATEGORIES.length - 1 ? [4, 4, 0, 0] : 0} />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <LegendRow items={FLOW_CATEGORIES.map((c) => ({ label: catLabel(c), color: CATEGORY_COLORS[c] }))} />
        </Card>

        <Card
          title={t("dash.outcomesByModule")}
          table={<DataTable head={[t("field.module"), ...TEST_OUTCOMES.map(outcomeLabel)]} rows={data.outcomesByModule.map((r) => [r.module, ...TEST_OUTCOMES.map((o) => r[o])])} />}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.outcomesByModule} margin={{ top: 4, right: 8, bottom: 0, left: -16 }} barCategoryGap="25%">
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="module" tick={AXIS} tickLine={false} axisLine={{ stroke: "#c3c2b7" }} interval={0} tickFormatter={short} />
              <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} />
              {TEST_OUTCOMES.map((o, i) => (
                <Bar key={o} dataKey={o} name={`${OUTCOME_STYLE[o].icon} ${outcomeLabel(o)}`} stackId="o" fill={OUTCOME_STYLE[o].color} stroke="#fff" strokeWidth={2} radius={i === TEST_OUTCOMES.length - 1 ? [4, 4, 0, 0] : 0} />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <LegendRow items={TEST_OUTCOMES.map((o) => ({ label: outcomeLabel(o), color: OUTCOME_STYLE[o].color, icon: OUTCOME_STYLE[o].icon }))} />
        </Card>

        <Card title={t("dash.defectsBySeverity")} subtitle={t("dash.openOnly")} table={<DataTable head={[t("field.severity"), t("dash.count")]} rows={data.defectsBySeverity.map((r) => [r.severity, r.count])} />}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.defectsBySeverity} margin={{ top: 4, right: 8, bottom: 0, left: -16 }} barCategoryGap="35%">
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="severity" tick={AXIS} tickLine={false} axisLine={{ stroke: "#c3c2b7" }} tickFormatter={(s: string) => t(`severity.${s}` as MessageKey)} />
              <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} labelFormatter={(s) => t(`severity.${s}` as MessageKey)} />
              <Bar dataKey="count" name={t("dash.count")} fill={SERIES_1} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title={t("dash.defectsByState")} table={<DataTable head={[t("field.state"), t("dash.count")]} rows={data.defectsByState.map((r) => [r.state, r.count])} />}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.defectsByState} margin={{ top: 4, right: 8, bottom: 0, left: -16 }} barCategoryGap="35%">
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="state" tick={AXIS} tickLine={false} axisLine={{ stroke: "#c3c2b7" }} interval={0} />
              <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="count" name={t("dash.count")} fill={SERIES_1} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title={t("dash.defectsByAssignee")} subtitle={t("dash.allAssigneesHint")} table={<DataTable head={[t("field.assignedTo"), t("dash.count")]} rows={data.defectsByAssignee.map((r) => [r.name, r.count])} />}>
          <ResponsiveContainer width="100%" height={assigneeHeight}>
            <BarChart data={data.defectsByAssignee} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 8 }} barCategoryGap="25%">
              <CartesianGrid horizontal={false} stroke={GRID} />
              <XAxis type="number" allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" width={130} tick={AXIS} tickLine={false} axisLine={{ stroke: "#c3c2b7" }} interval={0} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="count" name={t("dash.count")} fill={SERIES_1} radius={[0, 4, 4, 0]} minPointSize={0} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title={t("dash.defectAgeing")} subtitle={t("dash.defectAgeingHint")} table={<DataTable head={[t("dash.ageDays"), t("dash.count")]} rows={data.defectAgeing.map((r) => [r.bucket, r.count])} />}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.defectAgeing} margin={{ top: 4, right: 8, bottom: 0, left: -16 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="bucket" tick={AXIS} tickLine={false} axisLine={{ stroke: "#c3c2b7" }} tickFormatter={(b: string) => t("dash.days", { range: b })} />
              <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} labelFormatter={(b) => t("dash.days", { range: String(b) })} />
              <Bar dataKey="count" name={t("dash.count")} fill={SERIES_1} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card
          title={t("dash.cumulativeFlow")}
          subtitle={t("dash.cumulativeFlowHint")}
          className="xl:col-span-2"
          table={<DataTable head={[t("dash.date"), ...FLOW_CATEGORIES.map(catLabel)]} rows={data.flow.map((r) => [r.date, ...FLOW_CATEGORIES.map((c) => r[c])])} />}
        >
          <div className="mb-2 flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-2">
              {t("field.type")}
              <select className="rounded border border-line-strong bg-white px-2 py-1" value={flowType} onChange={(e) => setParam("flowType", e.target.value)}>
                <option value="">{t("common.all")}</option>
                {meta.types.map((ty) => (
                  <option key={ty.id} value={ty.key}>
                    {ty.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              {t("dash.period")}
              <select className="rounded border border-line-strong bg-white px-2 py-1" value={flowDays} onChange={(e) => setParam("days", e.target.value)}>
                {flowDayOptions.map((d) => (
                  <option key={d} value={d}>
                    {t("dash.lastDays", { days: d })}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.flow} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={{ stroke: "#c3c2b7" }} tickFormatter={shortDate} minTickGap={24} />
              <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle.contentStyle} labelFormatter={(d) => shortDate(String(d))} />
              {/* Completed at the bottom so the band of finished work grows upward. */}
              {[...FLOW_CATEGORIES].reverse().map((c) => (
                <Area key={c} type="monotone" dataKey={c} name={catLabel(c)} stackId="f" stroke="#fff" strokeWidth={1} fill={CATEGORY_COLORS[c]} fillOpacity={1} isAnimationActive={false} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
          <LegendRow items={FLOW_CATEGORIES.map((c) => ({ label: catLabel(c), color: CATEGORY_COLORS[c] }))} />
        </Card>

        <Card
          title={data.burndown ? t("dash.burndownFor", { phase: data.burndown.phaseName }) : t("dash.burndown")}
          subtitle={t("dash.burndownHint")}
          table={data.burndown ? <DataTable head={[t("dash.date"), t("dash.remaining"), t("dash.ideal")]} rows={data.burndown.points.map((p) => [p.date, p.remaining ?? "", p.ideal])} /> : undefined}
        >
          {data.burndown ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.burndown.points} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={{ stroke: "#c3c2b7" }} tickFormatter={shortDate} minTickGap={24} />
                <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle.contentStyle} labelFormatter={(d) => shortDate(String(d))} />
                <Line type="linear" dataKey="ideal" name={t("dash.ideal")} stroke={MUTED} strokeDasharray="4 4" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="remaining" name={t("dash.remaining")} stroke={SERIES_1} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : null}
          {data.burndown ? (
            <LegendRow items={[{ label: t("dash.remaining"), color: SERIES_1 }, { label: t("dash.ideal"), color: MUTED, dashed: true }]} />
          ) : (
            <p className="py-8 text-center text-sm text-ink-muted">{t("dash.burndownNeedsPhase")}</p>
          )}
        </Card>

        <Card title={`${t("field.overdue")} (${data.kpis.overdue})`}>
          {data.overdue.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">{t("dash.noOverdue")}</p>
          ) : (
            <ul className="max-h-64 divide-y divide-line overflow-auto text-sm">
              {data.overdue.map((o) => (
                <li key={o.id} className="flex items-center gap-2 py-1.5">
                  <span className="w-10 text-xs font-semibold text-ink-muted">{o.id}</span>
                  <Link href={`/p/${meta.id}/items/${o.id}`} className="min-w-0 flex-1 truncate hover:underline">
                    {o.title}
                  </Link>
                  <span className="hidden text-xs text-ink-muted sm:inline">{o.assignee}</span>
                  <span className="w-24 text-right text-xs font-semibold text-danger">{formatDate(o.dueDate, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}
