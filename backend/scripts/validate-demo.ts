import { PrismaClient } from '@prisma/client';

const url = new URL(process.env.DATABASE_URL || '');
if (url.pathname !== '/ecogrid_demo' || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('Refusing validation: only local ecogrid_demo is permitted.');
const prisma = new PrismaClient();
const ORG_ID = 'a1000000-0000-4000-8000-000000000001';
const SIMULATED_TELEMETRY_SOURCE = 'SIMULATED_LIVE_TELEMETRY';

async function main() {
  const checks: { name: string; passed: boolean; detail: string }[] = [];
  const orgs = await prisma.organization.findMany({ where: { id: ORG_ID }, include: { buildings: true, meters: true } });
  const org = orgs[0];
  checks.push({ name: 'ABC synthetic organization uses India campus time', passed: Boolean(org && org.tier === 'DEMO_SANDBOX' && !org.isBenchmark && org.timezone === 'Asia/Kolkata'), detail: org ? `${org.name}; ${org.timezone}; ${org.tier}; benchmark=${org.isBenchmark}` : 'not found' });
  const [buildings, meters, energyCount, solarCount, schedules, events, batches, files, occupancyCount, tariffCount, solarConfigCount, batteryCount] = await Promise.all([
    prisma.building.count({ where: { organizationId: ORG_ID } }), prisma.meter.count({ where: { organizationId: ORG_ID } }),
    prisma.energyReading.count({ where: { organizationId: ORG_ID, dataSource: 'SYNTHETIC_DEMO', source: { not: SIMULATED_TELEMETRY_SOURCE } } }), prisma.solarReading.count({ where: { organizationId: ORG_ID } }),
    prisma.operationalSchedule.count({ where: { organizationId: ORG_ID, sourceType: 'SYNTHETIC_DEMO_TIMETABLE' } }), prisma.academicCalendarEvent.count({ where: { organizationId: ORG_ID, sourceType: 'SYNTHETIC_DEMO_CALENDAR' } }),
    prisma.dataImportBatch.count({ where: { organizationId: ORG_ID, dataSource: 'SYNTHETIC_DEMO', status: 'COMPLETED' } }), prisma.importFile.count({ where: { batch: { organizationId: ORG_ID } } }),
    prisma.occupancyRecord.count({ where: { dataSource: 'SYNTHETIC_DEMO' } }), prisma.electricityTariff.count({ where: { organizationId: ORG_ID } }),
    prisma.solarInstallation.count({ where: { organizationId: ORG_ID, status: 'ACTIVE' } }), prisma.battery.count({ where: { organizationId: ORG_ID, status: 'ACTIVE' } }),
  ]);
  checks.push({ name: 'Campus records and required configuration', passed: buildings === 5 && meters === 5 && energyCount >= 10000 && solarCount >= 2000 && schedules === 26 && events >= 4 && batches === 1 && files >= 3 && tariffCount >= 1 && solarConfigCount === 1 && batteryCount === 1, detail: JSON.stringify({ buildings, meters, energyReadings: energyCount, solarReadings: solarCount, schedules, calendarEvents: events, importBatches: batches, provenanceFiles: files, tariffs: tariffCount, solarInstallations: solarConfigCount, batteries: batteryCount }) });
  checks.push({ name: 'No fabricated occupancy observations', passed: occupancyCount === 0, detail: `synthetic occupancy records=${occupancyCount}; schedules remain expected activity only` });

  const meterRows = await prisma.meter.findMany({ where: { organizationId: ORG_ID }, select: { id: true, buildingId: true } });
  const meterBuildingIds = new Map(meterRows.map(m => [m.id, m.buildingId]));
  const sample = await prisma.energyReading.findMany({ where: { organizationId: ORG_ID, dataSource: 'SYNTHETIC_DEMO', source: { not: SIMULATED_TELEMETRY_SOURCE } }, select: { meterId: true, buildingId: true, batchId: true, timestamp: true, sourceLocalTime: true, consumptionKwh: true, intervalMinutes: true, qualityStatus: true }, orderBy: { timestamp: 'asc' } });
  const badReading = sample.find(r => !meterBuildingIds.has(r.meterId) || meterBuildingIds.get(r.meterId) !== r.buildingId || !r.batchId || !(r.timestamp instanceof Date) || !/\+05:30$/.test(r.sourceLocalTime || '') || r.consumptionKwh <= 0 || !Number.isFinite(r.consumptionKwh) || r.intervalMinutes !== 60 || r.qualityStatus !== 'VALIDATED');
  checks.push({ name: 'Energy relationships, provenance, units and values', passed: sample.length === energyCount && !badReading, detail: badReading ? JSON.stringify({ ...badReading, timestamp: badReading.timestamp.toISOString() }) : `${sample.length} readings validated with building/meter/batch mapping, positive kWh values, hourly intervals` });
  const simulatedReadings = await prisma.energyReading.findMany({ where: { organizationId: ORG_ID, dataSource: 'SYNTHETIC_DEMO', source: SIMULATED_TELEMETRY_SOURCE }, select: { meterId: true, buildingId: true, batchId: true, timestamp: true, sourceLocalTime: true, consumptionKwh: true, intervalMinutes: true, qualityStatus: true, rawUnit: true } });
  const badSimulated = simulatedReadings.find(r => meterBuildingIds.get(r.meterId) !== r.buildingId || r.batchId !== null || !(r.timestamp instanceof Date) || !/\+05:30$/.test(r.sourceLocalTime || '') || !Number.isFinite(r.consumptionKwh) || r.consumptionKwh < 0 || r.intervalMinutes !== 60 || r.qualityStatus !== 'MEASURED' || !['kWh','Wh','MWh'].includes(r.rawUnit || ''));
  checks.push({ name: 'Simulated telemetry provenance and meter mapping', passed: !badSimulated, detail: badSimulated ? JSON.stringify({ ...badSimulated, timestamp: badSimulated.timestamp.toISOString() }) : `${simulatedReadings.length} API-ingested synthetic live intervals; hourly, tenant-mapped and labelled separately from the historical seed` });
  const grouped = await prisma.energyReading.groupBy({ by: ['meterId'], where: { organizationId: ORG_ID, dataSource: 'SYNTHETIC_DEMO', source: { not: SIMULATED_TELEMETRY_SOURCE } }, _count: { _all: true }, _min: { timestamp: true }, _max: { timestamp: true } });
  const expectedHours = grouped[0]?._min.timestamp && grouped[0]?._max.timestamp ? Math.round((grouped[0]._max.timestamp.getTime() - grouped[0]._min.timestamp.getTime()) / 3600000) + 1 : 0;
  const datesConsistent = grouped.length === 5 && grouped.every(g => g._count._all === expectedHours && g._count._all === energyCount / 5 && g._min.timestamp?.getTime() === grouped[0]._min.timestamp?.getTime() && g._max.timestamp?.getTime() === grouped[0]._max.timestamp?.getTime());
  checks.push({ name: 'Hourly coverage is aligned across feeders', passed: datesConsistent, detail: JSON.stringify(grouped.map(g => ({ meterId: g.meterId, count: g._count._all, start: g._min.timestamp?.toISOString(), end: g._max.timestamp?.toISOString() }))) });
  const solar = await prisma.solarReading.findMany({ where: { organizationId: ORG_ID }, select: { installationId: true, timestamp: true, generationKwh: true, powerKw: true }, orderBy: { timestamp: 'asc' } });
  const installations = await prisma.solarInstallation.findMany({ where: { organizationId: ORG_ID, status: 'ACTIVE' }, select: { id: true, buildingId: true, capacityKw: true } });
  const solarTimestamps = new Set<string>();
  let duplicateSolarInterval = false;
  for (const row of solar) { const key = `${row.installationId}:${row.timestamp.toISOString()}`; if (solarTimestamps.has(key)) duplicateSolarInterval = true; solarTimestamps.add(key); }
  const solarIssue = solar.find(r => !installations.some(i => i.id === r.installationId) || r.generationKwh < 0 || r.generationKwh > 120 || !Number.isFinite(r.generationKwh));
  checks.push({ name: 'Solar values, mapping and interval uniqueness', passed: solar.length === solarCount && installations.length === 1 && !solarIssue && !duplicateSolarInterval, detail: `${solar.length} hourly records; active installations=${installations.length}; unique installation/timestamp pairs; peak ceiling 120 kWh per hourly interval` });

  const [scheduleRows, eventRows, importFiles, batch] = await Promise.all([
    prisma.operationalSchedule.findMany({ where: { organizationId: ORG_ID, sourceType: 'SYNTHETIC_DEMO_TIMETABLE' }, select: { dayOfWeek: true, startTime: true, endTime: true, timezone: true, recurrenceRule: true, recurrenceEnd: true, importBatchId: true } }),
    prisma.academicCalendarEvent.findMany({ where: { organizationId: ORG_ID, sourceType: 'SYNTHETIC_DEMO_CALENDAR' }, select: { startDatetime: true, endDatetime: true, timezone: true, allDay: true, importBatchId: true } }),
    prisma.importFile.findMany({ where: { batch: { organizationId: ORG_ID } }, select: { sha256: true, sizeBytes: true, storagePath: true } }),
    prisma.dataImportBatch.findFirst({ where: { organizationId: ORG_ID, dataSource: 'SYNTHETIC_DEMO' } }),
  ]);
  const opsOk = scheduleRows.every(s => s.dayOfWeek !== null && s.dayOfWeek >= 0 && s.dayOfWeek <= 6 && s.startTime < s.endTime && s.timezone === 'Asia/Kolkata' && s.recurrenceRule === 'WEEKLY' && s.importBatchId === batch?.id)
    && eventRows.every(e => e.startDatetime < e.endDatetime && e.timezone === 'Asia/Kolkata' && e.allDay && e.importBatchId === batch?.id);
  checks.push({ name: 'Schedules and academic calendar', passed: opsOk, detail: `${scheduleRows.length} weekly schedules, ${eventRows.length} local-time calendar events; no occupancy inference` });
  const filesOk = importFiles.length >= 3 && importFiles.every(f => /^[a-f0-9]{64}$/.test(f.sha256) && f.sizeBytes > 0 && f.storagePath.startsWith('datasets/demo/')) && batch?.fileSha256 === importFiles.find(f => f.storagePath.endsWith('energy-readings.csv'))?.sha256;
  checks.push({ name: 'Import provenance manifest and SHA-256', passed: Boolean(filesOk), detail: `${importFiles.length} hashed files, batch hash matches energy CSV` });
  const [tariff, battery] = await Promise.all([prisma.electricityTariff.findFirst({ where: { organizationId: ORG_ID } }), prisma.battery.findFirst({ where: { organizationId: ORG_ID, status: 'ACTIVE' } })]);
  const configOk = Boolean(tariff && tariff.pricePerKwh > 0 && tariff.allowGridExport && tariff.exportPricePerKwh !== null && battery && battery.capacityKwh > 0 && battery.minSoc <= battery.initialSoc && battery.initialSoc <= battery.maxSoc && battery.maxSoc <= battery.capacityKwh && battery.chargingEfficiency > 0 && battery.chargingEfficiency <= 1 && !battery.allowGridCharging);
  checks.push({ name: 'Explicit tariff, solar and battery setup', passed: configOk, detail: JSON.stringify({ tariff: tariff?.tariffName, importPrice: tariff?.pricePerKwh, exportPrice: tariff?.exportPricePerKwh?.toString(), battery: battery ? { capacityKwh: battery.capacityKwh, minSoc: battery.minSoc, initialSoc: battery.initialSoc, maxSoc: battery.maxSoc, allowGridCharging: battery.allowGridCharging } : null, solarCapacityKw: installations[0]?.capacityKw }) });

  const result = { database: 'ecogrid_demo', checks, passed: checks.filter(c => c.passed).length, failed: checks.filter(c => !c.passed).length };
  console.log(JSON.stringify(result, null, 2));
  if (result.failed) process.exitCode = 1;
}

main().catch(error => { console.error(error?.message || 'Demo validation failed.'); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
