import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const connection = new URL(process.env.DATABASE_URL || '');
if (connection.pathname !== '/ecogrid_demo' || !['127.0.0.1', 'localhost', '::1'].includes(connection.hostname)) {
  throw new Error('Refusing demo seed: DATABASE_URL must target local ecogrid_demo exactly.');
}

const prisma = new PrismaClient();
const ORG_ID = 'a1000000-0000-4000-8000-000000000001';
const ADMIN_ID = 'a1000000-0000-4000-8000-000000000002';
const TIMEZONE = 'America/New_York';
const VERSION = 'ecogrid-campus-synthetic-v1';
const ROOT = path.resolve(__dirname, '../../datasets/demo');
const stableId = (name: string) => {
  const hex = crypto.createHash('sha256').update(`${VERSION}:${name}`).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  const s = hex.join('');
  return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
};
const csv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const fmtLocal = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d).replace(',', '');
function localOffset(d: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, timeZoneName: 'longOffset' }).formatToParts(d);
  return parts.find(x => x.type === 'timeZoneName')?.value.replace('GMT', '') || '+00:00';
}
function localToUtc(y: number, m: number, day: number, hour = 0) {
  // Calendar anchors occur at local midnight; a two-pass offset calculation handles DST.
  const nominal = Date.UTC(y, m - 1, day, hour);
  const first = new Date(nominal);
  const off1 = localOffset(first);
  const mins1 = (off1[0] === '-' ? -1 : 1) * (Number(off1.slice(1,3)) * 60 + Number(off1.slice(4,6)));
  const guess = new Date(nominal - mins1 * 60000);
  const off2 = localOffset(guess);
  const mins2 = (off2[0] === '-' ? -1 : 1) * (Number(off2.slice(1,3)) * 60 + Number(off2.slice(4,6)));
  return new Date(nominal - mins2 * 60000);
}
function csvLocal(d: Date) { return `${fmtLocal(d)}${localOffset(d)}`; }
function prng(seed: number) {
  let x = seed >>> 0;
  return () => { x = (1664525 * x + 1013904223) >>> 0; return x / 4294967296; };
}
function localParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, weekday: 'short', hour: '2-digit', hourCycle: 'h23', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  const dow = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(get('weekday'));
  return { hour: Number(get('hour')), dow, month: Number(get('month')), day: Number(get('day')) };
}

async function main() {
  const otherOrgs = await prisma.organization.findMany({ where: { id: { not: ORG_ID } }, select: { id: true, name: true }, take: 1 });
  if (otherOrgs.length) throw new Error('ecogrid_demo contains an organization outside the dedicated synthetic ABC demo. Refusing to seed.');

  const now = new Date();
  const end = new Date(Math.floor(now.getTime() / 3600000) * 3600000);
  const start = new Date(end.getTime() - 90 * 86400000);
  fs.mkdirSync(ROOT, { recursive: true });

  const organization = await prisma.organization.upsert({ where: { id: ORG_ID }, create: {
    id: ORG_ID, name: 'ABC University (Synthetic Demo)', industryType: 'HIGHER_EDUCATION', address: '100 University Boulevard, Demonstration Campus', timezone: TIMEZONE, currency: 'USD', tier: 'DEMO_SANDBOX', isBenchmark: false,
  }, update: { name: 'ABC University (Synthetic Demo)', industryType: 'HIGHER_EDUCATION', timezone: TIMEZONE, currency: 'USD', tier: 'DEMO_SANDBOX', isBenchmark: false } });

  const password = process.env.DEMO_ADMIN_PASSWORD || 'EcoGrid-Demo-2026!';
  const user = await prisma.user.upsert({ where: { email: 'demo-admin@abc.edu' }, create: {
    id: ADMIN_ID, name: 'ABC University Demo Administrator', email: 'demo-admin@abc.edu', passwordHash: await bcrypt.hash(password, 10), status: 'ACTIVE', isPlatformAdmin: false,
  }, update: { name: 'ABC University Demo Administrator', status: 'ACTIVE', isPlatformAdmin: false } });
  await prisma.organizationMember.upsert({ where: { organizationId_userId: { organizationId: ORG_ID, userId: user.id } }, create: { organizationId: ORG_ID, userId: user.id, role: 'ORG_ADMIN', status: 'ACTIVE' }, update: { role: 'ORG_ADMIN', status: 'ACTIVE' } });
  await prisma.organizationSubscription.upsert({ where: { organizationId: ORG_ID }, create: { organizationId: ORG_ID, planKey: 'STARTER', status: 'LEGACY' }, update: { planKey: 'STARTER', status: 'LEGACY' } });

  const definitions = [
    { key: 'academic', name: 'Academic Block', type: 'ACADEMIC', area: 85000, base: 76, active: 1.9 },
    { key: 'lab', name: 'Computer Science & Research Labs', type: 'LAB', area: 62000, base: 58, active: 2.5 },
    { key: 'library', name: 'University Library', type: 'LIBRARY', area: 48000, base: 43, active: 1.55 },
    { key: 'residence', name: 'Student Residence Hall', type: 'RESIDENTIAL', area: 95000, base: 64, active: 1.25 },
    { key: 'auditorium', name: 'Grand Auditorium', type: 'AUDITORIUM', area: 32000, base: 18, active: 3.2 },
  ];
  const buildingIds: Record<string, string> = {};
  const meterIds: Record<string, string> = {};
  const roomIds: Record<string, string> = {};
  const deptIds: Record<string, string> = {};
  for (const b of definitions) {
    const buildingId = stableId(`building:${b.key}`); buildingIds[b.key] = buildingId;
    await prisma.building.upsert({ where: { id: buildingId }, create: { id: buildingId, organizationId: ORG_ID, name: b.name, buildingType: b.type, totalArea: b.area, dataSource: 'SYNTHETIC_DEMO', primarySpaceUsage: b.type }, update: { organizationId: ORG_ID, name: b.name, buildingType: b.type, totalArea: b.area, dataSource: 'SYNTHETIC_DEMO', primarySpaceUsage: b.type } });
    const departmentId = stableId(`department:${b.key}`); deptIds[b.key] = departmentId;
    await prisma.department.upsert({ where: { id: departmentId }, create: { id: departmentId, organizationId: ORG_ID, buildingId, name: `${b.name} Operations`, departmentType: b.type }, update: { organizationId: ORG_ID, buildingId, name: `${b.name} Operations`, departmentType: b.type } });
    const roomId = stableId(`room:${b.key}`); roomIds[b.key] = roomId;
    await prisma.room.upsert({ where: { id: roomId }, create: { id: roomId, organizationId: ORG_ID, buildingId, departmentId, roomNumber: `${b.key.toUpperCase()}-MAIN`, roomType: b.type === 'LAB' ? 'COMPUTER_LAB' : b.type === 'AUDITORIUM' ? 'AUDITORIUM' : b.type === 'LIBRARY' ? 'LIBRARY' : 'CLASSROOM', capacity: b.key === 'auditorium' ? 800 : b.key === 'library' ? 250 : 45, expectedOperatingHours: b.key === 'residence' ? '00:00-24:00' : '08:00-22:00' }, update: { organizationId: ORG_ID, buildingId, departmentId } });
    const meterId = stableId(`meter:${b.key}`); meterIds[b.key] = meterId;
    await prisma.meter.upsert({ where: { id: meterId }, create: { id: meterId, organizationId: ORG_ID, buildingId, meterName: `${b.name} Main Feeder`, meterType: 'MAIN_FEEDER', sourceType: 'MANUAL_CSV', unit: 'kWh', status: 'ACTIVE', dataSource: 'SYNTHETIC_DEMO', physicalLocation: 'Main electrical intake' }, update: { organizationId: ORG_ID, buildingId, meterName: `${b.name} Main Feeder`, meterType: 'MAIN_FEEDER', unit: 'kWh', status: 'ACTIVE', dataSource: 'SYNTHETIC_DEMO' } });
  }

  const tariffId = stableId('tariff:synthetic-flat');
  await prisma.electricityTariff.upsert({ where: { id: tariffId }, create: { id: tariffId, organizationId: ORG_ID, tariffName: 'Illustrative demo tariff (not a utility offer)', tariffType: 'FLAT', pricePerKwh: 0.15, effectiveFrom: start, allowGridExport: true, exportPricePerKwh: '0.04', demandChargePerKw: '0.00', fixedCharge: '0.00', carbonEmissionKgPerKwh: '0.35' }, update: { organizationId: ORG_ID, tariffName: 'Illustrative demo tariff (not a utility offer)', tariffType: 'FLAT', pricePerKwh: 0.15, effectiveFrom: start, effectiveTo: null, allowGridExport: true, exportPricePerKwh: '0.04', demandChargePerKw: '0.00', fixedCharge: '0.00', carbonEmissionKgPerKwh: '0.35' } });
  const solarInstallationId = stableId('solar:academic-roof');
  await prisma.solarInstallation.upsert({ where: { id: solarInstallationId }, create: { id: solarInstallationId, organizationId: ORG_ID, buildingId: buildingIds.academic, capacityKw: 120, installationDate: start, status: 'ACTIVE' }, update: { organizationId: ORG_ID, buildingId: buildingIds.academic, capacityKw: 120, status: 'ACTIVE' } });
  const batteryId = stableId('battery:academic-storage');
  await prisma.battery.upsert({ where: { id: batteryId }, create: { id: batteryId, organizationId: ORG_ID, buildingId: buildingIds.academic, name: 'Illustrative Academic Block storage', capacityKwh: 200, maxChargeKw: 50, maxDischargeKw: 50, minSoc: 20, maxSoc: 190, initialSoc: 80, chargingEfficiency: 0.94, dischargingEfficiency: 0.94, degradationCost: 0.012, allowGridCharging: false, status: 'ACTIVE' }, update: { organizationId: ORG_ID, buildingId: buildingIds.academic, capacityKwh: 200, maxChargeKw: 50, maxDischargeKw: 50, minSoc: 20, maxSoc: 190, initialSoc: 80, chargingEfficiency: 0.94, dischargingEfficiency: 0.94, degradationCost: 0.012, allowGridCharging: false, status: 'ACTIVE' } });

  const random = prng(20261127);
  const energyLines = ['building_id,meter_id,timestamp_utc,source_local_time,consumption_kwh,unit,interval_minutes'];
  const solarLines = ['installation_id,timestamp_utc,source_local_time,generation_kwh,unit,interval_minutes'];
  const energyRows: any[] = [];
  const solarRows: any[] = [];
  const holidays = new Set(['09-07', '10-12', '10-13', '11-26']);
  for (let ts = start.getTime(); ts <= end.getTime(); ts += 3600000) {
    const timestamp = new Date(ts); const p = localParts(timestamp); const dateKey = `${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;
    const holiday = holidays.has(dateKey); const weekday = p.dow >= 0 && p.dow < 5;
    const seasonal = 1 + 0.06 * Math.sin((ts - start.getTime()) / (90 * 86400000) * Math.PI * 2);
    for (const b of definitions) {
      let activity = 0.19;
      if (b.key === 'residence') activity = p.hour >= 6 && p.hour < 9 || p.hour >= 17 && p.hour < 23 ? 0.9 : 0.58;
      else {
        const open = b.key === 'library' ? p.hour >= 7 && p.hour < 23 : b.key === 'auditorium' ? p.hour >= 9 && p.hour < 21 : p.hour >= 8 && p.hour < 19;
        activity = open && weekday && !holiday ? 1 : open && !holiday && (b.key === 'library' || b.key === 'auditorium') ? 0.62 : 0.35;
      }
      let value = Math.max(2, (b.base + b.active * b.base * activity) * seasonal * (0.96 + random() * 0.08));
      const recurringLabSpike = b.key === 'lab' && weekday && !holiday && p.hour >= 20 && p.hour <= 21 && (Math.floor(ts / 86400000) % 4 === 0);
      const occasionalEvent = b.key === 'auditorium' && p.hour >= 17 && p.hour <= 20 && random() < 0.008;
      if (recurringLabSpike) value *= 1.8;
      else if (occasionalEvent) value *= 1.5;
      value = Math.round(value * 1000) / 1000;
      const meterId = meterIds[b.key], buildingId = buildingIds[b.key];
      energyRows.push({ organizationId: ORG_ID, meterId, buildingId, roomId: roomIds[b.key], batchId: stableId('batch:abc-synthetic'), timestamp, sourceLocalTime: csvLocal(timestamp), consumptionKwh: value, powerKw: value, rawReading: value, rawUnit: 'kWh', intervalMinutes: 60, dataSource: 'SYNTHETIC_DEMO', source: 'SYNTHETIC_GENERATOR', qualityStatus: 'VALIDATED' });
      energyLines.push([buildingId,meterId,timestamp.toISOString(),csvLocal(timestamp),value,'kWh',60].map(csv).join(','));
      if (b.key === 'academic') {
        const daylight = Math.max(0, Math.sin(Math.PI * (p.hour - 6) / 13));
        const cloud = 0.72 + random() * 0.27;
        const seasonalSolar = 0.83 + 0.17 * Math.sin((ts - start.getTime()) / (90 * 86400000) * Math.PI * 2);
        const generation = Math.round(120 * 0.78 * daylight * cloud * seasonalSolar * 1000) / 1000;
        solarRows.push({ id: stableId(`solar-reading:${timestamp.toISOString()}`), organizationId: ORG_ID, installationId: solarInstallationId, timestamp, generationKwh: generation, powerKw: generation });
        solarLines.push([solarInstallationId,timestamp.toISOString(),csvLocal(timestamp),generation,'kWh',60].map(csv).join(','));
      }
    }
  }
  const meta = JSON.stringify({ dataset: 'ABC University Synthetic Campus Demonstration', datasetVersion: VERSION, generatedAt: now.toISOString(), synthetic: true, license: 'Fictional synthetic data; no third-party license or source', sourceUrl: null, timezone: TIMEZONE, timeRangeUtc: { start: start.toISOString(), end: end.toISOString() }, interval: 'PT1H', energyUnit: 'kWh per interval', solarUnit: 'kWh per interval', randomSeed: 20261127, assumptions: { tariff: 'Illustrative USD 0.15/kWh import and USD 0.04/kWh export; not an actual utility tariff.', solar: 'Illustrative 120 kW rooftop system; generated profile is synthetic and not weather-derived.', battery: 'Illustrative 200 kWh battery; 50 kW charge/discharge limits; 94% efficiencies; SOC 20–190 kWh; grid charging disabled.', occupancy: 'No observed or estimated occupancy records are created. Schedule headcounts are expectations only.' } }, null, 2) + '\n';
  const artifacts = [
    { name: 'energy-readings.csv', fieldName: 'readings', body: energyLines.join('\n') + '\n', mediaType: 'text/csv' },
    { name: 'solar-readings.csv', fieldName: 'solar', body: solarLines.join('\n') + '\n', mediaType: 'text/csv' },
    { name: 'dataset-manifest.json', fieldName: 'metadata', body: meta, mediaType: 'application/json' },
  ];
  for (const f of artifacts) fs.writeFileSync(path.join(ROOT, f.name), f.body);
  const artifactHashes = artifacts.map(f => ({ ...f, sha256: hash(f.body), sizeBytes: Buffer.byteLength(f.body), storagePath: path.relative(path.resolve(__dirname, '../..'), path.join(ROOT, f.name)) }));
  const fingerprint = hash(`${VERSION}:seed=20261127`);
  const batchId = stableId('batch:abc-synthetic');
  const mappingJson = JSON.stringify({ buildingName: 'ABC University campus (5 buildings)', meterName: '5 building main feeders', buildingMeterMapping: definitions.map(b => ({ buildingId: buildingIds[b.key], meterId: meterIds[b.key] })), solarInstallationId, timezone: TIMEZONE, resolutionMinutes: 60, synthetic: true });
  const batch = await prisma.dataImportBatch.upsert({ where: { id: batchId }, create: { id: batchId, organizationId: ORG_ID, dataSource: 'SYNTHETIC_DEMO', datasetName: 'ABC University Synthetic Campus Demonstration', license: 'Fictional synthetic data; no third-party license or source', sourceUrl: null, originalFilename: 'energy-readings.csv', fileSha256: artifactHashes[0].sha256, sourceTimezone: TIMEZONE, rawUnit: 'kWh/interval', preprocessingVer: VERSION, importedAt: now, status: 'COMPLETED', progressPercent: 100, currentStage: 'COMPLETE', requestFingerprint: fingerprint, mappingJson, completedAt: now, totalRowsProcessed: energyRows.length + solarRows.length, validRecordsCount: energyRows.length + solarRows.length, imputedCount: 0, flaggedCount: 0, rejectedCount: 0, minTimestamp: start, maxTimestamp: end, errorLogJson: JSON.stringify({ info: 'SolarReadings have no batch foreign key in the current schema; their file hash and installation mapping are recorded in ImportFile and mappingJson.' }) }, update: { organizationId: ORG_ID, dataSource: 'SYNTHETIC_DEMO', datasetName: 'ABC University Synthetic Campus Demonstration', license: 'Fictional synthetic data; no third-party license or source', originalFilename: 'energy-readings.csv', fileSha256: artifactHashes[0].sha256, sourceTimezone: TIMEZONE, rawUnit: 'kWh/interval', preprocessingVer: VERSION, importedAt: now, status: 'COMPLETED', progressPercent: 100, currentStage: 'COMPLETE', requestFingerprint: fingerprint, mappingJson, completedAt: now, totalRowsProcessed: energyRows.length + solarRows.length, validRecordsCount: energyRows.length + solarRows.length, imputedCount: 0, flaggedCount: 0, rejectedCount: 0, minTimestamp: start, maxTimestamp: end, errorLogJson: JSON.stringify({ info: 'SolarReadings have no batch foreign key in the current schema; their file hash and installation mapping are recorded in ImportFile and mappingJson.' }) } });

  const membership = await prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: ORG_ID, userId: user.id } } });
  const scheduleTemplates = [
    { key: 'academic-lecture', originalDay: 0, days: [0,1,2,3,4], building: 'academic', room: 'academic', name: 'Weekday lecture and administration block', type: 'LECTURE', start: '09:00', end: '17:00', expected: 34 },
    { key: 'lab-sessions', originalDay: 1, days: [0,1,2,3,4], building: 'lab', room: 'lab', name: 'Research and laboratory sessions', type: 'LAB_SESSION', start: '09:00', end: '20:00', expected: 22 },
    { key: 'library-open', originalDay: 0, days: [0,1,2,3,4,5,6], building: 'library', room: 'library', name: 'Library operating hours', type: 'EVENT', start: '07:00', end: '23:00', expected: 70 },
    { key: 'residence-open', originalDay: 0, days: [0,1,2,3,4,5,6], building: 'residence', room: 'residence', name: 'Residence hall operations', type: 'EVENT', start: '00:00', end: '23:59', expected: 140 },
    { key: 'auditorium-weekend', originalDay: 5, days: [5,6], building: 'auditorium', room: 'auditorium', name: 'Weekend auditorium availability', type: 'EVENT', start: '10:00', end: '21:00', expected: 180 },
  ];
  const schedules = scheduleTemplates.flatMap(template => template.days.map(day => ({ ...template, day, key: day === template.originalDay ? template.key : `${template.key}-day${day}` })));
  await prisma.$transaction(async tx => {
    for (const [i, s] of schedules.entries()) {
      const data = { organizationId: ORG_ID, buildingId: buildingIds[s.building], roomId: roomIds[s.room], departmentId: deptIds[s.building], activityName: s.name, activityType: s.type, dayOfWeek: s.day, startTime: s.start, endTime: s.end, expectedOccupancy: s.expected, sourceType: 'SYNTHETIC_DEMO_TIMETABLE', timezone: TIMEZONE, recurrenceRule: 'WEEKLY', recurrenceEnd: end, status: 'ACTIVE', importBatchId: batch.id, sourceRow: i + 2, recordKey: `abc-synth:${s.key}` };
      await tx.operationalSchedule.upsert({ where: { organizationId_recordKey: { organizationId: ORG_ID, recordKey: data.recordKey } }, create: data, update: data });
    }
    const events = [
      { title: 'Labor Day campus holiday', type: 'HOLIDAY', date: [2026,9,7] },
      { title: 'Autumn academic break', type: 'VACATION', date: [2026,10,12] },
      { title: 'Autumn academic break', type: 'VACATION', date: [2026,10,13] },
      { title: 'Thanksgiving campus holiday', type: 'HOLIDAY', date: [2026,11,26] },
    ];
    for (const [i,e] of events.entries()) {
      const [y,m,d] = e.date; const startEvent = localToUtc(y,m,d); const endEvent = localToUtc(y,m,d+1);
      const recordKey = `abc-synth:calendar:${y}-${m}-${d}`;
      const data = { organizationId: ORG_ID, title: e.title, eventType: e.type, startDatetime: startEvent, endDatetime: endEvent, timezone: TIMEZONE, allDay: true, status: 'ACTIVE', sourceType: 'SYNTHETIC_DEMO_CALENDAR', importBatchId: batch.id, sourceRow: i + 2, recordKey };
      await tx.academicCalendarEvent.upsert({ where: { organizationId_recordKey: { organizationId: ORG_ID, recordKey } }, create: data, update: data });
    }
    for (const rows of [energyRows, solarRows]) {
      const model = rows === energyRows ? tx.energyReading : tx.solarReading;
      for (let offset = 0; offset < rows.length; offset += 1000) {
        await (model as any).createMany({ data: rows.slice(offset, offset + 1000), skipDuplicates: true });
      }
    }
    for (const f of artifactHashes) {
      await tx.importFile.upsert({ where: { id: stableId(`file:${f.fieldName}`) }, create: { id: stableId(`file:${f.fieldName}`), batchId: batch.id, fieldName: f.fieldName, originalFilename: f.name, sha256: f.sha256, sizeBytes: f.sizeBytes, mediaType: f.mediaType, storagePath: f.storagePath }, update: { batchId: batch.id, fieldName: f.fieldName, originalFilename: f.name, sha256: f.sha256, sizeBytes: f.sizeBytes, mediaType: f.mediaType, storagePath: f.storagePath } });
    }
  }, { timeout: 120000, maxWait: 10000 });

  console.log(JSON.stringify({ message: 'Synthetic ABC University demo seed completed.', organizationId: organization.id, adminEmail: user.email, adminPassword: process.env.DEMO_ADMIN_PASSWORD ? 'provided through DEMO_ADMIN_PASSWORD' : 'documented local demo default', buildings: definitions.length, meters: Object.keys(meterIds).length, energyReadingsInsertedOrPresent: energyRows.length, solarReadingsInsertedOrPresent: solarRows.length, schedules: schedules.length, calendarEvents: 4, observedOccupancyRecords: 0, timeRangeUtc: { start: start.toISOString(), end: end.toISOString() }, intervalMinutes: 60, provenanceFiles: artifactHashes.map(f => ({ name: f.name, sha256: f.sha256, sizeBytes: f.sizeBytes })) }, null, 2));
  void membership;
}

main().catch(error => { console.error(error?.message || 'Demo seed failed.'); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
