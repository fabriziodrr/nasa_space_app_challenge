import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { parseArgs } from "node:util";

async function main() {
  const { values } = parseArgs({ options: { "base-url": { type: "string", default: "http://127.0.0.1:3000" } } });
  if (existsSync(".env")) process.loadEnvFile(".env");
  if (!process.env.AGENT_DEMO_TOKEN) throw new Error("AGENT_DEMO_TOKEN missing from the .env file.");
  const url = new URL(values["base-url"]);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      || !["http:", "https:"].includes(url.protocol) || url.username || url.password
      || url.pathname !== "/" || url.search || url.hash) throw new Error("Use a local URL such as http://127.0.0.1:3000.");
  const base = `${url.origin}/api/agent/v1`;
  const headers = { Authorization: `Bearer ${process.env.AGENT_DEMO_TOKEN}`, "Content-Type": "application/json" };
  async function call(path, method = "GET", body) {
    const response = await fetch(base + path, {
      method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(135_000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`${data.error?.code ?? "ERROR"}: ${data.error?.message ?? "Request failed."}`);
    return data.data;
  }
  const session = await call("/sessions", "POST", { astronautId: "astro-1" });
  console.log("Conversation started. Type a message and press Enter.");
  console.log("Commands: /checkin to view the draft, /exit to finish. Messages stay in the local database.");
  const rl = createInterface({ input: stdin, output: stdout, terminal: Boolean(stdin.isTTY) });
  if (stdin.isTTY) { rl.setPrompt("You: "); rl.prompt(); }
  try {
    for await (const line of rl) {
      const text = line.trim();
      if (!text) { if (stdin.isTTY) rl.prompt(); continue; }
      if (text === "/exit") break;
      try {
        if (text === "/checkin") {
          const state = await call(`/sessions/${session.id}`);
          if (!state.checkIn?.observations.length) console.log("\nNo observations recorded in the draft.\n");
          else {
            const labels = { SLEEP_HOURS: "Sleep hours", SLEEP_QUALITY: "Sleep quality (1-10)", FATIGUE: "Fatigue (1-10)", PHYSICAL_NOTES: "Physical condition", MENTAL_STATE: "Mental state", STRESSOR_NOTES: "Stressors" };
            console.log("\nCheck-in draft:");
            for (const observation of state.checkIn.observations) {
              const scale = ["SLEEP_QUALITY", "FATIGUE"].includes(observation.field) ? (observation.scaleMax ? ` / ${observation.scaleMax}` : " (historical scale not specified)") : "";
              console.log(`- ${labels[observation.field] ?? observation.field}: ${observation.value}${scale}`);
            }
            console.log("The draft is not yet confirmed or shared with ground.\n");
          }
        } else {
          const turn = await call(`/sessions/${session.id}/messages`, "POST", { clientMessageId: randomUUID(), text, inputMode: "TEXT" });
          console.log(`\nAgent: ${turn.assistantMessage.text}\n`);
        }
      } catch (error) {
        console.error(`\nI could not complete the request: ${error instanceof Error ? error.message : "unexpected error"}\n`);
      }
      if (stdin.isTTY) rl.prompt();
    }
  } finally { rl.close(); }
  console.log("Conversation ended.");
}

main().catch((error) => {
  console.error(`Unable to start the chat: ${error instanceof Error ? error.message : "unexpected error"}`);
  console.error("Check that the server is running and the given port is correct.");
  process.exitCode = 1;
});
