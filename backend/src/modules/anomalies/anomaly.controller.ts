import { Request, Response } from 'express';
import { prisma, config } from '../../config';
import axios from 'axios';

export const detectAnomalies = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId!;
    const { buildingId, method = 'combined', sensitivity = 2.5, dataSource = 'SYNTHETIC_DEMO' } = req.body;

    const where: any = { organizationId: orgId };
    if (buildingId && buildingId !== 'all') where.buildingId = String(buildingId);
    if (dataSource !== 'all') where.dataSource = String(dataSource);

    const readings = await prisma.energyReading.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 1200,
      include: { building: true, room: true, meter: true },
    });

    if (readings.length === 0) {
      return res.status(400).json({ error: 'No energy readings available for anomaly detection.' });
    }

    const payload = {
      method,
      sensitivity,
      readings: readings.map((r) => ({
        timestamp: r.sourceLocalTime || r.timestamp.toISOString(),
        consumption_kwh: r.consumptionKwh,
        power_kw: r.powerKw,
        building_id: r.building?.name || r.buildingId,
        room_id: r.room?.roomNumber,
        meter_id: r.meter?.meterName,
        expected_baseline_kwh: null,
      })),
    };

    let detectionData;
    try {
      const pyRes = await axios.post(`${config.pythonServiceUrl}/api/anomalies/detect`, payload, { timeout: 15000 });
      detectionData = pyRes.data;
    } catch (err: any) {
      console.warn('Python anomaly service unavailable:', err.message);
      return res.status(503).json({ error: 'Anomaly service unavailable. No synthetic anomalies were generated.' });
    }

    // Save newly detected anomalies to database
    for (const a of detectionData.anomalies) {
      const bldgMatch = readings.find((r) => (r.building?.name || '') === a.building_id) || readings[0];
      await prisma.anomaly.create({
        data: {
          organizationId: orgId,
          buildingId: bldgMatch.buildingId,
          meterId: bldgMatch.meterId,
          roomId: bldgMatch.roomId,
          anomalyType: a.anomaly_type.toUpperCase(),
          dataSource: dataSource === 'all' ? 'MIXED_SOURCE' : String(dataSource),
          severity: a.severity.toUpperCase(),
          expectedValue: a.expected_value,
          observedValue: a.observed_value,
          deviation: a.deviation_kwh,
          deviationPercent: a.deviation_percent,
          description: a.description,
          suggestedAction: a.suggested_action,
          status: 'OPEN',
          detectedAt: new Date(a.timestamp),
        },
      });
    }

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
