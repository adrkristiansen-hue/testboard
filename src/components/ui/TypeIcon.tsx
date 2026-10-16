import type { TypeLite } from "@/lib/types";

export function TypeIcon({ type, size = 18 }: { type: Pick<TypeLite, "icon" | "color" | "name"> | undefined; size?: number }) {
  if (!type) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-sm font-bold text-white"
      style={{ width: size, height: size, background: type.color, fontSize: size * 0.62, lineHeight: 1 }}
      title={type.name}
      aria-label={type.name}
      role="img"
    >
      {type.icon}
    </span>
  );
}

export function StateDot({ color }: { color: string }) {
  return <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />;
}
