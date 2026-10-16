import { test, expect } from "@playwright/test";
import { login, openTeamBoard, unique } from "./helpers";

test("unauthenticated users are redirected to login", async ({ page }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill("erik.brattland@demo.test");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Wrong email or password.")).toBeVisible();
});

test("board shows columns, swimlanes and cards", async ({ page }) => {
  await login(page);
  await openTeamBoard(page);
  for (const col of ["To do", "In progress", "Failed / Blocked", "Fixed / Retest", "Done"]) {
    await expect(page.getByRole("heading", { name: col, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: /Expedite/ })).toBeVisible();
  await expect(page.locator("article").first()).toBeVisible();
});

test("quick add, open in panel, comment and move via menu", async ({ page }) => {
  await login(page);
  await openTeamBoard(page);
  const title = unique("E2E smoke");
  await page.getByRole("button", { name: "New item", exact: true }).click();
  await page.getByPlaceholder("Enter a title and press Enter").fill(title);
  await page.getByPlaceholder("Enter a title and press Enter").press("Enter");
  const card = page.locator("article", { hasText: title });
  await expect(card).toBeVisible();
  await expect(page.getByRole("list", { name: "Standard – To do" }).locator("article", { hasText: title })).toBeVisible();

  // Open in side panel and comment
  await card.getByRole("button", { name: new RegExp(title) }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByLabel("Title")).toHaveValue(title);
  const editor = panel.getByRole("textbox", { name: /Add a comment/ });
  await editor.click();
  await editor.pressSequentially("Retested in SIT 2, looks good");
  await panel.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(panel.getByText("Retested in SIT 2, looks good")).toBeVisible();
  await panel.getByRole("button", { name: "Close", exact: true }).click();

  // Keyboard/menu alternative to drag-and-drop
  const id = (await card.getAttribute("aria-label"))!.match(/(\d+):/)![1];
  await card.getByRole("button", { name: `Card actions #${id}` }).click();
  await page.getByRole("button", { name: "In progress – Doing" }).click();
  await expect(page.getByRole("list", { name: "Standard – In progress – Doing" }).locator("article", { hasText: title })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: `Moved #${id}` })).toBeVisible();
});

test("filter bar narrows the board", async ({ page }) => {
  await login(page);
  await openTeamBoard(page);
  const total = await page.locator("article").count();
  await page.getByRole("searchbox", { name: /Filter by keyword/ }).fill("holiday");
  await expect.poll(async () => page.locator("article").count()).toBeLessThan(total);
  await expect(page.locator("article", { hasText: /holiday/i }).first()).toBeVisible();
  await expect(page.getByText(/Showing \d+ of \d+/)).toBeVisible();
});

test("language toggle switches to Norwegian", async ({ page }) => {
  await login(page);
  await openTeamBoard(page);
  await page.getByRole("button", { name: "NO", exact: true }).click();
  await expect(page.getByRole("link", { name: "Tavler" })).toBeVisible();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByRole("link", { name: "Boards" })).toBeVisible();
});

