import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { AdminNav } from "@/components/settings/AdminNav";
import { OrganizationsAdmin } from "@/components/settings/OrganizationsAdmin";

export const metadata = { title: "Organisations" };

export default async function OrganizationsPage() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  const orgs = await db.organization.findMany({ include: { _count: { select: { users: true } } }, orderBy: [{ internal: "desc" }, { name: "asc" }] });
  return (
    <main className="mx-auto w-full max-w-4xl p-4">
      <AdminNav current="organizations" />
      <OrganizationsAdmin orgs={orgs.map((o) => ({ id: o.id, name: o.name, internal: o.internal, userCount: o._count.users }))} />
    </main>
  );
}
