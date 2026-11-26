import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { prisma } from '../../config';
import { getOptimizationRunById, runOptimization } from './optimization.controller';
import { compareScenarios, createScenario, duplicateScenario, getScenarios, runScenario } from '../scenarios/scenario.controller';
import { createBattery, recordBatteryReading, updateBattery } from '../batteries/battery.controller';
import { createTariff, updateTariff } from '../organizations/tariff.controller';

const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (!url || url.pathname.replace(/^\//, '') !== 'ecogrid_a9_test') throw new Error('A9 tests only run against the isolated ecogrid_a9_test database.');
let orgId = '', otherOrgId = '', buildingId = '', otherBuildingId = '';
let tariffId = '', batteryId = '', foreignBatteryId = '', meterId = '', modelId = '';
const invoke = async (handler: any, req: any) => {
  let status = 200; let body: any;
  const res: any = { status(code: number) { status = code; return this; }, json(value: any) { body = value; return this; } };
  await handler(req, res); return { status, body };
};

before(async () => {
  const org = await prisma.organization.create({ data: { name: 'A9 isolated test', timezone: 'UTC', currency: 'USD' } }); orgId = org.id;
  const other = await prisma.organization.create({ data: { name: 'A9 other tenant', timezone: 'UTC' } }); otherOrgId = other.id;
  buildingId = (await prisma.building.create({ data: { organizationId: orgId, name: 'A9 building' } })).id;
  otherBuildingId = (await prisma.building.create({ data: { organizationId: otherOrgId, name: 'Other building' } })).id;
  const tariff = await prisma.electricityTariff.create({ data: { organizationId: orgId, tariffName: 'A9 flat', tariffType: 'FLAT', pricePerKwh: 0.12, effectiveFrom: new Date(Date.now() - 86400000) } }); tariffId = tariff.id;
  const battery = await prisma.battery.create({ data: { organizationId: orgId, buildingId, capacityKwh: 10, maxChargeKw: 3, maxDischargeKw: 3, minSoc: 1, initialSoc: 2, maxSoc: 9 } }); batteryId = battery.id;
  const foreignBattery = await prisma.battery.create({ data: { organizationId: otherOrgId, buildingId: otherBuildingId, capacityKwh: 10, maxChargeKw: 3, maxDischargeKw: 3, minSoc: 1, initialSoc: 2, maxSoc: 9 } }); foreignBatteryId = foreignBattery.id;
  const meter = await prisma.meter.create({ data: { organizationId: orgId, buildingId, meterName: 'Main feeder', meterType: 'MAIN_FEEDER' } }); meterId = meter.id;
  const model = await prisma.forecastModel.create({ data: { organizationId: orgId, buildingId, meterId, dataSource: 'SYNTHETIC_DEMO', version: 1,
    algorithm: 'baseline', status: 'READY', stage: 'READY', isActive: true, featureSetJson: '[]', trainingConfigJson: '{}', completedAt: new Date() } }); modelId = model.id;
  const firstForecast = Math.ceil(Date.now() / 3600000) * 3600000;
  await prisma.prediction.createMany({ data: Array.from({ length: 24 }, (_, i) => { const timestamp = new Date(firstForecast + i * 3600000); return {
    organizationId: orgId, buildingId, meterId, forecastModelId: modelId, modelVersion: 'baseline-v1', predictionType: '24_HOUR_DEMAND',
    forecastTimestamp: timestamp, predictedKwh: 3, dataSource: 'SYNTHETIC_DEMO', horizonHours: 24, intervalMinutes: 60,
    sourcePredictionKey: `${modelId}:${timestamp.toISOString()}`,
  }; }) });
});

after(async () => {
  if (orgId) await prisma.organization.delete({ where: { id: orgId } });
  if (otherOrgId) await prisma.organization.delete({ where: { id: otherOrgId } });
  await prisma.$disconnect();
});

test('scenario APIs persist, duplicate and isolate scenario records by organization', async () => {
  const req = { user: { organizationId: orgId }, body: { name: 'Grid only scenario', buildingId, configuration: { horizonHours: 24, tariffId, demandMultiplier: 1, solarMultiplier: 1 } } };
  const created = await invoke(createScenario, req);
  assert.equal(created.status, 201);
  const foreign = await invoke(createScenario, { ...req, body: { ...req.body, buildingId: otherBuildingId } });
  assert.equal(foreign.status, 404);
  const list = await invoke(getScenarios, { user: { organizationId: orgId } });
  assert.equal(list.body.scenarios.length, 1);
  const copied = await invoke(duplicateScenario, { user: { organizationId: orgId }, params: { id: created.body.scenario.id } });
  assert.equal(copied.status, 201);
  const tenantList = await invoke(getScenarios, { user: { organizationId: otherOrgId } });
  assert.equal(tenantList.body.scenarios.length, 0);

  const timestamps = Array.from({ length: 24 }, (_, i) => new Date(Date.UTC(2026, 0, 1, i)).toISOString());
  const comparableConfiguration = JSON.stringify({ tariffId, timestamps });
  const comparableResult = JSON.stringify({ currency: 'USD', total_optimized_cost: 10, total_baseline_cost: 12,
    total_estimated_savings: 2, total_grid_import_kwh: 20, total_grid_export_kwh: 0,
    solar_self_consumption_kwh: 0, solar_curtailed_kwh: 0, peak_demand_optimized_kw: 1, total_grid_emissions_kg: null });
  const completed = await Promise.all(['Comparison one', 'Comparison two'].map(name => prisma.scenario.create({ data: {
    organizationId: orgId, buildingId, name, configuration: comparableConfiguration, resultData: comparableResult, status: 'COMPLETED',
  } })));
  const comparison = await invoke(compareScenarios, { user: { organizationId: orgId }, body: { scenarioIds: completed.map(s => s.id) } });
  assert.equal(comparison.status, 200);
  assert.equal(comparison.body.comparison.length, 2);
  const crossTenantComparison = await invoke(compareScenarios, { user: { organizationId: otherOrgId }, body: { scenarioIds: completed.map(s => s.id) } });
  assert.equal(crossTenantComparison.status, 404);
});

test('scenario execution uses scoped tariff and records simulated result and solver outcome', async () => {
  const firstHour = Math.ceil(Date.now() / 3600000) * 3600000;
  const saved = await prisma.scenario.create({ data: { organizationId: orgId, buildingId, name: 'Explicit scenario',
    configuration: JSON.stringify({ horizonHours: 24, tariffId, demandKw: Array(24).fill(3), timestamps: Array.from({ length: 24 }, (_, i) => new Date(firstHour + i * 3600000).toISOString()), useConfiguredBattery: false }) } });
  const original = axios.post;
  (axios as any).post = async (_url: string, payload: any) => ({ data: { feasible: true, solver_status: 'OPTIMAL', solver_message: 'test solver response', optimization_type: 'MILP test', data_status: payload.data_status,
    total_baseline_cost: 8.64, total_optimized_cost: 8.64, total_estimated_savings: 0, total_demand_kwh: 72, solar_generation_kwh: 0,
    solar_self_consumption_kwh: 0, solar_export_kwh: 0, solar_curtailed_kwh: 0, total_grid_import_kwh: 72, total_grid_export_kwh: 0,
    total_grid_emissions_kg: null, total_battery_charge_kwh: 0, total_battery_discharged_kwh: 0, peak_demand_baseline_kw: 3, peak_demand_optimized_kw: 3,
    constraints_binding: [], explanations: [], limitations: [], schedule: [] } });
  try {
    const result = await invoke(runScenario, { user: { organizationId: orgId }, params: { id: saved.id } });
    assert.equal(result.status, 200);
    assert.equal(result.body.scenario.status, 'COMPLETED');
    assert.equal(result.body.scenario.resultData.data_status, 'SIMULATED');
    const hidden = await invoke(runScenario, { user: { organizationId: otherOrgId }, params: { id: saved.id } });
    assert.equal(hidden.status, 404);
  } finally { (axios as any).post = original; }
});

test('battery updates and unitized readings are organization-scoped and validate physical limits', async () => {
  const foreign = await invoke(updateBattery, { user: { organizationId: orgId }, params: { id: foreignBatteryId }, body: { capacityKwh: 99 } });
  assert.equal(foreign.status, 404);
  const reading = await invoke(recordBatteryReading, { user: { organizationId: orgId }, params: { id: batteryId }, body: { stateOfChargeKwh: 4, chargePowerKw: 1, dischargePowerKw: 0 } });
  assert.equal(reading.status, 201);
  assert.equal(reading.body.reading.stateOfChargeKwh, 4);
  const invalid = await invoke(recordBatteryReading, { user: { organizationId: orgId }, params: { id: batteryId }, body: { stateOfChargeKwh: 4, chargePowerKw: 1, dischargePowerKw: 1 } });
  assert.equal(invalid.status, 400);
  const foreignRead = await invoke(recordBatteryReading, { user: { organizationId: orgId }, params: { id: foreignBatteryId }, body: { stateOfChargeKwh: 4 } });
  assert.equal(foreignRead.status, 404);
});

test('tariff configuration requires explicit rates and stays within the organization', async () => {
  const payload = { tariffName: 'A9 TOU', tariffType: 'TIME_OF_USE', pricePerKwh: 0.14,
    allowGridExport: true, exportPricePerKwh: 0.05, demandChargePerKw: 4, demandWindowMinutes: 60,
    fixedCharge: 12, carbonEmissionKgPerKwh: 0.4,
    periods: [{ periodName: 'DAY', startTime: '00:00', endTime: '24:00', pricePerKwh: 0.14, dayType: 'ALL' }] };
  const created = await invoke(createTariff, { user: { organizationId: orgId, role: 'ORG_ADMIN' }, params: { id: orgId }, body: payload });
  assert.equal(created.status, 201);
  assert.equal(created.body.tariff.allowGridExport, true);
  assert.equal(created.body.tariff.periods.length, 1);
  const foreign = await invoke(updateTariff, { user: { organizationId: otherOrgId, role: 'ORG_ADMIN' }, params: { id: orgId, tariffId: created.body.tariff.id }, body: { pricePerKwh: 0.99 } });
  assert.equal(foreign.status, 403);
});

test('optimization consumes a complete organization forecast and tariff without synthetic fallbacks', async () => {
  const original = axios.post; let sent: any;
  (axios as any).post = async (_url: string, payload: any) => { sent = payload; return { data: { feasible: true,
    solver_status: 'OPTIMAL', solver_message: 'test fixture', optimization_type: 'MILP test', total_baseline_cost: 8.64,
    total_optimized_cost: 7.64, total_estimated_savings: 1, data_status: payload.data_status,
    total_battery_charge_kwh: 2, total_battery_discharged_kwh: 1, peak_demand_baseline_kw: 3,
    peak_demand_optimized_kw: 2, peak_demand_reduction_kw: 1, tariff_periods_used: ['FLAT'] } }; };
  try {
    const selectionRequired = await invoke(runOptimization, { user: { organizationId: orgId }, body: { buildingId, horizonHours: 24 } });
    assert.equal(selectionRequired.status, 422);
    const response = await invoke(runOptimization, { user: { organizationId: orgId }, body: { buildingId, tariffId, horizonHours: 24 } });
    assert.equal(response.status, 200);
    assert.deepEqual(sent.predicted_demand_kw, Array(24).fill(3));
    assert.deepEqual(sent.solar_generation_kw, Array(24).fill(0));
    assert.deepEqual(sent.tariffs, Array(24).fill(0.12));
    assert.equal(sent.battery_available, true);
    assert.equal(sent.data_status, 'FORECAST');
    const recommendations = await prisma.recommendation.findMany({ where: { organizationId: orgId, generationSource: 'A9_OPTIMIZATION' } });
    assert.equal(recommendations.length, 2);
    assert.ok(recommendations.some(r => r.recommendationType === 'SOLAR_BATTERY_DISPATCH'));
    assert.ok(recommendations.some(r => r.recommendationType === 'PEAK_SHAVING'));
  } finally { (axios as any).post = original; }
});

test('optimization run lookups do not reveal another tenant record', async () => {
  const run = await prisma.optimizationRun.create({ data: { organizationId: orgId, buildingId, baselineCost: 1, optimizedCost: 1,
    estimatedSavings: 0, configuration: '{}', resultData: '{}' } });
  const hidden = await invoke(getOptimizationRunById, { user: { organizationId: otherOrgId }, params: { id: run.id } });
  assert.equal(hidden.status, 404);
});
