import { Prisma, PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const insertOrder = [
  'Organization', 'User', 'DataImportBatch', 'Building', 'OrganizationMember',
  'Department', 'Room', 'Meter', 'ElectricityTariff', 'SolarInstallation',
  'Battery', 'OperationalSchedule', 'TariffPeriod', 'SolarReading',
  'BatteryReading', 'EnergyReading', 'OccupancyRecord', 'Prediction',
  'Anomaly', 'Recommendation', 'OptimizationRun', 'Scenario', 'AuditLog',
  'BenchmarkEvaluationRun',
];
const legacyModelNames = [...insertOrder];
const insertChunkSize = 200;
type Row = Record<string, unknown>;
type ExportPayload = { integrity: string; foreign_key_violations: number; columns: Record<string, string[]>; tables: Record<string, Row[]> };

function normalize(value: unknown, fieldType: string): unknown {
  if (value === null || value === undefined) return null;
  if (fieldType === 'DateTime') {
    const date = value instanceof Date ? value : typeof value === 'number' ? new Date(value) : new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new Error('Source contains an invalid DateTime.');
    return date.toISOString();
  }
  if (fieldType === 'Boolean') return Boolean(value);
  if (fieldType === 'Int') return Number(value);
  if (fieldType === 'Float') {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error('Source contains a non-finite numeric value.');
    return number;
  }
  return value;
}

function prepareRow(row: Row, fields: Prisma.DMMF.Field[], modelName: string): Row {
  const result: Row = {};
  for (const field of fields.filter((candidate) => candidate.kind !== 'object')) {
    if (!(field.name in row)) throw new Error(`SQLite row is missing ${field.name}.`);
    let value: unknown;
    try {
      value = normalize(row[field.name], field.type);
    } catch {
      throw new Error(`Invalid source value for ${modelName}.${field.name}; migration refused.`);
    }
    result[field.name] = field.type === 'DateTime' && value !== null ? new Date(String(value)) : value;
  }
  if (!('id' in result)) throw new Error('A migrated model has no id field.');
  return result;
}

function rowsEqual(left: Row, right: Row, fields: Prisma.DMMF.Field[]): boolean {
  return fields.filter((field) => field.kind !== 'object').every((field) =>
    JSON.stringify(normalize(left[field.name], field.type)) === JSON.stringify(normalize(right[field.name], field.type)),
  );
}

async function main() {
  const sourcePath = process.env.SQLITE_MIGRATION_SOURCE;
  if (!sourcePath) throw new Error('Set SQLITE_MIGRATION_SOURCE to the verified backup path.');
  const resolvedSource = path.resolve(sourcePath);
  const backupRoot = path.resolve(__dirname, 'backups') + path.sep;
  if (!resolvedSource.startsWith(backupRoot) || resolvedSource === path.resolve(__dirname, 'dev.db')) {
    throw new Error('Migration source must be the verified backup, never the live SQLite database.');
  }
  const databaseUrl = new URL(process.env.DATABASE_URL || '');
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol) || databaseUrl.pathname.replace(/^\//, '') !== 'ecogrid_db') {
    throw new Error('Migration target must be PostgreSQL ecogrid_db.');
  }

  const rawExport = execFileSync('python3', [path.resolve(__dirname, 'export_sqlite_data.py'), resolvedSource], {
    encoding: 'utf8', maxBuffer: 128 * 1024 * 1024,
  });
  const exported = JSON.parse(rawExport) as ExportPayload;
  if (exported.integrity !== 'ok' || exported.foreign_key_violations !== 0) {
    throw new Error('Verified backup integrity check failed; migration refused.');
  }

  const models = Prisma.dmmf.datamodel.models.filter((model) => legacyModelNames.includes(model.name));
  const modelByTable = new Map(models.map((model) => [model.dbName || model.name, model]));
  const expectedNames = [...modelByTable.keys()].sort();
  const exportedNames = Object.keys(exported.tables).sort();
  if (JSON.stringify(expectedNames) !== JSON.stringify(exportedNames)) {
    throw new Error(`SQLite/Prisma model mismatch. Expected ${expectedNames.length} application tables, found ${exportedNames.length}.`);
  }
  if (new Set(insertOrder).size !== models.length || insertOrder.some((name) => !models.some((model) => model.name === name))) {
    throw new Error('Migration insertion order does not cover the current Prisma model set.');
  }

  const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(resolvedSource)).digest('hex');
  const counts: Record<string, { source: number; destination: number; inserted: number }> = {};
  const organizationRows = exported.tables.Organization || [];
  if (organizationRows.length !== 1 || organizationRows[0].name !== 'ABC University (DEMO)') {
    throw new Error('Expected exactly the ABC University demo organization; migration refused.');
  }
  const organizationId = organizationRows[0].id;
  for (const model of models) {
    const tableName = model.dbName || model.name;
    const rows = exported.tables[tableName];
    const allFields = model.fields.filter((field) => field.kind !== 'object');
    const sourceFieldNames = exported.columns[tableName] || [];
    const fields = allFields.filter((field) => sourceFieldNames.includes(field.name));
    const names = fields.map((field) => field.name).sort();
    const sourceColumnNames = [...(exported.columns[tableName] || [])].sort();
    if (JSON.stringify(names) !== JSON.stringify(sourceColumnNames)) {
      throw new Error(`SQLite columns differ from Prisma model ${model.name}; migration refused.`);
    }
    const missingRequired = allFields.filter((field) => !sourceFieldNames.includes(field.name) && field.isRequired && !field.hasDefaultValue);
    if (missingRequired.length) throw new Error(`Current model ${model.name} has new required fields without defaults; migration refused.`);
    const idSet = new Set(rows.map((row) => String(row.id)));
    if (idSet.size !== rows.length) throw new Error(`Duplicate source IDs found in ${tableName}; migration refused.`);
    const orgField = fields.find((field) => field.name === 'organizationId');
    if (orgField && rows.some((row) => row.organizationId !== organizationId)) {
      throw new Error(`Cross-organization row found in ${tableName}; migration refused.`);
    }
  }

  const report = await prisma.$transaction(async (tx) => {
    const currentDatabase = await tx.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
    if (currentDatabase[0]?.db !== 'ecogrid_db') throw new Error('Connected database is not ecogrid_db.');
    const perTable: Record<string, { source: number; destination: number; inserted: number }> = {};

    for (const modelName of insertOrder) {
      const model = models.find((item) => item.name === modelName)!;
      const tableName = model.dbName || model.name;
      const allFields = model.fields.filter((field) => field.kind !== 'object');
      const sourceFieldNames = exported.columns[tableName];
      const fields = allFields.filter((field) => sourceFieldNames.includes(field.name));
      const sourceRows = exported.tables[tableName].map((row) => prepareRow(row, fields, modelName));
      const delegate = (tx as any)[modelName[0].toLowerCase() + modelName.slice(1)];
      const destinationRows = await delegate.findMany();
      const sourceById = new Map<string, Row>(sourceRows.map((row) => [String(row.id), row]));
      const destinationById = new Map<string, Row>(destinationRows.map((row: Row) => [String(row.id), row]));

      for (const [id, existing] of destinationById) {
        const original = sourceById.get(id);
        if (!original) continue;
        if (!rowsEqual(original, existing as Row, fields)) {
          throw new Error(`Destination ${tableName} record ${id} differs from SQLite; no writes made.`);
        }
      }

      const missing = sourceRows.filter((row) => !destinationById.has(String(row.id)));
      for (let offset = 0; offset < missing.length; offset += insertChunkSize) {
        await delegate.createMany({ data: missing.slice(offset, offset + insertChunkSize) });
      }
      const finalRows = await delegate.findMany();
      const finalById = new Map<string, Row>(finalRows.map((row: Row) => [String(row.id), row]));
      for (const sourceRow of sourceRows) {
        const id = String(sourceRow.id);
        const finalRow = finalById.get(id);
        if (!finalRow || !rowsEqual(sourceRow, finalRow, fields)) throw new Error(`Source record verification failed in ${tableName}; transaction rolled back.`);
      }
      const finalCount = finalRows.length;
      perTable[tableName] = { source: sourceRows.length, destination: finalCount, inserted: missing.length };
    }
    return perTable;
  }, { maxWait: 10000, timeout: 120000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  console.log(`SQLite backup SHA-256: ${sourceHash}`);
  console.log('Table | SQLite source | PostgreSQL destination | inserted this run');
  for (const name of [...insertOrder].map((modelName) => modelByTable.get(modelName)?.dbName || modelName)) {
    const item = report[name];
    console.log(`${name} | ${item.source} | ${item.destination} | ${item.inserted}`);
  }
  console.log('Migration completed; source backup and live SQLite database were read-only.');
}

main()
  .catch((error) => {
    console.error('SQLite to PostgreSQL migration failed:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
