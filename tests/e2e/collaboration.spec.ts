import { test, expect } from "@playwright/test";
import { login, TESTER, unique } from "./helpers";

test("notification bell, notifications page and My work", async ({ page }) => {
  await login(page, TESTER);
  // Seeded data gives Maja unread mentions/assignments.
  const bell = page.getByRole("button", { name: /^Notifications \(\d+ unread\)$/ });
  await expect(bell).toBeVisible();
  await bell.click();
  await expect(page.getByRole("link", { name: "See all notifications" })).toBeVisible();
  await page.getByRole("link", { name: "See all notifications" }).click();
  await expect(page).toHaveURL(/\/notifications/);
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByRole("button", { name: "Notifications (0 unread)" })).toBeVisible();

  await page.getByRole("link", { name: "My work" }).click();
  await expect(page.getByRole("heading", { name: "My work" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Assigned to me/ })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("main section").first()).toBeVisible();
  await page.getByRole("link", { name: /@mentioned/ }).click();
  await expect(page.getByText(/mentioned you/).first()).toBeVisible();
});

test("bulk create test tasks and bulk assign from the list", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Work items" }).click();
  await expect(page.getByRole("heading", { name: "Work items" })).toBeVisible();

  const base = unique("Bulk E2E");
  await page.getByRole("button", { name: "Bulk create test tasks" }).click();
  const dialog = page.getByRole("dialog", { name: "Bulk create test tasks" });
  await dialog.getByLabel("Titles (one per line)").fill(`${base} A\n${base} B`);
  await dialog.getByLabel("Title pattern").fill("{title} – {phase}");
  const phases = dialog.getByRole("group", { name: "Phases" }).getByRole("checkbox");
  await phases.nth(0).check();
  await phases.nth(1).check();
  await expect(dialog.getByText("4 test tasks will be created")).toBeVisible();
  await dialog.getByRole("button", { name: /Create test tasks \(4\)/ }).click();
  await expect(page.getByText("4 test tasks created, 0 skipped")).toBeVisible();

  // Filter to the new tasks, select all, bulk assign.
  await page.getByPlaceholder(/Filter by keyword/).fill(base);
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page.getByLabel("Select all shown items").check();
  const bar = page.getByRole("toolbar", { name: "Bulk edit" });
  await expect(bar.getByText("4 selected")).toBeVisible();
  await bar.getByLabel("Assign to…").selectOption({ label: "Maja Sørli" });
  await expect(page.getByText("4 updated")).toBeVisible();
  await expect(page.locator("tbody tr", { hasText: "Maja Sørli" })).toHaveCount(4);
});
