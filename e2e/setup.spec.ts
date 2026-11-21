import { expect, test } from "@playwright/test";

test.describe("setup shell", () => {
  test("renders pairing, look fallback and system cards without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, locale: "en-US" });
    const page = await context.newPage();
    await page.goto("/setup");
    await expect(page.getByRole("heading", { name: "PocketPet Setup" })).toBeVisible();
    await expect(page.locator("#pair svg")).toBeVisible();
    await expect(page.locator("#look")).toContainText("JavaScript");
    await expect(page.locator("#system")).toContainText("Bridge");
    await context.close();
  });
});
