import { AgentError } from "./errors";

// Race the operation as well as aborting it: even a misbehaving adapter cannot
// keep a request open indefinitely or commit a late result through the service.
export async function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  callerSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let rejectAbort: (error: AgentError) => void = () => {};
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const abort = () => {
    controller.abort();
    rejectAbort(new AgentError("PROVIDER_TIMEOUT", "AI operation interrupted or timed out. You can retry.", true));
  };
  const timer = setTimeout(abort, timeoutMs);
  callerSignal?.addEventListener("abort", abort, { once: true });
  try {
    if (callerSignal?.aborted) abort();
    return await Promise.race([
      aborted,
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new AgentError("PROVIDER_TIMEOUT", "Operation interrupted.", true);
        return operation(controller.signal);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abort);
  }
}
