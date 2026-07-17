import { expect, test, type Page } from "@playwright/test";
import { minimalPdf } from "./fixtures";

/**
 * Tool-journey tests: page numbers, password protect + unlock, and merge —
 * each exercising the full browser-local round trip (IndexedDB library →
 * just-in-time server processing → result absorbed back into the library).
 *
 * Selectors target user-visible labels and toasts, so these tests double as
 * a contract that the UI copy users rely on doesn't silently change.
 */

/** Starts a fresh guest session and lands on the dashboard. */
async function guestDashboard(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: /continue as guest/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
}

/** Uploads PDFs through the dropzone's hidden input. */
async function uploadPdfs(page: Page, names: string[]): Promise<void> {
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles(
    names.map((name) => ({ name, mimeType: "application/pdf", buffer: minimalPdf() })),
  );
}

test("page numbers: tool round-trip creates a numbered copy", async ({ page }) => {
  await guestDashboard(page);
  await uploadPdfs(page, ["numbers-test.pdf"]);

  // Single PDF auto-opens in the viewer.
  await page.waitForURL("**/files/**", { timeout: 30_000 });

  // Secondary actions live in the Tools dropdown.
  await page.getByRole("button", { name: /^tools/i }).click();
  await page.getByRole("button", { name: /page numbers/i }).click();

  // Keep the defaults (bottom center, "1, 2, 3") and save as a new copy.
  await page.getByRole("button", { name: /save as copy/i }).click();
  await expect(page.getByText("Page numbers added")).toBeVisible({ timeout: 30_000 });
});

test("protect + unlock: encrypted copy asks for its password in the viewer", async ({ page }) => {
  await guestDashboard(page);
  await uploadPdfs(page, ["protect-test.pdf"]);
  await page.waitForURL("**/files/**", { timeout: 30_000 });

  // Encrypt with a password (creates a new protected copy in the library).
  await page.getByRole("button", { name: /^tools/i }).click();
  await page.getByRole("button", { name: /password/i }).click();
  await page.locator("#pw").fill("secret123");
  await page.getByRole("button", { name: /protect pdf/i }).click();
  await expect(page.getByText("Protected copy created")).toBeVisible({ timeout: 30_000 });

  // Open the protected copy: it's the newest file, so it's first in the list.
  // (File-list links have no ?mode= — that excludes the quick-tool cards.)
  await page.goto("/dashboard");
  await page.locator('a[href^="/files/"]:not([href*="mode="])').first().click();

  // The viewer must ask for the password, reject a wrong one, accept the right one.
  await expect(page.getByText(/password protected/i)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("PDF password").fill("wrong-pass");
  await page.getByRole("button", { name: /unlock/i }).click();
  await expect(page.getByText(/wrong password/i)).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("PDF password").fill("secret123");
  await page.getByRole("button", { name: /unlock/i }).click();
  await expect(page.getByRole("button", { name: /download/i })).toBeVisible({ timeout: 30_000 });
});

test("merge: two library PDFs combine into one", async ({ page }) => {
  await guestDashboard(page);
  await uploadPdfs(page, ["merge-a.pdf", "merge-b.pdf"]);

  // Multi-file upload stays on the dashboard; wait for both rows.
  await expect(page.getByText("merge-a.pdf").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("merge-b.pdf").first()).toBeVisible();

  await page.getByRole("button", { name: /merge pdfs/i }).click();
  const dialog = page.getByRole("dialog");

  // Select both files (click order defines merge order).
  await dialog.getByText("merge-a.pdf").click();
  await dialog.getByText("merge-b.pdf").click();

  // Ensure the output name is set, then merge.
  const nameBox = dialog.getByRole("textbox");
  if ((await nameBox.inputValue()).trim() === "") {
    await nameBox.fill("merged-e2e.pdf");
  }
  await dialog.getByRole("button", { name: /^merge 2/i }).click();
  await expect(page.getByText(/merged into/i)).toBeVisible({ timeout: 30_000 });
});
