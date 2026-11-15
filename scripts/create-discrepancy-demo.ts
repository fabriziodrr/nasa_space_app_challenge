import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaAgentRepository } from "../server/agent/adapters/prisma/repository";
import { DemoProgramProvider } from "../server/agent/adapters/demo-program";
import { MockConversationAiProvider } from "../server/agent/adapters/mock-conversation-ai";
import { ArtifactService } from "../server/agent/services/artifacts";
import { ProposalService } from "../server/agent/services/proposals";
import { DemoScheduleValidator } from "../server/agent/services/demo-validator";

async function main() {
  process.loadEnvFile(".env");
  const db = new PrismaClient();
  try {
    const astronautId = "crew-demo-03", id = randomUUID(), messageId = randomUUID();
    const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const recordedAt = `${day}T06:00:00.000Z`;
    const instant = new Date(recordedAt);
    await db.conversationSession.create({ data: { id, astronautId, openedAt: instant } });
    const observations = [{ id: randomUUID(), field: "SLEEP_HOURS", value: 4, source: "self_report", recordedAt, messageIds: [messageId] }];
    await db.checkIn.create({ data: { id, sessionId: id, astronautId, revision: 1, status: "CONFIRMED", confirmedAt: instant, createdAt: instant,
      observationsJson: JSON.stringify(observations), sharedObservationIdsJson: JSON.stringify(observations.map((o) => o.id)) } });
    const sensors = { async read() { return [{ id: randomUUID(), astronautId, metric: "SLEEP_DURATION" as const, value: 7.4, unit: "h" as const, observedAt: recordedAt, source: "sensor" as const, quality: "GOOD" as const, simulated: true }]; } };
    const schedule = new DemoProgramProvider(db, () => instant);
    const ai = new MockConversationAiProvider({ proposalsEnabled: true });
    const demoAi = { async generateOperational(input: Parameters<typeof ai.generateOperational>[0]) { const result = await ai.generateOperational(input); result.report.uncertainties.unshift("DEMONSTRATION: fictional speech, simulated spacecraft data and a future schedule. No real astronaut measurement."); return result; } };
    await new ArtifactService({ repository: new PrismaAgentRepository(db), sensors, schedule, operationalAi: demoAi, diaryAi: ai,
      proposals: new ProposalService(new DemoScheduleValidator()), allowProposals: true }).generate({ userId: "demo", role: "ASTRONAUT", astronautId }, id);
    console.log(`Discrepancy demo ready: Noah Ferri, ${day}. Speech: 4 h; simulated spacecraft: 7.4 h. Schedule change pending Houston approval.`);
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error("Unable to create discrepancy demo."); process.exitCode = 1; });
