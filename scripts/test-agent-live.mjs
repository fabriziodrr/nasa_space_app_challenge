import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  "base-url": { type: "string", default: "http://127.0.0.1:3000" },
  help: { type: "boolean", default: false },
} });

async function main() {
  if (values.help) {
    console.log("Avvia prima npm run dev, poi npm run test:agent:live -- --base-url http://127.0.0.1:3000");
    return;
  }
  if (existsSync(".env")) process.loadEnvFile(".env");
  if (process.env.AGENT_AI_PROVIDER !== "nvidia" || !process.env.AGENT_DEMO_TOKEN || !process.env.NVIDIA_API_KEY?.trim()) {
    throw new Error("Configurare .env con AGENT_AI_PROVIDER=nvidia, AGENT_DEMO_TOKEN e NVIDIA_API_KEY.");
  }
  const url = new URL(values["base-url"]);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      || !["http:", "https:"].includes(url.protocol) || url.username || url.password
      || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Usare un URL locale, per esempio http://127.0.0.1:3000.");
  }
  const base = `${url.origin}/api/agent/v1`;
  const headers = { Authorization: `Bearer ${process.env.AGENT_DEMO_TOKEN}`, "Content-Type": "application/json" };
  async function call(path, method, body, expected = 200, authenticated = true) {
    const response = await fetch(`${base}${path}`, {
      method, headers: authenticated ? headers : {},
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(135_000),
    });
    const payload = await response.json();
    if (response.status !== expected) {
      // Our API returns sanitized errors. Do not print headers/env/upstream bodies.
      throw new Error(`${method} ${path}: HTTP ${response.status}, ${payload.error?.code ?? "UNKNOWN"}. ${payload.error?.message ?? "Risposta inattesa."}`);
    }
    return payload.data;
  }
  const session = await call("/sessions", "POST", { astronautId: "astro-1" }, 201);
  console.log("OK: sessione creata.");
  const firstRequest = {
    clientMessageId: randomUUID(), inputMode: "TEXT",
    text: "Ho dormito 5 ore. Valuto la qualita del sonno 2 su 5 e la stanchezza 4 su 5.",
  };
  const first = await call(`/sessions/${session.id}/messages`, "POST", firstRequest);
  assert.ok(!first.assistantMessage.text.startsWith("Ho raccolto la bozza"), "Il server sta usando il mock: riavviarlo con AGENT_AI_PROVIDER=nvidia.");
  for (const [field, value] of [["SLEEP_HOURS", 5], ["SLEEP_QUALITY", 2], ["FATIGUE", 4]]) {
    assert.equal(first.checkIn.observations.find((o) => o.field === field)?.value, value, `Dato estratto non corretto: ${field}`);
  }
  console.log(`Agent: ${first.assistantMessage.text}`);
  const second = await call(`/sessions/${session.id}/messages`, "POST", {
    clientMessageId: randomUUID(), inputMode: "TEXT", text: "Fisicamente ho un lieve fastidio alla spalla destra.",
  });
  assert.ok(second.checkIn.observations.some((o) => o.field === "PHYSICAL_NOTES"));
  assert.notEqual(second.assistantMessage.text, first.assistantMessage.text, "L'agent ha ripetuto la risposta precedente senza rispondere alle nuove informazioni.");
  assert.equal(second.checkIn.revision, first.checkIn.revision + 1);
  for (const old of first.checkIn.observations) {
    const current = second.checkIn.observations.find((o) => o.field === old.field);
    assert.equal(current?.value, old.value, `Dato precedente perso: ${old.field}`);
    assert.equal(current?.id, old.id, `ID osservazione cambiato: ${old.field}`);
  }
  console.log(`Agent: ${second.assistantMessage.text}`);
  const replay = await call(`/sessions/${session.id}/messages`, "POST", firstRequest);
  assert.equal(replay.astronautMessage.id, first.astronautMessage.id);
  const state = await call(`/sessions/${session.id}`, "GET");
  assert.equal(state.messages.length, 4);
  assert.equal(state.checkIn.revision, second.checkIn.revision);
  assert.deepEqual(state.checkIn.sharedObservationIds, []);
  assert.equal(state.proposal, null);
  await call(`/sessions/${session.id}`, "GET", undefined, 401, false);
  await call(`/sessions/${session.id}/messages`, "POST", { ...firstRequest, text: "Testo diverso." }, 409);
  console.log("OK: 2 turni reali, 4 osservazioni, memoria del dialogo, retry senza duplicati, accesso protetto e conflitto 409.");
  console.log(`Sessione: ${session.id}. Il test usa solo dati fittizi e non modifica il programma.`);
}

main().catch((error) => {
  // Avoid printing stack/cause objects that might contain transport details.
  console.error(`Test non riuscito: ${error instanceof Error ? error.message : "errore inatteso"}`);
  console.error("Controllare che il server sia avviato, l'URL/porta siano corretti e la configurazione sia stata ricaricata.");
  process.exitCode = 1;
});
