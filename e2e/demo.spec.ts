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

  // Log a session as harder than planned → training feedback opens.
  await page.getByRole("button", { name: "Harder" }).first().click();
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
});

test("onboarding renders the signup gate", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(page.locator("text=Create your account")).toBeVisible();
});
