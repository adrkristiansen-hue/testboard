"use client";

import { useRouter } from "next/navigation";
import type { NewItemDefaults } from "@/lib/prefill";
import { useProject } from "../ProjectProvider";
import { WorkItemForm } from "./WorkItemForm";

/** Full-page work item (also used for "new"). */
export function ItemPage({ itemId, newDefaults }: { itemId: number | null; newDefaults?: NewItemDefaults }) {
  const router = useRouter();
  const { meta } = useProject();
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <WorkItemForm
        itemId={itemId}
        newDefaults={newDefaults}
        variant="page"
        onCreated={(id) => router.replace(`/p/${meta.id}/items/${id}`)}
        onSaved={() => router.refresh()}
        onOpenItem={(id) => router.push(`/p/${meta.id}/items/${id}`)}
      />
    </main>
  );
}
