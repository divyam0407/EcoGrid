import axios from 'axios';
import { prisma, config } from '../../config';
import { operationalFeatures } from './operational-features';

let activePoll: Promise<void> | null = null;
let timer: NodeJS.Timeout | null = null;
let lastPollAt: Date | null = null;
let lastFailureAt: Date | null = null;
let stopping = false;
let workerHandle: { stop: () => Promise<void>; health: typeof getForecastWorkerHealth } | null = null;

async function trainQueuedModel(modelId: string) {
  const claimed = await prisma.forecastModel.updateMany({ where: { id: modelId, status: 'QUEUED' }, data: { status: 'TRAINING', stage: 'LOADING_READINGS', progressPercent: 5 } });
  if (!claimed.count) return;
  const model = await prisma.forecastModel.findUnique({ where: { id: modelId } });
  if (!model) return;
  try {
    const [meter, organization] = await Promise.all([
      prisma.meter.findFirst({ where: { id: model.meterId, organizationId: model.organizationId, buildingId: model.buildingId } }),
      prisma.organization.findUnique({ where: { id: model.organizationId }, select: { timezone: true } }),
    ]);
    if (!meter) throw new Error('The training meter is no longer available in this organization.');
    const readings = await prisma.energyReading.findMany({
      where: { organizationId: model.organizationId, buildingId: model.buildingId, meterId: model.meterId, dataSource: model.dataSource },
      orderBy: { timestamp: 'asc' }, take: 100000,
      select: { timestamp: true, consumptionKwh: true, powerKw: true, intervalMinutes: true, qualityStatus: true, batchId: true },
    });
    const batchIds = [...new Set(readings.map((r) => r.batchId).filter((v): v is string => Boolean(v)))];
    const batches = batchIds.length ? await prisma.dataImportBatch.findMany({ where: { organizationId: model.organizationId, id: { in: batchIds } },
      select: { id: true, datasetName: true, dataSource: true, license: true, sourceUrl: true, originalFilename: true, fileSha256: true,
        sourceTimezone: true, rawUnit: true, preprocessingVer: true, files: { select: { fieldName: true, originalFilename: true, sha256: true, sizeBytes: true } } } }) : [];
    const operations = await operationalFeatures(model.organizationId, model.buildingId, readings.map((r) => r.timestamp), organization?.timezone || 'UTC');
    const operationsByTime = new Map(operations.map((v) => [v.timestamp, v]));
    await prisma.forecastModel.update({ where: { id: model.id }, data: { stage: 'TRAINING_AND_EVALUATION', progressPercent: 15 } });
    const response = await axios.post(`${config.pythonServiceUrl}/api/forecast/models/train`, {
      model_id: model.id, organization_id: model.organizationId, model_type: model.algorithm,
      timezone: organization?.timezone || 'UTC',
      historical_data: readings.map((r) => ({ timestamp: r.timestamp.toISOString(), consumption_kwh: r.consumptionKwh,
        power_kw: r.powerKw, interval_minutes: r.intervalMinutes, quality_status: r.qualityStatus,
        ...(operationsByTime.get(r.timestamp.toISOString()) || {}) })),
    }, { timeout: 20 * 60 * 1000, headers: { 'X-Import-Service-Token': config.importServiceToken } });
    const result = response.data;
    const metrics = result.metrics || {};
    await prisma.forecastModel.update({ where: { id: model.id }, data: {
      status: 'READY', stage: 'READY', progressPercent: 100, algorithm: result.algorithm,
      featureSetJson: JSON.stringify(result.feature_set || []), metricsJson: JSON.stringify(metrics),
      qualityReportJson: JSON.stringify(metrics.quality || {}), artifactPath: result.artifact_path,
      dataProvenanceJson: JSON.stringify({ dataSource: model.dataSource, inputReadings: readings.length, importBatches: batches }),
      artifactSha256: result.artifact_sha256,
      trainingRows: metrics.train_size || 0, validationRows: metrics.validation_size || 0, testRows: metrics.test_size || 0,
      trainStart: metrics.train_period?.[0] ? new Date(metrics.train_period[0]) : null,
      trainEnd: metrics.train_period?.[1] ? new Date(metrics.train_period[1]) : null,
      validationStart: metrics.validation_period?.[0] ? new Date(metrics.validation_period[0]) : null,
      validationEnd: metrics.validation_period?.[1] ? new Date(metrics.validation_period[1]) : null,
      testStart: metrics.test_period?.[0] ? new Date(metrics.test_period[0]) : null,
      testEnd: metrics.test_period?.[1] ? new Date(metrics.test_period[1]) : null, completedAt: new Date(), errorMessage: null,
    } });
  } catch (error: any) {
    await prisma.forecastModel.update({ where: { id: model.id }, data: { status: 'FAILED', stage: 'FAILED', progressPercent: 100,
      errorMessage: error.response?.data?.detail || (error.message || 'Training failed').slice(0, 1000), completedAt: new Date() } });
  }
}

export function startForecastTrainingWorker() {
  if (workerHandle) return workerHandle;
  const poll = async () => {
    if (activePoll || stopping) return;
    lastPollAt = new Date();
    activePoll = (async () => {
    try {
      // Training calls time out at 20 minutes; older claims can be safely re-queued after a worker crash.
      const staleBefore = new Date(Date.now() - 30 * 60 * 1000);
      await prisma.forecastModel.updateMany({ where: { status: 'TRAINING', updatedAt: { lt: staleBefore } }, data: {
        status: 'QUEUED', stage: 'QUEUED', errorMessage: 'Training was re-queued after an interrupted worker claim.', completedAt: null, progressPercent: 0,
      } });
      const queued = await prisma.forecastModel.findFirst({ where: { status: 'QUEUED' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
      if (queued) await trainQueuedModel(queued.id);
    } catch (error: any) {
      lastFailureAt = new Date();
      process.stderr.write(`${JSON.stringify({ level: 'error', event: 'forecast_worker_poll_failed', errorType: error?.name || 'Error' })}\n`);
    }
    })().finally(() => { activePoll = null; });
    return activePoll;
  };
  stopping = false;
  void poll();
  timer = setInterval(() => void poll(), 1500);
  timer.unref();
  workerHandle = {
    stop: async () => {
      stopping = true;
      if (timer) clearInterval(timer);
      timer = null;
      if (activePoll) await activePoll;
      workerHandle = null;
    },
    health: getForecastWorkerHealth,
  };
  return workerHandle;
}

export function getForecastWorkerHealth() {
  return { state: timer && !stopping ? 'RUNNING' : 'STOPPED', processing: Boolean(activePoll),
    lastPollAt: lastPollAt?.toISOString() || null, lastFailureAt: lastFailureAt?.toISOString() || null };
}
