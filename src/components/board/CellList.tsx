"use client";

import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ItemView } from "@/lib/types";

const VIRTUAL_THRESHOLD = 40;

/**
 * Renders the cards of one board cell. Long lists are virtualised so boards
 * with hundreds of cards stay responsive; short lists render normally.
 */
export function CellList({ items, renderItem, maxHeight }: { items: ItemView[]; renderItem: (item: ItemView) => ReactNode; maxHeight: string }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtual = items.length > VIRTUAL_THRESHOLD;
  const virtualizer = useVirtualizer({
    count: virtual ? items.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 78,
    overscan: 8,
    getItemKey: (i) => items[i].id,
  });

  if (!virtual) {
    return (
      <div className="flex flex-col gap-1.5 overflow-y-auto p-1.5" style={{ maxHeight }}>
        {items.map((it) => (
          <div key={it.id}>{renderItem(it)}</div>
        ))}
      </div>
    );
  }

  return (
    <div ref={parentRef} className="overflow-y-auto p-1.5" style={{ maxHeight }}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((v) => (
          <div
            key={v.key}
            data-index={v.index}
            ref={virtualizer.measureElement}
            style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${v.start}px)`, paddingBottom: 6 }}
          >
            {renderItem(items[v.index])}
          </div>
        ))}
      </div>
    </div>
  );
}
