import { afterEach, describe, expect, it } from "vitest";
import { GET as hubExport } from "@/app/api/hub/export/route";
import { POST as hubStrength } from "@/app/api/hub/strength/route";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("/api/hub/export", () => {
  it("does not exist without HUB_EXPORT_TOKEN", async () => {
    delete process.env.HUB_EXPORT_TOKEN;
    const res = await hubExport(new Request("https://app/api/hub/export", { headers: { authorization: "Bearer x" } }));
    expect(res.status).toBe(404);
  });

  it("rejects a wrong token", async () => {
    process.env.HUB_EXPORT_TOKEN = "export-token";
    const res = await hubExport(new Request("https://app/api/hub/export", { headers: { authorization: "Bearer nope" } }));
    expect(res.status).toBe(401);
  });
});

describe("/api/hub/strength", () => {
  const post = (body: unknown, auth = "Bearer ingest") =>
    hubStrength(new Request("https://app/api/hub/strength", { method: "POST", headers: { authorization: auth }, body: JSON.stringify(body) }));

  it("is closed without HUB_INGEST_SECRET and with a wrong one", async () => {
    delete process.env.HUB_INGEST_SECRET;
    expect((await post({})).status).toBe(503);
    process.env.HUB_INGEST_SECRET = "ingest";
    expect((await post({}, "Bearer wrong")).status).toBe(401);
  });

  it("rejects an invalid payload before touching the database", async () => {
    process.env.HUB_INGEST_SECRET = "ingest";
    const res = await post({ hub_workout_id: "x", deleted: false, date: "gestern" });
    expect(res.status).toBe(400);
  });
});
