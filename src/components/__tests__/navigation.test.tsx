import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppHeader } from "../AppHeader";

const pathname = vi.hoisted(() => ({ value: "/progress" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

// The contract this app makes about getting home: every signed-in page renders
// AppHeader, whose logo links to /today and whose first tab is Today. The
// per-page presence is pinned by the pages' own component tests (they render
// AppHeader through SeasonClient/StrengthClient/…); this file pins what
// AppHeader itself must always provide.
const render = (path: string) => {
  pathname.value = path;
  return renderToStaticMarkup(<AppHeader />);
};
const tabsOf = (html: string) =>
  [...html.matchAll(/<nav[^>]*>([\s\S]*?)<\/nav>/g)].map((m) =>
    [...m[1].matchAll(/href="([^"]+)"/g)].map((h) => h[1]),
  );
const current = (html: string) =>
  [...html.matchAll(/<a\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => tag.includes('aria-current="page"'))
    .map((tag) => tag.match(/href="([^"]+)"/)?.[1]);

describe("the way back to today", () => {
  const html = render("/progress");

  it("the logo is a link to /today", () => {
    expect(html).toMatch(/<a[^>]+href="\/today"[^>]*>HYROX/);
  });

  it("has four tabs, in the same order on desktop and phone", () => {
    const navs = tabsOf(html);
    expect(navs).toHaveLength(2);
    for (const tabs of navs) expect(tabs).toEqual(["/today", "/plan", "/progress", "/race"]);
  });

  it("offers setup from every page, as a utility rather than a fifth tab", () => {
    expect(html).toContain('href="/settings"');
    for (const tabs of tabsOf(html)) expect(tabs).not.toContain("/settings");
  });
});

describe("the tab that is lit", () => {
  it("is the page's own tab", () => {
    expect(current(render("/today"))).toContain("/today");
    expect(current(render("/race"))).toContain("/race");
  });

  it("is Plan on the season, Progress on tests, Setup on the strength program", () => {
    expect(current(render("/season"))).toContain("/plan");
    expect(current(render("/benchmarks"))).toContain("/progress");
    const strength = current(render("/strength"));
    expect(strength).toContain("/settings");
    expect(strength).not.toContain("/plan");
  });
});
