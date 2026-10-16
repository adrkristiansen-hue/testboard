"use client";

import type { UserLite } from "@/lib/types";

/** Native select for users (keyboard and screen-reader friendly). */
export function UserSelect({
  id,
  users,
  value,
  onChange,
  disabled,
  unassignedLabel,
  className = "input",
}: {
  id?: string;
  users: UserLite[];
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  unassignedLabel: string;
  className?: string;
}) {
  return (
    <select id={id} className={className} value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{unassignedLabel}</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );
}
