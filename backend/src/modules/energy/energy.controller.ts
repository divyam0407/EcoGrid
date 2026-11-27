import { Request, Response } from 'express';
import { prisma, config } from '../../config';
import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { tariffRateAt } from '../recommendations/energy-intelligence.service';

const DEMO_ORGANIZATION_ID = 'a1000000-0000-4000-8000-000000000001';
const TELEMETRY_SOURCE = 'SIMULATED_LIVE_TELEMETRY';
const CAMPUS_TIMEZONE = 'Asia/Kolkata';

function telemetryDisabled(res: Response) {
  return res.status(404).json({ error: 'Simulated telemetry is disabled for this environment.' });
}

export const getTelemetryStatus = async (req: Request, res: Response) => {
  if (!config.demoTelemetryEnabled || config.nodeEnv === 'production' || req.user?.organizationId !== DEMO_ORGANIZATION_ID) return telemetryDisabled(res);
  try {
    const organizationId = req.user!.organizationId;
    const [organization, meters, latestReading, recentReadings] = await Promise.all([
      prisma.organization.findFirst({ where: { id: organizationId, tier: 'DEMO_SANDBOX' }, select: { timezone: true } }),
      prisma.meter.findMany({ where: { organizationId, dataSource: 'SYNTHETIC_DEMO', status: 'ACTIVE' }, select: { id: true, meterName: true, buildingId: true, building: { select: { name: true } } }, orderBy: { meterName: 'asc' } }),
      prisma.energyReading.findFirst({ where: { organizationId, dataSource: 'SYNTHETIC_DEMO' }, orderBy: { timestamp: 'desc' }, select: { timestamp: true } }),
      prisma.energyReading.findMany({
        where: { organizationId, dataSource: 'SYNTHETIC_DEMO', source: TELEMETRY_SOURCE },
        orderBy: { timestamp: 'desc' }, take: 100,
        include: { meter: { select: { id: true, meterName: true, building: { select: { name: true } } } } },
      }),
    ]);
    if (!organization || organization.timezone !== CAMPUS_TIMEZONE) return res.status(409).json({ error: 'The demo campus timezone must be corrected before live telemetry is enabled.' });
    const selectedMeterId = typeof req.query.meterId === 'string' ? req.query.meterId : undefined;
    const historicalMeter = selectedMeterId ? meters.find((meter) => meter.id === selectedMeterId) : meters[0];
    if (selectedMeterId && !historicalMeter) return res.status(404).json({ error: 'Meter not found in this organization.' });
    const historicalReadings = historicalMeter ? await prisma.energyReading.findMany({ where: { organizationId, meterId: historicalMeter.id, dataSource: 'SYNTHETIC_DEMO', source: { not: TELEMETRY_SOURCE } }, orderBy: { timestamp: 'desc' }, take: 168, select: { timestamp: true, consumptionKwh: true, powerKw: true } }) : [];
    return res.json({ enabled: true, synthetic: true, timezone: organization.timezone, intervalMinutes: 60,
      meters, latestCampusTimestamp: latestReading?.timestamp || null,
      lastIngestedAt: recentReadings[0]?.createdAt || null,
      historicalReadings: historicalReadings.reverse(),
      recentReadings: recentReadings.reverse().map((reading) => ({ timestamp: reading.timestamp, consumptionKwh: reading.consumptionKwh, powerKw: reading.powerKw, meterId: reading.meterId, meterName: reading.meter.meterName, buildingName: reading.meter.building.name, qualityStatus: reading.qualityStatus, source: reading.source })),
    });
  } catch { return res.status(500).json({ error: 'Telemetry status could not be loaded.' }); }
};

export const ingestTelemetry = async (req: Request, res: Response) => {
  if (!config.demoTelemetryEnabled || config.nodeEnv === 'production' || req.user?.organizationId !== DEMO_ORGANIZATION_ID) return telemetryDisabled(res);
  const submitted = req.body?.readings;
  if (!Array.isArray(submitted) || submitted.length < 1 || submitted.length > 10) {
    return res.status(400).json({ error: 'Submit between 1 and 10 interval readings.' });
  }
  const normalized: Array<{ meterId: string; timestamp: Date; valueKwh: number; rawReading: number; rawUnit: string }> = [];
  const keys = new Set<string>();
  for (const [index, item] of submitted.entries()) {
    const rawTimestamp = typeof item?.timestamp === 'string' ? item.timestamp : '';
    const meterId = typeof item?.meterId === 'string' ? item.meterId.trim() : '';
    const measurementType = item?.measurementType;
    const unit = typeof item?.unit === 'string' ? item.unit.trim() : '';
    const rawReading = item?.value;
    const timestamp = new Date(rawTimestamp);
    const timestampPattern = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;
    const canonicalTimestamp = Number.isFinite(timestamp.getTime())
      ? (rawTimestamp.includes('.') ? timestamp.toISOString() : timestamp.toISOString().replace('.000Z', 'Z'))
      : '';
    if (!meterId || measurementType !== 'INTERVAL_ENERGY' || !timestampPattern.test(rawTimestamp) || canonicalTimestamp !== rawTimestamp) {
      return res.status(400).json({ error: `Reading ${index + 1} must include a meter ID, UTC timestamp ending in Z and measurementType INTERVAL_ENERGY.` });
    }
    if (typeof rawReading !== 'number' || !Number.isFinite(rawReading) || rawReading < 0 || rawReading > 50000) {
      return res.status(400).json({ error: `Reading ${index + 1} must have a finite, non-negative interval value no greater than 50000.` });
    }
    const factors: Record<string, number> = { kWh: 1, Wh: 0.001, MWh: 1000 };
    if (!Object.prototype.hasOwnProperty.call(factors, unit)) return res.status(400).json({ error: `Reading ${index + 1} has an unsupported energy unit. Use kWh, Wh or MWh.` });
    if (rawReading * factors[unit] > 50000) return res.status(400).json({ error: `Reading ${index + 1} exceeds the normalized 50000 kWh interval limit.` });
    const key = `${meterId}:${timestamp.toISOString()}`;
    if (keys.has(key)) return res.status(400).json({ error: 'A request cannot contain duplicate meter and timestamp pairs.' });
    keys.add(key);
    normalized.push({ meterId, timestamp, valueKwh: rawReading * factors[unit], rawReading, rawUnit: unit });
  }
  try {
    const organizationId = req.user!.organizationId;
    const result = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.findFirst({ where: { id: organizationId, tier: 'DEMO_SANDBOX', timezone: CAMPUS_TIMEZONE }, select: { id: true } });
      if (!organization) throw Object.assign(new Error('Live telemetry requires the configured ABC University demo organization.'), { status: 403 });
      const meters = await tx.meter.findMany({ where: { id: { in: normalized.map((r) => r.meterId) }, organizationId, dataSource: 'SYNTHETIC_DEMO', status: 'ACTIVE' }, select: { id: true, buildingId: true } });
      if (meters.length !== new Set(normalized.map((r) => r.meterId)).size) throw Object.assign(new Error('One or more meters are not active synthetic-demo meters in this organization.'), { status: 403 });
      const byMeter = new Map(meters.map((meter) => [meter.id, meter]));
      const existing = await tx.energyReading.findMany({ where: { organizationId, OR: normalized.map(({ meterId, timestamp }) => ({ meterId, timestamp })) }, select: { meterId: true, timestamp: true, source: true } });
      const existingKeys = new Map(existing.map((row) => [`${row.meterId}:${row.timestamp.toISOString()}`, row.source]));
      if (existing.some((row) => row.source !== TELEMETRY_SOURCE)) throw Object.assign(new Error('A reading already exists for this meter and timestamp from another source.'), { status: 409 });
      const newRecords = normalized.filter((row) => !existingKeys.has(`${row.meterId}:${row.timestamp.toISOString()}`));
      const inserted = await tx.energyReading.createMany({ skipDuplicates: true, data: newRecords.map((row) => {
        const meter = byMeter.get(row.meterId)!;
        return { organizationId, buildingId: meter.buildingId, meterId: row.meterId, timestamp: row.timestamp,
          sourceLocalTime: (() => { const parts = new Intl.DateTimeFormat('en-US', { timeZone: CAMPUS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(row.timestamp); const get = (type: string) => parts.find((part) => part.type === type)?.value || ''; return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}+05:30`; })(),
          consumptionKwh: row.valueKwh, powerKw: row.valueKwh, rawReading: row.rawReading, rawUnit: row.rawUnit,
          intervalMinutes: 60, dataSource: 'SYNTHETIC_DEMO', source: TELEMETRY_SOURCE, qualityStatus: 'MEASURED' };
      }) });
      return { insertedCount: inserted.count, duplicateCount: normalized.length - inserted.count, timezone: CAMPUS_TIMEZONE };
    }, { maxWait: 10000, timeout: 20000 });
    return res.status(result.insertedCount ? 201 : 200).json({ success: true, synthetic: true, ...result });
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'Telemetry could not be persisted.' });
  }
};

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
    const { buildingId, meterId, roomId, startDate, endDate, limit, dataSource } = req.query;

    const where: any = { organizationId: orgId };
    if (buildingId) where.buildingId = String(buildingId);
    if (meterId) where.meterId = String(meterId);
    if (roomId) where.roomId = String(roomId);
    if (dataSource && dataSource !== 'all') where.dataSource = String(dataSource);

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

export const getEnergySources = async (req: Request, res: Response) => {
  try {
    const organizationId = req.user!.organizationId;
    const sources = await prisma.energyReading.findMany({
      where: { organizationId },
      distinct: ['dataSource'],
      select: { dataSource: true },
      orderBy: { dataSource: 'asc' },
    });
    return res.json({ sources: sources.map((item) => item.dataSource) });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getEnergySummary = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId!;
    const { buildingId, days, dataSource } = req.query;

    const requestedDays = days ? String(days) : '30';
    const dayCount = requestedDays === 'all' ? null : Math.max(1, parseInt(requestedDays, 10) || 30);
    const sinceDate = dayCount === null ? null : new Date(Date.now() - dayCount * 24 * 60 * 60 * 1000);

    const where: any = {
      organizationId: orgId,
      ...(sinceDate ? { timestamp: { gte: sinceDate } } : {}),
    };
    if (buildingId) where.buildingId = String(buildingId);
    if (dataSource && dataSource !== 'all') where.dataSource = String(dataSource);

    const readings = await prisma.energyReading.findMany({
      where,
      orderBy: { timestamp: 'asc' },
    });

    const solarReadings = dataSource && dataSource !== 'all' && dataSource !== 'SYNTHETIC_DEMO'
      ? []
      : await prisma.solarReading.findMany({
        where: {
          organizationId: orgId,
          ...(sinceDate ? { timestamp: { gte: sinceDate } } : {}),
          ...(buildingId ? { installation: { buildingId: String(buildingId) } } : {}),
        },
      });

    const firstTimestamp = readings[0]?.timestamp;
    const lastTimestamp = readings[readings.length - 1]?.timestamp;
    const [tariffs, organization] = await Promise.all([
      prisma.electricityTariff.findMany({ where: { organizationId: orgId, ...(lastTimestamp ? { effectiveFrom: { lte: lastTimestamp }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: firstTimestamp } }] } : {}) }, include: { periods: true }, orderBy: { effectiveFrom: 'desc' } }),
      prisma.organization.findUnique({ where: { id: orgId }, select: { currency: true, timezone: true } }),
    ]);

    let totalKwh = 0;
    let peakDemandKw = 0;
    let totalExpenditure = 0;

    let expenditureAvailable = readings.length > 0;
    readings.forEach((r) => {
      totalKwh += r.consumptionKwh;
      const kw = r.powerKw ?? (r.consumptionKwh * 60) / r.intervalMinutes;
      if (kw > peakDemandKw) peakDemandKw = kw;
      const rate = organization ? tariffRateAt(r, tariffs, organization.timezone) : null;
      if (rate) totalExpenditure += r.consumptionKwh * Number(rate.toString()); else expenditureAvailable = false;
    });

    const totalSolarKwh = solarReadings.reduce((sum, s) => sum + s.generationKwh, 0);

    // Active anomalies count
    const activeAnomalies = await prisma.anomaly.count({
      where: { organizationId: orgId, status: { in: ['OPEN', 'INVESTIGATING'] } },
    });

    // Inefficiencies count
    const recommendations = await prisma.recommendation.findMany({
      where: { organizationId: orgId, status: { in: ['NEW', 'UNDER_REVIEW', 'APPROVED', 'IN_PROGRESS'] }, generationSource: 'A7_ENGINE', financialEstimateAvailable: true },
    });
    const potentialSavings = recommendations.reduce((sum, r) => sum + Number(r.estimatedCostSaving || 0), 0);

    return res.json({
      periodDays: dayCount,
      totalConsumptionKwh: Math.round(totalKwh),
      peakDemandKw: Math.round(peakDemandKw * 10) / 10,
      totalExpenditure: expenditureAvailable ? Math.round(totalExpenditure) : null,
      solarGenerationKwh: Math.round(totalSolarKwh),
      gridConsumptionKwh: Math.round(Math.max(0, totalKwh - totalSolarKwh)),
      activeAnomaliesCount: activeAnomalies,
      potentialSavingsCost: Math.round(potentialSavings),
      currency: organization?.currency || null,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getEnergyTrends = async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organizationId!;
    const { buildingId, interval, dataSource } = req.query; // 'hourly', 'daily', 'monthly'

    const where: any = { organizationId: orgId };
    if (buildingId) where.buildingId = String(buildingId);
    if (dataSource && dataSource !== 'all') where.dataSource = String(dataSource);

    const [readings, solar, organization] = await Promise.all([
      prisma.energyReading.findMany({ where, orderBy: { timestamp: 'asc' } }),
      dataSource && dataSource !== 'SYNTHETIC_DEMO'
        ? Promise.resolve([])
        : prisma.solarReading.findMany({ where: { organizationId: orgId, ...(buildingId ? { installation: { buildingId: String(buildingId) } } : {}) }, orderBy: { timestamp: 'asc' } }),
      prisma.organization.findUnique({ where: { id: orgId }, select: { timezone: true } }),
    ]);
    const timezone = organization?.timezone || 'UTC';
    const bucketFor = (timestamp: Date) => {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(timestamp);
      const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
      const date = `${value('year')}-${value('month')}-${value('day')}`;
      if (interval === 'hourly') return `${date}T${value('hour')}:00:00`;
      if (interval === 'monthly') return date.slice(0, 7);
      return date;
    };

    // Grouping by interval (default daily or hourly)
    const grouped = new Map<string, { timestamp: string; consumptionKwh: number; peakKw: number; solarKwh: number; count: number }>();

    readings.forEach((r) => {
      const key = bucketFor(r.timestamp);

      const existing = grouped.get(key) || {
        timestamp: key,
        consumptionKwh: 0,
        peakKw: 0,
        solarKwh: 0,
        count: 0,
      };

      existing.consumptionKwh += r.consumptionKwh;
      const kw = r.powerKw ?? (r.consumptionKwh * 60) / r.intervalMinutes;
      if (kw > existing.peakKw) existing.peakKw = kw;
      existing.count += 1;

      grouped.set(key, existing);
    });

    solar.forEach((reading) => {
      const key = bucketFor(reading.timestamp);
      const existing = grouped.get(key) || { timestamp: key, consumptionKwh: 0, peakKw: 0, solarKwh: 0, count: 0 };
      existing.solarKwh += reading.generationKwh;
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
    const dataSource = req.query.dataSource ? String(req.query.dataSource) : undefined;
    const buildings = await prisma.building.findMany({
      where: { organizationId: orgId },
      include: {
        energyReadings: {
          where: dataSource && dataSource !== 'all' ? { dataSource } : undefined,
          select: { consumptionKwh: true, powerKw: true },
        },
      },
    });

    const comparison = buildings.map((b) => {
      const totalKwh = b.energyReadings.reduce((sum, r) => sum + r.consumptionKwh, 0);
      const maxKw = b.energyReadings.reduce((max, r) => Math.max(max, r.powerKw ?? r.consumptionKwh), 0);
      return {
        buildingId: b.id,
        buildingName: b.name,
        buildingType: b.buildingType,
        totalAreaSqFt: b.totalArea,
        totalConsumptionKwh: Math.round(totalKwh),
        peakDemandKw: Math.round(maxKw * 10) / 10,
        energyIntensityKwhPerSqFt: b.totalArea ? Math.round((totalKwh / b.totalArea) * 10) / 10 : null,
      };
    });

    return res.json({ comparison });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
