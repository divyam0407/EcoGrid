ALTER TABLE "OperationalSchedule"
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN "recurrenceRule" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "recurrenceEnd" TIMESTAMP(3),
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "departmentId" TEXT,
  ADD COLUMN "importBatchId" TEXT,
  ADD COLUMN "sourceRow" INTEGER,
  ADD COLUMN "recordKey" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "OperationalSchedule" SET "recurrenceRule" = 'WEEKLY' WHERE "dayOfWeek" IS NOT NULL;

CREATE TABLE "AcademicCalendarEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "buildingId" TEXT,
  "departmentId" TEXT,
  "roomId" TEXT,
  "title" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "startDatetime" TIMESTAMP(3) NOT NULL,
  "endDatetime" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL,
  "allDay" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "sourceType" TEXT NOT NULL DEFAULT 'MANUAL_ENTRY',
  "importBatchId" TEXT,
  "sourceRow" INTEGER,
  "recordKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademicCalendarEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationalInsight" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "buildingId" TEXT,
  "roomId" TEXT,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "recommendation" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "observedEnergyKwh" DOUBLE PRECISION,
  "estimatedSavingsKwh" DOUBLE PRECISION,
  "estimatedSavingsCost" DOUBLE PRECISION,
  "confidence" TEXT NOT NULL DEFAULT 'LIMITED_EVIDENCE',
  "evidenceJson" TEXT NOT NULL,
  "limitationsJson" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "approvalStatus" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
  "outcomeJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperationalInsight_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationalSchedule_organizationId_recordKey_key" ON "OperationalSchedule"("organizationId", "recordKey");
CREATE INDEX "OperationalSchedule_organizationId_status_dayOfWeek_idx" ON "OperationalSchedule"("organizationId", "status", "dayOfWeek");
CREATE INDEX "OperationalSchedule_importBatchId_idx" ON "OperationalSchedule"("importBatchId");
CREATE UNIQUE INDEX "AcademicCalendarEvent_organizationId_recordKey_key" ON "AcademicCalendarEvent"("organizationId", "recordKey");
CREATE INDEX "AcademicCalendarEvent_organizationId_startDatetime_endDatetime_idx" ON "AcademicCalendarEvent"("organizationId", "startDatetime", "endDatetime");
CREATE INDEX "AcademicCalendarEvent_organizationId_eventType_status_idx" ON "AcademicCalendarEvent"("organizationId", "eventType", "status");
CREATE INDEX "AcademicCalendarEvent_buildingId_startDatetime_idx" ON "AcademicCalendarEvent"("buildingId", "startDatetime");
CREATE INDEX "AcademicCalendarEvent_roomId_startDatetime_idx" ON "AcademicCalendarEvent"("roomId", "startDatetime");
CREATE INDEX "AcademicCalendarEvent_importBatchId_idx" ON "AcademicCalendarEvent"("importBatchId");
CREATE INDEX "OperationalInsight_organizationId_status_createdAt_idx" ON "OperationalInsight"("organizationId", "status", "createdAt");
CREATE INDEX "OperationalInsight_buildingId_periodStart_idx" ON "OperationalInsight"("buildingId", "periodStart");
CREATE INDEX "OperationalInsight_roomId_periodStart_idx" ON "OperationalInsight"("roomId", "periodStart");

ALTER TABLE "OperationalSchedule" ADD CONSTRAINT "OperationalSchedule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationalSchedule" ADD CONSTRAINT "OperationalSchedule_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "DataImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcademicCalendarEvent" ADD CONSTRAINT "AcademicCalendarEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademicCalendarEvent" ADD CONSTRAINT "AcademicCalendarEvent_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademicCalendarEvent" ADD CONSTRAINT "AcademicCalendarEvent_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcademicCalendarEvent" ADD CONSTRAINT "AcademicCalendarEvent_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademicCalendarEvent" ADD CONSTRAINT "AcademicCalendarEvent_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "DataImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationalInsight" ADD CONSTRAINT "OperationalInsight_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalInsight" ADD CONSTRAINT "OperationalInsight_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationalInsight" ADD CONSTRAINT "OperationalInsight_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
