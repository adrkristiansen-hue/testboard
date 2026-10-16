import { apiHandler, json } from "@/server/api/http";

export const GET = apiHandler("read", async (_req, user) => json({ id: user.id, name: user.name, email: user.email, role: user.role }));
