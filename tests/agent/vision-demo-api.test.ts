import assert from "node:assert/strict";
import { test } from "node:test";
import { DemoApiError, confirmVision, selectVision, uploadVision } from "../../client/vision/demo-api";
import { MockVisionReader } from "../../server/agent/adapters/mock-vision-reader";

test("demo client sends the original file with a reusable key and confirms only explicit selections", async () => {
  const original = globalThis.fetch; const requests: { url: string; init: RequestInit }[] = [];
  const item = await new MockVisionReader("RESTED", () => new Date("2026-11-14T06:00:00Z")).getSelectedForSession("a1", "s1");
  const checkIn = { id: "c1", astronautId: "a1", sessionId: "s1", revision: 2, status: "CONFIRMED", observations: [],
    sharedObservationIds: [], createdAt: "2026-11-14T06:00:00Z", confirmedAt: "2026-11-14T06:01:00Z" };
  const selection = { visionObservationId: item.id, shareWithGround: false };
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init: init! });
    if (String(url).endsWith("vision-observations")) return Response.json({ data: item, meta: { contractVersion: "1.0.0", requestId: "r1" } });
    if (String(url).endsWith("vision-selection")) return Response.json({ data: { visionObservationId: item.id }, meta: { contractVersion: "1.0.0", requestId: "r2" } });
    return Response.json({ data: { checkIn, vision: selection }, meta: { contractVersion: "2.0.0", requestId: "r3" } });
  };
  try {
    const file = new File(["{}"], "sample.json", { type: "application/json" });
    assert.equal((await uploadVision("demo-token", "s1", file, "stable-key")).id, item.id);
    assert.equal((await selectVision("demo-token", "s1", item.id)).visionObservationId, item.id);
    assert.equal((await confirmVision("demo-token", "c1", { expectedRevision: 1, sharedObservationIds: [], vision: selection })).checkIn.status, "CONFIRMED");
    assert.equal(requests[0].init.body, file);
    assert.equal(new Headers(requests[0].init.headers).get("Idempotency-Key"), "stable-key");
    assert.equal(new Headers(requests[0].init.headers).get("Authorization"), "Bearer demo-token");
    assert.deepEqual(JSON.parse(String(requests[2].init.body)).vision, selection);
    await assert.rejects(uploadVision("demo-token", "s1", new File([], "empty.json"), "k"), (error) => error instanceof DemoApiError && error.status === 413);
  } finally { globalThis.fetch = original; }
});

test("client maps server errors without displaying response body", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ secret: "non mostrare" }, { status: 409 });
  try {
    await assert.rejects(selectVision("demo-token", "s1", "v1"), (error) => error instanceof DemoApiError
      && error.status === 409 && !error.message.includes("non mostrare"));
  } finally { globalThis.fetch = original; }
});
