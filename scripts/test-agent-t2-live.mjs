import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { "base-url": { type: "string", default: "http://127.0.0.1:3000" } } });
async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  if (process.env.AGENT_AI_PROVIDER !== "nvidia" || !process.env.AGENT_DEMO_TOKEN || !process.env.AGENT_GROUND_TOKEN || !process.env.NVIDIA_API_KEY?.trim()) {
    throw new Error("Configure the NVIDIA provider and the astronaut and ground demo tokens in .env.");
  }
  const url = new URL(values["base-url"]);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !["http:", "https:"].includes(url.protocol)
      || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Use a local URL.");
  const base = `${url.origin}/api/agent/v1`;
  const astronaut = { Authorization: `Bearer ${process.env.AGENT_DEMO_TOKEN}`, "Content-Type": "application/json" };
  const ground = { Authorization: `Bearer ${process.env.AGENT_GROUND_TOKEN}`, "Content-Type": "application/json" };
  async function call(path, method = "GET", body, headers = astronaut, expected = 200) {
    const response = await fetch(base + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(135_000) });
    const payload = await response.json();
    if (response.status !== expected) throw new Error(`${method} ${path}: HTTP ${response.status}, ${payload.error?.code ?? "UNKNOWN"}.`);
    return payload.data;
  }
  const session = await call("/sessions", "POST", { astronautId: "astro-1" }, astronaut, 201);
  const turn = await call(`/sessions/${session.id}/messages`, "POST", {
    clientMessageId: randomUUID(), text: "I slept five hours. Sleep quality 2 out of 5, fatigue 4 out of 5.", inputMode: "TEXT",
  });
  const hours = turn.checkIn.observations.find((o) => o.field === "SLEEP_HOURS");
  assert.equal(hours?.value, 5, "Sleep hours not recognized.");
  await call(`/check-ins/${turn.checkIn.id}/confirm`, "POST", {
    expectedRevision: turn.checkIn.revision, sharedObservationIds: [hours.id],
  }, astronaut, 202);
  let state;
  for (let i = 0; i < 90; i++) {
    state = await call(`/sessions/${session.id}`);
    if (state.generationStatus === "READY" || state.generationStatus === "FAILED") break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(state?.generationStatus, "READY", "Generation not completed; retry the confirmation if it failed.");
  const reports = await call("/reports?astronautId=astro-1", "GET", undefined, ground);
  const diaries = await call("/diary?astronautId=astro-1");
  const report = reports.items.find((item) => item.checkInId === turn.checkIn.id);
  const diary = diaries.items.find((item) => item.checkInId === turn.checkIn.id);
  assert.ok(report && diary, "Report or diary missing.");
  for (const finding of [...report.findings, ...report.discrepancies]) {
    for (const evidence of finding.evidence) {
      if (evidence.source === "self_report") assert.equal(evidence.observationId, hours.id, "Observation not shared in the report.");
    }
  }
  assert.equal(diary.visibility, "PRIVATE");
  await call("/diary?astronautId=astro-1", "GET", undefined, ground, 403);
  const updated = await call(`/diary/${diary.id}`, "PATCH", {
    expectedRevision: diary.revision, text: "Fake diary corrected by the astronaut.", status: "CONFIRMED",
  });
  assert.equal(updated.revision, diary.revision + 1);
  console.log("OK: check-in confirmed, report and diary persisted, shared evidence, private diary and edit verified.");
  console.log(`Trial session: ${session.id}. Fake data stays in the local database.`);
}
main().catch((error) => {
  console.error(`T2 test failed: ${error instanceof Error ? error.message : "unexpected error"}`);
  process.exitCode = 1;
});
