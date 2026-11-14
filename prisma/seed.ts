// Seeds the local demo database: demo identities, the demonstrative astronaut and a
// coherent initial schedule. Re-running the seed resets all agent demo data.
import { PrismaClient } from "@prisma/client";
import { toDate } from "../server/agent/lib/time";
import {
  baseSchedule, DEMO_ASTRONAUT_ID, DEMO_GROUND_ID,
} from "../server/agent/simulator/scenarios";

const prisma = new PrismaClient();

async function reset(): Promise<void> {
  await prisma.$transaction([
    prisma.turn.deleteMany(),
    prisma.proposalDecision.deleteMany(),
    prisma.scheduleProposal.deleteMany(),
    prisma.groundReport.deleteMany(),
    prisma.diaryEntry.deleteMany(),
    prisma.generationClaim.deleteMany(),
    prisma.scheduleApplication.deleteMany(),
    prisma.scheduleSnapshot.deleteMany(),
    prisma.checkIn.deleteMany(),
    prisma.conversationMessage.deleteMany(),
    prisma.conversationSession.deleteMany(),
    prisma.demoIdentity.deleteMany(),
  ]);
}

async function main(): Promise<void> {
  await reset();

  await prisma.demoIdentity.createMany({
    data: [
      {
        id: DEMO_ASTRONAUT_ID,
        role: "ASTRONAUT",
        astronautId: DEMO_ASTRONAUT_ID,
        astronautIdsJson: "[]",
        label: "Astronauta dimostrativo",
      },
      {
        id: DEMO_GROUND_ID,
        role: "GROUND_CONTROL",
        astronautId: null,
        astronautIdsJson: JSON.stringify([DEMO_ASTRONAUT_ID]),
        label: "Sala di controllo dimostrativa",
      },
    ],
  });

  const schedule = baseSchedule();
  await prisma.scheduleSnapshot.create({
    data: {
      id: schedule.id,
      astronautId: schedule.astronautId,
      date: schedule.date,
      timeZone: schedule.timeZone,
      version: schedule.version,
      dayStartsAt: toDate(schedule.dayStartsAt),
      dayEndsAt: toDate(schedule.dayEndsAt),
      activitiesJson: JSON.stringify(schedule.activities),
    },
  });

  console.log(`Seed completato: identita demo ${DEMO_ASTRONAUT_ID}/${DEMO_GROUND_ID} e programma ${schedule.id} v${schedule.version}.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
