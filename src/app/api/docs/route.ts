import { openApiSpec } from "@/lib/openapi";
import { escapeHtml } from "@/lib/email";

type Op = { summary: string; description?: string; parameters?: readonly { name: string; in: string; required?: boolean; description?: string }[]; requestBody?: { content: Record<string, { example?: unknown }> }; responses: Record<string, { description: string }> };

/** Self-contained, readable API reference generated from the OpenAPI spec (no external scripts). */
export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const e = escapeHtml;
  const ops = Object.entries(openApiSpec.paths).flatMap(([path, methods]) => Object.entries(methods as Record<string, Op>).map(([method, op]) => ({ path, method, op })));
  const section = ({ path, method, op }: (typeof ops)[number]) => {
    const params = (op.parameters ?? []).filter((p) => p.in === "query");
    const example = op.requestBody?.content["application/json"]?.example;
    const url = `${origin}/api/v1${path.replace("{projectId}", "HRS").replace("{id}", "1")}`;
    const curl = [`curl -H "Authorization: Bearer $TB_TOKEN"`, method !== "get" ? `-X ${method.toUpperCase()}` : "", example ? `-H "Content-Type: application/json" -d '${JSON.stringify(example)}'` : "", `"${url}"`].filter(Boolean).join(" \\\n  ");
    return `<section>
  <h3><span class="m ${method}">${method.toUpperCase()}</span> <code>${e(path)}</code></h3>
  <p>${e(op.summary)}${op.description ? ` – ${e(op.description)}` : ""}</p>
  ${params.length ? `<table><thead><tr><th>Query parameter</th><th>Description</th></tr></thead><tbody>${params.map((p) => `<tr><td><code>${e(p.name)}</code></td><td>${e(p.description ?? "")}</td></tr>`).join("")}</tbody></table>` : ""}
  <p class="r">${Object.entries(op.responses).map(([code, r]) => `<span><b>${code}</b> ${e(r.description)}</span>`).join(" · ")}</p>
  <pre>${e(curl)}</pre>
</section>`;
  };
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>TestBoard API</title>
<style>
body{font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#0b0b0b;background:#f6f7f9;margin:0}
main{max-width:900px;margin:0 auto;padding:24px 16px}
h1{margin:0 0 4px} h2{margin-top:32px} section{background:#fff;border:1px solid #e1e0d9;border-radius:8px;padding:12px 16px;margin:12px 0}
h3{margin:0 0 4px;font-size:16px} code{font-family:ui-monospace,Consolas,monospace}
pre{background:#1b2433;color:#e8eef7;padding:10px;border-radius:6px;overflow-x:auto;font-size:13px}
table{border-collapse:collapse;width:100%;font-size:14px;margin:6px 0} th,td{text-align:left;border-top:1px solid #e1e0d9;padding:4px 6px} th{color:#52514e;font-size:12px}
.m{display:inline-block;min-width:56px;text-align:center;border-radius:4px;color:#fff;font-size:12px;padding:1px 6px;margin-right:4px}
.get{background:#256abf}.post{background:#008300}.patch{background:#9a6700}.delete{background:#c62828}
.r{color:#52514e;font-size:13px} a{color:#0043ce}
</style></head><body><main>
<h1>${e(openApiSpec.info.title)}</h1>
<p>${e(openApiSpec.info.description)}</p>
<p>Machine-readable spec: <a href="/api/v1/openapi.json">/api/v1/openapi.json</a> (OpenAPI ${openApiSpec.openapi}). Base URL: <code>${e(origin)}/api/v1</code></p>
<h2>Quick start</h2>
<pre>export TB_TOKEN=tb_…   # from the user menu → API tokens
curl -H "Authorization: Bearer $TB_TOKEN" "${e(origin)}/api/v1/projects"</pre>
<p>Errors are returned as <code>{"error":{"code":"…","message":"…"}}</code> with status 400 (bad request), 401 (token), 403 (role), 404 (not found) or 422 (unknown value / workflow rule).</p>
<h2>Endpoints</h2>
${ops.map(section).join("\n")}
</main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" } });
}
