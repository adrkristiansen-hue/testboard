import "server-only";
import { ZodError } from "zod";
import { ForbiddenError } from "./auth";
import { UserError } from "./workitems";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string; code?: string };

/** Run a server action body and convert expected errors into a result object. */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message, code: e.code };
    if (e instanceof ForbiddenError) return { ok: false, error: e.message, code: "FORBIDDEN" };
    if (e instanceof ZodError) return { ok: false, error: e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "), code: "INVALID" };
    // Let Next.js control-flow errors (redirect/notFound) propagate.
    if (e && typeof e === "object" && "digest" in e && typeof (e as { digest: unknown }).digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_")) throw e;
    console.error(e);
    return { ok: false, error: "Unexpected error. See server log.", code: "INTERNAL" };
  }
}
