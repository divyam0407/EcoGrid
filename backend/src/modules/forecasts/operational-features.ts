import { prisma } from '../../config';

const weekdayNumber: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
function localParts(date: Date, timezone: string) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const value = Object.fromEntries(p.map((x) => [x.type, x.value]));
  return { day: weekdayNumber[value.weekday], minute: Number(value.hour) * 60 + Number(value.minute) };
}
function insideClock(minute: number, start: string, end: string) {
  const toMin = (v: string) => { const [h, m] = v.split(':').map(Number); return h * 60 + m; };
  const a = toMin(start), b = toMin(end);
  return a <= b ? minute >= a && minute < b : minute >= a || minute < b;
}

export async function operationalFeatures(organizationId: string, buildingId: string, timestamps: Date[], timezone: string) {
  if (!timestamps.length) return [];
  const start = new Date(Math.min(...timestamps.map((v) => v.getTime())) - 86400000);
  const end = new Date(Math.max(...timestamps.map((v) => v.getTime())) + 86400000);
  const [schedules, calendar] = await Promise.all([
    prisma.operationalSchedule.findMany({ where: { organizationId, buildingId, status: 'ACTIVE', OR: [
      { startDatetime: { lte: end }, endDatetime: { gte: start } },
      { recurrenceRule: 'WEEKLY', OR: [{ recurrenceEnd: null }, { recurrenceEnd: { gte: start } }] },
      ] }, select: { startDatetime: true, endDatetime: true, dayOfWeek: true, startTime: true, endTime: true, recurrenceRule: true, recurrenceEnd: true, timezone: true, updatedAt: true } }),
    prisma.academicCalendarEvent.findMany({ where: { organizationId, status: 'ACTIVE', eventType: { in: ['HOLIDAY', 'VACATION', 'EXAMINATION'] },
      AND: [{ OR: [{ buildingId: null }, { buildingId }] }, { startDatetime: { lte: end } }, { endDatetime: { gte: start } }] },
      select: { startDatetime: true, endDatetime: true, eventType: true, createdAt: true } }),
  ]);
  return timestamps.map((timestamp) => {
    const scheduled = schedules.filter((s) => {
      if (s.updatedAt > timestamp) return false;
      if (s.recurrenceRule === 'WEEKLY') {
        const local = localParts(timestamp, s.timezone || timezone);
        return (s.recurrenceEnd == null || timestamp <= s.recurrenceEnd) && s.dayOfWeek === local.day && insideClock(local.minute, s.startTime, s.endTime);
      }
      return !!s.startDatetime && !!s.endDatetime && timestamp >= s.startDatetime && timestamp < s.endDatetime;
    }).length;
    const knownEvents = calendar.filter((e) => e.createdAt <= timestamp && timestamp >= e.startDatetime && timestamp < e.endDatetime);
    const holiday = knownEvents.some((e) => ['HOLIDAY', 'VACATION'].includes(e.eventType));
    const exam = knownEvents.some((e) => e.eventType === 'EXAMINATION');
    return { timestamp: timestamp.toISOString(), scheduled_classes: scheduled, schedule_data_available: schedules.length ? 1 : 0,
      is_holiday: holiday ? 1 : 0, is_exam_period: exam ? 1 : 0, calendar_data_available: calendar.length ? 1 : 0 };
  });
}
