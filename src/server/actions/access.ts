"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { db } from "../db";
import { ForbiddenError, requireEditor } from "../auth";
import { run, type ActionResult } from "../result";
import { UserError } from "../workitems-errors";
import { audit } from "../audit";
import { requirePermission } from "../access";
import { createInvite, sendInviteEmail } from "../invites";
import { PERMISSIONS, parsePermissions, type Permission } from "@/lib/permissions";

async function manager(projectId: string) {
  const user = await requireEditor();
  await requirePermission(user, projectId, "access.manage");
  return user;
}

/**
 * Refuse changes that would leave a project without anyone who can manage access
 * (system admins can always recover, but project leads should not lock themselves out by accident).
 */
async function assertSomeoneManages(projectId: string, change: { removeUserId?: string; memberRole?: { userId: string; roleId: string }; rolePermissions?: { roleId: string; permissions: Permission[] } }) {
  const [members, roles] = await Promise.all([
    db.projectMember.findMany({ where: { projectId, user: { active: true, role: { not: "READ_ONLY" } } }, select: { userId: true, roleId: true } }),
    db.projectRole.findMany({ where: { projectId }, select: { id: true, permissions: true } }),
  ]);
  // Permissions per role and role per member *after* the change.
  const permsOf = new Map(roles.map((r) => [r.id, r.id === change.rolePermissions?.roleId ? change.rolePermissions.permissions : parsePermissions(r.permissions)]));
  const ok = members.some((m) => {
    if (m.userId === change.removeUserId) return false;
    const roleId = change.memberRole?.userId === m.userId ? change.memberRole.roleId : m.roleId;
    return permsOf.get(roleId)?.includes("access.manage") ?? false;
  });
  if (!ok) throw new UserError("At least one member must keep the right to manage access.");
}

const inviteSchema = z.object({
  projectId: z.string(),
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().max(120).optional(),
  roleId: z.string(),
  organizationId: z.string().nullable().optional(),
  newOrganization: z.string().trim().max(120).optional(),
  boardIds: z.array(z.string()).max(50).default([]),
});

/**
 * Give someone access to a project by e-mail. Existing users are added (or their role updated);
 * new people get an account and a one-time invite link to set their password.
 */
export async function inviteMember(input: z.infer<typeof inviteSchema>): Promise<ActionResult<{ invitePath: string | null; emailed: boolean; existing: boolean }>> {
  return run(async () => {
    const d = inviteSchema.parse(input);
    const user = await manager(d.projectId);
    const role = await db.projectRole.findFirst({ where: { id: d.roleId, projectId: d.projectId } });
    if (!role) throw new UserError("Unknown role.");
    let organizationId = d.organizationId ?? null;
    if (d.newOrganization) {
      const org = await db.organization.upsert({ where: { name: d.newOrganization }, create: { name: d.newOrganization }, update: {} });
      organizationId = org.id;
    }
    let target = await db.user.findUnique({ where: { email: d.email } });
    const existing = !!target;
    let invitePath: string | null = null;
    let emailed = false;
    if (target) {
      if (!target.active) throw new UserError("That account is deactivated. An admin must activate it first.");
      if (organizationId && !target.organizationId) await db.user.update({ where: { id: target.id }, data: { organizationId } });
    } else {
      if (!d.name) throw new UserError("Enter a name for the new person.");
      // Random password nobody knows; the person sets their own through the invite link.
      target = await db.user.create({
        data: { email: d.email, name: d.name, role: "MEMBER", organizationId, passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 10), color: pickColor(d.email) },
      });
      invitePath = (await createInvite(target.id, user.id)).path;
      const project = await db.project.findUnique({ where: { id: d.projectId }, select: { name: true } });
      emailed = await sendInviteEmail(target, project?.name ?? "", user.name, invitePath);
    }
    await db.projectMember.upsert({
      where: { projectId_userId: { projectId: d.projectId, userId: target.id } },
      create: { projectId: d.projectId, userId: target.id, roleId: role.id },
      update: { roleId: role.id },
    });
    const boards = await db.team.findMany({ where: { id: { in: d.boardIds }, projectId: d.projectId }, select: { id: true } });
    for (const b of boards) await db.teamMember.upsert({ where: { teamId_userId: { teamId: b.id, userId: target.id } }, create: { teamId: b.id, userId: target.id }, update: {} });
    await audit(user.id, existing ? "access.memberAdd" : "access.invite", "Project", d.projectId, { email: d.email, role: role.name, boards: boards.length });
    return { invitePath, emailed, existing };
  });
}

function pickColor(seed: string) {
  const palette = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#4f46e5", "#b45309"];
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

export async function newInviteLink(projectId: string, userId: string): Promise<ActionResult<{ invitePath: string }>> {
  return run(async () => {
    const user = await manager(projectId);
    const m = await db.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, include: { user: true } });
    if (!m) throw new UserError("Not a member of this project.");
    if (m.user.authProvider === "MICROSOFT") throw new UserError("This person signs in with Microsoft and needs no invite.");
    const { path } = await createInvite(userId, user.id);
    await audit(user.id, "access.inviteRenew", "User", userId, { projectId });
    return { invitePath: path };
  });
}

export async function setMemberRole(projectId: string, userId: string, roleId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await manager(projectId);
    const role = await db.projectRole.findFirst({ where: { id: roleId, projectId } });
    if (!role) throw new UserError("Unknown role.");
    await assertSomeoneManages(projectId, { memberRole: { userId, roleId } });
    await db.projectMember.update({ where: { projectId_userId: { projectId, userId } }, data: { roleId } });
    await audit(user.id, "access.roleChange", "User", userId, { projectId, role: role.name });
    return undefined;
  });
}

export async function removeMember(projectId: string, userId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await manager(projectId);
    await assertSomeoneManages(projectId, { removeUserId: userId });
    await db.teamMember.deleteMany({ where: { userId, team: { projectId } } });
    await db.projectMember.delete({ where: { projectId_userId: { projectId, userId } } });
    await audit(user.id, "access.memberRemove", "User", userId, { projectId });
    return undefined;
  });
}

const roleSchema = z.object({
  projectId: z.string(),
  id: z.string().optional(),
  name: z.string().trim().min(1).max(60),
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
});

export async function saveRole(input: z.infer<typeof roleSchema>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const d = roleSchema.parse(input);
    const user = await manager(d.projectId);
    const permissions = [...new Set<Permission>(["items.view", ...d.permissions])];
    const clash = await db.projectRole.findFirst({ where: { projectId: d.projectId, name: d.name, NOT: d.id ? { id: d.id } : undefined } });
    if (clash) throw new UserError("A role with that name already exists.");
    if (d.id) {
      const existing = await db.projectRole.findFirst({ where: { id: d.id, projectId: d.projectId } });
      if (!existing) throw new UserError("Unknown role.");
      await assertSomeoneManages(d.projectId, { rolePermissions: { roleId: d.id, permissions } });
      await db.projectRole.update({ where: { id: d.id }, data: { name: d.name, permissions: JSON.stringify(permissions) } });
      await audit(user.id, "access.roleUpdate", "ProjectRole", d.id, { name: d.name, permissions });
      return { id: d.id };
    }
    const count = await db.projectRole.count({ where: { projectId: d.projectId } });
    const row = await db.projectRole.create({ data: { projectId: d.projectId, name: d.name, permissions: JSON.stringify(permissions), order: count } });
    await audit(user.id, "access.roleCreate", "ProjectRole", row.id, { name: d.name, permissions });
    return { id: row.id };
  });
}

export async function deleteRole(projectId: string, roleId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await manager(projectId);
    const role = await db.projectRole.findFirst({ where: { id: roleId, projectId }, include: { _count: { select: { members: true } } } });
    if (!role) throw new UserError("Unknown role.");
    if (role._count.members > 0) throw new UserError("Move the members of this role to another role first.");
    await db.projectRole.delete({ where: { id: roleId } });
    await audit(user.id, "access.roleDelete", "ProjectRole", roleId, { name: role.name });
    return undefined;
  });
}

/** Lock or unlock a board, and set who is on it. */
export async function setBoardAccess(projectId: string, teamId: string, input: { restricted: boolean; memberIds: string[] }): Promise<ActionResult> {
  return run(async () => {
    const user = await manager(projectId);
    const team = await db.team.findFirst({ where: { id: teamId, projectId } });
    if (!team) throw new UserError("Board not found.");
    const d = z.object({ restricted: z.boolean(), memberIds: z.array(z.string()).max(500) }).parse(input);
    const members = await db.projectMember.findMany({ where: { projectId, userId: { in: d.memberIds } }, select: { userId: true } });
    if (d.restricted && members.length === 0) throw new ForbiddenError("A locked board needs at least one member.");
    await db.team.update({ where: { id: teamId }, data: { restricted: d.restricted } });
    await db.teamMember.deleteMany({ where: { teamId } });
    if (members.length) await db.teamMember.createMany({ data: members.map((m) => ({ teamId, userId: m.userId })) });
    await audit(user.id, "access.boardLock", "Team", teamId, { restricted: d.restricted, members: members.length });
    return undefined;
  });
}
