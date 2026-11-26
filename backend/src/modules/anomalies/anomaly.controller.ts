import { Request, Response } from 'express';
import { prisma, config } from '../../config';
import axios from 'axios';
import { operationalFeatures } from '../forecasts/operational-features';

export const detectAnomalies = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId!;
    const { buildingId, method = 'combined', sensitivity = 2.5, dataSource = 'SYNTHETIC_DEMO' } = req.body;

    const where: any = { organizationId: orgId };
    if (buildingId && buildingId !== 'all') where.buildingId = String(buildingId);
    if (dataSource !== 'all') where.dataSource = String(dataSource);

    const readings = await prisma.energyReading.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      take: 10000,
      include: { building: true, room: true, meter: true },
    });

    if (readings.length === 0) {
      return res.status(400).json({ error: 'No energy readings available for anomaly detection.' });
    }

    const organization = await prisma.organization.findUnique({ where: { id: orgId }, select: { timezone: true } });
    const operationsByBuilding = new Map<string, Map<string, any>>();
    for (const bldgId of new Set(readings.map((r) => r.buildingId))) {
      const subset = readings.filter((r) => r.buildingId === bldgId);
      const operations = await operationalFeatures(orgId, bldgId, subset.map((r) => r.timestamp), organization?.timezone || 'UTC');
      operationsByBuilding.set(bldgId, new Map(operations.map((v) => [v.timestamp, v])));
    }
    const payload = {
      method,
      sensitivity,
      timezone: organization?.timezone || 'UTC',
      readings: readings.map((r) => ({
        timestamp: r.timestamp.toISOString(),
        consumption_kwh: r.consumptionKwh,
        power_kw: r.powerKw,
        building_id: r.buildingId,
        room_id: r.roomId,
        meter_id: r.meterId,
        quality_status: r.qualityStatus,
        ...(operationsByBuilding.get(r.buildingId)?.get(r.timestamp.toISOString()) || {}),
        expected_baseline_kwh: null,
      })),
    };

    let detectionData;
    try {
      const pyRes = await axios.post(`${config.pythonServiceUrl}/api/anomalies/detect`, payload, { timeout: 120000,
        headers: { 'X-Import-Service-Token': config.importServiceToken } });
      detectionData = pyRes.data;
    } catch (err: any) {
      console.warn('Python anomaly service unavailable:', err.message);
      return res.status(503).json({ error: 'Anomaly service unavailable. No synthetic anomalies were generated.' });
    }

    // Evidence is tenant-scoped and idempotent across repeated scans.
    const evidence = detectionData.anomalies.map((a: any) => ({
          organizationId: orgId,
          buildingId: a.building_id,
          meterId: a.meter_id,
          roomId: a.room_id,
          anomalyType: a.anomaly_type.toUpperCase(),
          dataSource: dataSource === 'all' ? 'MIXED_SOURCE' : String(dataSource),
          severity: a.severity.toUpperCase(),
          expectedValue: a.expected_value,
          observedValue: a.observed_value,
          deviation: a.deviation_kwh,
          deviationPercent: a.deviation_percent,
          description: a.description,
          suggestedAction: a.suggested_action,
          detectionMethod: a.detection_method,
          baselineSampleCount: a.baseline_sample_count,
          qualityReportJson: JSON.stringify({ qualityStatus: a.quality_status || 'UNKNOWN', intervalMinutes: a.interval_minutes || null,
            evidence: 'only valid measured/validated/calculated interval readings considered' }),
          operationalContextJson: JSON.stringify(a.operational_context || { holiday: 'unavailable', timetable: 'unavailable', occupancy: 'not used' }),
          sourceKey: `${dataSource}:${a.meter_id}:${new Date(a.timestamp).toISOString()}:${a.detection_method}`,
          status: 'OPEN',
          detectedAt: new Date(a.timestamp),
    }));
    if (evidence.length) await prisma.anomaly.createMany({ data: evidence, skipDuplicates: true });

    return res.json(detectionData);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getAnomalies = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId!;
    const { buildingId, severity, status, dataSource } = req.query;

    const where: any = { organizationId: orgId };
    if (buildingId) where.buildingId = String(buildingId);
    if (severity) where.severity = String(severity).toUpperCase();
    if (status) where.status = String(status).toUpperCase();
    if (dataSource && dataSource !== 'all') where.dataSource = String(dataSource);

    const anomalies = await prisma.anomaly.findMany({
      where,
      orderBy: { detectedAt: 'desc' },
      include: {
        building: { select: { id: true, name: true } },
        room: { select: { id: true, roomNumber: true } },
        meter: { select: { id: true, meterName: true } },
      },
      take: 100,
    });

    return res.json({ anomalies });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const updateAnomalyStatus = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId!;
    const { id } = req.params;
    const { status, resolutionNotes } = req.body;

    const validStatuses = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'FALSE_POSITIVE'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const result = await prisma.anomaly.updateMany({
      where: { id, organizationId: orgId },
      data: { status },
    });
    if (!result.count) return res.status(404).json({ error: 'Anomaly not found.' });
    const anomaly = await prisma.anomaly.findFirst({ where: { id, organizationId: orgId } });

    return res.json({ anomaly });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
