import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { decideProposal, getProposals, getReports, getSchedule, MissionApiError, saveSchedule } from "../../client/dashboard/mission-api";
import { ScheduleSnapshotSchema } from "../../server/agent/contracts";

const fixture = JSON.parse(readFileSync("docs/agent/examples/normal.json", "utf8"));
const decision = JSON.parse(readFileSync("docs/agent/examples/normal-response.json", "utf8")).data;
const success = (data: unknown) => Response.json({ data, meta: { contractVersion: "2.0.0", requestId: "test-request" } });

test("dashboard loads authorized schedule, reports and paginated proposals", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input); calls.push(url);
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer ground-token");
    assert.equal(init?.cache, "no-store");
    if (url.includes("/schedule?")) return success(fixture.schedule);
    if (url.includes("/reports?")) return success({ items: [fixture.report], nextCursor: null });
    return success({ items: [fixture.pendingProposal], nextCursor: "next-page" });
  };
  try {
    assert.equal((await getSchedule(" ground-token ", "astro-1", "2026-11-14")).version, 1);
    assert.equal((await getReports("ground-token", "astro-1")).items[0].id, fixture.report.id);
    assert.equal((await getProposals("ground-token", "astro-1", "previous")).nextCursor, "next-page");
    assert.match(calls[2], /cursor=previous/);
  } finally { globalThis.fetch = original; }
});

test("dashboard saves with expected schedule version and exposes conflicts", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    assert.equal(init?.method, "PUT");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.expectedVersion, fixture.schedule.version);
    assert.deepEqual(body.schedule, fixture.schedule);
    return Response.json({ error: { code: "VERSION_CONFLICT" } }, { status: 409 });
  };
  try {
    await assert.rejects(saveSchedule("ground-token", ScheduleSnapshotSchema.parse(fixture.schedule)),
      (error) => error instanceof MissionApiError && error.status === 409 && error.code === "VERSION_CONFLICT");
  } finally { globalThis.fetch = original; }
});

test("decision retries send the same idempotency key and return only the confirmed server result", async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /\/proposals\/proposal-1\/decision$/);
    assert.equal(new Headers(init?.headers).get("Idempotency-Key"), "operation-1");
    assert.deepEqual(JSON.parse(String(init?.body)), { decision: "APPROVE", comment: null });
    if (++count === 1) throw new TypeError("Connection lost");
    return success(decision);
  };
  try {
    await assert.rejects(decideProposal("ground-token", "proposal-1", "APPROVE", "operation-1"));
    const result = await decideProposal("ground-token", "proposal-1", "APPROVE", "operation-1");
    assert.equal(result.proposal.status, "APPLIED");
    assert.equal(result.schedule?.version, 2);
  } finally { globalThis.fetch = original; }
});
