import { expect, type Page } from "@playwright/test";

// Fictional demo users from prisma/seed.ts
export const TEST_LEAD = { email: "erik.brattland@demo.test", password: "demo1234" };
export const TESTER = { email: "maja.sorli@demo.test", password: "demo1234" };

export async function login(page: Page, user = TEST_LEAD) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/boards\//);
}

export async function openTeamBoard(page: Page, team = "EC team") {
  const select = page.getByLabel("Choose a team board");
  if ((await select.locator("option:checked").textContent())?.trim() !== team) {
    await select.selectOption({ label: team });
    await expect(select.locator("option:checked")).toHaveText(team);
  }
  await expect(page.locator("article").first()).toBeVisible();
}

export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;
