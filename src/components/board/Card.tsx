"use client";

import { memo } from "react";
import type { ItemView, TypeLite, UserLite, ModuleLite, PhaseLite } from "@/lib/types";
import type { CardField, CardStyle } from "@/lib/cards";
import type { ColumnDef } from "@/lib/board";
import type { Lane } from "@/lib/swimlanes";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { Avatar } from "../ui/Avatar";
import { TypeIcon, StateDot } from "../ui/TypeIcon";
import { Popover, MenuItem, MenuLabel } from "../ui/Popover";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n";

export interface CardActions {
  open: (id: number) => void;
  moveToColumn: (item: ItemView, column: ColumnDef, done: boolean) => void;
  moveToLane: (item: ItemView, lane: Lane) => void;
  moveWithinCell: (item: ItemView, where: "top" | "bottom" | "up" | "down") => void;
  assign: (item: ItemView, userId: string | null) => void;
}

export interface CardProps {
  item: ItemView;
  type: TypeLite | undefined;
  fields: CardField[];
  style: CardStyle;
  overdue: boolean;
  assignee: UserLite | undefined;
  module: ModuleLite | undefined;
  phase: PhaseLite | undefined;
  showState: boolean;
  columns: ColumnDef[];
  currentColumnId: string;
  lanes: Lane[];
  users: UserLite[];
  currentUserId: string;
  canEdit: boolean;
  /** May reassign from the card's avatar menu */
  canAssign: boolean;
  actions: CardActions;
  t: TFunction;
  locale: Locale;
  dragging?: boolean;
}

function CardInner(p: CardProps) {
  const { item, type, fields, t } = p;
  const has = (f: CardField) => fields.includes(f);
  const stateColor = type?.states.find((s) => s.name === item.state)?.color ?? "#999";
  const moveColumns = p.columns.filter((c) => (c.stateMap[item.typeId] ?? []).length > 0);
  const assignableLanes = p.lanes.filter((l) => l.assign);

  return (
    <article
      aria-label={`${type?.name ?? ""} ${item.id}: ${item.title}`}
      className={`group relative rounded-[4px] border border-line bg-white text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:shadow-md ${p.dragging ? "opacity-40" : ""}`}
      style={{
        borderLeft: `4px solid ${p.style.borderColor ?? type?.color ?? "#999"}`,
        background: p.style.background,
      }}
      title={p.style.matched.length ? p.style.matched.join(", ") : undefined}
    >
      <div className="flex items-start gap-1.5 px-2 pt-1.5">
        <TypeIcon type={type} size={14} />
        <button
          type="button"
          onClick={() => p.actions.open(item.id)}
          className="min-w-0 flex-1 text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-brand"
        >
          <span className="mr-1 font-semibold text-ink-muted">{item.id}</span>
          <span className="line-clamp-3 inline break-words font-medium text-ink">{item.title}</span>
        </button>
        {p.canEdit && (
          <Popover label={`${t("board.cardMenu")} #${item.id}`} trigger={<span aria-hidden="true">⋯</span>} align="right" className="relative z-10 -mr-1 -mt-0.5" triggerClassName="icon-btn h-6 w-6 opacity-60 group-hover:opacity-100 focus:opacity-100">
            {(close) => (
              <div className="max-h-[60vh] w-56 overflow-y-auto">
                <MenuItem onClick={() => { close(); p.actions.open(item.id); }}>{t("common.open")}</MenuItem>
                <MenuItem onClick={() => { close(); p.actions.assign(item, p.currentUserId); }}>{t("board.assignToMe")}</MenuItem>
                <MenuLabel>{t("board.moveTo")}</MenuLabel>
                {moveColumns.map((c) =>
                  c.split ? (
                    [false, true].map((done) => (
                      <MenuItem key={c.id + done} active={c.id === p.currentColumnId && item.columnDone === done} onClick={() => { close(); p.actions.moveToColumn(item, c, done); }}>
                        {c.name} – {done ? t("board.done") : t("board.doing")}
                      </MenuItem>
                    ))
                  ) : (
                    <MenuItem key={c.id} active={c.id === p.currentColumnId} onClick={() => { close(); p.actions.moveToColumn(item, c, false); }}>
                      {c.name}
                    </MenuItem>
                  ),
                )}
                {assignableLanes.length > 1 && (
                  <>
                    <MenuLabel>{t("board.moveToLane")}</MenuLabel>
                    {assignableLanes.map((l) => (
                      <MenuItem key={l.key} onClick={() => { close(); p.actions.moveToLane(item, l); }}>
                        {l.name}
                      </MenuItem>
                    ))}
                  </>
                )}
                <MenuLabel>{t("common.actions")}</MenuLabel>
                <MenuItem onClick={() => { close(); p.actions.moveWithinCell(item, "top"); }}>{t("board.moveTop")}</MenuItem>
                <MenuItem onClick={() => { close(); p.actions.moveWithinCell(item, "up"); }}>{t("common.moveUp")}</MenuItem>
                <MenuItem onClick={() => { close(); p.actions.moveWithinCell(item, "down"); }}>{t("common.moveDown")}</MenuItem>
                <MenuItem onClick={() => { close(); p.actions.moveWithinCell(item, "bottom"); }}>{t("board.moveBottom")}</MenuItem>
              </div>
            )}
          </Popover>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 pb-1.5 pl-[26px] pt-1 text-xs text-ink-muted">
        {p.showState && (
          <span className="inline-flex items-center gap-1">
            <StateDot color={stateColor} />
            {item.state}
          </span>
        )}
        {has("module") && p.module && <span className="max-w-full truncate">{p.module.name}</span>}
        {has("phase") && p.phase && <span>{p.phase.name}</span>}
        {has("priority") && (
          <span className={`rounded px-1 font-semibold ${item.priority === 1 ? "bg-red-100 text-red-800" : "bg-gray-100 text-ink-muted"}`} title={t(`priority.${item.priority}` as MessageKey)}>
            P{item.priority}
          </span>
        )}
        {has("severity") && item.severity && (
          <span className={`rounded px-1 font-semibold ${item.severity <= 1 ? "bg-red-700 text-white" : item.severity === 2 ? "bg-orange-100 text-orange-800" : "bg-gray-100 text-ink-muted"}`} title={t(`severity.${item.severity}` as MessageKey)}>
            S{item.severity}
          </span>
        )}
        {has("dueDate") && item.dueDate && (
          <span className={p.overdue ? "font-semibold text-danger" : ""} title={t("field.dueDate")}>
            {p.overdue ? "⚠ " : "📅 "}
            {formatDate(item.dueDate, p.locale)}
          </span>
        )}
        {has("comments") && item.commentCount > 0 && (
          <span title={t("field.comments")} aria-label={`${item.commentCount} ${t("field.comments")}`}>
            💬 {item.commentCount}
          </span>
        )}
        {has("children") && item.childTotal > 0 && (
          <span title={t("field.children")} className={item.childDone === item.childTotal ? "text-ok" : ""}>
            ☑ {item.childDone}/{item.childTotal}
          </span>
        )}
        {has("tags") &&
          item.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded bg-gray-100 px-1 text-[11px] text-ink">
              {tag}
            </span>
          ))}
        {has("assignee") && (
          <span className="relative z-10 ml-auto">
            {p.canAssign ? (
              <Popover
                label={`${t("board.assign")}: ${p.assignee?.name ?? t("common.unassigned")}`}
                trigger={<Avatar user={p.assignee} size={22} />}
                align="right"
                triggerClassName="rounded-full"
              >
                {(close) => (
                  <div className="max-h-72 w-56 overflow-y-auto">
                    <MenuItem active={!item.assignedToId} onClick={() => { close(); p.actions.assign(item, null); }}>
                      <Avatar user={null} size={20} /> {t("common.unassigned")}
                    </MenuItem>
                    {p.users.map((u) => (
                      <MenuItem key={u.id} active={u.id === item.assignedToId} onClick={() => { close(); p.actions.assign(item, u.id); }}>
                        <Avatar user={u} size={20} /> {u.name}
                      </MenuItem>
                    ))}
                  </div>
                )}
              </Popover>
            ) : (
              <Avatar user={p.assignee} size={22} />
            )}
          </span>
        )}
      </div>
    </article>
  );
}

export const Card = memo(CardInner);
