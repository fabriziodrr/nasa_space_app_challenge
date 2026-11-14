import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { parseArgs } from "node:util";

async function main() {
  const { values } = parseArgs({ options: { "base-url": { type: "string", default: "http://127.0.0.1:3000" } } });
  if (existsSync(".env")) process.loadEnvFile(".env");
  if (!process.env.AGENT_DEMO_TOKEN) throw new Error("AGENT_DEMO_TOKEN mancante nel file .env.");
  const url = new URL(values["base-url"]);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      || !["http:", "https:"].includes(url.protocol) || url.username || url.password
      || url.pathname !== "/" || url.search || url.hash) throw new Error("Usa un URL locale come http://127.0.0.1:3000.");
  const base = `${url.origin}/api/agent/v1`;
  const headers = { Authorization: `Bearer ${process.env.AGENT_DEMO_TOKEN}`, "Content-Type": "application/json" };
  async function call(path, method = "GET", body) {
    const response = await fetch(base + path, {
      method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(135_000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`${data.error?.code ?? "ERRORE"}: ${data.error?.message ?? "Richiesta non riuscita."}`);
    return data.data;
  }
  const session = await call("/sessions", "POST", { astronautId: "astro-1" });
  console.log("Conversazione avviata. Scrivi un messaggio e premi Invio.");
  console.log("Comandi: /checkin per vedere la bozza, /esci per terminare. I messaggi restano nel database locale.");
  const rl = createInterface({ input: stdin, output: stdout, terminal: Boolean(stdin.isTTY) });
  if (stdin.isTTY) { rl.setPrompt("Tu: "); rl.prompt(); }
  try {
    for await (const line of rl) {
      const text = line.trim();
      if (!text) { if (stdin.isTTY) rl.prompt(); continue; }
      if (text === "/esci") break;
      try {
        if (text === "/checkin") {
          const state = await call(`/sessions/${session.id}`);
          if (!state.checkIn?.observations.length) console.log("\nNessuna osservazione registrata nella bozza.\n");
          else {
            const labels = { SLEEP_HOURS: "Ore di sonno", SLEEP_QUALITY: "Qualità del sonno (1–5)", FATIGUE: "Stanchezza (1–5)", PHYSICAL_NOTES: "Condizioni fisiche" };
            console.log("\nBozza del check-in:");
            for (const observation of state.checkIn.observations) console.log(`- ${labels[observation.field] ?? observation.field}: ${observation.value}`);
            console.log("La bozza non è ancora confermata né condivisa con Terra.\n");
          }
        } else {
          const turn = await call(`/sessions/${session.id}/messages`, "POST", { clientMessageId: randomUUID(), text, inputMode: "TEXT" });
          console.log(`\nAgent: ${turn.assistantMessage.text}\n`);
        }
      } catch (error) {
        console.error(`\nNon sono riuscito a completare la richiesta: ${error instanceof Error ? error.message : "errore inatteso"}\n`);
      }
      if (stdin.isTTY) rl.prompt();
    }
  } finally { rl.close(); }
  console.log("Conversazione terminata.");
}

main().catch((error) => {
  console.error(`Impossibile avviare la chat: ${error instanceof Error ? error.message : "errore inatteso"}`);
  console.error("Verifica che il server sia avviato e che la porta indicata sia corretta.");
  process.exitCode = 1;
});
