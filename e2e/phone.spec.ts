import { expect, request, test, type Page } from "@playwright/test";
import { DEFAULT_APPEARANCE } from "../src/appearance.js";

const TOKEN = "e2e-token-0123456789";
const ORIGIN = "http://127.0.0.1:7799";
const SETUP_HEADERS = {
  origin: ORIGIN,
  "x-pocketpet-setup": "1",
  "content-type": "application/json",
};

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

async function setHostLook(data: Record<string, unknown>): Promise<void> {
  await expectOk(await fetch(`${ORIGIN}/api/setup/look`, {
    method: "PUT",
    headers: SETUP_HEADERS,
    body: JSON.stringify(data),
  }));
}

async function openTab(page: Page, tab: "live" | "look" | "about"): Promise<void> {
  await page.locator(`#sheet-tabs [data-tab="${tab}"]`).click();
}

async function hostLook(): Promise<{ appearance: typeof DEFAULT_APPEARANCE; activePet: string | null }> {
  return (await expectOk(await fetch(`${ORIGIN}/api/setup/look`))).json() as Promise<{
    appearance: typeof DEFAULT_APPEARANCE;
    activePet: string | null;
  }>;
}

test("folded layout shows clock, pet and live chips", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  await expect(page.locator("body")).toHaveAttribute("data-layout", "folded");
  await expect(page.locator("#stage [data-time]")).toHaveText(/^\d{2}:\d{2}$/);
  await expect(page.locator("#stage [data-pet]")).toBeVisible();
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

test("short wide viewport keeps the whole clock and pet inside the stage", async ({ page }) => {
  // Safari on the open iPhone Duo has a 951x537 CSS viewport after its chrome;
  // the stage is only 321px tall.
  await page.setViewportSize({ width: 951, height: 537 });
  await page.goto(`/?token=${TOKEN}`);
  await expect(page.locator("body")).toHaveAttribute("data-layout", "wide");
  await expect(page.locator("#stage")).toHaveAttribute("data-layout-mode", "stack");
  await expect.poll(async () =>
    page.locator("#stage").evaluate((stage) => {
      const sr = stage.getBoundingClientRect();
      const clock = stage.querySelector("[data-clock]")!.getBoundingClientRect();
      const pet = stage.querySelector("[data-pet]")!.getBoundingClientRect();
      return clock.top >= sr.top - 0.5 && pet.bottom <= sr.bottom + 0.5;
    }), { timeout: 3_000 }).toBe(true);
});

test("fullscreen control enters and exits focus mode without the Fullscreen API", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  await page.evaluate(() => {
    Object.defineProperty(Document.prototype, "fullscreenEnabled", { configurable: true, get: () => false });
    Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: undefined });
  });
  const toggle = page.locator("#fullscreen-toggle");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  const box = await toggle.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);

  await toggle.click();
  await expect(page.locator("body")).toHaveAttribute("data-focus", "true");
  await expect(page.locator("#top")).toBeHidden();
  await expect(page.locator("#sheet")).toBeHidden();
  await expect(page.locator("#focus-exit")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  await page.locator("#focus-exit").click();
  await expect(page.locator("body")).toHaveAttribute("data-focus", "false");
  await expect(page.locator("#top")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});

test("focus mode keeps the exit control clear of session cards", async ({ page }) => {
  await page.setViewportSize({ width: 951, height: 537 });
  await page.goto(`/?token=${TOKEN}`);
  await page.evaluate(() => {
    Object.defineProperty(Document.prototype, "fullscreenEnabled", { configurable: true, get: () => false });
    Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: undefined });
  });
  await postEvent({ v: 1, agent: "claude", sessionId: "e2e-focus-wide", project: "focus-demo", phase: "working", tool: "Edit", ts: Date.now() });
  await expect(page.locator("#sessions .card").filter({ hasText: "focus-demo" })).toBeVisible();
  await page.locator("#fullscreen-toggle").click();
  await expect(page.locator("body")).toHaveAttribute("data-focus", "true");
  const exitBox = await page.locator("#focus-exit").boundingBox();
  const cardBox = await page.locator("#sessions .card").filter({ hasText: "focus-demo" }).boundingBox();
  expect(exitBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  expect(cardBox!.y).toBeGreaterThanOrEqual(exitBox!.y + exitBox!.height + 4);
});

test("loads the host pet and switches the local pet without changing the host", async ({ page }) => {
  await setHostLook({ activePet: "local:testpet" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-id", "local:testpet");
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-ready", "true");
  await openTab(page, "look");
  await page.locator('#pet-list input[value="local:testpet2"]').check();
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-id", "local:testpet2");
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-ready", "true");

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pocketpet.look") ?? "null")) as {
    followHost: boolean;
    petId: string | null;
  };
  expect(stored.followHost).toBe(false);
  expect(stored.petId).toBe("local:testpet2");
  // A phone selection is local-only: the host pet stays where setup put it.
  expect((await hostLook()).activePet).toBe("local:testpet");

  // The local choice survives a reload and still does not touch the host.
  await page.reload();
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-id", "local:testpet2");
  await openTab(page, "look");
  await expect(page.locator("#follow-host")).not.toBeChecked();
  expect((await hostLook()).activePet).toBe("local:testpet");
});

test("caps the pet gallery and filters it by name", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  await openTab(page, "look");
  // 4 local pets + the 50-entry gallery window.
  await expect(page.locator("#pet-list input[name=pet]")).toHaveCount(54);
  await page.locator("#pet-search").fill("Gallery Pet 55");
  await expect(page.locator("#pet-list input[name=pet]")).toHaveCount(5);
  await expect(page.locator("#pet-list")).toContainText("Gallery Pet 55");
});

test("shows a localized wake-lock status", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  await openTab(page, "about");
  await expect(page.locator("#wake-info")).toHaveText(/^螢幕長亮：(已啟用|待命|已拒絕|不支援|非安全連線.*)$/);
});

test("falls back to the blob when a pet spritesheet cannot decode", async ({ page }) => {
  await setHostLook({ activePet: "local:testpet" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-id", "local:testpet");
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-ready", "true");
  await openTab(page, "look");
  await page.locator('#pet-list input[value="local:brokenpet"]').check();
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-id", "fallback");
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-ready", "false");
  // The failed sheet must be discarded: the fallback blob is opaque, the previous fixture atlas is fully transparent.
  await expect.poll(() => page.locator("#stage [data-pet]").evaluate((canvas: HTMLCanvasElement) => canvas.getContext("2d")!.getImageData(60, 80, 1, 1).data[3])).toBeGreaterThan(0);
});

test("strips the pairing token after the cookie is set and survives a reload", async ({ page }) => {
  // Earlier tests may leave a local pet selection; pin a known-good host pet so
  // "the pet still loads" is meaningful.
  await setHostLook({ activePet: "local:testpet" });
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
  await openTab(page, "live");
  const hint = page.locator("#install-hint");
  // Desktop Chromium is neither iOS Safari nor Android Chrome.
  await expect(hint).toBeVisible();
  await expect(page.locator("#install-hint-text")).toHaveText("在瀏覽器選單選擇「加到主畫面」，開啟更方便");
  await page.locator("#install-hint-dismiss").click();
  await expect(hint).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("pocketpet.installHintDismissed"))).toBe("1");

  // localStorage lives in the same context, so the dismissal survives a reload.
  await page.reload();
  await openTab(page, "live");
  await expect(page.locator("#install-hint")).toBeHidden();
});

test("opens and collapses the sheet from a 44px handle", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  const sheet = page.locator("#sheet");
  const handle = page.locator("#sheet-handle");
  await expect(sheet).toHaveAttribute("data-open", "false");
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  // y=6 is inside the 44px button but outside the 4px visual bar at its centre.
  await handle.click({ position: { x: 22, y: 6 } });
  await expect(sheet).toHaveAttribute("data-open", "true");
  await handle.click({ position: { x: 22, y: 6 } });
  await expect(sheet).toHaveAttribute("data-open", "false");

  // Escape collapses and returns focus to the handle.
  await handle.click({ position: { x: 22, y: 6 } });
  await expect(sheet).toHaveAttribute("data-open", "true");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveAttribute("data-open", "false");
  await expect(handle).toBeFocused();
});

test("boots when accessing window.localStorage throws", async ({ page }) => {
  await setHostLook({ activePet: "local:testpet" });
  await page.setViewportSize({ width: 390, height: 844 });
  // Some browsers throw on the window.localStorage getter itself, not only on
  // the Storage methods, so the app must resolve storage inside a try block.
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage access denied", "SecurityError");
      },
    });
  });
  await page.goto(`/?token=${TOKEN}`);
  // Clock, connection and host values still render; module load did not abort.
  await expect(page.locator("#stage [data-time]")).toHaveText(/^\d{2}:\d{2}$/);
  await expect(page.locator("#conn")).toHaveText("已連線");
  await openTab(page, "about");
  await expect(page.locator("#debug-host")).toHaveText(/^(macOS|Windows|Linux) \S+/);
  await openTab(page, "look");
  await expect(page.locator("#follow-host")).toBeChecked();
  await expect(page.locator("#look-storage")).toBeVisible();
});

test("falls back to the host pet when a saved local pet is missing", async ({ page }) => {
  await setHostLook({ activePet: "local:testpet" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("pocketpet.look", JSON.stringify({
      v: 1,
      followHost: false,
      overrides: {},
      petId: "local:deleted-pet",
    }));
  });
  await page.goto(`/?token=${TOKEN}`);
  // The missing saved pet resolves to the host pet, not the first gallery row.
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-id", "local:testpet");
  await openTab(page, "look");
  await expect(page.locator("#look-note")).toBeVisible();
  await expect(page.locator("#look-summary")).toContainText("Test Pet");
});

test("keeps booting and dismisses the hint when storage is denied", async ({ page }) => {
  await setHostLook({ activePet: "local:testpet" });
  await page.setViewportSize({ width: 390, height: 844 });
  // Private mode / enterprise policy can make the dismissal key throw. Other
  // keys keep working so the page can be inspected normally.
  await page.addInitScript(() => {
    const key = "pocketpet.installHintDismissed";
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
  await openTab(page, "live");
  const hint = page.locator("#install-hint");
  await expect(hint).toBeVisible();

  // The failed write is best-effort; the local UI still hides the hint.
  await page.locator("#install-hint-dismiss").click();
  await expect(hint).toBeHidden();
});

test("switches the phone page between English and Simplified Chinese", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // One live session so an English phase label has something to render.
  await postEvent({ v: 1, agent: "claude", sessionId: "e2e-i18n", project: "i18n-demo", phase: "working", ts: Date.now() });
  await page.goto(`/?token=${TOKEN}`);
  // The config sets locale zh-TW, so the first visit is Traditional Chinese.
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
  await openTab(page, "about");

  await page.locator("#lang-select").selectOption("en");
  await expect(page.locator("#conn")).toHaveText("Connected");
  await expect(page.locator("#chips")).toContainText("Working");
  await expect(page.locator("#wake-info")).toHaveText(/^Screen awake:/);
  await expect(page.locator("#debug-lang")).toHaveText("English");
  await expect(page.locator("#debug-host")).toHaveText(/^(macOS|Windows|Linux) \S+/);
  await expect(page.locator("#debug-version")).toHaveText(/^\d+\.\d+\.\d+/);
  await expect(page.locator("#debug-secure")).toHaveText(/^(yes|no)$/);
  await expect(page.locator("#debug-pet")).not.toHaveText("");
  await expect(page.locator("#sheet-tabs [data-tab=about]")).toHaveText("About");
  await expect(page.locator("#pet-search")).toHaveAttribute("placeholder", "Search pets…");

  await page.locator("#lang-select").selectOption("zh-Hans");
  await expect(page.locator("#conn")).toHaveText("已连接");
  await expect(page.locator("#chips")).toContainText("工作中");
  await expect(page.locator("#sheet-tabs [data-tab=about]")).toHaveText("关于");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");

  // The choice is stored per device: a reload keeps Simplified Chinese even
  // though the browser locale is still zh-TW.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
  await expect(page.locator("#conn")).toHaveText("已连接");
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

  await setHostLook({ activePet: "local:testpet" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  await openTab(page, "look");
  await page.locator('#pet-list input[value="local:markerpet"]').check();
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-id", "local:markerpet");
  await expect(page.locator("#stage")).toHaveAttribute("data-pet-ready", "true");

  // The 384x468 marker sheet paints each 48x52 cell with R = 40 + 20*row and
  // G = 40 + 20*col. The canvas centre sits in row 0, so R must be 40. The old
  // hard-coded 192x208 source rect would sample row 2 here and yield R = 80.
  // data-pet-ready flips after the image decodes, before the next RAF paints it;
  // poll so the assertion cannot sample the previous fallback blob.
  await expect.poll(async () => {
    const pixel = await page.locator("#stage [data-pet]").evaluate((canvas: HTMLCanvasElement) =>
      Array.from(canvas.getContext("2d")!.getImageData(96, 104, 1, 1).data));
    return { r: pixel[0], a: pixel[3] };
  }, { timeout: 5_000, intervals: [50, 100, 200] }).toEqual({ r: 40, a: 255 });
});

test("applies host appearance and can reset this phone", async ({ page }) => {
  await setHostLook({
    appearance: { ...DEFAULT_APPEARANCE, clock: { ...DEFAULT_APPEARANCE.clock, scale: 140 } },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  await expect.poll(
    () => page.locator("#stage").evaluate((element) => getComputedStyle(element).getPropertyValue("--clock-scale").trim()),
  ).toBe("1.4");
  await openTab(page, "look");
  await expect(page.locator("#follow-host")).toBeChecked();
  await expect(page.locator("#open-studio")).toBeEnabled();
  await page.locator("#follow-host").uncheck();
  await page.locator("#reset-look").click();
  await expect(page.locator("#follow-host")).toBeChecked();
  // Resetting this phone restores follow-host; it must not write host state.
  expect((await hostLook()).appearance.clock.scale).toBe(140);
});

test("saves a phone-only Studio override without changing host defaults", async ({ page }) => {
  await setHostLook({ appearance: DEFAULT_APPEARANCE, activePet: "local:testpet" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  await openTab(page, "look");
  await page.locator("#open-studio").click();
  const studio = page.locator("#studio");
  await expect(studio).toBeVisible();
  await expect(studio.locator(".studio-scope")).toHaveText(/This phone|此手機|此手机/);
  await studio.locator('[data-field="clock.scale"]').fill("130");
  await studio.locator('[data-field="clock.scale"]').dispatchEvent("input");
  await studio.locator('[data-act="save"]').click();
  await expect(studio).toBeHidden();
  const scale = await page.locator("#stage").evaluate((element) => getComputedStyle(element).getPropertyValue("--clock-scale").trim());
  expect(scale).toBe("1.3");
  const stored = await page.evaluate(() => localStorage.getItem("pocketpet.look"));
  expect(stored).toContain("130");
  const host = await (await page.request.get("/api/setup/look")).json();
  expect(host.appearance.clock.scale).toBe(100);
  await page.reload();
  await expect(page.locator("#stage")).toHaveAttribute("data-layout-mode", /stack|free/);
  const scaleAfterReload = await page.locator("#stage").evaluate((element) => getComputedStyle(element).getPropertyValue("--clock-scale").trim());
  expect(scaleAfterReload).toBe("1.3");

  // A later host change must not overwrite the custom phone: the pet follows
  // the broadcast while the phone's own clock override stays in force.
  await setHostLook({
    appearance: {
      ...DEFAULT_APPEARANCE,
      clock: { ...DEFAULT_APPEARANCE.clock, scale: 140 },
      pet: { ...DEFAULT_APPEARANCE.pet, scale: 150 },
    },
  });
  await expect.poll(
    () => page.locator("#stage").evaluate((element) => getComputedStyle(element).getPropertyValue("--pet-scale").trim()),
  ).toBe("1.5");
  const customScale = await page.locator("#stage").evaluate((element) => getComputedStyle(element).getPropertyValue("--clock-scale").trim());
  expect(customScale).toBe("1.3");
  expect((await hostLook()).appearance.clock.scale).toBe(140);
});

test("a follow-host phone applies a host Studio change", async ({ page }) => {
  await setHostLook({ appearance: DEFAULT_APPEARANCE, activePet: "local:testpet" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  // The setup save must not race the phone's WebSocket: wait for the connected
  // state so the broadcast snapshot reaches this page.
  await expect(page.locator("#conn")).toHaveText("已連線");
  await openTab(page, "look");
  await expect(page.locator("#follow-host")).toBeChecked();
  await setHostLook({ appearance: { ...DEFAULT_APPEARANCE, pet: { ...DEFAULT_APPEARANCE.pet, scale: 150 } } });
  await expect.poll(async () => page.locator("#stage").evaluate((element) => getComputedStyle(element).getPropertyValue("--pet-scale").trim())).toBe("1.5");
});

test("localizes the Look layout summary instead of the raw mode", async ({ page }) => {
  await setHostLook({ appearance: DEFAULT_APPEARANCE });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  await openTab(page, "look");
  await expect(page.locator("#look-summary")).toContainText("堆疊 · 16");
  await setHostLook({ appearance: { ...DEFAULT_APPEARANCE, layout: { mode: "free", gap: 24 } } });
  await expect(page.locator("#look-summary")).toContainText("自由 · 24");
});

test("keeps a Studio draft stable when a host snapshot arrives while it is open", async ({ page }) => {
  await setHostLook({ appearance: DEFAULT_APPEARANCE, activePet: "local:testpet" });
  await page.setViewportSize({ width: 390, height: 844 });
  const frames: string[] = [];
  page.on("websocket", (socket) => {
    socket.on("framereceived", (event) => {
      frames.push(String(event.payload));
    });
  });
  await page.goto(`/?token=${TOKEN}`);
  await expect(page.locator("#conn")).toHaveText("已連線");
  await openTab(page, "look");
  await page.locator("#open-studio").click();
  const studio = page.locator("#studio");
  await expect(studio).toBeVisible();
  // A draft theme the incoming host snapshot would otherwise repaint.
  await studio.locator('[data-field="theme"]').selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(studio.locator('[data-field="clock.scale"]')).toHaveValue("100");

  await setHostLook({
    appearance: { ...DEFAULT_APPEARANCE, clock: { ...DEFAULT_APPEARANCE.clock, scale: 140 }, theme: "light" },
  });
  // The broadcast proves the page received the host change while Studio was open.
  await expect.poll(() => frames.some((frame) => frame.includes('"scale":140'))).toBe(true);

  // The open draft wins: no page repaint and no theme override underneath.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(studio.locator('[data-field="clock.scale"]')).toHaveValue("100");
  const previewScale = await studio.locator("[data-stage]").evaluate((element) => getComputedStyle(element).getPropertyValue("--clock-scale").trim());
  expect(previewScale).toBe("1");

  // Cancel restores the pre-open page state rather than the skipped host paint.
  await studio.locator('[data-act="cancel"]').click();
  await expect(studio).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const pageScale = await page.locator("#stage").evaluate((element) => getComputedStyle(element).getPropertyValue("--clock-scale").trim());
  expect(pageScale).toBe("1");

  // The host change was still recorded; a fresh load picks it up.
  await page.reload();
  await expect.poll(
    () => page.locator("#stage").evaluate((element) => getComputedStyle(element).getPropertyValue("--clock-scale").trim()),
  ).toBe("1.4");
});

test("yields one phone Escape to the topmost Studio layer", async ({ page }) => {
  await setHostLook({ appearance: DEFAULT_APPEARANCE });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  await openTab(page, "look");
  const sheet = page.locator("#sheet");
  await expect(sheet).toHaveAttribute("data-open", "true");
  await page.locator("#open-studio").click();
  const studio = page.locator("#studio");
  await expect(studio).toBeVisible();

  await page.keyboard.press("Escape");
  // The first Escape closes only the Studio; the sheet and its visible trigger stay.
  await expect(studio).toBeHidden();
  await expect(sheet).toHaveAttribute("data-open", "true");
  await expect(page.locator("#open-studio")).toBeFocused();

  // A second Escape then dismisses the sheet from that visible trigger.
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveAttribute("data-open", "false");
  await expect(page.locator("#sheet-handle")).toBeFocused();
});

test("keeps the sheet open when Escape asks to discard a dirty Studio", async ({ page }) => {
  await setHostLook({ appearance: DEFAULT_APPEARANCE });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?token=${TOKEN}`);
  await openTab(page, "look");
  await page.locator("#open-studio").click();
  const studio = page.locator("#studio");
  await expect(studio).toBeVisible();
  await studio.locator('[data-field="clock.scale"]').fill("130");
  await studio.locator('[data-field="clock.scale"]').dispatchEvent("input");
  // Escape inside a numeric field reverts the field first; leave it to reach
  // the dirty-draft confirm.
  await studio.locator('[data-element="clock"]').click();

  await page.keyboard.press("Escape");
  await expect(studio.locator("[data-confirm]")).toBeVisible();
  await expect(studio).toBeVisible();
  await expect(page.locator("#sheet")).toHaveAttribute("data-open", "true");

  await studio.locator('[data-act="discard"]').click();
  await expect(studio).toBeHidden();
  await expect(page.locator("#sheet")).toHaveAttribute("data-open", "true");
  await expect(page.locator("#open-studio")).toBeFocused();
});

// These tests mutate the shared host state. Restore the seeded defaults with
// the setup API even when a test fails so later spec files do not inherit it.
test.afterAll(async () => {
  const api = await request.newContext({ baseURL: ORIGIN });
  try {
    const response = await api.put("/api/setup/look", {
      headers: SETUP_HEADERS,
      data: { appearance: DEFAULT_APPEARANCE, activePet: "local:testpet" },
    });
    expect(response.ok(), `phone look cleanup failed: HTTP ${response.status()}`).toBe(true);
  } finally {
    await api.dispose();
  }
});
