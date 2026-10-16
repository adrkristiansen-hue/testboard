import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { UsersAdmin } from "@/components/settings/UsersAdmin";
import { AdminNav } from "@/components/settings/AdminNav";
import type { Role } from "@/lib/types";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  const users = await db.user.findMany({ orderBy: { name: "asc" } });
  return (
    <main className="mx-auto w-full max-w-5xl p-4">
      <AdminNav current="users" />
      <UsersAdmin users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role as Role, color: u.color, active: u.active }))} currentUserId={user.id} />
    </main>
  );
}
