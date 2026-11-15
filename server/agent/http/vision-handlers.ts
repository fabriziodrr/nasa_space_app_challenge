import { z } from "zod";
import { IdSchema, VisionObservationSchema, successSchema } from "../contracts";
import { AgentError } from "../core/errors";
import type { AgentRuntime } from "../runtime";
import { createConversationHttpHandlers, readJson, response } from "./conversation-handlers";
import { evaluateVisionQuality } from "../vision/quality";

const maxBytes = 10 * 1024 * 1024;
async function readBytes(request: Request): Promise<Uint8Array> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new AgentError("VALIDATION_ERROR", "A JSON export is required.");
  if (Number(request.headers.get("content-length")) > maxBytes) throw new AgentError("PAYLOAD_TOO_LARGE", "File too large.");
  if (!request.body) throw new AgentError("VALIDATION_ERROR", "File missing.");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > maxBytes) { await reader.cancel(); throw new AgentError("PAYLOAD_TOO_LARGE", "File too large."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

const ListSchema = successSchema(z.array(VisionObservationSchema).max(100));
const OneSchema = successSchema(VisionObservationSchema);
const SelectionSchema = z.strictObject({ visionObservationId: IdSchema.nullable() });
const SelectionResponse = successSchema(SelectionSchema);
const SelectedObservationResponse = successSchema(VisionObservationSchema.nullable());
export function createVisionHttpHandlers(getRuntime: () => AgentRuntime) {
  const { handle } = createConversationHttpHandlers(getRuntime);
  return {
    import: (request: Request, id: string) => handle(request, async ({ visionObservations }, identity, requestId) => {
      if (identity.role !== "ASTRONAUT") throw new AgentError("FORBIDDEN", "This function is restricted to the astronaut.");
      const key = IdSchema.parse(request.headers.get("idempotency-key"));
      return response(OneSchema, await visionObservations.import(identity.astronautId, IdSchema.parse(id), key, await readBytes(request), request.signal), requestId, 201);
    }),
    list: (request: Request, id: string) => handle(request, async ({ visionObservations }, identity, requestId) => {
      if (identity.role !== "ASTRONAUT") throw new AgentError("FORBIDDEN", "This function is restricted to the astronaut.");
      return response(ListSchema, await visionObservations.list(identity.astronautId, IdSchema.parse(id)), requestId);
    }),
    select: (request: Request, id: string) => handle(request, async ({ visionObservations }, identity, requestId) => {
      if (identity.role !== "ASTRONAUT") throw new AgentError("FORBIDDEN", "This function is restricted to the astronaut.");
      const selection = SelectionSchema.parse(await readJson(request));
      await visionObservations.select(identity.astronautId, IdSchema.parse(id), selection.visionObservationId);
      return response(SelectionResponse, selection, requestId);
    }),
    selected: (request: Request, id: string) => handle(request, async ({ visionObservations, visionQuality }, identity, requestId) => {
      if (identity.role !== "ASTRONAUT") throw new AgentError("FORBIDDEN", "Funzione riservata all'astronauta.");
      const observation = await visionObservations.getSelectedForSession(identity.astronautId, IdSchema.parse(id));
      if (!observation) {
        // Verify session ownership even when no observation is selected.
        await visionObservations.list(identity.astronautId, IdSchema.parse(id));
        return response(SelectedObservationResponse, null, requestId);
      }
      return response(SelectedObservationResponse, { ...observation, ...evaluateVisionQuality(observation, new Date(), visionQuality) }, requestId);
    }),
  };
}
