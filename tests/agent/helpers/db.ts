// Test helpers: a throwaway SQLite database per test file, schema pushed via the
// Prisma CLI, plus seed helpers mirroring prisma/seed.ts.
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { toDate } from "../../../server/agent/lib/time";
import {
  baseSchedule, DEMO_ASTRONAUT_ID, DEMO_GROUND_ID,
} from "../../../server/agent/simulator/scenarios";

export interface TestDb {
  prisma: PrismaClient;
  url: string;
  cleanup(): Promise<void>;
}

export function createTestDb(): TestDb {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-test-"));
  const dbPath = path.join(dir, "test.db").split(path.sep).join("/");
  const url = `file:${dbPath}`;
  execSync("prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  const prisma = new PrismaClient({ datasourceUrl: url });
  return {
    prisma,
    url,
    async cleanup() {
      await prisma.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export async function seedIdentities(prisma: PrismaClient): Promise<void> {
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
}

export async function seedSchedule(prisma: PrismaClient): Promise<void> {
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
}
