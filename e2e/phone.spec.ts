import { expect, test } from "@playwright/test";

const TOKEN = "e2e-token-0123456789";

test("folded layout shows clock, pet and live chips", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  await expect(page.locator("body")).toHaveAttribute("data-layout", "folded");
  await expect(page.locator("#time")).toHaveText(/^\d{2}:\d{2}$/);
  await expect(page.locator("#stage canvas")).toBeVisible();
  await fetch("http://127.0.0.1:7799/api/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ v: 1, agent: "claude", sessionId: "e2e-folded", project: "demo", phase: "working", tool: "Edit", ts: Date.now() }),
  });
  await expect(page.locator("#chips .chip").filter({ hasText: "Claude Code" })).toContainText("工作中");
});

test("wide layout shows session cards", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 760 });
  await page.goto(`/?token=${TOKEN}`);
  await expect(page.locator("body")).toHaveAttribute("data-layout", "wide");
  await fetch("http://127.0.0.1:7799/api/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ v: 1, agent: "opencode", sessionId: "e2e-wide", project: "wide-demo", phase: "waiting", ts: Date.now() }),
  });
  await expect(page.locator("#sessions .card").filter({ hasText: "wide-demo" })).toContainText("等待中");
});

test("loads the active pet sprite and switches pets from the drawer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-id", "local:testpet");
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-ready", "true");
  await page.locator("#gear").click();
  await page.locator('#pet-list input[value="local:testpet2"]').check();
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-id", "local:testpet2");
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-ready", "true");
});

test("shows a localized wake-lock status", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  await expect(page.locator("#wake-info")).toHaveText(/^螢幕長亮：(已啟用|待命|已拒絕|不支援|非安全連線.*)$/);
});

test("falls back to the blob when a pet spritesheet cannot decode", async ({ page }) => {
  await fetch(`http://127.0.0.1:7799/api/active-pet?token=${TOKEN}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "local:testpet" }),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-id", "local:testpet");
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-ready", "true");
  await page.locator("#gear").click();
  await page.locator('#pet-list input[value="local:brokenpet"]').check();
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-id", "fallback");
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-ready", "false");
  // The failed sheet must be discarded: the fallback blob is opaque, the previous fixture atlas is fully transparent.
  await expect.poll(() => page.locator("#stage canvas").evaluate((canvas: HTMLCanvasElement) => canvas.getContext("2d")!.getImageData(60, 80, 1, 1).data[3])).toBeGreaterThan(0);
});
