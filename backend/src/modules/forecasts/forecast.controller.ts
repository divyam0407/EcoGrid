import { Request, Response } from 'express';
import { prisma, config } from '../../config';
import '../../middleware/auth';
import axios from 'axios';
import { operationalFeatures } from './operational-features';

const org = (req: Request) => req.user!.organizationId;
const modelSummary = (model: any) => {
  const { artifactPath, metricsJson, qualityReportJson, featureSetJson, dataProvenanceJson, ...safe } = model;
  return { ...safe, metrics: metricsJson ? JSON.parse(metricsJson) : null,
    qualityReport: qualityReportJson ? JSON.parse(qualityReportJson) : null,
    dataProvenance: dataProvenanceJson ? JSON.parse(dataProvenanceJson) : null,
    features: featureSetJson ? JSON.parse(featureSetJson) : [] };
};

export const getForecastOptions = async (req: Request, res: Response) => {
  const meters = await prisma.meter.findMany({ where: { organizationId: org(req), status: 'ACTIVE' },
    select: { id: true, meterName: true, dataSource: true, buildingId: true, building: { select: { name: true } } }, orderBy: { meterName: 'asc' } });
  return res.json({ meters });
};

export const requestForecastTraining = async (req: Request, res: Response) => {
  try {
    const organizationId = org(req); const { meterId, dataSource, modelType = 'auto' } = req.body;
    if (!meterId || !dataSource || !['auto', 'baseline', 'random_forest', 'xgboost'].includes(modelType)) return res.status(400).json({ error: 'Select a meter, data source and supported model selection.' });
    const meter = await prisma.meter.findFirst({ where: { id: String(meterId), organizationId }, select: { id: true, buildingId: true } });
    if (!meter) return res.status(404).json({ error: 'Meter not found in this organization.' });
    const [{ _max }, rows] = await Promise.all([
      prisma.forecastModel.aggregate({ where: { organizationId, meterId: meter.id, dataSource: String(dataSource) }, _max: { version: true } }),
      prisma.energyReading.count({ where: { organizationId, meterId: meter.id, buildingId: meter.buildingId, dataSource: String(dataSource) } }),
    ]);
    if (!rows) return res.status(422).json({ error: 'No readings exist for this meter and data source.' });
    const training = await prisma.forecastModel.create({ data: {
      organizationId, buildingId: meter.buildingId, meterId: meter.id, dataSource: String(dataSource),
      version: (_max.version || 0) + 1, algorithm: modelType, status: 'QUEUED', stage: 'QUEUED', progressPercent: 0,
      featureSetJson: '[]', trainingConfigJson: JSON.stringify({ requestedAlgorithm: modelType, chronologicalSplit: '70/15/15', minHistoryDays: 28 }),
    } });
    return res.status(202).json({ model: modelSummary(training), message: 'Training queued. Poll this model for progress and result.' });
  } catch (error: any) { return res.status(500).json({ error: 'Could not queue forecast training.' }); }
};

export const listForecastModels = async (req: Request, res: Response) => {
  const models = await prisma.forecastModel.findMany({ where: { organizationId: org(req), ...(req.query.meterId ? { meterId: String(req.query.meterId) } : {}) }, orderBy: [{ createdAt: 'desc' }], take: 100 });
  return res.json({ models: models.map(modelSummary) });
};

export const getForecastModel = async (req: Request, res: Response) => {
  const model = await prisma.forecastModel.findFirst({ where: { id: req.params.modelId, organizationId: org(req) } });
  if (!model) return res.status(404).json({ error: 'Forecast model not found.' });
  return res.json({ model: modelSummary(model) });
};

export const retryForecastTraining = async (req: Request, res: Response) => {
  const original = await prisma.forecastModel.findFirst({ where: { id: req.params.modelId, organizationId: org(req), status: 'FAILED' } });
  if (!original) return res.status(404).json({ error: 'Failed model job not found in this organization.' });
  const version = await prisma.forecastModel.aggregate({ where: { organizationId: org(req), meterId: original.meterId, dataSource: original.dataSource }, _max: { version: true } });
  const retry = await prisma.forecastModel.create({ data: { organizationId: original.organizationId, buildingId: original.buildingId, meterId: original.meterId,
    dataSource: original.dataSource, version: (version._max.version || 0) + 1, algorithm: original.algorithm, status: 'QUEUED', stage: 'QUEUED',
    featureSetJson: '[]', trainingConfigJson: original.trainingConfigJson, retryOfId: original.id } });
  return res.status(202).json({ model: modelSummary(retry) });
};

export const activateForecastModel = async (req: Request, res: Response) => {
  const model = await prisma.forecastModel.findFirst({ where: { id: req.params.modelId, organizationId: org(req), status: 'READY' } });
  if (!model) return res.status(404).json({ error: 'Only a ready model in this organization can be activated.' });
  await prisma.$transaction([
    prisma.forecastModel.updateMany({ where: { organizationId: org(req), meterId: model.meterId, dataSource: model.dataSource }, data: { isActive: false } }),
    prisma.forecastModel.update({ where: { id: model.id }, data: { isActive: true } }),
  ]);
  return res.json({ model: modelSummary(await prisma.forecastModel.findUnique({ where: { id: model.id } })) });
};

export const runForecast = async (req: Request, res: Response) => {
  try {
    const organizationId = org(req); const { meterId, modelId, horizonHours = 24 } = req.body;
    if (!meterId || ![24, 168].includes(Number(horizonHours))) return res.status(400).json({ error: 'Select one meter and a supported 24 or 168 hour horizon.' });
    const model = await prisma.forecastModel.findFirst({ where: { organizationId, meterId: String(meterId), status: 'READY', isActive: true, ...(modelId ? { id: String(modelId) } : {}) } });
    if (!model) return res.status(422).json({ error: 'No active ready model exists for this meter and source. Train and activate a model first.' });
    const meter = await prisma.meter.findFirst({ where: { id: model.meterId, organizationId, buildingId: model.buildingId } });
    if (!meter) return res.status(404).json({ error: 'Meter not found in this organization.' });
    const now = new Date();
    const nextUtcHour = new Date(Math.ceil(now.getTime() / 3600000) * 3600000);
    const readings = await prisma.energyReading.findMany({ where: { organizationId, meterId: model.meterId, buildingId: model.buildingId, dataSource: model.dataSource, timestamp: { lte: now } },
      orderBy: { timestamp: 'desc' }, take: 2000, select: { timestamp: true, consumptionKwh: true, powerKw: true, intervalMinutes: true, qualityStatus: true } });
    const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
    const orderedReadings = readings.reverse();
    const historicalOperationalData = await operationalFeatures(organizationId, model.buildingId, orderedReadings.map((r) => r.timestamp), organization?.timezone || 'UTC');
    const historicalOpsByTime = new Map(historicalOperationalData.map((v) => [v.timestamp, v]));
    if (!orderedReadings.length) return res.status(422).json({ error: 'No non-future readings are available for forecasting.' });
    const lastTimestamp = orderedReadings[orderedReadings.length - 1].timestamp;
    const forecastStart = new Date(Math.max(nextUtcHour.getTime(), Math.ceil((lastTimestamp.getTime() + 1) / 3600000) * 3600000));
    const futureTimestamps = Array.from({ length: Number(horizonHours) + 25 }, (_, i) => new Date(forecastStart.getTime() - (25 - i) * 3600000));
    const futureOperationalData = await operationalFeatures(organizationId, model.buildingId, futureTimestamps, organization?.timezone || 'UTC');
    const response = await axios.post(`${config.pythonServiceUrl}/api/forecast/models/${model.id}/predict`, {
      organization_id: organizationId, horizon_hours: Number(horizonHours), forecast_start: forecastStart.toISOString(),
      historical_data: orderedReadings.map((r) => ({ timestamp: r.timestamp.toISOString(), consumption_kwh: r.consumptionKwh, power_kw: r.powerKw,
        interval_minutes: r.intervalMinutes, quality_status: r.qualityStatus, ...(historicalOpsByTime.get(r.timestamp.toISOString()) || {}) })), timezone: organization?.timezone || 'UTC',
      future_operational_data: futureOperationalData,
    }, { timeout: 120000, headers: { 'X-Import-Service-Token': config.importServiceToken } });
    const predictions = response.data.forecasts || [];
    await prisma.$transaction(predictions.map((f: any, index: number) => prisma.prediction.upsert({
      where: { organizationId_sourcePredictionKey: { organizationId, sourcePredictionKey: `${model.id}:${f.timestamp}` } },
      create: {
      organizationId, buildingId: model.buildingId, meterId: model.meterId, forecastModelId: model.id, modelVersion: `${model.algorithm}-v${model.version}`,
      predictionType: Number(horizonHours) > 24 ? '7_DAY_DEMAND' : '24_HOUR_DEMAND', forecastTimestamp: new Date(f.timestamp), predictedKwh: f.predicted_consumption_kwh,
      dataSource: model.dataSource, confidenceLower: f.confidence_lower, confidenceUpper: f.confidence_upper, horizonHours: Number(horizonHours), leadHours: index + 1, intervalMinutes: 60,
      sourcePredictionKey: `${model.id}:${f.timestamp}`,
      },
      update: { modelVersion: `${model.algorithm}-v${model.version}`, predictedKwh: f.predicted_consumption_kwh,
        confidenceLower: f.confidence_lower, confidenceUpper: f.confidence_upper, horizonHours: Number(horizonHours), leadHours: index + 1, createdAt: new Date() },
    })));
    return res.json({ ...response.data, forecastStart: forecastStart.toISOString(), metrics: model.metricsJson ? JSON.parse(model.metricsJson) : null, model: modelSummary(model), dataSource: model.dataSource });
  } catch (error: any) { return res.status(error.response?.status || 503).json({ error: error.response?.data?.detail || 'Forecast service is unavailable.' }); }
};

export const getForecastHistory = async (req: Request, res: Response) => {
  const predictions = await prisma.prediction.findMany({ where: { organizationId: org(req),
    ...(req.query.buildingId ? { buildingId: String(req.query.buildingId) } : {}), ...(req.query.meterId ? { meterId: String(req.query.meterId) } : {}),
    ...(req.query.dataSource && req.query.dataSource !== 'all' ? { dataSource: String(req.query.dataSource) } : {}) },
    orderBy: { forecastTimestamp: 'desc' }, take: Math.min(1000, Number(req.query.limit) || 168), include: { forecastModel: { select: { algorithm: true, version: true } } } });
  return res.json({ predictions });
};

export const getPredictionMonitoring = async (req: Request, res: Response) => {
  const organizationId = org(req); const now = new Date();
  const pending = await prisma.prediction.findMany({ where: { organizationId, actualKwh: null, forecastTimestamp: { lt: now }, meterId: { not: null },
    ...(req.query.meterId ? { meterId: String(req.query.meterId) } : {}), ...(req.query.modelId ? { forecastModelId: String(req.query.modelId) } : {}) }, orderBy: { forecastTimestamp: 'asc' }, take: 2000 });
  for (const prediction of pending) {
    if (!prediction.meterId) continue;
    const from = prediction.forecastTimestamp; const to = new Date(from.getTime() + prediction.intervalMinutes * 60000);
    const readings = await prisma.energyReading.findMany({ where: { organizationId, meterId: prediction.meterId, buildingId: prediction.buildingId,
      timestamp: { gte: from, lt: to }, qualityStatus: { in: ['VALIDATED', 'MEASURED', 'CALCULATED_INTERVAL'] } }, select: { consumptionKwh: true, intervalMinutes: true } });
    const expected = Math.max(1, Math.round(prediction.intervalMinutes / Math.max(...readings.map((r) => r.intervalMinutes), 1)));
    if (!readings.length || readings.length < Math.ceil(expected * .75) || readings.some((r) => r.intervalMinutes > prediction.intervalMinutes)) continue;
    const actualKwh = readings.reduce((sum, reading) => sum + reading.consumptionKwh, 0);
    await prisma.prediction.update({ where: { id: prediction.id }, data: { actualKwh } });
  }
  const matched = await prisma.prediction.findMany({ where: { organizationId, actualKwh: { not: null }, ...(req.query.meterId ? { meterId: String(req.query.meterId) } : {}),
    ...(req.query.modelId ? { forecastModelId: String(req.query.modelId) } : {}) }, select: { predictedKwh: true, actualKwh: true, horizonHours: true, meterId: true, buildingId: true, forecastModelId: true, forecastTimestamp: true }, orderBy: { forecastTimestamp: 'asc' }, take: 10000 });
  const metrics = (rows: typeof matched) => {
    const y = rows.map((r) => r.actualKwh!); const p = rows.map((r) => r.predictedKwh); const n = rows.length;
    if (!n) return { n: 0, mae: null, rmse: null, mape: null, wape: null };
    const errors = y.map((v, i) => Math.abs(v - p[i])); const mae = errors.reduce((a,b)=>a+b,0)/n;
    return { n, mae, rmse: Math.sqrt(errors.reduce((a,b)=>a+b*b,0)/n), mape: y.some((v)=>Math.abs(v)>.1) ? y.reduce((a,v,i)=>a+(Math.abs(v)>.1?Math.abs(v-p[i])/Math.abs(v):0),0)/y.filter((v)=>Math.abs(v)>.1).length*100 : null,
      wape: y.reduce((a,v,i)=>a+Math.abs(v-p[i]),0)/(y.reduce((a,v)=>a+Math.abs(v),0)||1)*100 };
  };
  const groups = new Map<string, typeof matched>();
  for (const row of matched) { const key = `${row.forecastModelId}|${row.meterId}|${row.buildingId}|${row.horizonHours}`; groups.set(key, [...(groups.get(key) || []), row]); }
  return res.json({ metrics: metrics(matched), byModelMeterBuildingHorizon: [...groups.entries()].map(([key, rows]) => ({ key, ...metrics(rows) })), evaluatedCount: matched.length,
    awaitingActualCount: await prisma.prediction.count({ where: { organizationId, actualKwh: null, forecastTimestamp: { lt: now } } }) });
};
