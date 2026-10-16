import { test, expect } from "@playwright/test";
import { login, unique } from "./helpers";

test("import CSV with Norwegian headers: mapping, preview, skip invalid, import", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Import" }).click();
  await expect(page.getByRole("heading", { name: "Import from Excel or CSV" })).toBeVisible();

  const base = unique("Import");
  const csv = [
    "Tittel;Status;Tildelt;Modul;Fase;Teststeg",
    `${base} A;Not started;maja.sorli@demo.test;Hire;SIT 2;"1. Open | Opens\n2. Save | Saved"`,
    `${base} B;In test;Nora Lindeberg;Employee Central > Termination;SIT 2;`,
    `;Unknown state;ghost@nowhere;Nowhere;SIT 9;`,
  ].join("\r\n");
  await page.locator("input[type=file]").setInputFiles({ name: "tests.csv", mimeType: "text/csv", buffer: Buffer.from("﻿" + csv, "utf8") });

  await expect(page.getByLabel("Import column Tittel as")).toHaveValue("title");
  await expect(page.getByLabel("Import column Tildelt as")).toHaveValue("assignedTo");
  await expect(page.getByLabel("Import column Teststeg as")).toHaveValue("steps");
  await expect(page.getByText("Ready to import: 2")).toBeVisible();
  await expect(page.getByText("With errors: 1")).toBeVisible();
  await expect(page.getByText('✕ Unknown user "ghost@nowhere"')).toBeVisible();

  const run = page.getByRole("button", { name: "Import 2 work items" });
  await expect(run).toBeDisabled();
  await page.getByLabel("Skip rows with errors (1)").check();
  await run.click();
  await expect(page.getByText("2 work items imported, 1 skipped.").first()).toBeVisible();

  await page.getByRole("link", { name: "Open work items" }).click();
  await page.getByPlaceholder(/Filter by keyword/).fill(base);
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.locator("tbody tr", { hasText: `${base} A` })).toContainText("Maja Sørli");
});
