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
