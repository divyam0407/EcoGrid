import { Request, Response } from 'express';
import axios from 'axios';
import { prisma, config } from '../../config';
import '../../middleware/auth';
import { tariffPeriodAt, tariffRateAt } from '../recommendations/energy-intelligence.service';

const orgId = (req: Request) => req.user!.organizationId;
const parse = (s: string | null) => s ? JSON.parse(s) : null;

export const getScenarios = async (req: Request, res: Response) => {
  const rows = await prisma.scenario.findMany({ where: { organizationId: orgId(req) }, orderBy: { updatedAt: 'desc' }, take: 100 });
  return res.json({ scenarios: rows.map(s => ({ ...s, configuration: parse(s.configuration), resultData: parse(s.resultData) })) });
};

export const createScenario = async (req: Request, res: Response) => {
  const { name, description, buildingId, configuration } = req.body;
  if (typeof name !== 'string' || !name.trim() || !buildingId || !configuration || typeof configuration !== 'object') return res.status(400).json({ error: 'Scenario name, building and explicit configuration are required.' });
  const building = await prisma.building.findFirst({ where: { id: String(buildingId), organizationId: orgId(req) } });
  if (!building) return res.status(404).json({ error: 'Building not found in this organization.' });
  const scenario = await prisma.scenario.create({ data: { organizationId: orgId(req), buildingId: building.id, name: name.trim(), description: description || null, configuration: JSON.stringify(configuration), status: 'DRAFT' } });
  return res.status(201).json({ scenario: { ...scenario, configuration, resultData: null } });
};

export const updateScenario = async (req: Request, res: Response) => {
  const current = await prisma.scenario.findFirst({ where: { id: req.params.id, organizationId: orgId(req) } });
  if (!current) return res.status(404).json({ error: 'Scenario not found.' });
  if (current.status !== 'DRAFT' && current.status !== 'FAILED') return res.status(409).json({ error: 'Only draft or failed scenarios can be edited. Duplicate a completed scenario to change its assumptions.' });
  const { name, description, buildingId, configuration } = req.body;
  if (buildingId) {
    const building = await prisma.building.findFirst({ where: { id: String(buildingId), organizationId: orgId(req) } });
    if (!building) return res.status(404).json({ error: 'Building not found in this organization.' });
  }
  const scenario = await prisma.scenario.update({ where: { id: current.id }, data: {
    name: typeof name === 'string' ? name.trim() : undefined, description: description === undefined ? undefined : description,
    buildingId: buildingId ? String(buildingId) : undefined, configuration: configuration ? JSON.stringify(configuration) : undefined,
    resultData: null, status: 'DRAFT',
  } });
  return res.json({ scenario: { ...scenario, configuration: parse(scenario.configuration), resultData: null } });
};

export const duplicateScenario = async (req: Request, res: Response) => {
  const source = await prisma.scenario.findFirst({ where: { id: req.params.id, organizationId: orgId(req) } });
  if (!source) return res.status(404).json({ error: 'Scenario not found.' });
  const copy = await prisma.scenario.create({ data: { organizationId: orgId(req), buildingId: source.buildingId,
    name: `${source.name} (copy)`, description: source.description, configuration: source.configuration, status: 'DRAFT' } });
  return res.status(201).json({ scenario: { ...copy, configuration: parse(copy.configuration), resultData: null } });
};

export const runScenario = async (req: Request, res: Response) => {
  const scenario = await prisma.scenario.findFirst({ where: { id: req.params.id, organizationId: orgId(req) } });
  if (!scenario || !scenario.buildingId) return res.status(404).json({ error: 'Scenario or its building was not found in this organization.' });
  const c = parse(scenario.configuration) || {};
  const horizon = Number(c.horizonHours || (Array.isArray(c.timestamps) ? c.timestamps.length : 0));
  if (![24, 168].includes(horizon) || !c.tariffId) return res.status(422).json({ error: 'Scenario requires a 24 or 168 hour horizon and a configured tariff.' });
  const [building, tariff, organization] = await Promise.all([
    prisma.building.findFirst({ where: { id: scenario.buildingId, organizationId: orgId(req) }, include: { solar: { where: { status: 'ACTIVE' } }, batteries: { where: { status: 'ACTIVE' } }, meters: { where: { status: 'ACTIVE', meterType: 'MAIN_FEEDER' } } } }),
    prisma.electricityTariff.findFirst({ where: { id: String(c.tariffId), organizationId: orgId(req) }, include: { periods: true } }),
    prisma.organization.findFirst({ where: { id: orgId(req) }, select: { timezone: true, currency: true } }),
  ]);
  if (!building || !tariff) return res.status(422).json({ error: 'Scenario building or tariff is not available in this organization.' });
  let timestamps: string[] = Array.isArray(c.timestamps) ? c.timestamps : [];
  let demandKw: number[] = Array.isArray(c.demandKw) ? c.demandKw : [];
  let sourceModel: any = null;
  if (c.forecastModelId) {
    sourceModel = await prisma.forecastModel.findFirst({ where: { id: String(c.forecastModelId), organizationId: orgId(req), buildingId: building.id, status: 'READY', isActive: true } });
    if (!sourceModel) return res.status(422).json({ error: 'Selected active forecast model is unavailable for this building.' });
    if (building.meters.length !== 1 || building.meters[0].id !== sourceModel.meterId) return res.status(422).json({ error: 'A scenario demand forecast must come from the building’s single active main-feeder meter.' });
    const predictions = await prisma.prediction.findMany({ where: { organizationId: orgId(req), buildingId: building.id, meterId: sourceModel.meterId, forecastModelId: sourceModel.id, forecastTimestamp: { gte: new Date() } }, orderBy: { forecastTimestamp: 'asc' }, take: horizon });
    if (predictions.length !== horizon || predictions.some(p => p.intervalMinutes !== 60)) return res.status(422).json({ error: 'Selected model needs a complete future forecast. Run its forecast first.' });
    timestamps = predictions.map(p => p.forecastTimestamp.toISOString());
    demandKw = predictions.map(p => p.predictedKwh);
  }
  const demandMultiplier = Number(c.demandMultiplier ?? 1);
  if (!Number.isFinite(demandMultiplier) || demandMultiplier <= 0 || demandMultiplier > 3) return res.status(400).json({ error: 'Demand multiplier must be greater than 0 and at most 3.' });
  demandKw = demandKw.map(value => value * demandMultiplier);
  if (timestamps.length !== horizon || demandKw.length !== horizon || demandKw.some((x: unknown) => typeof x !== 'number' || !Number.isFinite(x) || x < 0) || timestamps.some((x: unknown) => typeof x !== 'string' || Number.isNaN(Date.parse(x)))) return res.status(422).json({ error: 'Select a valid forecast model or supply complete non-negative demand and timestamp arrays.' });
  const solarMultiplier = Number(c.solarMultiplier ?? 1);
  if (!Number.isFinite(solarMultiplier) || solarMultiplier < 0 || solarMultiplier > 3) return res.status(400).json({ error: 'Solar multiplier must be between 0 and 3.' });
  const solarGenerationKw: number[] = Array.isArray(c.solarGenerationKw) ? c.solarGenerationKw.map((v: number) => v * solarMultiplier) : timestamps.map(() => 0);
  if (solarGenerationKw.length !== horizon || solarGenerationKw.some(x => typeof x !== 'number' || !Number.isFinite(x) || x < 0)) return res.status(422).json({ error: 'Solar forecast must have one non-negative value per interval.' });
  if (building.solar.length && !Array.isArray(c.solarGenerationKw)) return res.status(422).json({ error: 'An explicit solar forecast is required while no configured solar forecast source exists.' });
  const dates = timestamps.map((x: string) => new Date(x));
  if (dates.some((d: Date, i: number) => i > 0 && d.getTime() - dates[i - 1].getTime() !== 3600000)) return res.status(422).json({ error: 'Scenario timestamps must be contiguous hourly intervals.' });
  if (building.batteries.length > 1) return res.status(422).json({ error: 'Multiple batteries require dispatch topology configuration.' });
  const rates = dates.map((timestamp: Date) => tariffRateAt({ timestamp }, [tariff], organization?.timezone || 'UTC'));
  if (rates.some((v: any) => v === null)) return res.status(422).json({ error: 'The selected tariff has ambiguous or missing rates for scenario intervals.' });
  const battery = building.batteries[0];
  const requestedBattery = c.useConfiguredBattery === false ? null : c.battery;
  const batteryConfig = requestedBattery === null ? null : requestedBattery || battery;
  if (batteryConfig && (!batteryConfig.capacityKwh || batteryConfig.initialSocKwh === undefined || batteryConfig.minSocKwh === undefined || batteryConfig.maxSocKwh === undefined || batteryConfig.maxChargeKw === undefined || batteryConfig.maxDischargeKw === undefined || batteryConfig.chargeEfficiency === undefined || batteryConfig.dischargeEfficiency === undefined)) {
    return res.status(422).json({ error: 'Battery scenarios require explicit capacity, initial/min/max SOC, power, efficiency and availability configuration. Set battery to null for grid/solar only.' });
  }
  let batteryInitialSoc = batteryConfig?.initialSocKwh ?? batteryConfig?.initialSoc;
  if (batteryConfig?.id) {
    const reading = await prisma.batteryReading.findFirst({ where: { organizationId: orgId(req), batteryId: batteryConfig.id, stateOfChargeKwh: { not: null }, timestamp: { gte: new Date(Date.now() - 6 * 3600000) } }, orderBy: { timestamp: 'desc' } });
    if (reading?.stateOfChargeKwh !== null && reading?.stateOfChargeKwh !== undefined) batteryInitialSoc = reading.stateOfChargeKwh;
  }
  const payload: any = { building_id: building.id, timestamps, interval_hours: 1,
    predicted_demand_kw: demandKw, solar_generation_kw: solarGenerationKw, tariffs: rates.map((r: any) => Number(r)),
    tariff_periods: dates.map((timestamp: Date) => tariffPeriodAt({ timestamp }, tariff, organization?.timezone || 'UTC') || 'UNRESOLVED'),
    battery_available: Boolean(batteryConfig), allow_grid_export: tariff.allowGridExport && tariff.exportPricePerKwh !== null,
    export_price_per_kwh: tariff.exportPricePerKwh === null ? undefined : Number(tariff.exportPricePerKwh),
    demand_charge_per_kw: tariff.demandChargePerKw === null ? undefined : Number(tariff.demandChargePerKw),
    demand_window_hours: tariff.demandWindowMinutes / 60, data_status: 'SIMULATED' };
  if (batteryConfig) Object.assign(payload, { battery_capacity_kwh: batteryConfig.capacityKwh,
    initial_soc_kwh: batteryInitialSoc, min_soc_kwh: batteryConfig.minSocKwh ?? batteryConfig.minSoc,
    max_soc_kwh: batteryConfig.maxSocKwh ?? batteryConfig.maxSoc, max_charge_kw: batteryConfig.maxChargeKw,
    max_discharge_kw: batteryConfig.maxDischargeKw, charge_efficiency: batteryConfig.chargeEfficiency ?? batteryConfig.chargingEfficiency,
    discharge_efficiency: batteryConfig.dischargeEfficiency ?? batteryConfig.dischargingEfficiency,
    battery_degradation_cost_per_kwh: batteryConfig.degradationCost ?? 0, reserve_soc_kwh: batteryConfig.reserveSocKwh,
    final_soc_kwh: batteryConfig.finalSocKwh, allow_grid_charging: batteryConfig.allowGridCharging ?? false });
  await prisma.scenario.update({ where: { id: scenario.id }, data: { status: 'PROCESSING' } });
  try {
    const result = (await axios.post(`${config.pythonServiceUrl}/api/optimization/optimize`, payload, { timeout: 45000 })).data;
    result.limitations = [...(result.limitations || []), 'Scenario results are simulated; forecast uncertainty is not propagated through dispatch.'];
    if (Number(tariff.fixedCharge) > 0) result.limitations.push('Configured fixed charges are excluded because the billing period is not defined for this scenario horizon.');
    if (building.solar.length) result.limitations.push('Solar generation uses the scenario-provided profile; no weather-backed solar forecast is configured.');
    const status = result.feasible ? 'COMPLETED' : 'INFEASIBLE';
    const resolvedConfiguration = { ...c, timestamps, demandKw, solarGenerationKw,
      forecastSource: sourceModel ? { modelId: sourceModel.id, algorithm: sourceModel.algorithm, version: sourceModel.version } : 'EXPLICIT_ASSUMPTION' };
    const saved = await prisma.scenario.update({ where: { id: scenario.id }, data: { status,
      configuration: JSON.stringify(resolvedConfiguration),
      resultData: JSON.stringify({ ...result, currency: organization?.currency || null, savingsStatus: 'ESTIMATED_UNVERIFIED' }) } });
    return res.json({ scenario: { ...saved, configuration: resolvedConfiguration, resultData: { ...result, currency: organization?.currency || null, savingsStatus: 'ESTIMATED_UNVERIFIED' } } });
  } catch (error: any) {
    await prisma.scenario.update({ where: { id: scenario.id }, data: { status: 'FAILED', resultData: JSON.stringify({ error: error.response?.data?.detail || 'Solver unavailable; no schedule was generated.' }) } });
    return res.status(503).json({ error: error.response?.data?.detail || 'Scenario solver is unavailable. No fallback schedule was generated.' });
  }
};

export const compareScenarios = async (req: Request, res: Response) => {
  const ids = req.body.scenarioIds;
  if (!Array.isArray(ids) || ids.length < 2 || ids.length > 5) return res.status(400).json({ error: 'Choose between two and five scenarios to compare.' });
  const rows = await prisma.scenario.findMany({ where: { organizationId: orgId(req), id: { in: ids }, status: 'COMPLETED' } });
  if (rows.length !== ids.length) return res.status(404).json({ error: 'Every compared scenario must be completed and belong to this organization.' });
  const results = rows.map(s => ({ id: s.id, name: s.name, buildingId: s.buildingId, configuration: parse(s.configuration), result: parse(s.resultData) }));
  if (new Set(results.map(s => s.buildingId)).size !== 1) return res.status(422).json({ error: 'Scenarios must target the same building to compare.' });
  if (new Set(results.map(s => s.result?.currency)).size !== 1) return res.status(422).json({ error: 'Scenarios must use the same currency to compare.' });
  if (new Set(results.map(s => s.configuration?.tariffId)).size !== 1 || new Set(results.map(s => JSON.stringify(s.configuration?.timestamps || []))).size !== 1) return res.status(422).json({ error: 'Scenarios must use the same tariff and forecast time intervals for a valid comparison.' });
  return res.json({ comparison: results.map(s => ({ id: s.id, name: s.name, currency: s.result.currency,
    simulated: true, totalCost: s.result.total_optimized_cost, baselineCost: s.result.total_baseline_cost,
    estimatedSavings: s.result.total_estimated_savings, gridImportKwh: s.result.total_grid_import_kwh,
    gridExportKwh: s.result.total_grid_export_kwh, solarSelfConsumptionKwh: s.result.solar_self_consumption_kwh,
    solarCurtailedKwh: s.result.solar_curtailed_kwh, peakDemandKw: s.result.peak_demand_optimized_kw,
    gridEmissionsKg: s.result.total_grid_emissions_kg,
    assumptions: s.configuration })) });
};
