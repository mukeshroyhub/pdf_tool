import { expect, test } from "@playwright/test";
import { minimalPdf } from "./fixtures";

/**
 * Core journey smoke test: guest session → upload a PDF → the browser-local
 * library stores it and the viewer auto-opens. This exercises the pieces unit
 * tests can't reach: the IndexedDB library, the upload dropzone, client-side
 * page counting and the viewer round-trip.
 */

test("guest can upload a PDF into the browser library and open it", async ({ page }) => {
  await page.goto("/login");

  // Enter as a throwaway guest — no credentials needed.
  await page.getByRole("button", { name: /continue as guest/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 30_000 });

  // Upload via the dropzone's hidden file input.
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles({
    name: "smoke-test.pdf",
    mimeType: "application/pdf",
    buffer: minimalPdf(),
  });

  // A single PDF auto-opens in the viewer; its name shows as the heading.
  await page.waitForURL("**/files/**", { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /smoke-test\.pdf/i })).toBeVisible();

  // The viewer toolbar renders (Download proves the file is readable locally).
  await expect(page.getByRole("button", { name: /download/i })).toBeVisible();

  // Back on the dashboard, the library lists the file (IndexedDB read path).
  await page.goto("/dashboard");
  await expect(page.getByText("smoke-test.pdf").first()).toBeVisible();
});
