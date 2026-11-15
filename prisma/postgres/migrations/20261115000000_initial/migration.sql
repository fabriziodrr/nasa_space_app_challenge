-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "sloth_agent";

-- CreateTable
CREATE TABLE "DemoIdentity" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "astronautId" TEXT,
    "astronautIdsJson" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "DemoIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationSession" (
    "id" TEXT NOT NULL,
    "astronautId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ConversationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "inputMode" TEXT NOT NULL,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "astronautId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "observationsJson" TEXT NOT NULL,
    "sharedObservationIdsJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisionObservation" (
    "id" TEXT NOT NULL,
    "astronautId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "summaryJson" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisionObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisionSelection" (
    "sessionId" TEXT NOT NULL,
    "astronautId" TEXT NOT NULL,
    "observationId" TEXT,

    CONSTRAINT "VisionSelection_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "CheckInContextSnapshot" (
    "checkInId" TEXT NOT NULL,
    "astronautId" TEXT NOT NULL,
    "selectionJson" TEXT NOT NULL,
    "sensorsJson" TEXT NOT NULL,
    "visionJson" TEXT,
    "qualityJson" TEXT NOT NULL,
    "scheduleJson" TEXT,
    "confirmedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckInContextSnapshot_pkey" PRIMARY KEY ("checkInId")
);

-- CreateTable
CREATE TABLE "Turn" (
    "clientMessageId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "astronautId" TEXT NOT NULL,
    "requestJson" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Turn_pkey" PRIMARY KEY ("clientMessageId")
);

-- CreateTable
CREATE TABLE "ScheduleProposal" (
    "id" TEXT NOT NULL,
    "astronautId" TEXT NOT NULL,
    "checkInId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "baseScheduleVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "candidateJson" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "decisionId" TEXT,
    "appliedScheduleVersion" INTEGER,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "ScheduleProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalDecision" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,

    CONSTRAINT "ProposalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroundReport" (
    "id" TEXT NOT NULL,
    "astronautId" TEXT NOT NULL,
    "checkInId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "findingsJson" TEXT NOT NULL,
    "discrepanciesJson" TEXT NOT NULL,
    "uncertaintiesJson" TEXT NOT NULL,
    "humanReviewRequired" BOOLEAN NOT NULL,
    "humanReviewReason" TEXT,
    "proposalId" TEXT,

    CONSTRAINT "GroundReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiaryEntry" (
    "id" TEXT NOT NULL,
    "astronautId" TEXT NOT NULL,
    "checkInId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationClaim" (
    "checkInId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
    "failed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "noChangeReason" TEXT,

    CONSTRAINT "GenerationClaim_pkey" PRIMARY KEY ("checkInId")
);

-- CreateTable
CREATE TABLE "ScheduleSnapshot" (
    "id" TEXT NOT NULL,
    "astronautId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "dayStartsAt" TIMESTAMP(3) NOT NULL,
    "dayEndsAt" TIMESTAMP(3) NOT NULL,
    "activitiesJson" TEXT NOT NULL,

    CONSTRAINT "ScheduleSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleApplication" (
    "proposalId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL,
    "resultingVersion" INTEGER NOT NULL,
    "resultingActivitiesJson" TEXT NOT NULL,
    "commandJson" TEXT NOT NULL,

    CONSTRAINT "ScheduleApplication_pkey" PRIMARY KEY ("proposalId","decisionId")
);

-- CreateIndex
CREATE INDEX "ConversationSession_astronautId_idx" ON "ConversationSession"("astronautId");

-- CreateIndex
CREATE INDEX "ConversationMessage_sessionId_createdAt_id_idx" ON "ConversationMessage"("sessionId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_sessionId_key" ON "CheckIn"("sessionId");

-- CreateIndex
CREATE INDEX "CheckIn_astronautId_idx" ON "CheckIn"("astronautId");

-- CreateIndex
CREATE INDEX "VisionObservation_astronautId_sessionId_importedAt_id_idx" ON "VisionObservation"("astronautId", "sessionId", "importedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "VisionObservation_astronautId_sessionId_requestKey_key" ON "VisionObservation"("astronautId", "sessionId", "requestKey");

-- CreateIndex
CREATE INDEX "Turn_astronautId_sessionId_idx" ON "Turn"("astronautId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Turn_sessionId_clientMessageId_key" ON "Turn"("sessionId", "clientMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleProposal_checkInId_key" ON "ScheduleProposal"("checkInId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleProposal_decisionId_key" ON "ScheduleProposal"("decisionId");

-- CreateIndex
CREATE INDEX "ScheduleProposal_astronautId_createdAt_id_idx" ON "ScheduleProposal"("astronautId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalDecision_proposalId_key" ON "ProposalDecision"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalDecision_proposalId_idempotencyKey_key" ON "ProposalDecision"("proposalId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "GroundReport_checkInId_key" ON "GroundReport"("checkInId");

-- CreateIndex
CREATE INDEX "GroundReport_astronautId_generatedAt_id_idx" ON "GroundReport"("astronautId", "generatedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DiaryEntry_checkInId_key" ON "DiaryEntry"("checkInId");

-- CreateIndex
CREATE INDEX "DiaryEntry_astronautId_updatedAt_id_idx" ON "DiaryEntry"("astronautId", "updatedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleSnapshot_astronautId_date_key" ON "ScheduleSnapshot"("astronautId", "date");

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConversationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConversationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalDecision" ADD CONSTRAINT "ProposalDecision_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "ScheduleProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
