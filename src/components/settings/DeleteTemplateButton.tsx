"use client";

import { useRouter } from "next/navigation";
import { deleteTemplate } from "@/server/actions/config";
import { useT } from "../I18nProvider";
import { useToast } from "../ui/Toast";

export function DeleteTemplateButton({ id, name }: { id: string; name: string }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-danger btn-sm"
      aria-label={`${t("common.delete")}: ${name}`}
      onClick={async () => {
        if (!confirm(t("common.confirmDelete"))) return;
        const res = await deleteTemplate(id);
        if (!res.ok) return toast(res.error, "error");
        router.refresh();
      }}
    >
      {t("common.delete")}
    </button>
  );
}
