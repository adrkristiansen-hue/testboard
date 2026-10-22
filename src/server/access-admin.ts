import "server-only";
import { db } from "./db";
import { parsePermissions, type Permission } from "@/lib/permissions";

export interface AccessData {
  members: { userId: string; name: string; email: string; organization: string | null; internal: boolean; roleId: string; authProvider: string; pendingInvite: boolean; active: boolean }[];
  roles: { id: string; name: string; permissions: Permission[]; memberCount: number }[];
  organizations: { id: string; name: string; internal: boolean }[];
  boards: { id: string; name: string; restricted: boolean; memberIds: string[] }[];
}

export async function loadAccessData(projectId: string): Promise<AccessData> {
  const [members, roles, organizations, boards] = await Promise.all([
    db.projectMember.findMany({
      where: { projectId },
      include: { user: { include: { organization: true, invites: { where: { usedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } } } } },
      orderBy: { user: { name: "asc" } },
    }),
    db.projectRole.findMany({ where: { projectId }, include: { _count: { select: { members: true } } }, orderBy: { order: "asc" } }),
    db.organization.findMany({ orderBy: [{ internal: "desc" }, { name: "asc" }] }),
    db.team.findMany({ where: { projectId }, include: { members: { select: { userId: true } } }, orderBy: { name: "asc" } }),
  ]);
  return {
    members: members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      organization: m.user.organization?.name ?? null,
      internal: m.user.organization?.internal ?? false,
      roleId: m.roleId,
      authProvider: m.user.authProvider,
      pendingInvite: m.user.invites.length > 0,
      active: m.user.active,
    })),
    roles: roles.map((r) => ({ id: r.id, name: r.name, permissions: parsePermissions(r.permissions), memberCount: r._count.members })),
    organizations: organizations.map((o) => ({ id: o.id, name: o.name, internal: o.internal })),
    boards: boards.map((b) => ({ id: b.id, name: b.name, restricted: b.restricted, memberIds: b.members.map((m) => m.userId) })),
  };
}
