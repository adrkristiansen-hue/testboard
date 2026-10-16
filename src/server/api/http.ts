import "server-only";
import { ZodError } from "zod";
import { ForbiddenError, type CurrentUser } from "../auth";
import { UserError } from "../workitems";
import { userFromToken } from "../apitokens";
import { canConfigure, canEdit } from "@/lib/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}

function errorResponse(status: number, code: string, message: string) {
  return json({ error: { code, message } }, status);
}

type Level = "read" | "write" | "configure";

/**
 * Wrap a REST handler: Bearer-token auth, role check and uniform JSON errors.
 * Tokens act as their owner, so the owner's role decides what the token may do.
 */
export function apiHandler<C>(level: Level, fn: (req: Request, user: CurrentUser, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      const user = await userFromToken(req.headers.get("authorization"));
      if (!user) return errorResponse(401, "UNAUTHORIZED", "Missing or invalid API token. Send 'Authorization: Bearer tb_…'.");
      if (level === "write" && !canEdit(user.role)) return errorResponse(403, "FORBIDDEN", "Read-only users cannot make changes.");
      if (level === "configure" && !canConfigure(user.role)) return errorResponse(403, "FORBIDDEN", "Only admins and test leads can do this.");
      return await fn(req, user, ctx);
    } catch (e) {
      if (e instanceof ApiError) return errorResponse(e.status, e.code, e.message);
      if (e instanceof UserError) return errorResponse(e.code === "NOT_FOUND" ? 404 : 422, e.code, e.message);
      if (e instanceof ForbiddenError) return errorResponse(403, "FORBIDDEN", e.message);
      if (e instanceof ZodError) return errorResponse(400, "INVALID", e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
      console.error("[api]", e);
      return errorResponse(500, "INTERNAL", "Unexpected error.");
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be JSON.");
  }
}
