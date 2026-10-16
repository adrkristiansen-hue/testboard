import { test, expect } from "@playwright/test";
import { login, TESTER, unique } from "./helpers";

test("API token: create in UI, use REST API, revoke", async ({ page, request }) => {
  await login(page, TESTER);
  await page.goto("/account/tokens");
  await page.getByLabel("Token name").fill(unique("e2e"));
  await page.getByRole("button", { name: "Create token" }).click();
  const token = (await page.getByTestId("new-token").textContent())!.trim();
  expect(token).toMatch(/^tb_/);
  const auth = { Authorization: `Bearer ${token}` };

  expect((await request.get("/api/v1/me")).status()).toBe(401);
  const me = await (await request.get("/api/v1/me", { headers: auth })).json();
  expect(me.email).toBe(TESTER.email);

  const projects = (await (await request.get("/api/v1/projects", { headers: auth })).json()).projects;
  const key = projects[0].key;

  const title = unique("API defect");
  const created = await request.post(`/api/v1/projects/${key}/workitems`, {
    headers: auth,
    data: { type: "Defect", title, module: "Hire", phase: "SIT 2", assignedTo: "Nora Lindeberg", severity: 2, fields: { environment: "TEST" } },
  });
  expect(created.status()).toBe(201);
  const item = await created.json();
  expect(item).toMatchObject({ type: "DEFECT", title, state: "New", module: "Employee Central > Hire", phase: "SIT 2", assignedTo: { name: "Nora Lindeberg" }, severity: 2 });

  // Workflow rules apply: New -> Fixed is not allowed for defects
  const bad = await request.patch(`/api/v1/workitems/${item.id}`, { headers: auth, data: { state: "Fixed" } });
  expect(bad.status()).toBe(422);
  const ok = await request.patch(`/api/v1/workitems/${item.id}`, { headers: auth, data: { state: "Active", priority: 1 } });
  expect(ok.status()).toBe(200);
  expect((await ok.json()).changedFields).toEqual(expect.arrayContaining(["state", "priority"]));

  const unknown = await request.patch(`/api/v1/workitems/${item.id}`, { headers: auth, data: { assignedTo: "ghost@nowhere" } });
  expect(unknown.status()).toBe(422);

  const list = await (await request.get(`/api/v1/projects/${key}/workitems?q=${encodeURIComponent(title)}`, { headers: auth })).json();
  expect(list.total).toBe(1);

  expect((await request.post(`/api/v1/workitems/${item.id}/comments`, { headers: auth, data: { text: "From the API" } })).status()).toBe(201);
  const comments = (await (await request.get(`/api/v1/workitems/${item.id}/comments`, { headers: auth })).json()).comments;
  expect(comments.at(-1).text).toBe("From the API");

  // Members cannot delete
  expect((await request.delete(`/api/v1/workitems/${item.id}`, { headers: auth })).status()).toBe(403);

  // Docs are public
  expect((await request.get("/api/v1/openapi.json")).ok()).toBe(true);
  expect(await (await request.get("/api/docs")).text()).toContain("TestBoard REST API");

  // Revoke
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Revoke" }).first().click();
  await expect(page.getByText("Revoked").first()).toBeVisible();
  expect((await request.get("/api/v1/me", { headers: auth })).status()).toBe(401);
});

test("admin: audit log shows events", async ({ page }) => {
  await login(page, { email: "siri.holmvik@demo.test", password: "demo1234" });
  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "auth.login" }).first()).toBeVisible();
  await page.getByLabel("Action").selectOption("auth.");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/action=auth\./);
});
