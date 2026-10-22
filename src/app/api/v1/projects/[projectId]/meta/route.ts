import { apiHandler, json } from "@/server/api/http";
import { projectByRef } from "@/server/api/workitems";

type Ctx = { params: Promise<{ projectId: string }> };

/** Valid values for writes: types with states and fields, modules, phases, users. */
export const GET = apiHandler("read", async (_req, user, { params }: Ctx) => {
  const { meta, access } = await projectByRef((await params).projectId, user);
  return json({
    project: { id: meta.id, key: meta.key, name: meta.name },
    yourRole: access.roleName,
    yourPermissions: [...access.permissions],
    types: meta.types.map((t) => ({ key: t.key, name: t.name, disabled: t.disabled, states: t.states.map((s) => ({ name: s.name, category: s.category })), transitions: t.transitions, fields: t.fields.map((f) => ({ key: f.key, label: f.label, kind: f.kind, options: f.options })) })),
    modules: meta.modules.map((m) => m.path),
    phases: meta.phases.map((p) => ({ name: p.name, startDate: p.startDate, endDate: p.endDate })),
    users: meta.users.map((u) => ({ email: u.email, name: u.name })),
  });
});
