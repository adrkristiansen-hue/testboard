"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { UserLite } from "@/lib/types";
import { canConfigure, canEdit } from "@/lib/types";

const SessionContext = createContext<UserLite | null>(null);

export function SessionProvider({ user, children }: { user: UserLite; children: ReactNode }) {
  return <SessionContext value={user}>{children}</SessionContext>;
}

export function useSessionUser() {
  const u = useContext(SessionContext);
  if (!u) throw new Error("useSessionUser outside SessionProvider");
  return {
    user: u,
    canEdit: canEdit(u.role),
    canConfigure: canConfigure(u.role),
    isAdmin: u.role === "ADMIN",
  };
}
