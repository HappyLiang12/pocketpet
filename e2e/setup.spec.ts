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
    // Without JavaScript the copy affordance is hidden, but URLs and commands
    // remain present as selectable text.
    await expect(page.locator("#pair [data-copy-target]").first()).toBeHidden();
    await expect(page.locator("#system [data-copy-target]").first()).toBeHidden();
    await expect(page.locator("#pair code").first()).toBeVisible();
    await expect(page.locator("#pair code").first()).toContainText("?token=");
    await expect(page.locator("#service-status-command")).toBeVisible();
    await expect(page.locator("#service-status-command")).toHaveText("pocketpet service status");
    await context.close();
  });

  test("copies the displayed Pair URL from the setup app", async ({ browser }) => {
    const context = await browser.newContext({
      locale: "en-US",
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();
    await page.goto("/setup");
    const copyButton = page.locator("#pair [data-copy-target]").first();
    await expect(copyButton).toBeVisible();
    const targetId = await copyButton.getAttribute("data-copy-target");
    expect(targetId).toBeTruthy();
    const target = page.locator(`#${targetId}`);
    await expect(target).toBeVisible();
    const displayed = (await target.textContent())?.trim() ?? "";
    expect(displayed.length).toBeGreaterThan(0);
    expect(displayed).toContain("?token=");

    await copyButton.click();
    await expect(copyButton).toHaveText("Copied");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    // Compare booleans so a failed assertion never echoes the token.
    expect(copied === displayed).toBe(true);
    await context.close();
  });
});
