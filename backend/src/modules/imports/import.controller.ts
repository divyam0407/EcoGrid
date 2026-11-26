import { Request, Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import { promisify } from 'util';
import { prisma, config } from '../../config';

const hashFile = (filepath: string) => new Promise<string>((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filepath);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(hash.digest('hex')));
});
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);

type Uploaded = Express.Multer.File;
type NormalizeResult = {
  readings: any[];
  occupancy: any[];
  buildings: any[];
  summary: any;
  rejections: any[];
};

function responseBatch(batch: any) {
  const { files, rejectedRows, ...safeBatch } = batch;
  return {
    ...safeBatch,
    files: files?.map((file: any) => ({
      id: file.id,
      fieldName: file.fieldName,
      originalFilename: file.originalFilename,
      sha256: file.sha256,
      sizeBytes: file.sizeBytes,
      mediaType: file.mediaType,
    })),
    rejectedRows,
  };
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export const createDatasetImport = async (req: Request, res: Response) => {
  const files = (req.files || {}) as Record<string, Uploaded[]>;
  const uploaded = Object.values(files).flat();
  let retained = false;
  let batchId: string | undefined;

  const cleanupUnretained = async () => {
    if (!retained) await Promise.all(uploaded.map((file) => unlink(file.path).catch(() => undefined)));
  };

  try {
    const orgId = req.user!.organizationId;
    const datasetType = String(req.body.datasetType || '');
    const readingsFile = files.readings?.[0];
    const metadataFile = files.metadata?.[0];
    const weatherFile = files.weather?.[0];
    const occupancyFile = files.occupancy?.[0];
    const buildingId = String(req.body.buildingId || '');
    const meterId = String(req.body.meterId || '');
    const externalBuildingId = String(req.body.externalBuildingId || '');
    const validTypes = ['IBLEND_REAL_WORLD', 'BDG2_BENCHMARK', 'ASHRAE_GEPIII'];

    if (!validTypes.includes(datasetType)) return res.status(400).json({ error: 'Select I-BLEND, BDG2, or ASHRAE GEPIII.' });
    if (!readingsFile) return res.status(400).json({ error: 'A readings CSV file is required.' });
    if (datasetType !== 'IBLEND_REAL_WORLD' && !metadataFile) {
      return res.status(400).json({ error: 'This dataset requires its metadata CSV file.' });
    }
    if (datasetType !== 'IBLEND_REAL_WORLD' && !externalBuildingId) {
      return res.status(400).json({ error: 'Enter the source building ID to import and map.' });
    }
    if (!buildingId || !meterId) return res.status(400).json({ error: 'Choose an EcoGrid building and meter mapping.' });

    const [building, meter] = await Promise.all([
      prisma.building.findFirst({ where: { id: buildingId, organizationId: orgId }, select: { id: true } }),
      prisma.meter.findFirst({ where: { id: meterId, organizationId: orgId }, select: { id: true, buildingId: true } }),
    ]);
    if (!building || !meter || meter.buildingId !== building.id) {
      return res.status(400).json({ error: 'The selected building and meter must belong to your organization and match each other.' });
    }

    const fileRows = await Promise.all(uploaded.map(async (file) => ({
      fieldName: Object.entries(files).find(([, value]) => value.includes(file))?.[0] || 'unknown',
      originalFilename: pathBasename(file.originalname),
      sha256: await hashFile(file.path),
      sizeBytes: file.size,
      mediaType: file.mimetype || null,
      storagePath: file.path,
    })));
    const mapping = {
      buildingId, meterId, externalBuildingId,
      rawUnit: String(req.body.rawUnit || 'kWh'),
      powerUnit: String(req.body.powerUnit || 'W'),
      cumulativeLimitKwh: String(req.body.cumulativeLimitKwh || ''),
    };
    const fingerprintPayload = JSON.stringify({ datasetType, mapping, files: fileRows.map(({ fieldName, sha256 }) => ({ fieldName, sha256 })).sort((a, b) => a.fieldName.localeCompare(b.fieldName)) });
    const requestFingerprint = crypto.createHash('sha256').update(fingerprintPayload).digest('hex');

    let batch = await prisma.dataImportBatch.findUnique({
      where: { organizationId_requestFingerprint: { organizationId: orgId, requestFingerprint } },
      include: { files: true },
    });
    if (batch && batch.status !== 'FAILED') {
      await cleanupUnretained();
      return res.status(200).json({ batch: responseBatch(batch), duplicate: true });
    }

    if (batch) {
      const claim = await prisma.dataImportBatch.updateMany({
        where: { id: batch.id, organizationId: orgId, status: 'FAILED' },
        data: { status: 'VALIDATING', progressPercent: 10, currentStage: 'Retry validation', errorMessage: null, errorLogJson: null, mappingJson: JSON.stringify({ ...mapping, datasetType, mappingVersion: 'v1' }) },
      });
      if (claim.count !== 1) {
        await cleanupUnretained();
        const latest = await prisma.dataImportBatch.findFirst({ where: { id: batch.id, organizationId: orgId }, include: { files: true } });
        return res.status(200).json({ batch: responseBatch(latest), duplicate: true });
      }
      batchId = batch.id;
    } else {
      try {
        const primary = fileRows.find((file) => file.fieldName === 'readings')!;
        batch = await prisma.dataImportBatch.create({
          data: {
            organizationId: orgId,
            dataSource: datasetType,
            datasetName: datasetType,
            license: 'Pending dataset metadata',
            sourceUrl: null,
            originalFilename: primary.originalFilename,
            fileSha256: primary.sha256,
            sourceTimezone: 'PENDING_VALIDATION',
            rawUnit: mapping.rawUnit,
            preprocessingVer: 'pending',
            totalRowsProcessed: 0,
            validRecordsCount: 0,
            status: 'UPLOADED',
            progressPercent: 0,
            requestFingerprint,
            mappingJson: JSON.stringify({ ...mapping, datasetType, mappingVersion: 'v1' }),
            files: { create: fileRows },
          },
          include: { files: true },
        });
        batchId = batch.id;
      } catch (error: any) {
        if (error.code === 'P2002') {
          const existing = await prisma.dataImportBatch.findUnique({
            where: { organizationId_requestFingerprint: { organizationId: orgId, requestFingerprint } },
            include: { files: true },
          });
          if (existing) {
            await cleanupUnretained();
            return res.status(200).json({ batch: responseBatch(existing), duplicate: true });
          }
        }
        throw error;
      }
    }

    retained = true;
    if (batchId && batch?.status === 'FAILED') {
      await prisma.importFile.createMany({ data: fileRows.map((file) => ({ batchId: batchId!, ...file })) });
    }
    await prisma.dataImportBatch.update({
      where: { id: batchId! },
      data: { status: 'VALIDATING', progressPercent: 10, currentStage: 'Checking dataset and mappings', errorMessage: null, errorLogJson: null },
    });

    if (!config.importServiceToken) throw new Error('Import normalization service is not configured.');
    const form = new FormData();
    form.set('dataset_type', datasetType);
    form.set('building_id', buildingId);
    form.set('meter_id', meterId);
    form.set('external_building_id', externalBuildingId);
    form.set('raw_unit', mapping.rawUnit);
    form.set('power_unit', mapping.powerUnit);
    form.set('cumulative_limit_kwh', mapping.cumulativeLimitKwh);
    const appendUpload = async (field: string, file?: Uploaded) => {
      if (!file) return;
      const data = await readFile(file.path);
      form.set(field, new Blob([data], { type: file.mimetype || 'text/csv' }), pathBasename(file.originalname));
    };
    await Promise.all([
      appendUpload('readings_file', readingsFile),
      appendUpload('metadata_file', metadataFile),
      appendUpload('weather_file', weatherFile),
      appendUpload('occupancy_file', occupancyFile),
    ]);
    await prisma.dataImportBatch.update({
      where: { id: batchId! },
      data: { status: 'PROCESSING', progressPercent: 35, currentStage: 'Normalizing source data' },
    });

    const normalizedResponse = await axios.post<NormalizeResult>(
      `${config.pythonServiceUrl}/api/imports/normalize`, form,
      { headers: { 'X-Import-Service-Token': config.importServiceToken }, timeout: 180000, maxBodyLength: Infinity, maxContentLength: Infinity },
    );
    const result = normalizedResponse.data;
    const summary = result.summary;
    const allRejections = result.rejections || [];
    const completionStatus = allRejections.length || (summary.warnings || []).length ? 'COMPLETED_WITH_WARNINGS' : 'COMPLETED';
    const timestampValues = [
      ...result.readings.map((r) => r.timestamp_utc),
      ...result.occupancy.map((r) => r.timestamp_utc),
    ].filter(Boolean).sort();

    await prisma.dataImportBatch.update({
      where: { id: batchId! },
      data: { status: 'PROCESSING', progressPercent: 70, currentStage: 'Saving normalized records' },
    });

    await prisma.$transaction(async (tx) => {
      if (result.readings.length) {
        await tx.energyReading.createMany({
          data: result.readings.map((reading) => ({
            organizationId: orgId,
            buildingId,
            meterId,
            timestamp: new Date(reading.timestamp_utc),
            sourceLocalTime: reading.source_local_time || null,
            sourceExternalBuildingId: reading.external_building_id || null,
            sourceExternalMeterId: reading.external_meter_id || null,
            consumptionKwh: reading.consumption_kwh,
            powerKw: reading.power_kw,
            rawReading: reading.raw_reading,
            rawUnit: reading.raw_unit,
            voltageV: reading.voltage_v,
            currentA: reading.current_a,
            frequencyHz: reading.frequency_hz,
            powerFactor: reading.power_factor,
            apparentPowerVa: reading.apparent_power_va,
            reactivePowerVar: reading.reactive_power_var,
            intervalMinutes: reading.interval_minutes,
            dataSource: datasetType,
            source: datasetType,
            qualityStatus: reading.quality_status,
            batchId,
          })),
        });
      }
      if (result.occupancy.length) {
        await tx.occupancyRecord.createMany({
          data: result.occupancy.map((record) => ({
            organizationId: orgId,
            buildingId,
            roomId: null,
            batchId,
            timestamp: new Date(record.timestamp_utc),
            sourceLocalTime: record.source_local_time || null,
            sourceExternalBuildingId: record.external_building_id || null,
            occupancyCount: record.occupancy_count,
            sourceType: record.source_type,
            granularity: record.granularity,
            dataSource: datasetType,
            confidence: record.confidence,
          })),
        });
      }
      if (allRejections.length) {
        await tx.importRejectedRow.createMany({
          data: allRejections.map((item) => ({
            batchId,
            fileField: item.file_field || 'readings',
            rowNumber: Number(item.row_number) || 0,
            externalBuildingId: item.external_building_id || null,
            externalMeterId: item.external_meter_id || null,
            rawTimestamp: item.raw_timestamp || null,
            rawValue: item.raw_value || null,
            reason: String(item.reason || 'Rejected by dataset validator'),
            qualityStatus: item.quality_status || 'INVALID_REJECTED',
          })),
        });
      }
      await tx.dataImportBatch.update({
        where: { id: batchId! },
        data: {
          dataSource: datasetType,
          datasetName: summary.dataset_name,
          license: summary.license,
          sourceUrl: summary.source_url,
          sourceTimezone: summary.source_timezone,
          rawUnit: summary.raw_unit,
          preprocessingVer: summary.preprocessing_ver,
          totalRowsProcessed: Number(summary.total_rows_processed || 0) + result.occupancy.length + (result.rejections || []).filter((r: any) => r.file_field === 'occupancy').length,
          validRecordsCount: result.readings.length + result.occupancy.length,
          imputedCount: Number(summary.imputed_count || 0),
          flaggedCount: Number(summary.flagged_count || 0),
          rejectedCount: allRejections.length,
          minTimestamp: timestampValues.length ? new Date(timestampValues[0]) : null,
          maxTimestamp: timestampValues.length ? new Date(timestampValues[timestampValues.length - 1]) : null,
          errorLogJson: JSON.stringify({ warnings: summary.warnings || [], duplicateCount: summary.duplicate_count || 0, missingIntervalCount: summary.missing_interval_count || 0 }),
          status: completionStatus,
          progressPercent: 100,
          currentStage: null,
          completedAt: new Date(),
          errorMessage: null,
        },
      });
    }, { maxWait: 10000, timeout: 120000 });

    const completed = await prisma.dataImportBatch.findFirst({ where: { id: batchId!, organizationId: orgId }, include: { files: true } });
    return res.status(201).json({ batch: responseBatch(completed), duplicate: false });
  } catch (error: any) {
    if (batchId) {
      const errorMessage = error.response?.data?.detail || error.message || 'Import failed.';
      await prisma.dataImportBatch.updateMany({
        where: { id: batchId, organizationId: req.user?.organizationId },
        data: {
          status: 'FAILED', progressPercent: 100, currentStage: null,
          errorMessage: String(errorMessage).slice(0, 1000),
          errorLogJson: JSON.stringify({ message: String(errorMessage).slice(0, 1000), status: 'FAILED' }),
          completedAt: new Date(),
        },
      }).catch(() => undefined);
    }
    const status = error.response?.status === 400 ? 422 : 500;
    return res.status(status).json({ error: batchId ? 'Import failed.' : (error.message || 'Import request failed.'), batchId });
  } finally {
    await cleanupUnretained();
  }
};

function pathBasename(filename: string) {
  return filename.replace(/\\/g, '/').split('/').pop() || 'uploaded.csv';
}

export const getImportHistory = async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '25'), 10) || 25));
    const where: any = { organizationId: orgId };
    if (req.query.dataSource) where.dataSource = String(req.query.dataSource);
    if (req.query.status) where.status = String(req.query.status);
    const [batches, total] = await Promise.all([
      prisma.dataImportBatch.findMany({ where, orderBy: { importedAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: { files: true, _count: { select: { rejectedRows: true, readings: true, occupancyRecords: true } } } }),
      prisma.dataImportBatch.count({ where }),
    ]);
    return res.json({ batches: batches.map(responseBatch), total, page, limit });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getImportBatch = async (req: Request, res: Response) => {
  try {
    const batch = await prisma.dataImportBatch.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      include: { files: true, _count: { select: { rejectedRows: true, readings: true, occupancyRecords: true } } },
    });
    if (!batch) return res.status(404).json({ error: 'Import batch not found.' });
    return res.json({ batch: responseBatch(batch) });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getImportRejectionsCsv = async (req: Request, res: Response) => {
  try {
    const batch = await prisma.dataImportBatch.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId }, select: { id: true } });
    if (!batch) return res.status(404).json({ error: 'Import batch not found.' });
    const rejected = await prisma.importRejectedRow.findMany({ where: { batchId: batch.id }, orderBy: [{ fileField: 'asc' }, { rowNumber: 'asc' }] });
    const columns = ['fileField', 'rowNumber', 'externalBuildingId', 'externalMeterId', 'rawTimestamp', 'rawValue', 'reason', 'qualityStatus'];
    const csv = [columns.join(','), ...rejected.map((row) => columns.map((column) => csvCell((row as any)[column])).join(','))].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ecogrid-import-${batch.id}-rejections.csv"`);
    return res.send(csv);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
