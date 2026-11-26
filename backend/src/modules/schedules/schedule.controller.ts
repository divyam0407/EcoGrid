import { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { config, prisma } from '../../config';

const DAY_NAMES: Record<string, number> = { monday: 0, mon: 0, tuesday: 1, tue: 1, wednesday: 2, wed: 2, thursday: 3, thu: 3, friday: 4, fri: 4, saturday: 5, sat: 5, sunday: 6, sun: 6 };
const csv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const headers = (row: Record<string, string>) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase().replace(/[\s-]+/g, '_'), String(v ?? '').trim()]));

async function parseCsv(buffer: Buffer) {
  const rows: Record<string, string>[] = [];
  await new Promise<void>((resolve, reject) => Readable.from(buffer).pipe(csvParser()).on('data', row => rows.push(headers(row))).on('end', resolve).on('error', reject));
  return rows;
}

function timezoneExists(tz: string) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(); return true; } catch { return false; }
}

// Reject DST gaps and folds for local timestamps; explicit-offset timestamps are unambiguous.
function parseTimestamp(value: string, timezone: string): Date {
  if (!timezoneExists(timezone)) throw new Error(`Unknown IANA timezone: ${timezone}`);
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(value)) {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) throw new Error('Invalid timestamp');
    return parsed;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!m) throw new Error('Use ISO 8601 timestamp with offset or YYYY-MM-DD HH:mm[:ss] plus an IANA timezone');
  const [year, month, day, hour, minute] = m.slice(1, 6).map(Number); const second = Number(m[7] || 0);
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const offsets = new Set<number>();
  for (const delta of [-86400000, 0, 86400000]) {
    const values = Object.fromEntries(fmt.formatToParts(new Date(naive + delta)).map(p => [p.type, p.value]));
    const localAsUtc = Date.UTC(+values.year, +values.month - 1, +values.day, +values.hour, +values.minute, +values.second);
    offsets.add(localAsUtc - (naive + delta));
  }
  const matches = [...offsets].map(offset => new Date(naive - offset)).filter(candidate => {
    const v = Object.fromEntries(fmt.formatToParts(candidate).map(p => [p.type, p.value]));
    return +v.year === year && +v.month === month && +v.day === day && +v.hour === hour && +v.minute === minute && +v.second === second;
  });
  if (matches.length !== 1) throw new Error(matches.length ? 'Ambiguous local timestamp during daylight-saving transition; provide an explicit UTC offset' : 'Nonexistent local timestamp during daylight-saving transition');
  return matches[0];
}

const timeOk = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const json = (v: unknown) => JSON.stringify(v);

export const getSchedules = async (req: Request, res: Response) => {
  try {
    const organizationId = req.user!.organizationId;
    const schedules = await prisma.operationalSchedule.findMany({
      where: { organizationId, status: 'ACTIVE', ...(req.query.buildingId ? { buildingId: String(req.query.buildingId) } : {}), ...(req.query.roomId ? { roomId: String(req.query.roomId) } : {}) },
      include: { building: { select: { id: true, name: true } }, room: { select: { id: true, roomNumber: true, roomType: true, capacity: true } }, department: { select: { id: true, name: true } } },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    res.json({ schedules });
  } catch { res.status(500).json({ error: 'Could not load schedules.' }); }
};

async function validateScope(orgId: string, buildingId: string, roomId?: string, departmentId?: string) {
  const building = await prisma.building.findFirst({ where: { id: buildingId, organizationId: orgId }, select: { id: true } });
  if (!building) throw new Error('Building is not in your organization.');
  if (roomId) {
    const room = await prisma.room.findFirst({ where: { id: roomId, organizationId: orgId, buildingId }, select: { id: true } });
    if (!room) throw new Error('Room does not belong to the selected building and organization.');
  }
  if (departmentId) {
    const dept = await prisma.department.findFirst({ where: { id: departmentId, organizationId: orgId, buildingId }, select: { id: true } });
    if (!dept) throw new Error('Department does not belong to the selected building and organization.');
  }
}

export const createSchedule = async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const b = req.body;
    if (!b.buildingId || !b.roomId || !b.activityName || !timeOk(b.startTime) || !timeOk(b.endTime) || b.startTime >= b.endTime) return res.status(400).json({ error: 'Provide building, room, activity, and a valid same-day start/end time.' });
    const day = b.dayOfWeek === null || b.dayOfWeek === undefined ? null : Number(b.dayOfWeek);
    if (day === null || !Number.isInteger(day) || day < 0 || day > 6) return res.status(400).json({ error: 'dayOfWeek is required and must be 0 (Monday) through 6 (Sunday).' });
    if (b.recurrenceRule !== undefined && !['NONE','WEEKLY'].includes(b.recurrenceRule)) return res.status(400).json({ error: 'recurrenceRule must be WEEKLY or NONE.' });
    if (b.activityType !== undefined && !['LECTURE','LAB_SESSION','EXAMINATION','EVENT','MAINTENANCE'].includes(b.activityType)) return res.status(400).json({ error: 'Invalid activityType.' });
    if (!timezoneExists(b.timezone || 'UTC')) return res.status(400).json({ error: 'timezone must be a valid IANA timezone.' });
    await validateScope(orgId, b.buildingId, b.roomId, b.departmentId);
    const dup = await prisma.operationalSchedule.findFirst({ where: { organizationId: orgId, buildingId: b.buildingId, roomId: b.roomId, dayOfWeek: day, startTime: b.startTime, endTime: b.endTime, activityName: b.activityName, timezone: b.timezone || 'UTC', status: 'ACTIVE' } });
    if (dup) return res.status(409).json({ error: 'An identical active schedule already exists.' });
    const overlap = await prisma.operationalSchedule.findFirst({ where: { organizationId: orgId, roomId: b.roomId, dayOfWeek: day, timezone: b.timezone || 'UTC', recurrenceRule: 'WEEKLY', status: 'ACTIVE', startTime: { lt: b.endTime }, endTime: { gt: b.startTime } } });
    if (overlap) return res.status(409).json({ error: 'This room already has an overlapping active session for that day.' });
    const activityName = String(b.activityName).trim(); const timezone = b.timezone || 'UTC'; const recurrenceRule = b.recurrenceRule === 'NONE' ? 'NONE' : 'WEEKLY';
    const recurrenceEnd = b.recurrenceEnd ? parseTimestamp(b.recurrenceEnd, timezone) : null;
    const startDatetime = recurrenceRule === 'NONE' && b.startDatetime ? parseTimestamp(b.startDatetime, timezone) : null;
    const endDatetime = recurrenceRule === 'NONE' && b.endDatetime ? parseTimestamp(b.endDatetime, timezone) : null;
    if (recurrenceRule === 'NONE' && (!startDatetime || !endDatetime || startDatetime >= endDatetime)) return res.status(400).json({ error: 'A non-recurring schedule requires valid startDatetime and endDatetime.' });
    const recordKey = crypto.createHash('sha256').update([b.buildingId,b.roomId,day,b.startTime,b.endTime,activityName,recurrenceRule,startDatetime?.toISOString() || '',recurrenceEnd?.toISOString() || '',timezone].join('|')).digest('hex');
    const schedule = await prisma.operationalSchedule.create({ data: { organizationId: orgId, buildingId: b.buildingId, roomId: b.roomId, departmentId: b.departmentId || null, activityName, activityType: b.activityType || 'LECTURE', dayOfWeek: day, startTime: b.startTime, endTime: b.endTime, startDatetime, endDatetime, expectedOccupancy: Number.isInteger(Number(b.expectedOccupancy)) && Number(b.expectedOccupancy) >= 0 ? Number(b.expectedOccupancy) : 0, timezone, recurrenceRule, recurrenceEnd, recordKey, sourceType: 'MANUAL_ENTRY' } });
    await prisma.auditLog.create({ data: { organizationId: orgId, userId: req.user!.id, action: 'CREATE', entityType: 'OperationalSchedule', entityId: schedule.id } });
    res.status(201).json({ schedule });
  } catch (e: any) { res.status(400).json({ error: e.message || 'Schedule could not be created.' }); }
};

export const updateSchedule = async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const existing = await prisma.operationalSchedule.findFirst({ where: { id: req.params.id, organizationId: orgId } });
    if (!existing) return res.status(404).json({ error: 'Schedule not found.' });
    const b = req.body;
    if (b.recurrenceRule !== undefined && !['NONE','WEEKLY'].includes(b.recurrenceRule)) return res.status(400).json({ error: 'recurrenceRule must be WEEKLY or NONE.' });
    if (b.buildingId || b.roomId || b.departmentId) await validateScope(orgId, b.buildingId || existing.buildingId, b.roomId || existing.roomId, b.departmentId || undefined);
    if (b.startTime !== undefined && (!timeOk(b.startTime) || !timeOk(b.endTime || existing.endTime) || b.startTime >= (b.endTime || existing.endTime))) return res.status(400).json({ error: 'Invalid schedule time window.' });
    const nextDay = b.dayOfWeek === undefined ? existing.dayOfWeek : (b.dayOfWeek === null ? null : Number(b.dayOfWeek));
    if (nextDay !== null && (!Number.isInteger(nextDay) || nextDay < 0 || nextDay > 6)) return res.status(400).json({ error: 'dayOfWeek must be 0 (Monday) through 6 (Sunday).' });
    if (nextDay === null && existing.recurrenceRule === 'WEEKLY') return res.status(400).json({ error: 'A weekly schedule must retain a dayOfWeek.' });
    const nextStart = b.startTime || existing.startTime; const nextEnd = b.endTime || existing.endTime;
    const nextRoom = b.roomId || existing.roomId;
    const nextBuilding = b.buildingId || existing.buildingId; const nextName = b.activityName || existing.activityName; const nextRule = b.recurrenceRule || existing.recurrenceRule; const nextTimezone = b.timezone || existing.timezone;
    const nextRecurrenceEnd = b.recurrenceEnd !== undefined ? (b.recurrenceEnd ? parseTimestamp(b.recurrenceEnd, nextTimezone) : null) : existing.recurrenceEnd;
    const nextStartDatetime = b.recurrenceRule === 'WEEKLY' ? null : b.startDatetime !== undefined ? (b.startDatetime ? parseTimestamp(b.startDatetime, nextTimezone) : null) : existing.startDatetime;
    const nextEndDatetime = b.recurrenceRule === 'WEEKLY' ? null : b.endDatetime !== undefined ? (b.endDatetime ? parseTimestamp(b.endDatetime, nextTimezone) : null) : existing.endDatetime;
    if (nextRule === 'NONE' && (!nextStartDatetime || !nextEndDatetime || nextStartDatetime >= nextEndDatetime)) return res.status(400).json({ error: 'A non-recurring schedule requires valid startDatetime and endDatetime.' });
    if (existing.recurrenceRule === 'WEEKLY') {
      const overlap = await prisma.operationalSchedule.findFirst({ where: { id: { not: existing.id }, organizationId: orgId, roomId: nextRoom, dayOfWeek: nextDay, timezone: nextTimezone, recurrenceRule: 'WEEKLY', status: 'ACTIVE', startTime: { lt: nextEnd }, endTime: { gt: nextStart } } });
      if (overlap && (b.status === undefined || b.status === 'ACTIVE')) return res.status(409).json({ error: 'This room already has an overlapping active session for that day.' });
    }
    if (b.expectedOccupancy !== undefined && (!Number.isInteger(Number(b.expectedOccupancy)) || Number(b.expectedOccupancy) < 0)) return res.status(400).json({ error: 'expectedOccupancy must be a non-negative integer.' });
    if (b.status !== undefined && !['ACTIVE','CANCELLED'].includes(b.status)) return res.status(400).json({ error: 'status must be ACTIVE or CANCELLED.' });
    if (b.timezone !== undefined && !timezoneExists(b.timezone)) return res.status(400).json({ error: 'timezone must be a valid IANA timezone.' });
    const recordKey = crypto.createHash('sha256').update([nextBuilding,nextRoom,nextDay,nextStart,nextEnd,nextName,nextRule,nextStartDatetime?.toISOString() || '',nextRecurrenceEnd?.toISOString() || '',nextTimezone].join('|')).digest('hex');
    const schedule = await prisma.operationalSchedule.update({ where: { id: existing.id }, data: { ...(['activityName','activityType','startTime','endTime','buildingId','roomId','departmentId','timezone','recurrenceRule','status'].filter(k => b[k] !== undefined).reduce((a,k) => ({ ...a,[k]: b[k] }), {})), ...(b.dayOfWeek !== undefined ? { dayOfWeek: b.dayOfWeek === null ? null : Number(b.dayOfWeek) } : {}), ...(b.expectedOccupancy !== undefined ? { expectedOccupancy: Number(b.expectedOccupancy) } : {}), ...(b.recurrenceEnd !== undefined ? { recurrenceEnd: nextRecurrenceEnd } : {}), ...(b.startDatetime !== undefined || b.recurrenceRule === 'WEEKLY' ? { startDatetime: nextStartDatetime } : {}), ...(b.endDatetime !== undefined || b.recurrenceRule === 'WEEKLY' ? { endDatetime: nextEndDatetime } : {}), recordKey } });
    await prisma.auditLog.create({ data: { organizationId: orgId, userId: req.user!.id, action: b.status === 'CANCELLED' ? 'CANCEL' : 'UPDATE', entityType: 'OperationalSchedule', entityId: schedule.id } });
    res.json({ schedule });
  } catch (e: any) { res.status(400).json({ error: e.message || 'Schedule could not be updated.' }); }
};

export const importOperationalCsv = async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Upload one CSV file in the file field.' });
  const orgId = req.user!.organizationId;
  const isCalendar = req.path.includes('calendar');
  const dataSource = isCalendar ? 'ACADEMIC_CALENDAR' : 'ACADEMIC_TIMETABLE';
  const sha = crypto.createHash('sha256').update(file.buffer).digest('hex');
  let rows: Record<string,string>[];
  try { rows = await parseCsv(file.buffer); } catch { return res.status(400).json({ error: 'CSV could not be parsed.' }); }
  if (!rows.length) return res.status(400).json({ error: 'CSV contains no data rows.' });
  const fingerprint = crypto.createHash('sha256').update(`${dataSource}:${sha}`).digest('hex');
  const existingBatch = await prisma.dataImportBatch.findUnique({ where: { organizationId_requestFingerprint: { organizationId: orgId, requestFingerprint: fingerprint } }, include: { files: true, rejectedRows: true } });
  if (existingBatch) return res.json({ batch: existingBatch, duplicate: true });

  const rejects: Array<{ rowNumber: number; rawTimestamp: string | null; rawValue: string | null; reason: string }> = [];
  const accepted: any[] = []; const seen = new Set<string>(); const slots = new Map<string, Array<{ start: string; end: string }>>();
  const buildings = await prisma.building.findMany({ where: { organizationId: orgId }, include: { rooms: true, departments: true } });
  const buildingById = new Map(buildings.map(b => [b.id, b]));
  const buildingByName = new Map<string, typeof buildings>();
  buildings.forEach(b => buildingByName.set(b.name.toLowerCase(), [...(buildingByName.get(b.name.toLowerCase()) || []), b]));
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]; const rowNo = i + 2;
    try {
      const timezone = r.timezone || 'UTC';
      if (!timezoneExists(timezone)) throw new Error(`Unknown IANA timezone: ${timezone}`);
      const names = buildingByName.get((r.building || '').toLowerCase()) || [];
      if (!r.building_id && names.length > 1) throw new Error('Building name is ambiguous; supply building_id.');
      const building = buildingById.get(r.building_id) || names[0];
      if (!building && (!isCalendar || r.room_id || r.room || r.department_id || r.department || r.building_id || r.building)) throw new Error('Building mapping not found in this organization. Use building_id or exact building name.');
      const matchingRooms = (building?.rooms || []).filter(x => x.roomNumber.toLowerCase() === (r.room || '').toLowerCase());
      if (!r.room_id && matchingRooms.length > 1) throw new Error('Room number is ambiguous in this building; supply room_id.');
      const room = r.room_id ? building?.rooms.find(x => x.id === r.room_id) : matchingRooms[0];
      const matchingDepartments = (building?.departments || []).filter(x => x.name.toLowerCase() === (r.department || '').toLowerCase());
      if (!r.department_id && matchingDepartments.length > 1) throw new Error('Department name is ambiguous; supply department_id.');
      const department = r.department_id ? building?.departments.find(x => x.id === r.department_id) : matchingDepartments[0];
      if (!isCalendar && !room) throw new Error('Room mapping not found inside the selected building.');
      if ((r.room || r.room_id) && !room) throw new Error('Room does not belong to the selected building.');
      if ((r.department || r.department_id) && !department) throw new Error('Department does not belong to the selected building.');
      let data: any; let key: string;
      if (!isCalendar) {
        const startTime = r.start_time || ''; const endTime = r.end_time || '';
        if (!timeOk(startTime) || !timeOk(endTime) || startTime >= endTime) throw new Error('start_time/end_time must be valid HH:mm values with start before end.');
        const dayText = (r.day_of_week || '').toLowerCase(); const day = /^\d$/.test(dayText) ? Number(dayText) : DAY_NAMES[dayText];
        if (day === undefined || day < 0 || day > 6) throw new Error('day_of_week is required (Monday=0 through Sunday=6, or a day name).');
        const recurrenceRule = (r.recurrence || 'WEEKLY').toUpperCase();
        if (!['WEEKLY','NONE'].includes(recurrenceRule)) throw new Error('recurrence must be WEEKLY or NONE.');
        let startDatetime: Date | null = null; let endDatetime: Date | null = null;
        if (recurrenceRule === 'NONE') {
          if (!r.date) throw new Error('A non-recurring schedule requires a date column value (YYYY-MM-DD).');
          startDatetime = parseTimestamp(`${r.date} ${startTime}`, timezone); endDatetime = parseTimestamp(`${r.date} ${endTime}`, timezone);
          const dateDay = (new Date(`${r.date}T12:00:00Z`).getUTCDay() + 6) % 7;
          if (dateDay !== day) throw new Error('day_of_week does not match the date in the supplied timezone.');
        }
        const activityName = r.activity_name || '';
        if (!activityName) throw new Error('activity_name is required.');
        const activityType = (r.activity_type || 'LECTURE').toUpperCase();
        if (!['LECTURE','LAB_SESSION','EXAMINATION','EVENT','MAINTENANCE'].includes(activityType)) throw new Error('activity_type must be LECTURE, LAB_SESSION, EXAMINATION, EVENT, or MAINTENANCE.');
        const rowStatus = (r.status || 'ACTIVE').toUpperCase();
        if (!['ACTIVE','CANCELLED'].includes(rowStatus)) throw new Error('status must be ACTIVE or CANCELLED.');
        if (recurrenceRule === 'WEEKLY') {
          const slotKey = `${room!.id}|${day}|${timezone}`; const intervals = slots.get(slotKey) || [];
          if (intervals.some(x => startTime < x.end && endTime > x.start)) throw new Error('This room has an overlapping timetable row for that day in this file.');
          const overlap = await prisma.operationalSchedule.findFirst({ where: { organizationId: orgId, roomId: room!.id, dayOfWeek: day, timezone, recurrenceRule: 'WEEKLY', status: 'ACTIVE', startTime: { lt: endTime }, endTime: { gt: startTime } }, select: { id: true } });
          if (overlap) throw new Error('This room already has an overlapping active session for that day.');
          slots.set(slotKey, [...intervals, { start: startTime, end: endTime }]);
        }
        const expected = r.expected_occupancy === '' || r.expected_occupancy === undefined ? null : Number(r.expected_occupancy);
        if (expected !== null && (!Number.isInteger(expected) || expected < 0)) throw new Error('expected_occupancy must be a non-negative integer; leave blank if unknown.');
        const recurrenceEnd = r.recurrence_end ? parseTimestamp(r.recurrence_end, timezone) : null;
        data = { organizationId: orgId, buildingId: building!.id, roomId: room!.id, departmentId: department?.id || null, activityName, activityType, dayOfWeek: day, startTime, endTime, startDatetime, endDatetime, expectedOccupancy: expected ?? 0, timezone, recurrenceRule, recurrenceEnd, sourceType: 'TIMETABLE_CSV', status: rowStatus, sourceRow: rowNo };
        key = [building.id, room!.id, day, startTime, endTime, activityName, recurrenceRule, startDatetime?.toISOString() || '', recurrenceEnd?.toISOString() || '', timezone].join('|');
      } else {
        const title = r.title || ''; const eventType = (r.event_type || '').toUpperCase();
        if (!title || !['HOLIDAY','EXAMINATION','VACATION','SPECIAL_EVENT'].includes(eventType)) throw new Error('title and event_type (HOLIDAY, EXAMINATION, VACATION, SPECIAL_EVENT) are required.');
        const rowStatus = (r.status || 'ACTIVE').toUpperCase();
        if (!['ACTIVE','CANCELLED'].includes(rowStatus)) throw new Error('status must be ACTIVE or CANCELLED.');
        if (r.all_day && !['true','false','1','0','yes','no'].includes(r.all_day.toLowerCase())) throw new Error('all_day must be true/false or 1/0.');
        const start = parseTimestamp(r.start_datetime || '', timezone); const end = parseTimestamp(r.end_datetime || '', timezone);
        if (end <= start) throw new Error('end_datetime must be later than start_datetime.');
        data = { organizationId: orgId, buildingId: building?.id || null, roomId: room?.id || null, departmentId: department?.id || null, title, eventType, startDatetime: start, endDatetime: end, timezone, allDay: ['true','1','yes'].includes((r.all_day || '').toLowerCase()), status: rowStatus, sourceType: 'CALENDAR_CSV', sourceRow: rowNo };
        key = [building?.id || '', room?.id || '', department?.id || '', eventType, start.toISOString(), end.toISOString(), title, timezone].join('|');
      }
      if (seen.has(key)) throw new Error('Duplicate entry in this file.');
      seen.add(key); data.recordKey = crypto.createHash('sha256').update(key).digest('hex'); accepted.push({ data, key, rawRow: r });
    } catch (e: any) { rejects.push({ rowNumber: rowNo, rawTimestamp: r.start_datetime || r.start_time || null, rawValue: json(r), reason: e.message || 'Invalid row.' }); }
  }
  const duplicateChecks = await Promise.all(accepted.map(async entry => isCalendar
    ? prisma.academicCalendarEvent.findFirst({ where: { organizationId: orgId, buildingId: entry.data.buildingId, roomId: entry.data.roomId, title: entry.data.title, eventType: entry.data.eventType, startDatetime: entry.data.startDatetime, endDatetime: entry.data.endDatetime, status: 'ACTIVE' }, select: { id: true } })
    : prisma.operationalSchedule.findFirst({ where: { organizationId: orgId, buildingId: entry.data.buildingId, roomId: entry.data.roomId, activityName: entry.data.activityName, status: 'ACTIVE', recurrenceRule: entry.data.recurrenceRule, recordKey: entry.data.recordKey }, select: { id: true } })));
  const valid = accepted.filter((_, i) => !duplicateChecks[i]);
  accepted.forEach((_, i) => { if (duplicateChecks[i]) rejects.push({ rowNumber: accepted[i].data.sourceRow, rawTimestamp: accepted[i].rawRow.start_datetime || accepted[i].rawRow.start_time || null, rawValue: json(accepted[i].rawRow), reason: 'Duplicate of an existing active record.' }); });
  const batchData: any = { organizationId: orgId, dataSource, datasetName: isCalendar ? 'Academic calendar' : 'Academic timetable', license: 'Organization supplied data', sourceUrl: null, originalFilename: file.originalname, fileSha256: sha, sourceTimezone: 'Per-row IANA timezone; defaults to UTC', rawUnit: 'Not applicable', preprocessingVer: 'a6.1', totalRowsProcessed: rows.length, validRecordsCount: valid.length, rejectedCount: rejects.length, status: rejects.length ? (valid.length ? 'COMPLETED_WITH_WARNINGS' : 'FAILED') : 'COMPLETED', progressPercent: 100, currentStage: 'Completed', completedAt: new Date(), requestFingerprint: fingerprint, mappingJson: json({ kind: dataSource, timezoneDefault: 'UTC' }), errorLogJson: rejects.length ? json(rejects.map(x => ({ rowNumber: x.rowNumber, reason: x.reason }))) : null, files: { create: { fieldName: 'file', originalFilename: file.originalname, sha256: sha, sizeBytes: file.size, mediaType: file.mimetype || 'text/csv', storagePath: `sha256:${sha}` } } };
  const sourceDirectory = path.resolve(config.importStorageDir, 'operational', orgId);
  const sourcePath = path.join(sourceDirectory, `${sha}.csv`);
  let sourceCreated = false;
  try {
    await fs.mkdir(sourceDirectory, { recursive: true });
    try { await fs.writeFile(sourcePath, file.buffer, { flag: 'wx', mode: 0o600 }); sourceCreated = true; }
    catch (error: any) { if (error.code !== 'EEXIST') throw error; }
    batchData.files.create.storagePath = sourcePath;
    const batch = await prisma.$transaction(async tx => {
      const created = await tx.dataImportBatch.create({ data: batchData });
      if (valid.length) {
        if (isCalendar) await tx.academicCalendarEvent.createMany({ data: valid.map(x => ({ ...x.data, importBatchId: created.id })), skipDuplicates: true });
        else await tx.operationalSchedule.createMany({ data: valid.map(x => ({ ...x.data, importBatchId: created.id })), skipDuplicates: true });
      }
      if (rejects.length) await tx.importRejectedRow.createMany({ data: rejects.map(x => ({ batchId: created.id, fileField: 'file', rowNumber: x.rowNumber, rawTimestamp: x.rawTimestamp, rawValue: x.rawValue, reason: x.reason })) });
      await tx.auditLog.create({ data: { organizationId: orgId, userId: req.user!.id, action: 'IMPORT', entityType: dataSource, entityId: created.id } });
      return created;
    });
    res.status(201).json({ batch, importedCount: valid.length, rejectedCount: rejects.length, duplicate: false });
  } catch (e: any) {
    if (sourceCreated) await fs.unlink(sourcePath).catch(() => undefined);
    if (e.code === 'P2002') {
      const batch = await prisma.dataImportBatch.findUnique({ where: { organizationId_requestFingerprint: { organizationId: orgId, requestFingerprint: fingerprint } } });
      if (batch) return res.json({ batch, duplicate: true });
    }
    res.status(400).json({ error: 'Import failed transactionally; no schedule or calendar rows were committed.' });
  }
};

export const listImportHistory = async (req: Request, res: Response) => {
  try {
    const batches = await prisma.dataImportBatch.findMany({ where: { organizationId: req.user!.organizationId, dataSource: { in: ['ACADEMIC_TIMETABLE','ACADEMIC_CALENDAR'] } }, include: { files: true, rejectedRows: { orderBy: { rowNumber: 'asc' } } }, orderBy: { importedAt: 'desc' }, take: 100 });
    res.json({ batches: batches.map(({ files, rejectedRows, ...batch }) => ({ ...batch, files: files.map(({ storagePath, ...file }) => file), rejectedRows })) });
  } catch { res.status(500).json({ error: 'Could not load import history.' }); }
};

export const listEnergySources = async (req: Request, res: Response) => {
  try {
    const rows = await prisma.energyReading.findMany({ where: { organizationId: req.user!.organizationId }, distinct: ['dataSource'], select: { dataSource: true }, orderBy: { dataSource: 'asc' } });
    res.json({ sources: rows.map(row => row.dataSource) });
  } catch { res.status(500).json({ error: 'Could not load data sources.' }); }
};

export const getOperationalAnalysis = async (req: Request, res: Response) => {
  try {
    const organizationId = req.user!.organizationId;
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(to.getTime() - 30 * 86400000);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to || to.getTime() - from.getTime() > 93 * 86400000) return res.status(400).json({ error: 'Provide a valid date range of up to 93 days.' });
    const buildingId = req.query.buildingId ? String(req.query.buildingId) : undefined;
    if (buildingId && !await prisma.building.findFirst({ where: { id: buildingId, organizationId }, select: { id: true } })) return res.status(404).json({ error: 'Building not found.' });
    const [readings, schedules, calendar, occupancy, org] = await Promise.all([
      prisma.energyReading.findMany({ where: { organizationId, timestamp: { gte: from, lt: to }, qualityStatus: { in: ['VALIDATED','MEASURED','CALCULATED_INTERVAL'] }, ...(buildingId ? { buildingId } : {}), ...(req.query.dataSource ? { dataSource: String(req.query.dataSource) } : {}) }, include: { building: { select: { id: true, name: true, organizationId: true } }, meter: { select: { organizationId: true, buildingId: true, roomId: true, room: { select: { id: true, organizationId: true, roomNumber: true, expectedOperatingHours: true, departmentId: true } } } } }, orderBy: { timestamp: 'asc' }, take: 50000 }),
      prisma.operationalSchedule.findMany({ where: { organizationId, status: 'ACTIVE', buildingId: buildingId || undefined } }),
      prisma.academicCalendarEvent.findMany({ where: { organizationId, status: 'ACTIVE', startDatetime: { lt: to }, endDatetime: { gt: from }, buildingId: buildingId || undefined } }),
      prisma.occupancyRecord.findMany({ where: { organizationId, timestamp: { gte: from, lt: to }, ...(buildingId ? { buildingId } : {}) }, orderBy: { timestamp: 'asc' }, take: 50000 }),
      prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } }),
    ]);
    const readingLimitReached = readings.length === 50000; const occupancyLimitReached = occupancy.length === 50000;
    const groups = new Map<string, any>(); let scheduledKwh = 0; let unscheduledKwh = 0; let holidayKwh = 0; let roomScoped = 0; let observedOcc = 0; let estimatedOcc = 0;
    let inconsistentReadings = 0;
    for (const r of readings) {
      if (r.meter.organizationId !== organizationId || r.building.organizationId !== organizationId || r.meter.buildingId !== r.buildingId || (r.meter.roomId && r.meter.room?.organizationId !== organizationId)) { inconsistentReadings++; continue; }
      const roomId = r.meter.roomId || null; const roomData = roomId ? r.meter.room : null; const scope = roomId ? `room:${roomId}` : `building:${r.buildingId}`;
      const key = `${r.buildingId}|${scope}`; const group = groups.get(key) || { buildingId: r.buildingId, building: r.building.name, roomId, room: roomId ? roomData?.roomNumber || null : null, granularity: roomId ? 'ROOM_LEVEL' : 'BUILDING_LEVEL', readingCount: 0, observedEnergyKwh: 0, scheduledKwh: 0, outsideScheduledKwh: 0, holidayKwh: 0, afterHoursKwh: 0, operatingHours: roomId ? roomData?.expectedOperatingHours || null : null, sources: new Set<string>(), limitations: new Set<string>() };
      const kw = Number(r.consumptionKwh); const d = r.timestamp;
      const matchingSchedule = schedules.find(s => {
        if (s.buildingId !== r.buildingId || (roomId && s.roomId && s.roomId !== roomId)) return false;
        if (s.recurrenceRule === 'NONE') return Boolean(s.startDatetime && s.endDatetime && d >= s.startDatetime && d < s.endDatetime);
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: s.timezone || org?.timezone || 'UTC', weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
        const localDay = DAY_NAMES[(parts.find(x => x.type === 'weekday')?.value || '').toLowerCase()];
        const localTime = `${parts.find(x => x.type === 'hour')?.value}:${parts.find(x => x.type === 'minute')?.value}`;
        if ((s.dayOfWeek === localDay || s.dayOfWeek === null) && s.startTime <= localTime && s.endTime > localTime) {
          const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: s.timezone || org?.timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
          const localDate = `${dateParts.find(x => x.type === 'year')?.value}-${dateParts.find(x => x.type === 'month')?.value}-${dateParts.find(x => x.type === 'day')?.value}`;
          try { parseTimestamp(`${localDate} ${s.startTime}`, s.timezone || org?.timezone || 'UTC'); parseTimestamp(`${localDate} ${s.endTime}`, s.timezone || org?.timezone || 'UTC'); }
          catch (error: any) {
            if (/daylight-saving transition/.test(error.message)) group.limitations.add(`A recurring timetable window was skipped on ${localDate} because its local time is ambiguous or nonexistent in ${s.timezone}.`);
            return false;
          }
        }
        return (s.dayOfWeek === localDay || s.dayOfWeek === null) && s.startTime <= localTime && s.endTime > localTime && (!s.recurrenceEnd || d <= s.recurrenceEnd);
      });
      const matching = Boolean(matchingSchedule);
      const orgParts = new Intl.DateTimeFormat('en-CA', { timeZone: org?.timezone || 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
      const orgLocalTime = `${orgParts.find(x => x.type === 'hour')?.value}:${orgParts.find(x => x.type === 'minute')?.value}`;
      const onHoliday = calendar.some(e => (!e.buildingId || e.buildingId === r.buildingId) && (!e.roomId || e.roomId === roomId) && (!e.departmentId || e.departmentId === roomData?.departmentId) && d >= e.startDatetime && d < e.endDatetime && ['HOLIDAY','VACATION'].includes(e.eventType));
      group.readingCount++; group.observedEnergyKwh += kw; group.sources.add(r.dataSource);
      if (roomId) roomScoped++;
      if (matching) { scheduledKwh += kw; group.scheduledKwh += kw; } else { unscheduledKwh += kw; group.outsideScheduledKwh += kw; }
      if (onHoliday) { holidayKwh += kw; group.holidayKwh += kw; }
      const hours = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.exec(group.operatingHours || '');
      if (hours && (orgLocalTime < hours[1] || orgLocalTime >= hours[2])) group.afterHoursKwh += kw;
      if (roomId && matchingSchedule && matchingSchedule.expectedOccupancy > 0) {
        const halfIntervalMs = Math.max(1, Number(r.intervalMinutes || 60)) * 30000;
        const observation = occupancy.filter(o => o.roomId === roomId && !['ESTIMATED','SCHEDULED'].includes(o.sourceType) && Math.abs(o.timestamp.getTime() - d.getTime()) <= halfIntervalMs).sort((a, b) => Math.abs(a.timestamp.getTime() - d.getTime()) - Math.abs(b.timestamp.getTime() - d.getTime()))[0];
        if (observation) {
          if (!group.occupancyPairs) group.occupancyPairs = new Map<string, any>();
          group.occupancyPairs.set(observation.id, { expected: matchingSchedule.expectedOccupancy, observed: observation.occupancyCount, sourceType: observation.sourceType, timestamp: observation.timestamp.toISOString() });
        }
      }
      if (!matching) group.limitations.add('Timetable is not evidence of occupancy; outside-schedule energy is an operational context only.');
      if (!roomId) group.limitations.add('Meter is building-scoped; no room-level energy attribution is available.');
      if (r.roomId && !r.meter.roomId) group.limitations.add('Reading carries a room reference but its meter is building-scoped; reported at building level.');
      groups.set(key, group);
    }
    const insights = [...groups.values()].map(g => {
      const occ = occupancy.filter(o => o.buildingId === g.buildingId && (g.roomId ? o.roomId === g.roomId : !o.roomId));
      const actual = occ.filter(o => !['ESTIMATED','SCHEDULED'].includes(o.sourceType)); const estimated = occ.filter(o => o.sourceType === 'ESTIMATED');
      observedOcc += actual.length; estimatedOcc += estimated.length;
      g.occupancy = actual.length ? { classification: 'OBSERVED', count: actual.length, sourceTypes: [...new Set(actual.map(o => o.sourceType))], scope: g.roomId ? 'ROOM_LEVEL' : 'BUILDING_LEVEL' } : estimated.length ? { classification: 'ESTIMATED', count: estimated.length, sourceTypes: [...new Set(estimated.map(o => o.sourceType))], scope: g.roomId ? 'ROOM_LEVEL' : 'BUILDING_LEVEL' } : { classification: 'UNKNOWN', count: 0, note: 'No reliable occupancy observation is available for this scope.' };
      g.scheduledActivity = g.scheduledKwh > 0 ? 'SCHEDULED_ACTIVITY' : 'UNKNOWN';
      g.confidence = g.readingCount ? 'MEASURED_DATA' : 'NO_MEASUREMENTS';
      const pairs = [...(g.occupancyPairs?.values() || [])];
      g.expectedVsObservedOccupancy = pairs.length ? { pairedObservations: pairs.length, expectedAverage: Number((pairs.reduce((sum: number, p: any) => sum + p.expected, 0) / pairs.length).toFixed(1)), observedAverage: Number((pairs.reduce((sum: number, p: any) => sum + p.observed, 0) / pairs.length).toFixed(1)), observedSources: [...new Set(pairs.map((p: any) => p.sourceType))], note: 'Comparison only; timetable expectation and sampled occupancy may not align perfectly in time.' } : null;
      delete g.occupancyPairs;
      g.insight = g.outsideScheduledKwh > 0 ? { category: 'ENERGY_OUTSIDE_SCHEDULE', title: 'Measured energy outside scheduled activity', reason: `${g.outsideScheduledKwh.toFixed(2)} kWh of measured energy occurred outside matching timetable windows. This does not establish that the space was vacant or that energy was wasted.`, recommendation: 'Review the readings, timetable coverage, equipment schedules, and occupancy evidence for this period.' } : null;
      g.afterHoursInsight = g.operatingHours && g.afterHoursKwh > 0 ? { category: 'ENERGY_OUTSIDE_STORED_HOURS', title: 'Measured energy outside stored room hours', reason: `${g.afterHoursKwh.toFixed(2)} kWh was measured outside this room's stored hours (${g.operatingHours}) in ${org?.timezone || 'UTC'}. The current room schema defaults to 08:00–18:00 unless changed.`, recommendation: 'Review room hours and equipment schedules; the reading alone does not prove avoidable use.' } : null;
      g.sources = [...g.sources]; g.limitations = [...g.limitations];
      const sourceClasses = [...new Set(g.sources.map((source: string) => /SYNTHETIC|DEMO/i.test(source) ? 'DEMO' : /BENCHMARK|BDG2|ASHRAE/i.test(source) ? 'BENCHMARK' : /REAL_WORLD|IBLEND/i.test(source) ? 'REAL_WORLD' : 'UNCLASSIFIED'))];
      g.dataClassification = sourceClasses.length === 1 ? sourceClasses[0] : 'MIXED';
      g.observedEnergyKwh = Number(g.observedEnergyKwh.toFixed(3)); g.scheduledKwh = Number(g.scheduledKwh.toFixed(3)); g.outsideScheduledKwh = Number(g.outsideScheduledKwh.toFixed(3)); g.holidayKwh = Number(g.holidayKwh.toFixed(3)); g.afterHoursKwh = Number(g.afterHoursKwh.toFixed(3));
      for (const insight of [g.insight, g.afterHoursInsight].filter(Boolean)) Object.assign(insight, { organizationId, buildingId: g.buildingId, roomId: g.roomId, granularity: g.granularity, period: { from: from.toISOString(), to: to.toISOString() }, observedEnergyKwh: g.observedEnergyKwh, scheduledEnergyKwh: g.scheduledKwh, occupancyEvidence: g.occupancy, dataSources: g.sources, evidenceQuality: g.confidence, evidence: { readingCount: g.readingCount, outsideScheduledEnergyKwh: g.outsideScheduledKwh, afterHoursEnergyKwh: g.afterHoursKwh, holidayEnergyKwh: g.holidayKwh }, estimatedSavingsKwh: null, estimatedSavingsCost: null, limitations: g.limitations });
      return g;
    });
    const valid = readings.length;
    res.json({ period: { from: from.toISOString(), to: to.toISOString(), timezone: org?.timezone || 'UTC' }, summary: { readingsAnalyzed: valid - inconsistentReadings, inconsistentReadingsExcluded: inconsistentReadings, scheduledEnergyKwh: Number(scheduledKwh.toFixed(3)), outsideScheduledEnergyKwh: Number(unscheduledKwh.toFixed(3)), holidayEnergyKwh: Number(holidayKwh.toFixed(3)), occupancyEvidence: observedOcc ? 'OBSERVED' : estimatedOcc ? 'ESTIMATED' : 'UNKNOWN' }, insights: insights.flatMap(x => [x.insight, x.afterHoursInsight].filter(Boolean)), groups: insights, dataLimitations: valid ? ['Scheduled activity does not prove occupancy.', 'Outside-schedule, after-hours, or holiday energy is a potential investigation signal, not proof of waste.', ...(roomScoped < valid - inconsistentReadings ? ['Some readings are building-level and cannot be attributed to rooms.'] : []), ...(inconsistentReadings ? [`${inconsistentReadings} readings with mismatched organization or meter/building mappings were excluded.`] : []), ...(readingLimitReached ? ['Readings are capped at 50,000 rows for a single analysis request. Narrow the date range or filter further.'] : []), ...(occupancyLimitReached ? ['Occupancy evidence is capped at 50,000 records for a single analysis request.'] : [])] : ['No validated energy readings exist for this organization and date range.'] });
  } catch (e: any) { res.status(500).json({ error: 'Operational analysis could not be calculated.' }); }
};

export const downloadRejectedRows = async (req: Request, res: Response) => {
  const batch = await prisma.dataImportBatch.findFirst({ where: { id: req.params.batchId, organizationId: req.user!.organizationId, dataSource: { in: ['ACADEMIC_TIMETABLE','ACADEMIC_CALENDAR'] } }, include: { rejectedRows: { orderBy: { rowNumber: 'asc' } } } });
  if (!batch) return res.status(404).json({ error: 'Import not found.' });
  res.type('text/csv').attachment(`rejected-rows-${batch.id}.csv`).send(['row_number,raw_timestamp,raw_value,reason', ...batch.rejectedRows.map(r => [r.rowNumber,r.rawTimestamp,r.rawValue,r.reason].map(csv).join(','))].join('\n'));
};

export { parseTimestamp };
