ALTER TABLE "OperationalSchedule" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER INDEX "AcademicCalendarEvent_organizationId_startDatetime_endDatetime_" RENAME TO "AcademicCalendarEvent_organizationId_startDatetime_endDatet_idx";
