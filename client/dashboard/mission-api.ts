import { z } from "zod";
import { DecisionV2ResponseSchema, GroundReportSchema, IdSchema, ProposalListV2ResponseSchema,
  ScheduleV2ResponseSchema, successV2Schema, type ScheduleSnapshot } from "../../server/agent/contracts";

const ReportsSchema = successV2Schema(z.strictObject({ items: z.array(GroundReportSchema).max(100), nextCursor: IdSchema.nullable() }));
export class MissionApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly detail?: string) { super(code); }
}

async function call(path: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token.trim()}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`/api/agent/v2${path}`, { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(30000) });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.object({ code: z.string(), message: z.string().optional() }) }).safeParse(body);
    throw new MissionApiError(response.status, error.success ? error.data.error.code : "UNKNOWN", error.success ? error.data.error.message : undefined);
  }
  return body;
}
export async function getSchedule(token: string, astronautId: string, date: string) {
  const query = new URLSearchParams({ astronautId, date });
  return ScheduleV2ResponseSchema.parse(await call(`/schedule?${query}`, token)).data;
}
export async function saveSchedule(token: string, schedule: ScheduleSnapshot) {
  return ScheduleV2ResponseSchema.parse(await call("/schedule", token, { method: "PUT",
    body: JSON.stringify({ expectedVersion: schedule.version, schedule }) })).data;
}
export async function getReports(token: string, astronautId: string, cursor?: string) {
  const query = new URLSearchParams({ astronautId, limit: "20", ...(cursor ? { cursor } : {}) });
  return ReportsSchema.parse(await call(`/reports?${query}`, token)).data;
}
export async function getProposals(token: string, astronautId: string, cursor?: string) {
  const query = new URLSearchParams({ astronautId, limit: "20", ...(cursor ? { cursor } : {}) });
  return ProposalListV2ResponseSchema.parse(await call(`/proposals?${query}`, token)).data;
}
export async function decideProposal(token: string, proposalId: string, decision: "APPROVE" | "REJECT", key: string) {
  return DecisionV2ResponseSchema.parse(await call(`/proposals/${encodeURIComponent(proposalId)}/decision`, token, {
    method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ decision, comment: null }),
  })).data;
}
