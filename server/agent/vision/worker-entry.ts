import { parentPort } from "node:worker_threads";
import { parseSessionExport } from "./vendor/integration/parse-session-export";

if (!parentPort) throw new Error("Worker requires a parent port");
parentPort.once("message", (text: string) => {
  try { parentPort!.postMessage({ ok: true, data: parseSessionExport(text) }); }
  catch { parentPort!.postMessage({ ok: false }); }
});
