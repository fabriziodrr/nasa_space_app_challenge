import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { "base-url": { type: "string", default: "http://127.0.0.1:3000" } } });
async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  if (process.env.AGENT_AI_PROVIDER !== "nvidia" || !process.env.AGENT_DEMO_TOKEN || !process.env.AGENT_GROUND_TOKEN || !process.env.NVIDIA_API_KEY?.trim()) {
    throw new Error("Configurare provider NVIDIA e i token demo astronauta e Terra in .env.");
  }
  const url = new URL(values["base-url"]);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !["http:", "https:"].includes(url.protocol)
      || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Usare un URL locale.");
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
    clientMessageId: randomUUID(), text: "Ho dormito cinque ore. Qualita del sonno 2 su 5, stanchezza 4 su 5.", inputMode: "TEXT",
  });
  const hours = turn.checkIn.observations.find((o) => o.field === "SLEEP_HOURS");
  assert.equal(hours?.value, 5, "Ore di sonno non riconosciute.");
  await call(`/check-ins/${turn.checkIn.id}/confirm`, "POST", {
    expectedRevision: turn.checkIn.revision, sharedObservationIds: [hours.id],
  }, astronaut, 202);
  let state;
  for (let i = 0; i < 90; i++) {
    state = await call(`/sessions/${session.id}`);
    if (state.generationStatus === "READY" || state.generationStatus === "FAILED") break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(state?.generationStatus, "READY", "Generazione non completata; riprovare la conferma se fallita.");
  const reports = await call("/reports?astronautId=astro-1", "GET", undefined, ground);
  const diaries = await call("/diary?astronautId=astro-1");
  const report = reports.items.find((item) => item.checkInId === turn.checkIn.id);
  const diary = diaries.items.find((item) => item.checkInId === turn.checkIn.id);
  assert.ok(report && diary, "Report o diario assenti.");
  for (const finding of [...report.findings, ...report.discrepancies]) {
    for (const evidence of finding.evidence) {
      if (evidence.source === "self_report") assert.equal(evidence.observationId, hours.id, "Osservazione non condivisa nel report.");
    }
  }
  assert.equal(diary.visibility, "PRIVATE");
  await call("/diary?astronautId=astro-1", "GET", undefined, ground, 403);
  const updated = await call(`/diary/${diary.id}`, "PATCH", {
    expectedRevision: diary.revision, text: "Diario fittizio corretto dall'astronauta.", status: "CONFIRMED",
  });
  assert.equal(updated.revision, diary.revision + 1);
  console.log("OK: check-in confermato, report e diario persistiti, evidenze condivise, diario privato e modifica verificati.");
  console.log(`Sessione di prova: ${session.id}. I dati fittizi rimangono nel database locale.`);
}
main().catch((error) => {
  console.error(`Test T2 non riuscito: ${error instanceof Error ? error.message : "errore inatteso"}`);
  process.exitCode = 1;
});
