import { expect, test } from "@playwright/test";

const TOKEN = "e2e-token-0123456789";
const ORIGIN = "http://127.0.0.1:7799";

async function expectOk(response: Response): Promise<Response> {
  expect(response.ok, `HTTP ${response.status} for ${response.url}`).toBe(true);
  return response;
}

async function postEvent(event: Record<string, unknown>): Promise<void> {
  await expectOk(await fetch(`${ORIGIN}/api/event`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  }));
}

test("folded layout shows clock, pet and live chips", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  await expect(page.locator("body")).toHaveAttribute("data-layout", "folded");
  await expect(page.locator("#time")).toHaveText(/^\d{2}:\d{2}$/);
  await expect(page.locator("#stage canvas")).toBeVisible();
  await postEvent({ v: 1, agent: "claude", sessionId: "e2e-folded", project: "demo", phase: "working", tool: "Edit", ts: Date.now() });
  await expect(page.locator("#chips .chip").filter({ hasText: "Claude Code" })).toContainText("工作中");
});

test("wide layout shows session cards", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 760 });
  await page.goto(`/?token=${TOKEN}`);
  await expect(page.locator("body")).toHaveAttribute("data-layout", "wide");
  await postEvent({ v: 1, agent: "opencode", sessionId: "e2e-wide", project: "wide-demo", phase: "waiting", ts: Date.now() });
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
  await expectOk(await fetch(`${ORIGIN}/api/active-pet?token=${TOKEN}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "local:testpet" }),
  }));
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

test("draws scaled atlases with their real cell geometry", async ({ page }) => {
  // Clear every session so the pet settles on idle row 0; flashes expire within ~3 s.
  const state = await (await expectOk(await fetch(`${ORIGIN}/api/state?token=${TOKEN}`))).json() as {
    sessions: Array<{ agent: string; sessionId: string; project: string }>;
  };
  for (const session of state.sessions) {
    await postEvent({ v: 1, agent: session.agent, sessionId: session.sessionId, project: session.project, phase: "idle", ts: Date.now() });
  }
  await expect.poll(async () => {
    const response = await expectOk(await fetch(`${ORIGIN}/api/state?token=${TOKEN}`));
    return ((await response.json()) as { pet: string }).pet;
  }, { timeout: 6_000, intervals: [100, 250, 500] }).toBe("idle");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  await page.locator("#gear").click();
  await page.locator('#pet-list input[value="local:markerpet"]').check();
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-id", "local:markerpet");
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-ready", "true");

  // The 384x468 marker sheet paints each 48x52 cell with R = 40 + 20*row and
  // G = 40 + 20*col. The canvas centre sits in row 0, so R must be 40. The old
  // hard-coded 192x208 source rect would sample row 2 here and yield R = 80.
  const pixel = await page.locator("#stage canvas").evaluate((canvas: HTMLCanvasElement) =>
    Array.from(canvas.getContext("2d")!.getImageData(96, 104, 1, 1).data));
  expect(pixel[0]).toBe(40);
  expect(pixel[3]).toBe(255);

  await expectOk(await fetch(`${ORIGIN}/api/active-pet?token=${TOKEN}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "local:testpet" }),
  }));
});
