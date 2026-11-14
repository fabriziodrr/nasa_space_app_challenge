import { z } from "zod";
import { CheckInSchema, IdSchema, VisionObservationSchema, VisionSelectionSchema, successSchema } from "../../server/agent/contracts";

const Item = successSchema(VisionObservationSchema);
const Selection = successSchema(z.strictObject({ visionObservationId: IdSchema.nullable() }));
const Confirmation = z.strictObject({ data: z.strictObject({ checkIn: CheckInSchema, vision: VisionSelectionSchema }),
  meta: z.strictObject({ contractVersion: z.literal("2.0.0"), requestId: IdSchema }) });

export class DemoApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
async function call(path: string, init: RequestInit, token: string) {
  const headers = new Headers(init.headers); headers.set("Authorization", `Bearer ${token.trim()}`);
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  if (!response.ok) {
    const message = response.status === 401 ? "Token demo non riconosciuto."
      : response.status === 413 ? "Il file supera il limite di 10 MiB."
      : response.status === 400 ? "Il file o i dati inviati non sono validi."
      : response.status === 409 ? "La sessione o il check-in sono cambiati. Verifica lo stato prima di riprovare."
      : "Operazione non riuscita. Controlla il server e riprova.";
    throw new DemoApiError(response.status, message);
  }
  return response.json() as Promise<unknown>;
}
const base = (sessionId: string) => `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}`;
export async function uploadVision(token: string, sessionId: string, file: Blob, key: string) {
  if (!file.size || file.size > 10 * 1024 * 1024) throw new DemoApiError(413, "Scegli un file JSON non vuoto, fino a 10 MiB.");
  return Item.parse(await call(`${base(sessionId)}/vision-observations`, {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: file,
  }, token)).data;
}
export async function selectVision(token: string, sessionId: string, id: string | null) {
  return Selection.parse(await call(`${base(sessionId)}/vision-selection`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visionObservationId: id }),
  }, token)).data;
}
export async function confirmVision(token: string, checkInId: string, body: {
  expectedRevision: number; sharedObservationIds: string[]; vision: { visionObservationId: string | null; shareWithGround: boolean };
}) {
  return Confirmation.parse(await call(`/api/agent/v2/check-ins/${encodeURIComponent(checkInId)}/confirm`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }, token)).data;
}
