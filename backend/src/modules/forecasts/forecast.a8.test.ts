import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../config';
import { activateForecastModel, getPredictionMonitoring, listForecastModels, requestForecastTraining, runForecast } from './forecast.controller';
import { startForecastTrainingWorker } from './forecast-training.worker';
import { detectAnomalies } from '../anomalies/anomaly.controller';

const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (!url || url.pathname.replace(/^\//, '') !== 'ecogrid_a8_test') throw new Error('A8 lifecycle tests only run against ecogrid_a8_test.');
let orgId = ''; let otherOrgId = ''; let userId = ''; let buildingId = ''; let meterId = '';
before(async () => {
  const org = await prisma.organization.create({ data: { name: 'A8 lifecycle test', timezone: 'UTC' } }); orgId = org.id;
  const other = await prisma.organization.create({ data: { name: 'A8 tenant isolation test', timezone: 'UTC' } }); otherOrgId = other.id;
  const user = await prisma.user.create({ data: { name: 'A8 test', email: `a8-${orgId}@example.invalid`, passwordHash: 'test-only' } }); userId = user.id;
  await prisma.organizationMember.create({ data: { organizationId: orgId, userId } });
  const building = await prisma.building.create({ data: { organizationId: orgId, name: 'A8 Test Building' } }); buildingId = building.id;
  const meter = await prisma.meter.create({ data: { organizationId: orgId, buildingId, meterName: 'A8 Test Meter', dataSource: 'BENCHMARK' } }); meterId = meter.id;
  const readings = Array.from({ length: 24 * 45 }, (_, i) => ({ organizationId: orgId, meterId, buildingId,
    timestamp: new Date(Date.UTC(2025, 0, 1) + i * 3600000), consumptionKwh: 20 + (i % 24) / 3,
    intervalMinutes: 60, qualityStatus: 'MEASURED', dataSource: 'BENCHMARK' }));
  await prisma.energyReading.createMany({ data: readings });
});
after(async () => { if (orgId) await prisma.organization.delete({ where: { id: orgId } }); if (otherOrgId) await prisma.organization.delete({ where: { id: otherOrgId } }); await prisma.$disconnect(); });

async function invoke(handler: any, req: any) { let status = 200; let body: any; const res: any = { status(code: number) { status = code; return this; }, json(value: any) { body = value; return this; } }; await handler(req, res); return { status, body }; }

test('training requests create durable queued model jobs and list is organization scoped', async () => {
  startForecastTrainingWorker();
  const created = await invoke(requestForecastTraining, { user: { organizationId: orgId }, body: { meterId, dataSource: 'BENCHMARK', modelType: 'auto' } });
  assert.equal(created.status, 202);
  assert.equal(created.body.model.status, 'QUEUED');
  let finished: any;
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    finished = await prisma.forecastModel.findUniqueOrThrow({ where: { id: created.body.model.id } });
    if (finished.status === 'READY' || finished.status === 'FAILED') break;
  }
  assert.equal(finished.status, 'READY', finished.errorMessage || 'Background model training did not finish.');
  assert.ok(finished.artifactPath && finished.artifactSha256);
  assert.ok(finished.testRows > 0);
  const provenance = JSON.parse(finished.dataProvenanceJson || '{}');
  assert.equal(provenance.inputReadings, 1080);
  assert.equal(provenance.dataSource, 'BENCHMARK');
  const listed = await invoke(listForecastModels, { user: { organizationId: orgId }, query: { meterId } });
  assert.ok(listed.body.models.some((model: any) => model.id === created.body.model.id));
  const other = await invoke(listForecastModels, { user: { organizationId: otherOrgId }, query: {} });
  assert.equal(other.body.models.length, 0);
});

test('activation is explicit and switches only the selected tenant meter/source', async () => {
  const base = { organizationId: orgId, buildingId, meterId, dataSource: 'BENCHMARK', algorithm: 'seasonal_median', status: 'READY', stage: 'READY',
    featureSetJson: '[]', trainingConfigJson: '{}', metricsJson: '{}', completedAt: new Date() };
  const old = await prisma.forecastModel.create({ data: { ...base, version: 2, isActive: true } });
  const next = await prisma.forecastModel.create({ data: { ...base, version: 3 } });
  const result = await invoke(activateForecastModel, { user: { organizationId: orgId }, params: { modelId: next.id } });
  assert.equal(result.status, 200);
  assert.equal((await prisma.forecastModel.findUniqueOrThrow({ where: { id: old.id } })).isActive, false);
  assert.equal((await prisma.forecastModel.findUniqueOrThrow({ where: { id: next.id } })).isActive, true);
});

test('monitoring matches actual intervals and leaves missing actuals pending', async () => {
  const model = await prisma.forecastModel.findFirstOrThrow({ where: { organizationId: orgId, artifactPath: { not: null }, status: 'READY' } });
  await invoke(activateForecastModel, { user: { organizationId: orgId }, params: { modelId: model.id } });
  const forecast = await invoke(runForecast, { user: { organizationId: orgId }, body: { meterId, modelId: model.id, horizonHours: 24 } });
  assert.equal(forecast.status, 200);
  assert.equal(forecast.body.forecasts.length, 24);
  assert.equal(await prisma.prediction.count({ where: { organizationId: orgId, forecastModelId: model.id } }), 24);
  const timestamp = new Date(Date.now() - 30 * 60000);
  await prisma.prediction.create({ data: { organizationId: orgId, buildingId, meterId, forecastModelId: model.id, modelVersion: 'test-v2',
    predictionType: '24_HOUR_DEMAND', forecastTimestamp: timestamp, predictedKwh: 11, dataSource: 'BENCHMARK', horizonHours: 24, intervalMinutes: 60,
    sourcePredictionKey: `${model.id}:${timestamp.toISOString()}` } });
  await prisma.energyReading.create({ data: { organizationId: orgId, meterId, buildingId, timestamp, consumptionKwh: 10, intervalMinutes: 60,
    qualityStatus: 'VALIDATED', dataSource: 'BENCHMARK' } });
  const result = await invoke(getPredictionMonitoring, { user: { organizationId: orgId }, query: { meterId } });
  assert.equal(result.body.metrics.n, 1);
  assert.equal(result.body.metrics.mae, 1);
});

test('anomaly scans persist tenant-scoped evidence idempotently without inventing actions', async () => {
  const timestamp = new Date(Date.UTC(2025, 2, 1));
  await prisma.energyReading.create({ data: { organizationId: orgId, meterId, buildingId, timestamp, consumptionKwh: 500,
    intervalMinutes: 60, qualityStatus: 'MEASURED', dataSource: 'BENCHMARK' } });
  const req = { user: { organizationId: orgId }, body: { buildingId, method: 'z_score', dataSource: 'BENCHMARK' } };
  const first = await invoke(detectAnomalies, req);
  const second = await invoke(detectAnomalies, req);
  assert.ok(first.body.anomalies_found > 0);
  assert.ok(second.body.anomalies_found > 0);
  const stored = await prisma.anomaly.findMany({ where: { organizationId: orgId, sourceKey: { startsWith: `BENCHMARK:${meterId}:` } } });
  assert.equal(stored.length, first.body.anomalies_found);
  assert.ok(stored.every((row) => row.detectionMethod && row.baselineSampleCount && row.qualityReportJson));
  assert.ok(stored.every((row) => row.suggestedAction === null));
});
