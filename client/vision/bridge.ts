import { IdSchema } from "../../server/agent/contracts";

export const VISION_BRIDGE_CHANNEL = "crewready-vision-agent-v1";
export const DEFAULT_VISION_ORIGIN = "http://127.0.0.1:5173";
export function visionOrigin(value: string | undefined): string {
  const raw = value?.trim() || DEFAULT_VISION_ORIGIN;
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error("Invalid eyelid prototype address.");
  if (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Il prototipo deve usare HTTPS oppure un indirizzo locale.");
  return url.origin;
}

export function parseVisionBridgeMessage(event: Pick<MessageEvent, "origin" | "source" | "data">, expectedOrigin: string, expectedSource: MessageEventSource | null) {
  if (!expectedSource || event.origin !== expectedOrigin || event.source !== expectedSource) return null;
  const value: unknown = event.data;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  if (message.channel !== VISION_BRIDGE_CHANNEL || message.type !== "IMPORT" || !IdSchema.safeParse(message.requestId).success
      || typeof message.json !== "string" || !message.json.length || message.json.length > 10 * 1024 * 1024) return null;
  const blob = new Blob([message.json], { type: "application/json" });
  if (blob.size > 10 * 1024 * 1024) return null;
  return { requestId: message.requestId as string, blob };
}
