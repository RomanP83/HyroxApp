import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsClient, type SettingsProps } from "../SettingsClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
  usePathname: () => "/settings",
}));

const base: SettingsProps = {
  hasPlan: true,
  planStatus: "active",
  weekShape: {
    long_run_day: 7,
    strength_days: [1, 4],
    rest_days: [3],
    max_rest_days: 2,
    warnings: [],
  },
  volume: {
    weekly_km_peak: 45,
    runs_per_week: 4,
    max_runs: 4,
    assessment: null,
    frequency: { verdict: "ok", note: "5 days sits in the 5-6 sessions." },
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
    // Sunday long run, Monday and Thursday strength, Wednesday rest.
    const pressed = (html.match(/aria-pressed="true"/g) ?? []).length;
    expect(pressed).toBe(4);
    expect(html).toContain('aria-label="Long run: Sunday"');
    expect(html).toContain('aria-label="Rest (max 2): Wednesday"');
  });

  it("spends the accent once — only the focal card saves in the filled form", () => {
    expect((html.match(/btn-primary/g) ?? []).length).toBe(1);
  });

  it("says what a pin costs, when it costs something", () => {
    const warned = render({
      weekShape: { ...base.weekShape, warnings: ["Strength on Thursday follows a hard Wednesday."] },
    });
    expect(warned).toContain("Strength on Thursday follows a hard Wednesday.");
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
