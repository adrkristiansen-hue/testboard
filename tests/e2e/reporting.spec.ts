import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { login, unique } from "./helpers";

test("list: columns, tree view, inline edit and export", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Work items" }).click();
  await expect(page.locator("tbody tr").first()).toBeVisible();

  // Add the Tags column
  await page.getByRole("button", { name: "Choose columns" }).click();
  await page.getByRole("checkbox", { name: "Tags", exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("columnheader", { name: /Tags/ })).toBeVisible();
  await expect(page).toHaveURL(/cols=/);

  // Tree view nests the defect under its failed test
  await page.getByRole("button", { name: "Tree" }).click();
  await page.getByPlaceholder(/Filter by keyword/).fill("temporary");
  await expect(page.getByRole("button", { name: "Hire temporary employee with contract end date" })).toBeVisible();
  await expect(page.locator("button[aria-expanded]").first()).toBeVisible();

  // Inline edit priority of the first row (wait for the debounced filter first)
  const row = page.locator("tbody tr").first();
  await expect(row).toContainText("temporary");
  const priorityCell = row.locator("td").nth(8);
  await priorityCell.dblclick();
  const editor = row.getByRole("combobox", { name: /Edit #\d+/ });
  const before = await editor.inputValue();
  const next = before === "3" ? "2" : "3";
  await editor.selectOption(next);
  await expect(row.locator("td").nth(8)).toHaveText(next);

  // Export to Excel
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("button", { name: "Excel (.xlsx)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.xlsx$/);
  const bytes = await readFile((await file.path())!);
  expect(bytes.subarray(0, 2).toString()).toBe("PK"); // xlsx is a zip
});

test("saved query: create from list filter, save, use on board", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Work items" }).click();
  await expect(page.getByRole("heading", { name: "Work items" })).toBeVisible();
  await page.getByRole("button", { name: "Types" }).click();
  await page.getByRole("checkbox", { name: "Defect" }).check();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Save as query" }).click();

  await expect(page.getByRole("heading", { name: "Conditions" })).toBeVisible();
  const name = unique("E2E defects");
  await page.getByLabel("Name").fill(name);
  await expect(page.getByRole("heading", { name: /\d+ results/ })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/queries\/(?!new)[\w-]+$/);
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();

  await page.getByRole("link", { name: "Use as board filter" }).click();
  await expect(page).toHaveURL(/\/boards\/.+query=/);
  await expect(page.getByLabel("Saved query")).toHaveValue(/.+/);
  // Only defects remain on the board
  const cards = page.locator("article");
  await expect(cards.first()).toBeVisible();
  for (const icon of await cards.locator('[role="img"]').all()) await expect(icon).toHaveAttribute("aria-label", "Defect");
});

test("dashboard shows KPIs and charts", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Open defects", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open defects by assignee" })).toBeVisible();
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
  // Table view for accessibility
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Open defects by assignee" }) });
  await card.getByRole("button", { name: "Show table" }).click();
  await expect(card.getByRole("cell", { name: "Siri Holmvik" })).toBeVisible();
  // Phase filter
  await page.getByLabel("Phase").selectOption({ label: "All phases" });
  await expect(page).toHaveURL(/phase=all/);
});

test("create a new board and open its report", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "+ New board" }).click();
  const dialog = page.getByRole("dialog", { name: "New board" });
  const name = unique("E2E board");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("group", { name: "Modules on this board" }).getByRole("checkbox", { name: "Recruiting" }).check();
  await dialog.getByRole("button", { name: "Create board" }).click();
  await expect(page.getByLabel("Choose a team board").locator("option:checked")).toHaveText(name);
  // Copied columns from the current board
  await expect(page.getByRole("heading", { name: "To do", exact: true })).toBeVisible();

  await page.getByRole("link", { name: /Reports/ }).click();
  await expect(page.getByRole("heading", { name: `Report: ${name}` })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Items per board column" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cumulative flow by board column" })).toBeVisible();
  await expect(page.getByLabel("Board", { exact: true })).toHaveValue(/.+/);
});
