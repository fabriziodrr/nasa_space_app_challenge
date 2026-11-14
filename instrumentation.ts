export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadAgentConfig } = await import("./server/agent/config");
    loadAgentConfig(process.env);
  }
}
