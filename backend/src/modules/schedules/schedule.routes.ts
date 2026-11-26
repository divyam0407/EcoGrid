import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { authenticate, requireOrg, requireRole } from '../../middleware/auth';
import { createSchedule, downloadRejectedRows, getOperationalAnalysis, getSchedules, importOperationalCsv, listEnergySources, listImportHistory, updateSchedule } from './schedule.controller';
import { prisma } from '../../config';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
router.use(authenticate, requireOrg);

router.get('/timetable/template', (_req, res) => res.type('text/csv').attachment('ecogrid-timetable-template.csv').send('building_id,room_id,department_id,activity_name,activity_type,day_of_week,date,start_time,end_time,timezone,recurrence,recurrence_end,expected_occupancy,status\n<building-uuid>,<room-uuid>,,Lecture,LECTURE,Monday,,09:00,10:00,America/New_York,WEEKLY,2027-05-31 00:00,,'));
router.get('/calendar/template', (_req, res) => res.type('text/csv').attachment('ecogrid-academic-calendar-template.csv').send('building_id,room_id,department_id,title,event_type,start_datetime,end_datetime,timezone,all_day,status\n<building-uuid>,,,Winter Break,VACATION,2026-12-24 00:00,2027-01-03 00:00,America/New_York,true,ACTIVE'));
router.get('/history', listImportHistory);
router.get('/sources', listEnergySources);
router.get('/imports/:batchId/rejected.csv', downloadRejectedRows);
router.get('/analysis', getOperationalAnalysis);
router.get('/correlate', getOperationalAnalysis);
router.get('/', getSchedules);
router.post('/', requireRole(['ORG_ADMIN','ENERGY_MANAGER']), createSchedule);
router.put('/:id', requireRole(['ORG_ADMIN','ENERGY_MANAGER']), updateSchedule);
router.post(['/timetable/import','/upload'], requireRole(['ORG_ADMIN','ENERGY_MANAGER']), upload.single('file'), importOperationalCsv);
router.post('/calendar/import', requireRole(['ORG_ADMIN','ENERGY_MANAGER']), upload.single('file'), importOperationalCsv);

router.post('/calendar', requireRole(['ORG_ADMIN','ENERGY_MANAGER']), async (req, res) => {
  try {
    const orgId = req.user!.organizationId; const b = req.body;
    if (!b.title || !['HOLIDAY','EXAMINATION','VACATION','SPECIAL_EVENT'].includes(String(b.eventType).toUpperCase()) || !b.startDatetime || !b.endDatetime || !b.timezone) return res.status(400).json({ error: 'Title, eventType, startDatetime, endDatetime, and timezone are required.' });
    if (b.allDay !== undefined && ![true,false,'true','false',1,0,'1','0'].includes(b.allDay)) return res.status(400).json({ error: 'allDay must be true or false.' });
    const { parseTimestamp } = await import('./schedule.controller');
    const startDatetime = parseTimestamp(b.startDatetime, b.timezone); const endDatetime = parseTimestamp(b.endDatetime, b.timezone);
    if (startDatetime >= endDatetime) return res.status(400).json({ error: 'Event end must follow its start.' });
    const building = b.buildingId ? await prisma.building.findFirst({ where: { id: b.buildingId, organizationId: orgId }, select: { id: true } }) : null;
    if (b.buildingId && !building) return res.status(400).json({ error: 'Building is outside your organization.' });
    const room = b.roomId ? await prisma.room.findFirst({ where: { id: b.roomId, organizationId: orgId, ...(b.buildingId ? { buildingId: b.buildingId } : {}) }, select: { id: true, buildingId: true } }) : null;
    if (b.roomId && !room) return res.status(400).json({ error: 'Room is outside the selected building or organization.' });
    const scopeBuildingId = building?.id || room?.buildingId || null;
    const department = b.departmentId ? await prisma.department.findFirst({ where: { id: b.departmentId, organizationId: orgId, ...(scopeBuildingId ? { buildingId: scopeBuildingId } : {}) }, select: { id: true, buildingId: true } }) : null;
    if (b.departmentId && !department) return res.status(400).json({ error: 'Department is outside the selected building or organization.' });
    if (room && department && room.buildingId !== department.buildingId) return res.status(400).json({ error: 'Room and department must map to the same building.' });
    const title = String(b.title).trim(); const eventType = String(b.eventType).toUpperCase();
    const recordKey = crypto.createHash('sha256').update([scopeBuildingId || department?.buildingId || '',room?.id || '',department?.id || '',eventType,startDatetime.toISOString(),endDatetime.toISOString(),title,b.timezone].join('|')).digest('hex');
    const allDay = [true,'true',1,'1'].includes(b.allDay);
    const event = await prisma.academicCalendarEvent.create({ data: { organizationId: orgId, buildingId: scopeBuildingId || department?.buildingId || null, roomId: room?.id || null, departmentId: department?.id || null, title, eventType, startDatetime, endDatetime, timezone: b.timezone, allDay, sourceType: 'MANUAL_ENTRY', recordKey } });
    await prisma.auditLog.create({ data: { organizationId: orgId, userId: req.user!.id, action: 'CREATE', entityType: 'AcademicCalendarEvent', entityId: event.id } });
    res.status(201).json({ event });
  } catch (e: any) { res.status(400).json({ error: e.message || 'Calendar event could not be created.' }); }
});
router.get('/calendar', async (req, res) => {
  const events = await prisma.academicCalendarEvent.findMany({ where: { organizationId: req.user!.organizationId, status: 'ACTIVE', ...(req.query.buildingId ? { buildingId: String(req.query.buildingId) } : {}) }, include: { building: { select: { id: true, name: true } }, room: { select: { id: true, roomNumber: true } }, department: { select: { id: true, name: true } } }, orderBy: { startDatetime: 'asc' }, take: 1000 });
  res.json({ events });
});
router.patch('/calendar/:id', requireRole(['ORG_ADMIN','ENERGY_MANAGER']), async (req, res) => {
  const orgId = req.user!.organizationId;
  const existing = await prisma.academicCalendarEvent.findFirst({ where: { id: req.params.id, organizationId: orgId } });
  if (!existing) return res.status(404).json({ error: 'Calendar event not found.' });
  try {
    const { parseTimestamp } = await import('./schedule.controller'); const b = req.body; const tz = b.timezone || existing.timezone;
    if (b.status !== undefined && !['ACTIVE','CANCELLED'].includes(b.status)) return res.status(400).json({ error: 'status must be ACTIVE or CANCELLED.' });
    if (b.allDay !== undefined && typeof b.allDay !== 'boolean') return res.status(400).json({ error: 'allDay must be a boolean.' });
    parseTimestamp(existing.startDatetime.toISOString(), tz);
    const startDatetime = b.startDatetime ? parseTimestamp(b.startDatetime, tz) : existing.startDatetime; const endDatetime = b.endDatetime ? parseTimestamp(b.endDatetime, tz) : existing.endDatetime;
    if (startDatetime >= endDatetime) return res.status(400).json({ error: 'Event end must follow its start.' });
    const title = b.title ?? existing.title; const eventType = b.eventType ? String(b.eventType).toUpperCase() : existing.eventType;
    if (!['HOLIDAY','EXAMINATION','VACATION','SPECIAL_EVENT'].includes(eventType)) return res.status(400).json({ error: 'Invalid eventType.' });
    const recordKey = crypto.createHash('sha256').update([existing.buildingId || '',existing.roomId || '',existing.departmentId || '',eventType,startDatetime.toISOString(),endDatetime.toISOString(),title,tz].join('|')).digest('hex');
    const event = await prisma.academicCalendarEvent.update({ where: { id: existing.id }, data: { title, eventType, startDatetime, endDatetime, timezone: tz, allDay: b.allDay ?? existing.allDay, status: b.status ?? existing.status, recordKey } });
    await prisma.auditLog.create({ data: { organizationId: orgId, userId: req.user!.id, action: event.status === 'CANCELLED' ? 'CANCEL' : 'UPDATE', entityType: 'AcademicCalendarEvent', entityId: event.id } });
    res.json({ event });
  } catch (e: any) { res.status(400).json({ error: e.message || 'Calendar event could not be updated.' }); }
});
export default router;
