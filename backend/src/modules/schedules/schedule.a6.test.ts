import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import jwt from 'jsonwebtoken';
import app from '../../app';
import { config, prisma } from '../../config';
import { parseTimestamp } from './schedule.controller';

let server: any; let base = ''; let orgA: any; let orgB: any; let user: any; let viewer: any; let buildingA: any; let roomA: any; let meterA: any; let meterBuilding: any; let token = '';
const csvFile = (text: string, name: string) => { const f = new FormData(); f.append('file', new Blob([text], { type: 'text/csv' }), name); return f; };
const auth = () => ({ authorization: `Bearer ${token}` });
const roleAuth = (role: string, organizationId = orgA?.id) => {
  const actor = role === 'VIEWER' ? viewer : user;
  return { authorization: `Bearer ${jwt.sign({ id: actor.id, email: actor.email, name: actor.name, role, organizationId }, config.jwtSecret)}` };
};

before(async () => {
  const db = new URL(process.env.DATABASE_URL || '');
  if (db.pathname !== '/ecogrid_a6_test') throw new Error('A6 integration tests are restricted to ecogrid_a6_test.');
  orgA = await prisma.organization.create({ data: { name: 'A6 test org A', timezone: 'UTC' } });
  orgB = await prisma.organization.create({ data: { name: 'A6 test org B', timezone: 'UTC' } });
  user = await prisma.user.create({ data: { name: 'A6 tester', email: `a6-${Date.now()}@example.invalid`, passwordHash: 'not-used' } });
  viewer = await prisma.user.create({ data: { name: 'A6 viewer', email: `a6-viewer-${Date.now()}@example.invalid`, passwordHash: 'not-used' } });
  await prisma.organizationMember.create({ data: { organizationId: orgA.id, userId: user.id, role: 'ORG_ADMIN', status: 'ACTIVE' } });
  await prisma.organizationMember.create({ data: { organizationId: orgA.id, userId: viewer.id, role: 'VIEWER', status: 'ACTIVE' } });
  buildingA = await prisma.building.create({ data: { organizationId: orgA.id, name: 'A6 test building' } });
  roomA = await prisma.room.create({ data: { organizationId: orgA.id, buildingId: buildingA.id, roomNumber: 'A6-101' } });
  meterA = await prisma.meter.create({ data: { organizationId: orgA.id, buildingId: buildingA.id, roomId: roomA.id, meterName: 'A6 test meter' } });
  meterBuilding = await prisma.meter.create({ data: { organizationId: orgA.id, buildingId: buildingA.id, meterName: 'A6 building feeder', meterType: 'MAIN_FEEDER' } });
  token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: 'ORG_ADMIN', organizationId: orgA.id }, config.jwtSecret);
  server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  if (orgA || orgB) {
    const ids = [orgA?.id, orgB?.id].filter(Boolean);
    const sourceFiles = await prisma.importFile.findMany({ where: { batch: { organizationId: { in: ids } } }, select: { storagePath: true } });
    await prisma.occupancyRecord.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.organization.deleteMany({ where: { id: { in: ids } } });
    for (const record of sourceFiles) {
      const allowed = orgA?.id ? path.resolve(config.importStorageDir, 'operational', orgA.id) : '';
      if (record.storagePath.startsWith(`${allowed}${path.sep}`)) await fs.unlink(record.storagePath).catch(() => undefined);
    }
    if (orgA?.id) await fs.rm(path.resolve(config.importStorageDir, 'operational', orgA.id), { recursive: true, force: true });
  }
  await prisma.user.deleteMany({ where: { id: { in: [user?.id, viewer?.id].filter(Boolean) } } });
  await prisma.$disconnect();
});

test('timezone parsing accepts explicit offsets and rejects DST folds and gaps', () => {
  assert.equal(parseTimestamp('2027-01-01T09:00:00Z', 'America/New_York').toISOString(), '2027-01-01T09:00:00.000Z');
  assert.throws(() => parseTimestamp('2026-11-01 01:30', 'America/New_York'), /Ambiguous/);
  assert.throws(() => parseTimestamp('2026-03-08 02:30', 'America/New_York'), /Nonexistent/);
});

test('schedule endpoints require auth and enforce tenant scope', async () => {
  assert.equal((await fetch(`${base}/schedules`)).status, 401);
  const foreignBuilding = await prisma.building.create({ data: { organizationId: orgB.id, name: 'Private building B' } });
  const denied = await fetch(`${base}/schedules`, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify({ buildingId: foreignBuilding.id, roomId: 'missing', activityName: 'Wrong tenant', startTime: '09:00', endTime: '10:00' }) });
  assert.equal(denied.status, 400);
  const analysis = await fetch(`${base}/schedules/analysis?buildingId=${foreignBuilding.id}`, { headers: auth() });
  assert.equal(analysis.status, 404);
  const viewer = await fetch(`${base}/schedules`, { method: 'POST', headers: { ...roleAuth('VIEWER'), 'content-type': 'application/json' }, body: JSON.stringify({ buildingId: buildingA.id, roomId: roomA.id, activityName: 'Denied', dayOfWeek: 0, startTime: '09:00', endTime: '10:00' }) });
  assert.equal(viewer.status, 403);
});

test('manual schedules validate duplicates and preserve scheduled-not-observed semantics', async () => {
  const body = { buildingId: buildingA.id, roomId: roomA.id, activityName: 'Seminar', dayOfWeek: 4, startTime: '11:00', endTime: '12:00', timezone: 'UTC' };
  const missingDay = await fetch(`${base}/schedules`, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify({ ...body, dayOfWeek: undefined }) });
  assert.equal(missingDay.status, 400);
  const created = await fetch(`${base}/schedules`, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(created.status, 201);
  const duplicate = await fetch(`${base}/schedules`, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(duplicate.status, 409);
  const schedule = await prisma.operationalSchedule.findFirst({ where: { organizationId: orgA.id, activityName: 'Seminar' } });
  assert.equal(schedule?.recurrenceRule, 'WEEKLY');
  assert.equal(schedule?.status, 'ACTIVE');
  const update = await fetch(`${base}/schedules/${schedule!.id}`, { method: 'PUT', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify({ activityName: 'Updated seminar' }) });
  assert.equal(update.status, 200);
});

test('timetable CSV records provenance, row rejections, and idempotent retry', async () => {
  const text = [
    'building_id,room_id,activity_name,activity_type,day_of_week,start_time,end_time,timezone,recurrence,expected_occupancy',
    `${buildingA.id},${roomA.id},Imported class,LECTURE,Friday,09:00,10:00,UTC,WEEKLY,24`,
    `${buildingA.id},missing-room,Bad room,LECTURE,Friday,09:00,10:00,UTC,WEEKLY,20`,
    `${buildingA.id},${roomA.id},Overlapping class,LECTURE,Friday,11:30,12:30,UTC,WEEKLY,20`,
  ].join('\n');
  const first = await fetch(`${base}/schedules/timetable/import`, { method: 'POST', headers: auth(), body: csvFile(text, 'a6-timetable.csv') });
  assert.equal(first.status, 201);
  const result: any = await first.json();
  assert.equal(result.importedCount, 1); assert.equal(result.rejectedCount, 2);
  assert.equal(result.batch.dataSource, 'ACADEMIC_TIMETABLE'); assert.match(result.batch.fileSha256, /^[a-f0-9]{64}$/);
  const retry = await fetch(`${base}/schedules/timetable/import`, { method: 'POST', headers: auth(), body: csvFile(text, 'a6-timetable.csv') });
  assert.equal(retry.status, 200); assert.equal(((await retry.json()) as any).duplicate, true);
  const rejected = await fetch(`${base}/schedules/imports/${result.batch.id}/rejected.csv`, { headers: auth() });
  assert.equal(rejected.status, 200); assert.match(await rejected.text(), /Room mapping not found/);
});

test('calendar import, analysis scope, holiday energy, and observed occupancy are explicit', async () => {
  const csv = [
    'building_id,title,event_type,start_datetime,end_datetime,timezone,all_day',
    `${buildingA.id},New Year closure,HOLIDAY,2027-01-01 00:00,2027-01-02 00:00,UTC,true`,
    `${buildingA.id},Invalid type,UNKNOWN,2027-01-01 00:00,2027-01-02 00:00,UTC,true`,
  ].join('\n');
  const response = await fetch(`${base}/schedules/calendar/import`, { method: 'POST', headers: auth(), body: csvFile(csv, 'a6-calendar.csv') });
  assert.equal(response.status, 201); const imported: any = await response.json();
  assert.equal(imported.importedCount, 1); assert.equal(imported.rejectedCount, 1);
  await prisma.energyReading.createMany({ data: [
    { organizationId: orgA.id, meterId: meterA.id, buildingId: buildingA.id, roomId: roomA.id, timestamp: new Date('2027-01-01T09:30:00Z'), consumptionKwh: 2.5, intervalMinutes: 60, dataSource: 'A6_FIXTURE', qualityStatus: 'VALIDATED' },
    { organizationId: orgA.id, meterId: meterA.id, buildingId: buildingA.id, roomId: roomA.id, timestamp: new Date('2027-01-01T20:00:00Z'), consumptionKwh: 1.5, intervalMinutes: 60, dataSource: 'A6_FIXTURE', qualityStatus: 'VALIDATED' },
    { organizationId: orgA.id, meterId: meterBuilding.id, buildingId: buildingA.id, roomId: null, timestamp: new Date('2027-01-01T12:00:00Z'), consumptionKwh: 3, intervalMinutes: 60, dataSource: 'A6_FIXTURE', qualityStatus: 'VALIDATED' },
  ] });
  const analysisUrl = `${base}/schedules/analysis?from=2027-01-01T00:00:00Z&to=2027-01-02T00:00:00Z`;
  const noOccupancy = await fetch(analysisUrl, { headers: auth() }); const noOccupancyReport: any = await noOccupancy.json();
  assert.equal(noOccupancyReport.groups.find((g: any) => g.roomId === roomA.id).occupancy.classification, 'UNKNOWN');
  await prisma.occupancyRecord.create({ data: { organizationId: orgA.id, buildingId: buildingA.id, roomId: roomA.id, timestamp: new Date('2027-01-01T09:30:00Z'), occupancyCount: 8, sourceType: 'PIR_SENSOR', granularity: 'ROOM_LEVEL', dataSource: 'A6_FIXTURE', confidence: 1 } });
  await prisma.occupancyRecord.create({ data: { organizationId: orgA.id, buildingId: buildingA.id, timestamp: new Date('2027-01-01T12:00:00Z'), occupancyCount: 40, sourceType: 'WIFI_ASSOCIATION', granularity: 'BUILDING_LEVEL', dataSource: 'A6_FIXTURE', confidence: 0.8 } });
  const analysis = await fetch(analysisUrl, { headers: auth() });
  assert.equal(analysis.status, 200); const report: any = await analysis.json();
  assert.equal(report.summary.readingsAnalyzed, 3); assert.equal(report.summary.scheduledEnergyKwh, 2.5); assert.equal(report.summary.outsideScheduledEnergyKwh, 4.5); assert.equal(report.summary.holidayEnergyKwh, 7);
  const roomGroup = report.groups.find((g: any) => g.roomId === roomA.id); const buildingGroup = report.groups.find((g: any) => g.roomId === null);
  assert.equal(roomGroup.granularity, 'ROOM_LEVEL'); assert.equal(roomGroup.occupancy.classification, 'OBSERVED'); assert.equal(roomGroup.afterHoursKwh, 1.5);
  assert.equal(roomGroup.expectedVsObservedOccupancy.expectedAverage, 24); assert.equal(roomGroup.expectedVsObservedOccupancy.observedAverage, 8);
  assert.equal(buildingGroup.granularity, 'BUILDING_LEVEL'); assert.equal(buildingGroup.occupancy.scope, 'BUILDING_LEVEL'); assert.equal(buildingGroup.room, null);
  assert.match(roomGroup.insight.reason, /does not establish/);
});
