import { test, expect } from "@playwright/test";
import { login, openTeamBoard, unique } from "./helpers";

test("keyboard shortcuts: ?, n, a, Ctrl+Enter, /", async ({ page }) => {
  await login(page);
  await openTeamBoard(page);
  await page.locator("body").click({ position: { x: 5, y: 300 } });

  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeHidden();

  // n: new item panel with the title focused
  await page.keyboard.press("n");
  const panel = page.getByRole("dialog", { name: "New work item" });
  await expect(panel).toBeVisible();
  const title = unique("Shortcut");
  await panel.getByLabel("Title").fill(title);
  await page.keyboard.press("Control+Enter");
  await expect(page.getByRole("dialog", { name: /Details #\d+/ })).toBeVisible();

  // a: assign to me (focus out of the text field first)
  const details = page.getByRole("dialog", { name: /Details #\d+/ });
  await details.getByRole("tab", { name: "Details" }).focus();
  await page.keyboard.press("a");
  await expect(details.getByLabel("Assigned to")).toHaveValue(/.+/);
  await page.keyboard.press("Control+Enter");
  await expect(page.locator("article", { hasText: title }).getByLabel("Erik Brattland").or(page.locator("article", { hasText: title }).locator('[title="Erik Brattland"]')).first()).toBeVisible();

  // /: focus the filter
  await page.keyboard.press("Escape");
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox", { name: "Filter by keyword or #ID" })).toBeFocused();
});
