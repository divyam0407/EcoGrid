import { Request, Response } from 'express';
import { prisma, config } from '../../config';
import axios from 'axios';

export const runForecast = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId!;
    const { buildingId, horizonHours = 24, modelType = 'xgboost', dataSource = 'SYNTHETIC_DEMO' } = req.body;

    const where: any = { organizationId: orgId };
    if (buildingId && buildingId !== 'all') where.buildingId = String(buildingId);
    if (dataSource !== 'all') where.dataSource = String(dataSource);

    const historicalReadings = await prisma.energyReading.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      take: 2000,
      include: { building: true },
    });

    if (historicalReadings.length === 0) {
      return res.status(400).json({ error: 'No historical energy readings found to train forecasting models.' });
    }

    if (historicalReadings.length < 48) {
      return res.status(422).json({ error: 'At least 48 readings from the selected source are required; no synthetic fallback is generated.' });
    }

    // Format payload for Python forecasting engine
    const payload = {
      building_id: buildingId || 'all',
      horizon_hours: horizonHours,
      model_type: modelType,
      historical_data: historicalReadings.map((r) => ({
        timestamp: r.sourceLocalTime || r.timestamp.toISOString(),
        consumption_kwh: r.consumptionKwh,
        power_kw: r.powerKw,
      })),
      future_operational_data: [],
    };

    let forecastData;
    try {
      const pyRes = await axios.post(`${config.pythonServiceUrl}/api/forecast/predict`, payload, { timeout: 15000 });
      forecastData = pyRes.data;
    } catch (err: any) {
      console.warn('Python forecast service unavailable:', err.message);
      return res.status(503).json({ error: 'Forecast service unavailable. No synthetic fallback forecast was generated.' });
    }

    // Persist forecasts in database
    const bldgId = buildingId && buildingId !== 'all' ? buildingId : historicalReadings[0].buildingId;
    await prisma.prediction.createMany({
      data: forecastData.forecasts.slice(0, 48).map((f: any) => ({
        organizationId: orgId,
        buildingId: bldgId,
        modelVersion: forecastData.model_version,
        predictionType: horizonHours > 24 ? '7_DAY_DEMAND' : '24_HOUR_DEMAND',
        forecastTimestamp: new Date(f.timestamp),
        predictedKwh: f.predicted_consumption_kwh,
        dataSource: dataSource === 'all' ? 'MIXED_SOURCE' : String(dataSource),
        confidenceLower: f.confidence_lower,
        confidenceUpper: f.confidence_upper,
      })),
    });

    return res.json(forecastData);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getForecastHistory = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId!;
    const { buildingId, dataSource } = req.query;

    const predictions = await prisma.prediction.findMany({
      where: {
        organizationId: orgId,
        ...(buildingId ? { buildingId: String(buildingId) } : {}),
        ...(dataSource && dataSource !== 'all' ? { dataSource: String(dataSource) } : {}),
      },
      orderBy: { forecastTimestamp: 'asc' },
      take: 168,
    });

    return res.json({ predictions });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
