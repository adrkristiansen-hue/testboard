"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ProjectMeta, TypeLite, UserLite, ModuleLite, PhaseLite } from "@/lib/types";
import { buildModuleSubtree, type QueryContext } from "@/lib/query";

interface ProjectCtx {
  meta: ProjectMeta;
  typeById: Map<string, TypeLite>;
  userById: Map<string, UserLite>;
  moduleById: Map<string, ModuleLite>;
  phaseById: Map<string, PhaseLite>;
  queryContext: (currentUserId?: string) => QueryContext;
}

const Ctx = createContext<ProjectCtx | null>(null);

export function ProjectProvider({ meta, children }: { meta: ProjectMeta; children: ReactNode }) {
  const value = useMemo<ProjectCtx>(() => {
    const typeById = new Map(meta.types.map((t) => [t.id, t]));
    const subtree = buildModuleSubtree(meta.modules);
    return {
      meta,
      typeById,
      userById: new Map(meta.users.map((u) => [u.id, u])),
      moduleById: new Map(meta.modules.map((m) => [m.id, m])),
      phaseById: new Map(meta.phases.map((p) => [p.id, p])),
      queryContext: (currentUserId?: string) => ({ currentUserId, types: typeById, moduleSubtree: subtree, now: new Date() }),
    };
  }, [meta]);
  return <Ctx value={value}>{children}</Ctx>;
}

export function useProject() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProject outside ProjectProvider");
  return v;
}
