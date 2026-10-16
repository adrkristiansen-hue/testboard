import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("create a project from a process template", async ({ page }) => {
  await login(page);
  await page.goto("/projects");
  const key = "T" + Date.now().toString(36).toUpperCase().slice(-6);
  await page.getByLabel("Project name").fill(`Template test ${key}`);
  await page.getByLabel("Key", { exact: true }).fill(key);
  await page.getByLabel("Process").selectOption({ label: "SuccessFactors SIT/UAT" });
  await expect(page.getByText(/modules, 3 phases, 5 types, 3 boards/)).toBeVisible();
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByText("Employee Central").first()).toBeVisible();

  // Boards came with their columns
  await page.getByRole("link", { name: "Boards" }).click();
  await expect(page.getByLabel("Choose a team board").locator("option")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Failed / Blocked", exact: true })).toBeVisible();
});
