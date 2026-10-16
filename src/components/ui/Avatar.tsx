import type { UserLite } from "@/lib/types";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

export function Avatar({ user, size = 24, title }: { user: Pick<UserLite, "name" | "color"> | null | undefined; size?: number; title?: string }) {
  if (!user) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-gray-400 text-gray-400"
        style={{ width: size, height: size, fontSize: size * 0.45 }}
        title={title}
      >
        ?
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: user.color, fontSize: size * 0.42 }}
      title={title ?? user.name}
    >
      {initials(user.name)}
    </span>
  );
}
