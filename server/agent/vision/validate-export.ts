import { Worker } from "node:worker_threads";
import path from "node:path";
import { AgentError } from "../core/errors";

/** Run producer validation and replay off the event loop with a hard deadline. */
export function validateExport(json: string, signal?: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AgentError("PROVIDER_TIMEOUT", "Validation interrupted.", true));
    const worker = new Worker(path.join(process.cwd(), "server/agent/vision/validator-worker.cjs"));
    let settled = false;
    const finish = (error?: AgentError, data?: unknown) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); void worker.terminate();
      if (error) reject(error); else resolve(data);
    };
    const abort = () => finish(new AgentError("PROVIDER_TIMEOUT", "Validation interrupted or timed out.", true));
    const timer = setTimeout(abort, 5000);
    signal?.addEventListener("abort", abort, { once: true });
    worker.once("message", (message: { ok?: boolean; data?: unknown }) => {
      if (!message?.ok) finish(new AgentError("VALIDATION_ERROR", "Invalid eyelid export."));
      else finish(undefined, message.data);
    });
    worker.once("error", () => finish(new AgentError("PROVIDER_UNAVAILABLE", "Eyelid validation unavailable.", true)));
    worker.once("exit", () => { if (!settled) finish(new AgentError("PROVIDER_UNAVAILABLE", "Eyelid validation interrupted.", true)); });
    worker.postMessage(json);
  });
}
