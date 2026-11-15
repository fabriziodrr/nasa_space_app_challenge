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
  const headers = new Headers(init.headers); if (token.trim()) headers.set("Authorization", `Bearer ${token.trim()}`);
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  if (!response.ok) {
    const message = response.status === 401 ? "Demo token not recognized."
      : response.status === 413 ? "The file exceeds the 10 MiB limit."
      : response.status === 400 ? "The uploaded file or data is invalid."
      : response.status === 409 ? "The session or check-in changed. Verify the state before retrying."
      : "Operation failed. Check the server and try again.";
    throw new DemoApiError(response.status, message);
  }
  return response.json() as Promise<unknown>;
}
const base = (sessionId: string) => `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}`;
export async function uploadVision(token: string, sessionId: string, file: Blob, key: string) {
  if (!file.size || file.size > 10 * 1024 * 1024) throw new DemoApiError(413, "Choose a non-empty JSON file, up to 10 MiB.");
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
