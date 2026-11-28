import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateDemoProvenance, DemoImportBatch, DemoImportFile } from './demo-provenance';

const batch: DemoImportBatch = { id: 'demo-batch', fileSha256: '', originalFilename: 'energy-readings.csv' };
const sources = [
  { fieldName: 'readings', filename: 'energy-readings.csv', body: 'timestamp,kwh\n2026-01-01T00:00:00Z,1\n' },
  { fieldName: 'solar', filename: 'solar-readings.csv', body: 'timestamp,kwh\n2026-01-01T00:00:00Z,0.5\n' },
  { fieldName: 'metadata', filename: 'dataset-manifest.json', body: '{"synthetic":true}\n' },
];

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ecogrid-demo-provenance-'));
  const files: DemoImportFile[] = sources.map(source => {
    const storagePath = path.posix.join('datasets/demo', source.filename);
    const fullPath = path.join(root, storagePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, source.body);
    const content = fs.readFileSync(fullPath);
    return { batchId: batch.id, fieldName: source.fieldName, originalFilename: source.filename, sha256: crypto.createHash('sha256').update(content).digest('hex'), sizeBytes: content.length, storagePath };
  });
  const readings = files.find(file => file.fieldName === 'readings')!;
  return { root, files, batch: { ...batch, fileSha256: readings.sha256 } };
}

test('accepts all project-relative demo files with matching batch provenance', () => {
  const value = fixture();
  try {
    assert.deepEqual(validateDemoProvenance(value.batch, value.files, value.root), {
      passed: true,
      detail: '3 synthetic demo files exist and match their size, SHA-256, and batch provenance',
    });
  } finally { fs.rmSync(value.root, { recursive: true, force: true }); }
});

test('rejects missing files and invalid hashes', () => {
  const missing = fixture();
  try {
    fs.unlinkSync(path.join(missing.root, missing.files[1].storagePath));
    assert.equal(validateDemoProvenance(missing.batch, missing.files, missing.root).passed, false);
  } finally { fs.rmSync(missing.root, { recursive: true, force: true }); }

  const invalidHash = fixture();
  try {
    invalidHash.files[0].sha256 = '0'.repeat(64);
    assert.equal(validateDemoProvenance(invalidHash.batch, invalidHash.files, invalidHash.root).passed, false);
  } finally { fs.rmSync(invalidHash.root, { recursive: true, force: true }); }
});

test('rejects unsupported paths, size mismatches, and incorrect batch references', () => {
  const value = fixture();
  try {
    const outsidePath = value.files.map(file => ({ ...file }));
    outsidePath[0].storagePath = '../outside.csv';
    assert.equal(validateDemoProvenance(value.batch, outsidePath, value.root).passed, false);

    const wrongBatch = value.files.map(file => ({ ...file }));
    wrongBatch[0].batchId = 'another-batch';
    assert.equal(validateDemoProvenance(value.batch, wrongBatch, value.root).passed, false);

    const wrongSize = value.files.map(file => ({ ...file }));
    wrongSize[0].sizeBytes += 1;
    assert.equal(validateDemoProvenance(value.batch, wrongSize, value.root).passed, false);
  } finally { fs.rmSync(value.root, { recursive: true, force: true }); }
});
