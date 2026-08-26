import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsClient, type SettingsProps } from "../SettingsClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/settings",
}));

const base: SettingsProps = {
  hasPlan: true,
  planStart: { starts_on: "2026-03-02", race_date: "2026-05-24", total_weeks: 12 },
  planStatus: "active",
  experienceLevel: "advanced",
  division: "open",
  weekShape: {
    training_days_per_week: 5,
    doubles_per_week: 0,
    long_run_day: 7,
    strength_days: [1, 4],
    rest_days: [3],
    double_days: [],
  },
  volume: {
    weekly_km_peak: 45,
    runs_per_week: 4,
    assessment: null,
  },
  connections: {
    strava: { connected: true, url: "/api/strava/connect" },
    garmin: { connected: false, url: "/api/garmin/connect" },
    telegram: { connected: false, url: null },
  },
};

const render = (over: Partial<SettingsProps> = {}) =>
  renderToStaticMarkup(<SettingsClient {...base} {...over} />);

describe("the setup page", () => {
  const html = render();

  it("carries the shared header — the way back to the week view", () => {
    expect(html).toMatch(/<a[^>]+href="\/plan"[^>]*>Hyrox/);
  });

  it("shows the pinned days as pressed, and the rest as not", () => {
    // Four pinned days (Sunday long run, Monday and Thursday strength,
    // Wednesday rest), plus one pressed option in each of the four single-
    // choice rows: training days, doubles, level and division.
    const pressed = (html.match(/aria-pressed="true"/g) ?? []).length;
    expect(pressed).toBe(4 + 4);
    expect(html).toContain('aria-label="Long run: Sunday"');
    expect(html).toContain('aria-label="Rest (max 2): Wednesday"');
    expect(html).toContain('aria-label="Level and target time: Competitive · sub 1:20"');
    expect(html).toContain('aria-label="Division: Open"');
  });

  it("puts the training days and the doubles where the week is shaped", () => {
    expect(html).toContain('aria-label="Training days: 5"');
    expect(html).toContain('aria-label="Double days: None"');
    // The rest cap follows the training days, not a value baked in server-side.
    expect(html).toContain("Rest (max 2)");
  });

  it("judges the frequency live, against the level", () => {
    // 5 days is what an advanced athlete is built for; 3 is not.
    expect(render()).toContain("sub 1:20");
    const thin = render({
      weekShape: { ...base.weekShape, training_days_per_week: 3 },
    });
    expect(thin).toContain("aerobic volume");
    expect(thin).toContain("Rest (max 4)");
  });

  it("spends the accent once — only the focal card saves in the filled form", () => {
    expect((html.match(/btn-primary/g) ?? []).length).toBe(1);
  });

  it("says what a pin costs, when it costs something", () => {
    // Computed from the pins themselves: Friday long run with the weekend at
    // rest leaves five sessions for Monday to Friday, and something gives.
    const warned = render({
      weekShape: {
        ...base.weekShape,
        long_run_day: 5,
        strength_days: [],
        rest_days: [6, 7],
      },
    });
    expect(warned).toContain("plyometrics wants 24-48 h");
  });

  it("distinguishes connected, connectable and not configured", () => {
    expect(html).toContain("connected"); // Strava
    expect(html).toContain("/api/garmin/connect"); // Garmin offers a link
    expect(html).toContain("not configured"); // Telegram has no bot on this deploy
  });

  it("offers rehab when the plan is running, and the way out when it is not", () => {
    expect(html).toContain("Flag an injury");
    const rehab = render({ planStatus: "rehab" });
    expect(rehab).toContain("Rehab mode is on.");
    expect(rehab).not.toContain("Flag an injury");
  });

  it("works before a plan exists — the week shape is what you set first", () => {
    const fresh = render({ hasPlan: false });
    expect(fresh).toContain("The shape of your week");
    expect(fresh).not.toContain("rebuild the remaining weeks");
    expect(fresh).toContain("It applies to your next plan.");
  });
});

describe("signing out", () => {
  const html = render();

  it("offers a way out of the session, and says what it costs", () => {
    expect(html).toContain("Sign out");
    // The reassurance is the point: someone signing out on a shared laptop
    // needs to know the plan is not what is being cleared.
    expect(html).toContain("This device");
    expect(html).toMatch(/plan and everything you have logged\s+stay where they are/);
    expect(html).toMatch(/other\s+devices stay signed in/);
  });
});
