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

test("caps the pet gallery and filters it by name", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  await page.locator("#gear").click();
  // 4 local pets + the 50-entry gallery window.
  await expect(page.locator("#pet-list input[name=pet]")).toHaveCount(54);
  await page.locator("#pet-search").fill("Gallery Pet 55");
  await expect(page.locator("#pet-list input[name=pet]")).toHaveCount(5);
  await expect(page.locator("#pet-list")).toContainText("Gallery Pet 55");
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

test("strips the pairing token after the cookie is set and survives a reload", async ({ page }) => {
  // Earlier tests may leave the active pet on a broken fixture; pin a known-good
  // pet so "the pet still loads" is meaningful.
  await expectOk(await fetch(`${ORIGIN}/api/active-pet?token=${TOKEN}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "local:testpet" }),
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  await expect(page).toHaveURL(`${ORIGIN}/`);
  await expect(page.locator("#conn")).toHaveText("已連線");
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-ready", "true");

  // The HttpOnly cookie is now the only credential: a fresh document without
  // the query string must still load the app and its data.
  await page.reload();
  await expect(page).toHaveURL(`${ORIGIN}/`);
  await expect(page.locator("#conn")).toHaveText("已連線");
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-id", /^local:/);
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-ready", "true");
});

test("shows the add-to-home hint until it is dismissed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  await page.locator("#gear").click();
  const hint = page.locator("#install-hint");
  // Desktop Chromium is neither iOS Safari nor Android Chrome.
  await expect(hint).toBeVisible();
  await expect(page.locator("#install-hint-text")).toHaveText("在瀏覽器選單選擇「加到主畫面」，開啟更方便");
  await page.locator("#install-hint-dismiss").click();
  await expect(hint).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("foldpet.installHintDismissed"))).toBe("1");

  // localStorage lives in the same context, so the dismissal survives a reload.
  await page.reload();
  await page.locator("#gear").click();
  await expect(page.locator("#install-hint")).toBeHidden();
});

test("keeps booting and dismisses the hint when storage is denied", async ({ page }) => {
  await expectOk(await fetch(`${ORIGIN}/api/active-pet?token=${TOKEN}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "local:testpet" }),
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  // Private mode / enterprise policy can make the dismissal key throw. Other
  // keys keep working so the page can be inspected normally.
  await page.addInitScript(() => {
    const key = "foldpet.installHintDismissed";
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (this: Storage, name: string): string | null {
      if (name === key) throw new DOMException("Storage access denied", "SecurityError");
      return getItem.call(this, name);
    };
    Storage.prototype.setItem = function (this: Storage, name: string, value: string): void {
      if (name === key) throw new DOMException("Storage access denied", "SecurityError");
      setItem.call(this, name, value);
    };
  });

  // Core boot must not depend on optional hint storage.
  await page.goto(`/?token=${TOKEN}`);
  await expect(page.locator("#conn")).toHaveText("已連線");
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-ready", "true");

  // A failed read defaults to visible rather than hiding the hint.
  await page.locator("#gear").click();
  const hint = page.locator("#install-hint");
  await expect(hint).toBeVisible();

  // The failed write is best-effort; the local UI still hides the hint.
  await page.locator("#install-hint-dismiss").click();
  await expect(hint).toBeHidden();
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
