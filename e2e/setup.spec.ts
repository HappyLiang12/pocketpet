import { expect, test } from "@playwright/test";
import { DEFAULT_APPEARANCE } from "../src/appearance.js";

// The project default locale is zh-TW; these assertions use the English copy,
// so opt this file into en-US. The no-JS and clipboard tests already create
// their own en-US contexts and are unaffected.
test.use({ locale: "en-US" });

const SETUP_ORIGIN = "http://127.0.0.1:7799";
const SETUP_HEADERS = {
  origin: SETUP_ORIGIN,
  "x-pocketpet-setup": "1",
  "content-type": "application/json",
};

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

test.describe("setup look", () => {
  test("opens Studio, saves host appearance, and reloads it", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    const spriteResponse = page.waitForResponse(
      (response) => response.url().includes("/assets/setup/pets/local/") && response.status() === 200,
    );
    await page.goto("/setup");
    await expect(page.locator("#look-app .look-summary")).toBeVisible();
    // The preview loads the host pet through the setup-only asset route.
    expect((await spriteResponse).ok()).toBe(true);
    // The setup app replaces the server fallback and exposes a real editor.
    await expect(page.locator("#look-app .look-fallback")).toHaveCount(0);
    await expect(page.locator("#look-app .look-frame")).toHaveAttribute("data-frame", "folded");
    await expect(page.locator("#look-app .look-frame canvas")).toBeVisible();
    await expect(page.locator("#look-app [data-time]")).toHaveText(/^\d{2}:\d{2}$/);
    const openStudio = page.getByRole("button", { name: "Open Studio" });
    await expect(openStudio).toBeEnabled();
    await openStudio.click();
    const studio = page.locator("#studio");
    await expect(studio).toBeVisible();
    await expect(studio.locator('.studio-pet[data-element="pet"] [data-pet]')).toBeVisible();

    // Type the digits for real: fill() alone would not catch the Studio's
    // per-keystroke clamp bug (100 -> 140 must stay 140 in the focused field).
    const scale = studio.locator('[data-field="clock.scale"]');
    await scale.fill("");
    await scale.pressSequentially("140");
    await expect(scale).toHaveValue("140");
    const putRequest = page.waitForRequest(
      (request) => request.method() === "PUT" && request.url().endsWith("/api/setup/look"),
    );
    await studio.locator('[data-act="save"]').click();
    const payload = (await putRequest).postDataJSON() as {
      appearance: { clock: { scale: number } };
      activePet?: string | null;
    };
    // A full appearance object; the pet is omitted for an appearance-only save.
    expect(payload.appearance.clock.scale).toBe(140);
    expect(payload.activePet).toBeUndefined();
    await expect(studio).toBeHidden();
    // The re-rendered Open Studio button receives focus from the closed Studio.
    await expect(page.getByRole("button", { name: "Open Studio" })).toBeFocused();

    await expect(page.locator("#look-app")).toContainText("140");
    const look = await (await page.request.get("/api/setup/look")).json();
    expect(look.appearance.clock.scale).toBe(140);

    await page.reload();
    await expect(page.locator("#look-app")).toContainText("140");

    // The folded/wide preview remains a real control after hydration.
    const frame = page.locator("#look-app .look-frame");
    await expect(frame).toHaveAttribute("data-frame", "folded");
    await page.getByRole("button", { name: "Wide" }).click();
    await expect(frame).toHaveAttribute("data-frame", "wide");
    await expect(page.getByRole("button", { name: "Wide" })).toHaveAttribute("aria-pressed", "true");
  });

  test("changes the host pet from setup Look", async ({ page }) => {
    await page.goto("/setup");
    await expect(page.locator("#look-app .look-summary")).toBeVisible();
    const putRequest = page.waitForRequest(
      (request) => request.method() === "PUT" && request.url().endsWith("/api/setup/look"),
    );
    await page.locator("#look-app [data-pet-option] input[value='local:testpet2']").check();
    const payload = (await putRequest).postDataJSON() as {
      appearance: Record<string, unknown>;
      activePet?: string | null;
    };
    // A pet change sends the current full appearance plus the new host pet.
    expect(Object.keys(payload.appearance).sort()).toEqual([
      "clock",
      "layout",
      "motion",
      "pet",
      "sessions",
      "stage",
      "theme",
      "v",
    ]);
    expect(payload.activePet).toBe("local:testpet2");
    await expect(page.locator("#look-app")).toContainText("Test Pet 2");
    const look = await (await page.request.get("/api/setup/look")).json();
    expect(look.activePet).toBe("local:testpet2");
  });

  test("caps and filters the setup pet picker", async ({ page }) => {
    await page.goto("/setup");
    await expect(page.locator("#look-app .look-summary")).toBeVisible();
    // 4 local pets + the 50-entry gallery window.
    await expect(page.locator("#look-app [data-pet-option]")).toHaveCount(54);
    await page.locator("#look-app input[type=search]").fill("Gallery Pet 55");
    await expect(page.locator("#look-app [data-pet-option]")).toHaveCount(5);
    await expect(page.locator("#look-app")).toContainText("Gallery Pet 55");
  });

  test("resets the host appearance from setup Look", async ({ page }) => {
    await page.request.put("/api/setup/look", {
      headers: SETUP_HEADERS,
      data: {
        appearance: {
          ...DEFAULT_APPEARANCE,
          clock: { ...DEFAULT_APPEARANCE.clock, scale: 150 },
        },
      },
    });
    await page.goto("/setup");
    await expect(page.locator("#look-app")).toContainText("150");
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(page.locator("#look-app")).toContainText("100%");
    const after = await (await page.request.get("/api/setup/look")).json();
    expect(after.appearance.clock.scale).toBe(100);
  });

  test("shows a specific Look error and recovers on retry", async ({ page }) => {
    let first = true;
    await page.route("**/api/setup/look", async (route) => {
      if (first && route.request().method() === "GET") {
        first = false;
        await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
        return;
      }
      await route.continue();
    });
    await page.goto("/setup");
    await expect(page.locator("#look-app")).toContainText("Could not load the look");
    await expect(page.locator("#look-app")).not.toContainText("Something went wrong");
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.locator("#look-app .look-summary")).toBeVisible();
  });
});
