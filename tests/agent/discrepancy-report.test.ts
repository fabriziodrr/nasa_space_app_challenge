import { test } from "node:test";
import assert from "node:assert/strict";
import { demoProgram } from "../../server/agent/adapters/demo-program";
import { discrepancyProposal } from "../../server/agent/services/discrepancy-proposal";
import { withReportMeasurements } from "../../server/agent/services/report-measurements";
import { ProposalService } from "../../server/agent/services/proposals";
import { DemoScheduleValidator } from "../../server/agent/services/demo-validator";
import type { OperationalContext } from "../../server/agent/contracts";

test("a discrepancy proposes a bounded clarification break and preserves authoritative readings", () => {
  const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const observedAt = `${day}T06:00:00.000Z`;
  const context: OperationalContext = { checkIn: { id: "c", astronautId: "astro-1", confirmedAt: observedAt, observations: [{ id: "speech", field: "SLEEP_HOURS", value: 4, source: "self_report", recordedAt: observedAt }] }, sensors: [{ id: "sensor", astronautId: "astro-1", metric: "SLEEP_DURATION", value: 7.4, unit: "h", observedAt, source: "sensor", simulated: true, quality: "GOOD" }], vision: null };
  const result = discrepancyProposal(context, demoProgram("astro-1", day), new ProposalService(new DemoScheduleValidator()));
  assert.equal(result?.outcome, "proposal");
  if (result?.outcome === "proposal") { assert.equal(result.proposal.status, "PENDING_REVIEW"); assert.match(result.proposal.candidate.rationale, /clarify/); }
  const finding = withReportMeasurements({ text: "model text", source: "sensor", evidence: [{ source: "sensor", sensorReadingId: "sensor" }] }, context);
  assert.equal(finding.measurements?.[0].value, 7.4);
  assert.equal(finding.measurements?.[0].observedAt, observedAt);
  assert.equal(finding.measurements?.[0].simulated, true);
  context.checkIn.observations[0].value = 7.4;
  assert.equal(discrepancyProposal(context, demoProgram("astro-1", day), new ProposalService(new DemoScheduleValidator())), null);
});
