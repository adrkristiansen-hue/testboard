import { test, expect, type Page } from "@playwright/test";
import { login, TEST_LEAD, TESTER, unique } from "./helpers";

async function itemIdByTitle(page: Page, title: string): Promise<number> {
  await page.getByRole("link", { name: "Work items" }).click();
  await expect(page.getByRole("heading", { name: "Work items" })).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await page.getByPlaceholder(/Filter by keyword/).fill(title);
  const row = page.locator("tbody tr", { hasText: title }).first();
  await expect(row).toBeVisible();
  return Number((await row.locator("td").nth(1).textContent())!.trim());
}

test("customer tester: locked board, hidden items, internal comments and limited actions", async ({ page, browser }) => {
  // As the project lead, find a payroll (locked) item and check the internal comment exists.
  await login(page, TEST_LEAD);
  const pid = page.url().match(/\/p\/([^/]+)/)![1];
  const lockedId = await itemIdByTitle(page, "Holiday pay not included in final settlement");
  const sharedId = await itemIdByTitle(page, "Legal entity transfer creates duplicate employment");
  await page.goto(`/p/${pid}/items/${sharedId}`);
  await expect(page.getByText(/root cause is our position-sync job/)).toBeVisible();
  await expect(page.getByText("🔒 Internal").first()).toBeVisible();

  // As a customer tester
  const ctx = await browser.newContext();
  const maja = await ctx.newPage();
  await login(maja, TESTER);
  await expect(maja.getByText("Customer tester", { exact: true })).toBeVisible();
  await expect(maja.getByRole("link", { name: "Project settings" })).toHaveCount(0);
  await expect(maja.getByRole("link", { name: "Import" })).toHaveCount(0);
  const boards = maja.getByLabel("Choose a team board").locator("option");
  await expect(boards.filter({ hasText: "Payroll team" })).toHaveCount(0);

  // Locked item: not in the list, and a direct link is a 404
  const res = await maja.goto(`/p/${pid}/items/${lockedId}`);
  expect(res?.status()).toBe(404);

  // Shared item: visible, but not the internal comment, no close state, no delete
  await maja.goto(`/p/${pid}/items/${sharedId}`);
  await expect(maja.getByRole("heading", { name: /Legal entity transfer/ })).toBeAttached();
  await expect(maja.getByText(/position-sync job/)).toHaveCount(0);
  const states = await maja.getByLabel("State").locator("option").allTextContents();
  expect(states).not.toContain("Closed");
  expect(states).not.toContain("Rejected");
  await maja.getByRole("button", { name: "More" }).click();
  await expect(maja.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await ctx.close();
});

test("project lead invites a new person who sets a password and gets in", async ({ page, browser }) => {
  await login(page, TEST_LEAD);
  const pid = page.url().match(/\/p\/([^/]+)/)![1];
  await page.goto(`/p/${pid}/settings`);
  await page.getByRole("tab", { name: "Access" }).click();
  const email = `${unique("guest").replace(/\s+/g, ".").toLowerCase()}@kunde.example`;
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Name/).fill("Guest Tester");
  await page.getByLabel("Role", { exact: true }).selectOption({ label: "Customer tester" });
  await page.getByLabel("Organisation").selectOption({ label: "Fjordvik kommune (demo)" });
  await page.getByRole("button", { name: "Invite" }).click();
  const link = (await page.getByTestId("invite-link").textContent())!.trim();
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{30,}$/);
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.locator("tr", { hasText: email }).getByText("Invite pending")).toBeVisible();

  const ctx = await browser.newContext();
  const guest = await ctx.newPage();
  await guest.goto(link);
  await expect(guest.getByRole("heading", { name: "Welcome, Guest Tester" })).toBeVisible();
  await guest.getByLabel("New password").fill("en-lang-hemmelighet");
  await guest.getByLabel("Repeat password").fill("en-lang-hemmelighet");
  await guest.getByRole("button", { name: "Save password and sign in" }).click();
  await expect(guest).toHaveURL(/\/p\/.+\/boards/);
  await expect(guest.getByText("Customer tester", { exact: true })).toBeVisible();
  // The link works only once
  await guest.goto(link);
  await expect(guest.getByRole("heading", { name: "This link does not work" })).toBeVisible();
  await ctx.close();

  // Lockout protection: the lead cannot remove the right to manage access from everyone
  await page.reload();
  await page.getByRole("tab", { name: "Access" }).click();
  await expect(page.locator("tr", { hasText: email }).getByText("Active")).toBeVisible();
});
