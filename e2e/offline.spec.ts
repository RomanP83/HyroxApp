import { test, expect } from "@playwright/test";

// ============================================================================
// The gym is the one place this app is opened and the one place with no signal.
//
// A note on what these tests do NOT do: Playwright's context.setOffline does
// not reach fetches made from inside a service worker in this Chromium, so an
// "offline" navigation still hits the server and a test written that way passes
// while proving nothing. What is asserted here is the machinery — the worker
// takes control, a visited page lands in the cache, the fallback is precached.
// The end-to-end behaviour was verified by stopping the server outright: the
// visited page rendered from cache, an unvisited one showed the offline page.
// ============================================================================

/** Resolve once the worker is actually intercepting, not merely registered. */
async function serviceWorkerInControl(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }),
      );
    }
  });
}

test("the worker takes control and keeps the page you visited", async ({ page }) => {
  await page.goto("/demo");
  await serviceWorkerInControl(page);
  await page.reload();

  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  // The page itself, so it can be read again in a basement.
  expect(
    await page.evaluate(async () => Boolean(await caches.match(new Request(location.origin + "/demo")))),
  ).toBe(true);
  // And the fallback for somewhere never opened.
  expect(await page.evaluate(async () => Boolean(await caches.match("/offline.html")))).toBe(true);
});

test("signing out takes the cached pages off the device", async ({ page }) => {
  // Cached pages are rendered HTML with this athlete's sessions in them.
  await page.goto("/demo");
  await serviceWorkerInControl(page);
  await page.reload();

  await page.evaluate(async () => {
    navigator.serviceWorker.controller?.postMessage("clear-cache");
  });
  await expect
    .poll(async () => page.evaluate(async () => (await caches.keys()).length), { timeout: 5000 })
    .toBe(0);
});

test("the app is installable: manifest, icons and a scope that starts on the week", async ({
  request,
}) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.start_url).toBe("/plan");
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons) {
    const img = await request.get(icon.src);
    expect(img.ok(), icon.src).toBe(true);
  }
});
