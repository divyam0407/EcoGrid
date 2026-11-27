import { Request, Response } from 'express';
import { prisma, config } from '../../config';
import axios from 'axios';
import '../../middleware/auth';
import { tariffPeriodAt, tariffRateAt } from '../recommendations/energy-intelligence.service';

const organizationId = (req: Request) => req.user!.organizationId;

export const runOptimization = async (req: Request, res: Response) => {
  try {
    const orgId = organizationId(req);
    const horizon = Number(req.body.horizonHours ?? 24);
    if (![24, 168].includes(horizon)) return res.status(400).json({ error: 'Choose a 24 or 168 hour forecast horizon.' });
    const building = await prisma.building.findFirst({
      where: { organizationId: orgId, ...(req.body.buildingId ? { id: String(req.body.buildingId) } : {}) },
      include: { meters: { where: { status: 'ACTIVE', meterType: 'MAIN_FEEDER' } }, solar: { where: { status: 'ACTIVE' } }, batteries: { where: { status: 'ACTIVE' } } },
    });
    if (!building) return res.status(404).json({ error: 'Building not found in this organization.' });
    if (building.meters.length !== 1) return res.status(422).json({ error: 'Optimization requires exactly one active main-feeder meter for the selected building. Configure non-overlapping meter mapping first.' });

    const meter = building.meters[0];
    const model = await prisma.forecastModel.findFirst({ where: { organizationId: orgId, buildingId: building.id, meterId: meter.id, status: 'READY', isActive: true }, orderBy: { version: 'desc' } });
    if (!model) return res.status(422).json({ error: 'No active ready A8 demand forecast model is configured for the main-feeder meter.' });
    const predictionWindowStart = new Date();
    const predictions = await prisma.prediction.findMany({
      where: { organizationId: orgId, buildingId: building.id, meterId: meter.id, forecastModelId: model.id, horizonHours: horizon,
        createdAt: { gte: new Date(predictionWindowStart.getTime() - 3600000) }, forecastTimestamp: { gte: predictionWindowStart } },
      orderBy: { forecastTimestamp: 'asc' }, take: horizon,
    });
    if (predictions.length !== horizon || predictions.some(p => p.intervalMinutes !== 60)) {
      return res.status(422).json({ error: `A complete ${horizon}-hour forecast from the active model is required. Run the A8 forecast first.` });
    }
    const timestamps = predictions.map(p => p.forecastTimestamp);
    if (timestamps.some((t, i) => i > 0 && t.getTime() - timestamps[i - 1].getTime() !== 3600000)) {
      return res.status(422).json({ error: 'Forecast intervals must be contiguous hourly intervals.' });
    }

    const [organization, tariffs] = await Promise.all([
      prisma.organization.findFirst({ where: { id: orgId }, select: { timezone: true, currency: true } }),
      prisma.electricityTariff.findMany({ where: { organizationId: orgId, ...(req.body.tariffId ? { id: String(req.body.tariffId) } : {}), effectiveFrom: { lte: timestamps[timestamps.length - 1] }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: timestamps[0] } }] }, include: { periods: true }, orderBy: { effectiveFrom: 'desc' } }),
    ]);
    if (!req.body.tariffId && tariffs.length > 1) return res.status(422).json({ error: 'Select a configured tariff when multiple tariffs cover the forecast horizon.' });
    const selectedTariffs = timestamps.map(timestamp => tariffs.find(t => timestamp >= t.effectiveFrom && (!t.effectiveTo || timestamp <= t.effectiveTo)) || null);
    if (selectedTariffs.some(t => t === null) || new Set(selectedTariffs.map(t => t!.id)).size !== 1) return res.status(422).json({ error: 'Exactly one consistent configured tariff must cover every forecast interval.' });
    const tariff = selectedTariffs[0]!;
    const rates = timestamps.map(timestamp => tariffRateAt({ timestamp }, [tariff], organization?.timezone || 'UTC'));
    if (rates.some(rate => rate === null)) return res.status(422).json({ error: 'The configured tariff does not provide exactly one applicable import rate for every forecast interval.' });
    if (tariff.demandWindowMinutes !== 60 && tariff.demandChargePerKw !== null) return res.status(422).json({ error: 'This optimization currently supports 60-minute demand-charge aggregation only.' });

    const solarForecast = req.body.solarGenerationKw;
    if (building.solar.length && (!Array.isArray(solarForecast) || solarForecast.length !== horizon || solarForecast.some((v: unknown) => typeof v !== 'number' || !Number.isFinite(v) || v < 0))) {
      return res.status(422).json({ error: 'An explicit non-negative hourly solar-generation forecast is required for this building. It will be labeled as a scenario input until a configured solar forecast source exists.' });
    }
    if (solarForecast !== undefined && (!Array.isArray(solarForecast) || solarForecast.length !== horizon || solarForecast.some((v: unknown) => typeof v !== 'number' || !Number.isFinite(v) || v < 0))) {
      return res.status(400).json({ error: 'solarGenerationKw must contain one non-negative number for every forecast hour.' });
    }

    if (building.batteries.length > 1) return res.status(422).json({ error: 'Multiple batteries require a dispatch topology configuration before optimization.' });
    const battery = building.batteries[0];
    let initialSoc = battery?.initialSoc;
    if (battery) {
      const latest = await prisma.batteryReading.findFirst({ where: { organizationId: orgId, batteryId: battery.id, stateOfChargeKwh: { not: null }, timestamp: { gte: new Date(Date.now() - 6 * 3600000) } }, orderBy: { timestamp: 'desc' } });
      if (latest?.stateOfChargeKwh !== null && latest?.stateOfChargeKwh !== undefined) initialSoc = latest.stateOfChargeKwh;
      if (battery.minSoc > battery.maxSoc || battery.maxSoc > battery.capacityKwh || initialSoc < battery.minSoc || initialSoc > battery.maxSoc || battery.chargingEfficiency <= 0 || battery.chargingEfficiency > 1 || battery.dischargingEfficiency <= 0 || battery.dischargingEfficiency > 1) {
        return res.status(422).json({ error: 'Battery configuration or latest state of charge is outside physical limits.' });
      }
    }

    const payload = {
      building_id: building.id, timestamps: timestamps.map(t => t.toISOString()), interval_hours: 1,
      predicted_demand_kw: predictions.map(p => p.predictedKwh),
      solar_generation_kw: solarForecast || timestamps.map(() => 0), tariffs: rates.map(r => Number(r)),
      tariff_periods: timestamps.map(timestamp => tariffPeriodAt({ timestamp }, tariff, organization?.timezone || 'UTC') || 'UNRESOLVED'),
      battery_available: Boolean(battery), ...(battery ? {
        battery_capacity_kwh: battery.capacityKwh, initial_soc_kwh: initialSoc, min_soc_kwh: battery.minSoc,
        max_soc_kwh: battery.maxSoc, max_charge_kw: battery.maxChargeKw, max_discharge_kw: battery.maxDischargeKw,
        charge_efficiency: battery.chargingEfficiency, discharge_efficiency: battery.dischargingEfficiency,
        battery_degradation_cost_per_kwh: battery.degradationCost, reserve_soc_kwh: battery.reserveSocKwh ?? undefined,
        final_soc_kwh: battery.finalSocKwh ?? undefined, allow_grid_charging: battery.allowGridCharging,
      } : {}),
      allow_grid_export: tariff.allowGridExport && tariff.exportPricePerKwh !== null,
      export_price_per_kwh: tariff.exportPricePerKwh === null ? undefined : Number(tariff.exportPricePerKwh),
      demand_charge_per_kw: tariff.demandChargePerKw === null ? undefined : Number(tariff.demandChargePerKw),
      demand_window_hours: tariff.demandWindowMinutes / 60,
      carbon_emission_kg_per_kwh: tariff.carbonEmissionKgPerKwh === null ? undefined : Number(tariff.carbonEmissionKgPerKwh),
      peak_demand_limit_kw: req.body.peakDemandLimitKw === undefined ? undefined : Number(req.body.peakDemandLimitKw),
      fixed_charge: 0,
      data_status: solarForecast ? 'SIMULATED' : 'FORECAST',
    };
    const response = await axios.post(`${config.pythonServiceUrl}/api/optimization/optimize`, payload, { timeout: 45000 });
    const result = response.data;
    result.limitations = [...(result.limitations || []), 'Forecast uncertainty bands are not propagated through the dispatch optimization.'];
    if (Number(tariff.fixedCharge) > 0) result.limitations.push('Configured fixed charges are excluded because the billing period is not defined for this forecast horizon.');
    if (solarForecast) result.limitations.push('Solar generation is an explicit scenario input; no weather forecast or solar uncertainty model is configured.');
    await prisma.$transaction(async tx => {
      const run = await tx.optimizationRun.create({ data: {
        organizationId: orgId, buildingId: building.id, optimizationType: result.optimization_type,
        baselineCost: result.total_baseline_cost, optimizedCost: result.total_optimized_cost,
        estimatedSavings: result.total_estimated_savings, solverStatus: result.solver_status,
        configuration: JSON.stringify({ ...payload, tariffId: tariff.id, tariffName: tariff.tariffName, modelId: model.id, modelVersion: `${model.algorithm}-v${model.version}`, currency: organization?.currency || null }),
        resultData: JSON.stringify({ ...result, currency: organization?.currency || null, savingsStatus: 'ESTIMATED_UNVERIFIED' }),
      } });
      if (!result.feasible) return;
      const simulated = result.data_status === 'SIMULATED';
      const limitations = [...(result.limitations || []), 'Optimization outputs are estimated operational evidence, not measured energy or verified savings.'];
      const suggestions: any[] = [];
      if (Number(result.total_battery_charge_kwh) > 0 && Number(result.total_battery_discharged_kwh) > 0) suggestions.push({
        type: 'SOLAR_BATTERY_DISPATCH', key: `A9:${run.id}:battery-dispatch`, title: `${simulated ? 'Simulated' : 'Forecast-based'} battery dispatch review`,
        description: 'Review this solver-produced charge/discharge schedule against operator requirements before acting. This record describes an optimization estimate and does not claim verified savings.',
        evidence: { optimizationRunId: run.id, solverStatus: result.solver_status, batteryChargeKwh: result.total_battery_charge_kwh,
          batteryDischargedKwh: result.total_battery_discharged_kwh, tariffPeriods: result.tariff_periods_used },
      });
      if (Number(result.peak_demand_reduction_kw) > 0.1) suggestions.push({
        type: 'PEAK_SHAVING', key: `A9:${run.id}:peak-dispatch`, title: `${simulated ? 'Simulated' : 'Forecast-based'} peak-demand dispatch review`,
        description: 'The optimized schedule reduces forecast peak grid import. Validate the demand interval, equipment availability and tariff billing window before operational use.',
        evidence: { optimizationRunId: run.id, baselinePeakKw: result.peak_demand_baseline_kw,
          optimizedPeakKw: result.peak_demand_optimized_kw, estimatedReductionKw: result.peak_demand_reduction_kw },
      });
      for (const suggestion of suggestions) await tx.recommendation.upsert({
        where: { organizationId_sourceKey: { organizationId: orgId, sourceKey: suggestion.key } },
        update: {},
        create: { organizationId: orgId, buildingId: building.id, sourceKey: suggestion.key,
          recommendationType: suggestion.type, generationSource: 'A9_OPTIMIZATION', title: suggestion.title,
          description: suggestion.description, evidence: JSON.stringify(suggestion.evidence),
          estimatedEnergySavingKwh: null, estimatedCostSaving: null, financialEstimateAvailable: false,
          calculationMethod: 'Solver-produced dispatch inspection; not a savings calculation.',
          assumptionsJson: JSON.stringify({ optimizationRunId: run.id, forecastModelId: model.id, tariffId: tariff.id, resultDataStatus: result.data_status }),
          limitationsJson: JSON.stringify(limitations), priority: Number(result.peak_demand_reduction_kw) > 10 ? 'HIGH' : 'MEDIUM',
          priorityReason: 'Prioritized from the solver schedule for human review; not an automated implementation instruction.',
          confidence: 0.5, status: 'NEW' },
      });
    });
    return res.json({ ...result, currency: organization?.currency || null,
      savingsStatus: result.feasible ? 'ESTIMATED_UNVERIFIED' : 'UNAVAILABLE',
      dataStatus: result.data_status, model: { id: model.id, algorithm: model.algorithm, version: model.version },
      solarInputStatus: solarForecast ? 'SIMULATED_INPUT' : building.solar.length ? 'UNAVAILABLE' : 'NO_INSTALLED_SOLAR' });
  } catch (error: any) {
    const status = error.response?.status === 422 ? 422 : 503;
    return res.status(status).json({ error: error.response?.data?.detail || 'Optimization service is unavailable. No fallback schedule was generated.' });
  }
};

export const getOptimizationHistory = async (req: Request, res: Response) => {
  try {
    const runs = await prisma.optimizationRun.findMany({ where: { organizationId: organizationId(req) }, orderBy: { createdAt: 'desc' }, take: 100,
      include: { building: { select: { id: true, name: true } } } });
    return res.json({ runs: runs.map(r => ({ id: r.id, building: r.building, optimizationType: r.optimizationType,
      baselineCost: r.baselineCost, optimizedCost: r.optimizedCost, estimatedSavings: r.estimatedSavings,
      solverStatus: r.solverStatus, createdAt: r.createdAt, resultData: JSON.parse(r.resultData) })) });
  } catch { return res.status(500).json({ error: 'Could not load optimization history.' }); }
};

export const getOptimizationRunById = async (req: Request, res: Response) => {
  const run = await prisma.optimizationRun.findFirst({ where: { id: req.params.id, organizationId: organizationId(req) }, include: { building: true } });
  if (!run) return res.status(404).json({ error: 'Optimization run not found.' });
  return res.json({ run: { ...run, configuration: JSON.parse(run.configuration), resultData: JSON.parse(run.resultData) } });
};
