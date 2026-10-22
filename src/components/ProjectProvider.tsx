"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ClientAccess, ProjectMeta, TypeLite, UserLite, ModuleLite, PhaseLite } from "@/lib/types";
import { hasPermission, type Permission } from "@/lib/permissions";
import { buildModuleSubtree, type QueryContext } from "@/lib/query";

interface ProjectCtx {
  meta: ProjectMeta;
  typeById: Map<string, TypeLite>;
  userById: Map<string, UserLite>;
  moduleById: Map<string, ModuleLite>;
  phaseById: Map<string, PhaseLite>;
  queryContext: (currentUserId?: string) => QueryContext;
  access: ClientAccess;
  /** Whether the current user's project role allows this */
  can: (p: Permission) => boolean;
}

const Ctx = createContext<ProjectCtx | null>(null);

export function ProjectProvider({ meta, access, children }: { meta: ProjectMeta; access: ClientAccess; children: ReactNode }) {
  const value = useMemo<ProjectCtx>(() => {
    const perms = new Set(access.permissions);
    const userOrg = new Map(meta.users.map((u) => [u.id, u.organization ?? null]));
    const typeById = new Map(meta.types.map((t) => [t.id, t]));
    const subtree = buildModuleSubtree(meta.modules);
    return {
      meta,
      typeById,
      userById: new Map(meta.users.map((u) => [u.id, u])),
      moduleById: new Map(meta.modules.map((m) => [m.id, m])),
      phaseById: new Map(meta.phases.map((p) => [p.id, p])),
      queryContext: (currentUserId?: string) => ({ currentUserId, types: typeById, moduleSubtree: subtree, now: new Date(), userOrg }),
      access,
      can: (p: Permission) => hasPermission(perms, p),
    };
  }, [meta, access]);
  return <Ctx value={value}>{children}</Ctx>;
}

export function useProject() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProject outside ProjectProvider");
  return v;
}
