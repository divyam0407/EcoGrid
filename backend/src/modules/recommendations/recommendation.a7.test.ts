import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../config';
import { generateRecommendations, tariffRateAt, validateOptions } from './energy-intelligence.service';
import { addRecommendationNote, assignRecommendation, getRecommendation, measureRecommendation, recordImplementation, updateStatus } from './recommendation.controller';

const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (!url || url.pathname.replace(/^\//,'') !== 'ecogrid_a7_test') throw new Error('A7 tests only run against the isolated ecogrid_a7_test database.');

let orgId = ''; let userId = ''; let buildingId = ''; let roomId = ''; let meterId = ''; let otherOrgId = '';
before(async () => {
  const org = await prisma.organization.create({ data: { name: 'A7 isolated test', timezone: 'UTC', currency: 'USD' } }); orgId = org.id;
  const other = await prisma.organization.create({ data: { name: 'A7 other tenant', timezone: 'UTC', currency: 'USD' } }); otherOrgId = other.id;
  const user = await prisma.user.create({ data: { name: 'A7 test user', email: `a7-${orgId}@example.invalid`, passwordHash: 'test-only' } }); userId = user.id;
  await prisma.organizationMember.create({ data: { organizationId: orgId, userId, role: 'ENERGY_MANAGER' } });
  const building = await prisma.building.create({ data: { organizationId: orgId, name: 'Test Building' } }); buildingId = building.id;
  const room = await prisma.room.create({ data: { organizationId: orgId, buildingId, roomNumber: 'A7-1', expectedOperatingHours: '08:00-18:00' } }); roomId = room.id;
  const meter = await prisma.meter.create({ data: { organizationId: orgId, buildingId, roomId, meterName: 'Test Meter', unit: 'kWh' } }); meterId = meter.id;
  const now = new Date();
  const readings = [];
  for (let offset = 1; offset <= 120; offset++) {
    const timestamp = new Date(now.getTime() - offset * 86400000); timestamp.setUTCHours(20,0,0,0);
    readings.push({ organizationId: orgId, meterId, buildingId, roomId, timestamp, consumptionKwh: offset <= 30 ? 15 : 10, intervalMinutes: 60, qualityStatus: 'MEASURED', dataSource: 'BENCHMARK', source: 'CSV_UPLOAD' });
  }
  await prisma.energyReading.createMany({ data: readings });
});
after(async () => { if (orgId) await prisma.organization.delete({ where: { id: orgId } }); if (otherOrgId) await prisma.organization.delete({ where: { id: otherOrgId } }); await prisma.$disconnect(); });

async function invoke(handler: any, req: any) { let status = 200; let body: any; const res: any = { status(code: number) { status = code; return this; }, json(value: any) { body = value; return this; } }; await handler(req, res); return { status, body }; }

test('validates generation controls and rejects unsafe windows', () => {
  assert.equal(validateOptions({}).analysisDays, 30);
  assert.throws(() => validateOptions({ analysisDays: 2 }), /analysisDays/);
});

test('matches configured time-of-use tariff windows and withholds ambiguous periods', () => {
  const tariff = { effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: null, pricePerKwh: 0.2, periods: [{ startTime: '20:00', endTime: '21:00', dayType: 'ALL', pricePerKwh: 0.5 }] };
  assert.equal(tariffRateAt({ timestamp: new Date('2026-01-02T20:30:00Z') }, [tariff], 'UTC')?.toString(), '0.5');
  assert.equal(tariffRateAt({ timestamp: new Date('2026-01-02T21:30:00Z') }, [tariff], 'UTC'), null);
  assert.equal(tariffRateAt({ timestamp: new Date('2026-01-02T20:30:00Z') }, [{ ...tariff, periods: [...tariff.periods, { startTime: '20:15', endTime: '20:45', dayType: 'ALL', pricePerKwh: 0.9 }] }], 'UTC'), null);
});

test('generates idempotent measured opportunities and keeps cost unavailable without tariff', async () => {
  const first = await generateRecommendations(orgId, userId);
  assert.ok(first.generated >= 1);
  const row = await prisma.recommendation.findFirst({ where: { organizationId: orgId, generationSource: 'A7_ENGINE' } });
  assert.ok(row);
  assert.equal(row!.financialEstimateAvailable, false);
  assert.equal(row!.estimatedCostSaving, null);
  assert.equal(row!.estimatedEnergySavingKwh?.toString(), '150');
  const second = await generateRecommendations(orgId, userId);
  assert.equal(second.created, 0);
  assert.equal(second.refreshed, first.generated);
  assert.equal(await prisma.recommendation.count({ where: { organizationId: orgId } }), first.generated);
});

test('uses configured tariff rate and retains evidence and source-key uniqueness', async () => {
  await prisma.electricityTariff.create({ data: { organizationId: orgId, tariffName: 'Test flat', tariffType: 'FLAT', pricePerKwh: 0.2, effectiveFrom: new Date(Date.now() - 200 * 86400000) } });
  const result = await generateRecommendations(orgId, userId);
  assert.equal(result.created, 0);
  const rec = await prisma.recommendation.findFirst({ where: { organizationId: orgId, generationSource: 'A7_ENGINE' } });
  assert.ok(rec?.financialEstimateAvailable);
  assert.equal(rec?.estimatedCostSaving?.toString(), '30');
  assert.ok(JSON.parse(rec!.evidence!).baselineComparisons.length > 0);
});

test('keeps recommendation details tenant-scoped and audits lifecycle and assignment', async () => {
  const rec = await prisma.recommendation.findFirstOrThrow({ where: { organizationId: orgId, generationSource: 'A7_ENGINE' } });
  const hidden = await invoke(getRecommendation, { params: { id: rec.id }, user: { organizationId: otherOrgId } });
  assert.equal(hidden.status, 404);
  const approved = await invoke(updateStatus, { params: { id: rec.id }, body: { status: 'APPROVED', approvedSavingsTargetKwh: 120 }, user: { organizationId: orgId, id: userId } });
  assert.equal(approved.status, 200);
  const updated = await prisma.recommendation.findUniqueOrThrow({ where: { id: rec.id } });
  assert.equal(updated.status, 'APPROVED');
  assert.equal(updated.approvedSavingsTargetKwh?.toString(), '120');
  const invalidTransition = await invoke(updateStatus, { params: { id: rec.id }, body: { status: 'REJECTED', reason: 'test' }, user: { organizationId: orgId, id: userId } });
  assert.equal(invalidTransition.status, 409);
  const assignment = await invoke(assignRecommendation, { params: { id: rec.id }, body: { assignedUserId: userId }, user: { organizationId: orgId, id: userId } });
  assert.equal(assignment.status, 200);
  const note = await invoke(addRecommendationNote, { params: { id: rec.id }, body: { note: 'A7 workflow test note' }, user: { organizationId: orgId, id: userId } });
  assert.equal(note.status, 201);
  assert.ok(await prisma.recommendationEvent.count({ where: { organizationId: orgId, recommendationId: rec.id } }) >= 3);
  assert.ok(await prisma.auditLog.count({ where: { organizationId: orgId, entityId: rec.id } }) >= 3);
});

test('measurement remains unverified and requires a recorded implementation date', async () => {
  const rec = await prisma.recommendation.findFirstOrThrow({ where: { organizationId: orgId, generationSource: 'A7_ENGINE' } });
  const now = new Date(); const start = new Date(now.getTime() - 14 * 86400000); const end = new Date(now.getTime() - 1 * 86400000);
  const implementationAt = new Date(now.getTime() - 15 * 86400000);
  const dated = await invoke(recordImplementation, { params: { id: rec.id }, body: { implementedAt: implementationAt.toISOString() }, user: { organizationId: orgId, id: userId } });
  assert.equal(dated.status, 200);
  const prematureStart = new Date(now.getTime() - 16 * 86400000); const prematureEnd = new Date(now.getTime() - 9 * 86400000);
  const premature = await invoke(measureRecommendation, { params: { id: rec.id }, body: { comparisonPeriodStart: prematureStart.toISOString(), comparisonPeriodEnd: prematureEnd.toISOString() }, user: { organizationId: orgId, id: userId } });
  assert.equal(premature.status, 400);
  const result = await invoke(measureRecommendation, { params: { id: rec.id }, body: { comparisonPeriodStart: start.toISOString(), comparisonPeriodEnd: end.toISOString() }, user: { organizationId: orgId, id: userId } });
  assert.equal(result.status, 201);
  assert.equal(result.body.measurement.savingsStatus, 'ESTIMATED_UNVERIFIED');
  assert.equal(result.body.measurement.estimatedRealizedSavingsKwh, '0');
  assert.ok(result.body.measurement.limitations.some((x: string) => x.includes('not verified')));
  assert.equal(await prisma.recommendationMeasurement.count({ where: { organizationId: otherOrgId } }), 0);
  const sparseStart = new Date(now.getTime() - 14 * 86400000); const sparseEnd = new Date(now.getTime() - 7 * 86400000);
  const sparse = await invoke(measureRecommendation, { params: { id: rec.id }, body: { comparisonPeriodStart: sparseStart.toISOString(), comparisonPeriodEnd: sparseEnd.toISOString() }, user: { organizationId: orgId, id: userId } });
  assert.equal(sparse.body.measurement.savingsStatus, 'INSUFFICIENT_DATA');
  assert.equal(sparse.body.measurement.estimatedRealizedSavingsKwh, null);
});

test('does not create a savings opportunity from repeated context alone when readings do not exceed baseline', async () => {
  const building = await prisma.building.create({ data: { organizationId: otherOrgId, name: 'No excess building' } });
  const room = await prisma.room.create({ data: { organizationId: otherOrgId, buildingId: building.id, roomNumber: 'N-1', expectedOperatingHours: '08:00-18:00' } });
  const meter = await prisma.meter.create({ data: { organizationId: otherOrgId, buildingId: building.id, roomId: room.id, meterName: 'No excess meter' } });
  const now = new Date(); const readings = [];
  for (let offset = 1; offset <= 120; offset++) { const timestamp = new Date(now.getTime() - offset * 86400000); timestamp.setUTCHours(20,0,0,0); readings.push({ organizationId: otherOrgId, meterId: meter.id, buildingId: building.id, roomId: room.id, timestamp, consumptionKwh: 10, intervalMinutes: 60, qualityStatus: 'MEASURED', dataSource: 'BENCHMARK' }); }
  await prisma.energyReading.createMany({ data: readings });
  const result = await generateRecommendations(otherOrgId, userId);
  assert.equal(result.generated, 0);
  assert.equal(await prisma.recommendation.count({ where: { organizationId: otherOrgId } }), 0);
});
