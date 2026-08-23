import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppHeader } from "../AppHeader";

vi.mock("next/navigation", () => ({ usePathname: () => "/progress" }));

// The contract this app makes about getting home: every signed-in page renders
// AppHeader, whose logo links to /plan and whose first tab is "This week".
// The per-page presence is pinned here by the pages' own component tests
// (they render AppHeader through SeasonClient/StrengthClient/…); this file
// pins what AppHeader itself must always provide.
describe("the way back to the week view", () => {
  const html = renderToStaticMarkup(<AppHeader />);

  it("the logo is a link to /plan", () => {
    expect(html).toMatch(/<a[^>]+href="\/plan"[^>]*>Hyrox/);
  });

  it("the first tab is the week view, on every page", () => {
    const firstTab = html.indexOf('href="/plan">This week');
    expect(firstTab).toBeGreaterThan(-1);
  });

  it("marks the page you are on", () => {
    expect(html).toContain('aria-current="page"');
  });

  it("offers setup from every page, as a utility rather than a sixth tab", () => {
    expect(html).toContain('href="/settings"');
    // It sits with the page-level controls, after the five content tabs.
    expect(html.indexOf('href="/settings"')).toBeGreaterThan(html.indexOf('href="/benchmarks"'));
  });
});
