import { test, expect } from "@playwright/test";

// The demo runs the real engine fully in-browser — this suite is the
// end-to-end proof that generation, adaptation, and the feedback card work
// without any backend (Roadmap B7).

test("landing page carries the core pitch", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("adapts after every session");
});

test("demo: generate → log → feedback card → adaptation feed", async ({ page }) => {
  await page.goto("/demo");
  await page.click("text=Generate my plan");

  // A full week renders with session cards and the why-this-week text.
  await expect(page.locator("text=Week 1")).toBeVisible();
  await expect(page.locator("text=RPE target").first()).toBeVisible();

  // Report a session as harder than planned → training feedback opens.
  await page.getByRole("button", { name: "Felt harder", exact: true }).first().click();
  await expect(page.locator("text=Training feedback")).toBeVisible();
  await expect(page.locator("text=Fulfillment index")).toBeVisible();
  await expect(page.locator("text=TOO HARD").first()).toBeVisible();
  await page.locator('button[aria-label="Close"]').click();

  // Log another session as planned → perfect score headline.
  await page.getByRole("button", { name: "As planned" }).first().click();
  await expect(page.locator("text=Dialed in!")).toBeVisible();
  await page.locator('button[aria-label="Close"]').click();

  // The estimated finish and station tiers are on screen.
  await expect(page.locator("text=Estimated finish")).toBeVisible();
  await expect(page.getByText("Station tiers", { exact: true })).toBeVisible();

  // Mis-tap insurance: undo one of the two logged days. The card hands the
  // quick-log row back and the adaptation feed says what was rolled back.
  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toHaveCount(2);
  await undo.first().click();
  await expect(undo).toHaveCount(1);
  await expect(page.locator("text=is back on the plan").first()).toBeVisible();
});

test("onboarding renders the signup gate", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(page.locator("text=Create your account")).toBeVisible();
});

test("the knowledge admin is gated by the operator secret", async ({ page }) => {
  await page.goto("/admin/knowledge");
  await expect(page.locator("text=Operator access")).toBeVisible();
  // The review surface itself must not render before the secret is accepted.
  await expect(page.locator("text=Knowledge pipeline")).toHaveCount(0);
});

test("the season view is behind the profile gate", async ({ page }) => {
  await page.goto("/season");
  // No profile in a fresh browser: the year plan needs one, so it sends you
  // to onboarding rather than rendering an empty calendar.
  await expect(page).toHaveURL(/onboarding/);
});

test("demo: double days mark the AM and PM halves of a day", async ({ page }) => {
  await page.goto("/demo");
  await page.getByLabel("Double days").selectOption("2");
  await page.click("text=Generate my plan");

  // Week 1 is a benchmark week and stays single-session by design, so step on.
  await expect(page.getByText("PM", { exact: true })).toHaveCount(0);
  await page.getByLabel("Next week").click();

  // The AM/PM marker only appears on days that carry two sessions.
  await expect(page.getByText("PM", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("AM", { exact: true }).first()).toBeVisible();

  // Without doubles the marker is gone again — one session a day.
  await page.getByLabel("Double days").selectOption("0");
  await page.click("text=Regenerate plan");
  await page.getByLabel("Next week").click();
  await expect(page.getByText("PM", { exact: true })).toHaveCount(0);
});

test("demo: a session moves to another day, and a taken day swaps", async ({ page }) => {
  await page.goto("/demo");
  await page.click("text=Generate my plan");

  const cards = page.locator("[data-session-card]");
  const first = cards.first();
  const firstTitle = (await first.getAttribute("data-session-title"))!;

  // Move it to a day the week has nothing on. Week 1 of a 4-day plan leaves
  // Sunday free, and a free day is a plain move — no swap message.
  // The move control lives inside the opened card — the first button of a card
  // is its disclosure toggle.
  await first.locator("button").first().click();
  await first.getByRole("button", { name: "Move" }).click();
  await first.getByTitle("Move to Sun").click();
  await expect(page.getByText(/the week bends, the plan doesn't break/).first()).toBeVisible();

  // The card now sits on Sunday — and it is the last card of the week.
  const moved = page.locator(`[data-session-title="${firstTitle}"]`).first();
  await expect(moved.getByText("Sun", { exact: true })).toBeVisible();
  await expect(cards.last()).toContainText(firstTitle);

  // Moving onto an occupied day trades the two sessions instead of failing.
  const targetTitle = (await cards.first().getAttribute("data-session-title"))!;
  // The card kept its open state through the move, so only toggle if needed.
  const moveBtn = moved.getByRole("button", { name: "Move" });
  if (!(await moveBtn.isVisible())) await moved.locator("button").first().click();
  await moveBtn.click();
  await moved.getByTitle(/is taken — the two sessions swap days/).first().click();
  // Plain substring, not a regex: session titles carry brackets of their own.
  await expect(
    page.getByText(`Swapped "${firstTitle}" with "${targetTitle}"`).first(),
  ).toBeVisible();
});

test("the strength page is behind the profile gate", async ({ page }) => {
  await page.goto("/strength");
  await expect(page).toHaveURL(/onboarding/);
});
