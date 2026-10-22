import { test, expect } from "@playwright/test";
import { login, TESTER, unique } from "./helpers";

test("script → approve → plan in UAT → customer runs it, raises a defect, retests after the fix", async ({ page, browser }) => {
  // The test lead writes a script
  await login(page);
  const pid = page.url().match(/\/p\/([^/]+)/)![1];
  await page.getByRole("link", { name: "Test scripts" }).click();
  await expect(page.getByRole("heading", { name: "Test scripts" })).toBeVisible();
  await page.getByRole("link", { name: "+ New test script" }).click();
  await expect(page).toHaveURL(/\/scripts\/new$/);
  await page.waitForLoadState("networkidle");
  const title = unique("Hire apprentice");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Module").selectOption({ label: "Employee Central > Hire" });
  await page.getByLabel("Action 1", { exact: true }).fill("Open Add New Employee");
  await page.getByLabel("Expected result 1", { exact: true }).fill("Form opens");
  await page.getByRole("button", { name: "+ Add step" }).click();
  await page.getByLabel("Action 2", { exact: true }).fill("Select event reason 'Apprentice'");
  await page.getByLabel("Expected result 2", { exact: true }).fill("Contract type is Apprentice");
  await page.getByRole("button", { name: "+ Add step" }).click();
  await page.getByLabel("Action 3", { exact: true }).fill("Save");
  await page.getByLabel("Expected result 3", { exact: true }).fill("Employee is created");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/scripts\/c[a-z0-9]{20,}$/);
  const key = (await page.getByRole("heading", { level: 1 }).locator("span").textContent())!.trim();
  expect(key).toMatch(/^TS-\d+$/);

  // Draft scripts cannot be planned in UAT: approve first
  await page.getByRole("button", { name: "✓ Approve" }).click();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "← Test scripts" }).click();
  await page.getByLabel(`Select ${key}`).check();
  await page.getByLabel("Select TS-6").check(); // a draft UAT script
  await page.getByRole("button", { name: /Plan test runs/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Phase").selectOption({ label: "UAT – approved scripts only" });
  await expect(dialog.getByText("1 script(s) will be skipped:")).toBeVisible();
  await dialog.getByLabel(/Maja Sørli/).check();
  await dialog.getByRole("button", { name: "Create 1 test run(s)" }).click();
  await expect(dialog.getByText("1 test run(s) created")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("link", { name: title }).click();
  const runLink = page.getByRole("table").getByRole("link", { name: /^#\d+$/ });
  const runId = Number((await runLink.textContent())!.slice(1));

  // The customer tester runs it
  const ctx = await browser.newContext();
  const maja = await ctx.newPage();
  await login(maja, TESTER);
  await maja.goto(`/p/${pid}/scripts`);
  await expect(maja.getByRole("link", { name: "+ New test script" })).toHaveCount(0);
  await expect(maja.getByRole("link", { name: "Hire new permanent employee – Norway" })).toBeVisible();
  // Scripts in modules on a locked board (Payroll) are hidden like the work items there
  await expect(maja.getByRole("link", { name: "Termination – payout of holiday pay" })).toHaveCount(0);
  await maja.goto(`/p/${pid}/items/${runId}/run`);
  await expect(maja.getByRole("heading", { name: title })).toBeVisible();
  await maja.waitForLoadState("networkidle");
  // The test user must be filled in before the test can start
  await maja.getByRole("button", { name: "▶ Start test" }).click();
  await expect(maja.getByText(/Fill in Test user to start/).first()).toBeVisible();
  await expect(maja.getByRole("group", { name: "Result for step 1" })).toHaveCount(0);
  await maja.getByLabel("Test user").fill("hradmin.test9");
  await maja.getByRole("button", { name: "▶ Start test" }).click();
  await expect(maja.getByRole("group", { name: "Result for step 1" })).toBeVisible();
  await expect(maja.getByText("In test", { exact: true })).toBeVisible();

  // Keyboard: P passes the current step and moves on
  await maja.locator("body").press("p");
  await expect(maja.getByRole("group", { name: "Result for step 1" }).getByRole("button", { name: /Passed/ })).toHaveAttribute("aria-pressed", "true");
  await expect(maja.getByText("1 of 3 done")).toBeVisible();
  await maja.getByLabel("Actual result for step 2").fill("Event reason list has no Apprentice");
  await maja.getByRole("group", { name: "Result for step 2" }).getByRole("button", { name: /Failed/ }).click();
  await expect(maja.getByText("Result: Failed")).toBeVisible();

  await maja.getByRole("button", { name: "+ Create defect" }).click();
  const raise = maja.getByRole("dialog");
  await expect(raise.getByLabel("Title")).toHaveValue(`Event reason list has no Apprentice (${key} step 2)`);
  await raise.getByRole("button", { name: "Create" }).click();
  await expect(maja.getByText(/Defect #\d+ created/)).toBeVisible();
  const chip = maja.getByRole("link", { name: /Defect #\d+ · New/ });
  await expect(chip).toBeVisible();
  const defectId = Number((await chip.textContent())!.match(/#(\d+)/)![1]);
  await maja.getByRole("button", { name: "Finish test" }).click();
  await expect(maja.getByText(/Attempt 1 · Failed · Maja Sørli/).first()).toBeVisible();

  // The defect carries steps, test user and actual result
  await maja.goto(`/p/${pid}/items/${defectId}`);
  await expect(maja.getByText("Test user: hradmin.test9")).toBeVisible();
  await expect(maja.getByText(`Found in test run #${runId} (${key}), step 2.`)).toBeVisible();

  // The consultant fixes the defect → the tester is told to retest
  await page.goto(`/p/${pid}/items/${defectId}`);
  await page.getByLabel("State").selectOption("Active");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("State")).toHaveValue("Active");
  await page.getByLabel("State").selectOption("Fixed");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("State")).toHaveValue("Fixed");

  await maja.goto("/notifications");
  await expect(maja.getByText(new RegExp(`#${defectId} .* is fixed – retest #${runId}`))).toBeVisible();
  await maja.goto(`/p/${pid}/items/${runId}/run`);
  await expect(maja.getByText(/ready for retest/)).toBeVisible();
  await maja.getByRole("button", { name: "▶ Start retest (attempt 2)" }).click();
  await expect(maja.getByText("carried over from the previous attempt")).toBeVisible();
  await expect(maja.getByText("1 of 3 done")).toBeVisible();
  await ctx.close();
});
