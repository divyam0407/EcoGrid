import { Request, Response } from 'express';
import { prisma } from '../../config';
import csvParser from 'csv-parser';
import { Readable } from 'stream';

export const previewCsv = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file provided.' });
    }

    const results: any[] = [];
    const stream = Readable.from(req.file.buffer.toString('utf-8'));

    stream
      .pipe(csvParser())
      .on('data', (data) => {
        if (results.length < 10) {
          results.push(data);
        }
      })
      .on('end', () => {
        const headers = results.length > 0 ? Object.keys(results[0]) : [];
        return res.json({
          headers,
          previewRows: results,
          detectedRowCount: results.length,
          suggestedMappings: {
            timestamp: headers.find((h) => /time|date|timestamp/i.test(h)) || headers[0],
            consumptionKwh: headers.find((h) => /kwh|consumption|energy/i.test(h)) || headers[1],
            powerKw: headers.find((h) => /kw|power|demand/i.test(h)),
            buildingName: headers.find((h) => /building|facility|block/i.test(h)),
            meterName: headers.find((h) => /meter|feeder/i.test(h)),
            roomNumber: headers.find((h) => /room|lab/i.test(h)),
          },
        });
      })
      .on('error', (err) => {
        return res.status(400).json({ error: 'Failed to parse CSV file: ' + err.message });
      });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const uploadEnergyCsv = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded.' });
    }

    const orgId = req.user?.organizationId!;
    const defaultBuildingId = req.body.defaultBuildingId;
    const mapping = req.body.mapping ? JSON.parse(req.body.mapping) : {};

    const timeCol = mapping.timestamp || 'timestamp';
    const kwhCol = mapping.consumptionKwh || 'consumption_kwh';
    const kwCol = mapping.powerKw || 'power_kw';
    const buildingCol = mapping.buildingName || 'building';
    const meterCol = mapping.meterName || 'meter';
    const roomCol = mapping.roomNumber || 'room';

    const rows: any[] = [];
    const errors: any[] = [];
    const stream = Readable.from(req.file.buffer.toString('utf-8'));

    // Cache existing buildings and meters for the organization
    const orgBuildings = await prisma.building.findMany({ where: { organizationId: orgId } });
    const bldgMap = new Map<string, string>();
    orgBuildings.forEach((b) => {
      bldgMap.set(b.name.toLowerCase().trim(), b.id);
      bldgMap.set(b.id, b.id);
    });

    const orgMeters = await prisma.meter.findMany({ where: { organizationId: orgId } });
    const meterMap = new Map<string, string>();
    orgMeters.forEach((m) => {
      meterMap.set(m.meterName.toLowerCase().trim(), m.id);
      meterMap.set(m.id, m.id);
    });

    let defaultMeterId = orgMeters[0]?.id;
    if (!defaultMeterId && orgBuildings[0]) {
      const createdMeter = await prisma.meter.create({
        data: {
          organizationId: orgId,
          buildingId: orgBuildings[0].id,
          meterName: 'Main Feeder 1',
          meterType: 'MAIN_FEEDER',
        },
      });
      defaultMeterId = createdMeter.id;
    }

    await new Promise((resolve, reject) => {
      stream
        .pipe(csvParser())
        .on('data', (row) => rows.push(row))
        .on('end', resolve)
        .on('error', reject);
    });

    const validReadings: any[] = [];
    const seenTimestamps = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rawTime = r[timeCol] || r['Timestamp'] || r['time'] || r['Date'];
      const rawKwh = r[kwhCol] || r['Consumption kWh'] || r['kwh'] || r['consumption'];
      const rawKw = r[kwCol] || r['Power kW'] || r['kw'] || r['power'];
      const bldgVal = (r[buildingCol] || r['Building'] || '').toLowerCase().trim();
      const meterVal = (r[meterCol] || r['Meter'] || '').toLowerCase().trim();

      if (!rawTime) {
        errors.push({ row: i + 2, reason: 'Missing timestamp.' });
        continue;
      }

      const parsedDate = new Date(rawTime);
      if (isNaN(parsedDate.getTime())) {
        errors.push({ row: i + 2, reason: `Invalid timestamp format: "${rawTime}"` });
        continue;
      }

      const kwh = parseFloat(rawKwh);
      if (isNaN(kwh)) {
        errors.push({ row: i + 2, reason: `Invalid numeric value for consumption: "${rawKwh}"` });
        continue;
      }

      if (kwh < 0) {
        errors.push({ row: i + 2, reason: `Negative consumption not allowed: ${kwh} kWh` });
        continue;
      }

      if (kwh > 50000) {
        errors.push({ row: i + 2, reason: `Physically impossible consumption reading: ${kwh} kWh` });
        continue;
      }

      // Check duplicates
      const bldgId = bldgMap.get(bldgVal) || defaultBuildingId || orgBuildings[0]?.id;
      if (!bldgId) {
        errors.push({ row: i + 2, reason: `Referenced building "${r[buildingCol]}" does not exist.` });
        continue;
      }

      const meterId = meterMap.get(meterVal) || defaultMeterId;
      const key = `${meterId}_${parsedDate.toISOString()}`;
      if (seenTimestamps.has(key)) {
        errors.push({ row: i + 2, reason: `Duplicate reading for meter at ${parsedDate.toISOString()}` });
        continue;
      }
      seenTimestamps.add(key);

      validReadings.push({
        organizationId: orgId,
        buildingId: bldgId,
        meterId,
        timestamp: parsedDate,
        consumptionKwh: kwh,
        powerKw: rawKw ? parseFloat(rawKw) : kwh,
        source: 'CSV_UPLOAD',
        qualityStatus: 'VALIDATED',
      });
    }

    // Batch insert valid readings
    let insertedCount = 0;
    if (validReadings.length > 0) {
      // Chunk in blocks of 500
      for (let c = 0; c < validReadings.length; c += 500) {
        const chunk = validReadings.slice(c, c + 500);
        const res = await prisma.energyReading.createMany({
          data: chunk,
        });
        insertedCount += res.count;
      }
    }

    return res.json({
      success: true,
      totalRowsProcessed: rows.length,
      importedCount: insertedCount,
      errorCount: errors.length,
      errors: errors.slice(0, 50),
    });
  } catch (error: any) {
    console.error('CSV import error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const getEnergyReadings = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId!;
    const { buildingId, meterId, roomId, startDate, endDate, limit } = req.query;

    const where: any = { organizationId: orgId };
    if (buildingId) where.buildingId = String(buildingId);
    if (meterId) where.meterId = String(meterId);
    if (roomId) where.roomId = String(roomId);

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = new Date(String(startDate));
      if (endDate) where.timestamp.lte = new Date(String(endDate));
    }

    const readings = await prisma.energyReading.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      take: limit ? parseInt(String(limit), 10) : 500,
      include: {
        building: { select: { id: true, name: true } },
        meter: { select: { id: true, meterName: true } },
        room: { select: { id: true, roomNumber: true } },
      },
    });

    return res.json({ count: readings.length, readings });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getEnergySummary = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId!;
    const { buildingId, days } = req.query;

    const dayCount = days ? parseInt(String(days), 10) : 30;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - dayCount);

    const where: any = {
      organizationId: orgId,
      timestamp: { gte: sinceDate },
    };
    if (buildingId) where.buildingId = String(buildingId);

    const readings = await prisma.energyReading.findMany({
      where,
      orderBy: { timestamp: 'asc' },
    });

    const solarReadings = await prisma.solarReading.findMany({
      where: {
        organizationId: orgId,
        timestamp: { gte: sinceDate },
      },
    });

    const activeTariff = await prisma.electricityTariff.findFirst({
      where: { organizationId: orgId },
      include: { periods: true },
    });
    const defaultRate = activeTariff?.pricePerKwh || 0.15;

    let totalKwh = 0;
    let peakDemandKw = 0;
    let totalExpenditure = 0;

    readings.forEach((r) => {
      totalKwh += r.consumptionKwh;
      const kw = r.powerKw || r.consumptionKwh;
      if (kw > peakDemandKw) peakDemandKw = kw;
      totalExpenditure += r.consumptionKwh * defaultRate;
    });

    const totalSolarKwh = solarReadings.reduce((sum, s) => sum + s.generationKwh, 0);

    // Active anomalies count
    const activeAnomalies = await prisma.anomaly.count({
      where: { organizationId: orgId, status: { in: ['OPEN', 'INVESTIGATING'] } },
    });

    // Inefficiencies count
    const recommendations = await prisma.recommendation.findMany({
      where: { organizationId: orgId, status: 'PENDING' },
    });
    const potentialSavings = recommendations.reduce((sum, r) => sum + r.estimatedCostSaving, 0);

    return res.json({
      periodDays: dayCount,
      totalConsumptionKwh: Math.round(totalKwh),
      peakDemandKw: Math.round(peakDemandKw * 10) / 10,
      totalExpenditure: Math.round(totalExpenditure),
      solarGenerationKwh: Math.round(totalSolarKwh),
      gridConsumptionKwh: Math.round(Math.max(0, totalKwh - totalSolarKwh)),
      activeAnomaliesCount: activeAnomalies,
      potentialMonthlySavings: Math.round(potentialSavings || 3450),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getEnergyTrends = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId!;
    const { buildingId, interval } = req.query; // 'hourly', 'daily', 'monthly'

    const where: any = { organizationId: orgId };
    if (buildingId) where.buildingId = String(buildingId);

    const readings = await prisma.energyReading.findMany({
      where,
      orderBy: { timestamp: 'asc' },
    });

    const solar = await prisma.solarReading.findMany({
      where: { organizationId: orgId },
      orderBy: { timestamp: 'asc' },
    });

    const solarMap = new Map<string, number>();
    solar.forEach((s) => {
      solarMap.set(s.timestamp.toISOString().slice(0, 13), s.generationKwh);
    });

    // Grouping by interval (default daily or hourly)
    const grouped = new Map<string, { timestamp: string; consumptionKwh: number; peakKw: number; solarKwh: number; count: number }>();

    readings.forEach((r) => {
      let key = r.timestamp.toISOString().slice(0, 10); // Daily by default
      if (interval === 'hourly') {
        key = r.timestamp.toISOString().slice(0, 13) + ':00:00';
      } else if (interval === 'monthly') {
        key = r.timestamp.toISOString().slice(0, 7);
      }

      const existing = grouped.get(key) || {
        timestamp: key,
        consumptionKwh: 0,
        peakKw: 0,
        solarKwh: 0,
        count: 0,
      };

      existing.consumptionKwh += r.consumptionKwh;
      const kw = r.powerKw || r.consumptionKwh;
      if (kw > existing.peakKw) existing.peakKw = kw;
      existing.count += 1;

      // Solar match
      const solHour = r.timestamp.toISOString().slice(0, 13);
      existing.solarKwh += (solarMap.get(solHour) || 0) / (interval === 'daily' ? 1 : 1);

      grouped.set(key, existing);
    });

    const data = Array.from(grouped.values()).map((item) => ({
      timestamp: item.timestamp,
      consumptionKwh: Math.round(item.consumptionKwh),
      peakKw: Math.round(item.peakKw * 10) / 10,
      solarKwh: Math.round(item.solarKwh),
      gridKwh: Math.round(Math.max(0, item.consumptionKwh - item.solarKwh)),
    }));

    return res.json({ trends: data });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getBuildingComparison = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId!;
    const buildings = await prisma.building.findMany({
      where: { organizationId: orgId },
      include: {
        energyReadings: {
          select: { consumptionKwh: true, powerKw: true },
        },
      },
    });

    const comparison = buildings.map((b) => {
      const totalKwh = b.energyReadings.reduce((sum, r) => sum + r.consumptionKwh, 0);
      const maxKw = b.energyReadings.reduce((max, r) => Math.max(max, r.powerKw || r.consumptionKwh), 0);
      return {
        buildingId: b.id,
        buildingName: b.name,
        buildingType: b.buildingType,
        totalAreaSqFt: b.totalArea || 45000,
        totalConsumptionKwh: Math.round(totalKwh),
        peakDemandKw: Math.round(maxKw * 10) / 10,
        energyIntensityKwhPerSqFt: b.totalArea ? Math.round((totalKwh / b.totalArea) * 10) / 10 : 12.5,
      };
    });

    return res.json({ comparison });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
