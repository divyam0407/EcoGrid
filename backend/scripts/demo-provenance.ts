import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface DemoImportFile {
  batchId: string;
  fieldName: string;
  originalFilename: string;
  sha256: string;
  sizeBytes: number;
  storagePath: string;
}

export interface DemoImportBatch {
  id: string;
  fileSha256: string;
  originalFilename: string;
}

const EXPECTED_FILES = [
  { fieldName: 'readings', filename: 'energy-readings.csv' },
  { fieldName: 'solar', filename: 'solar-readings.csv' },
  { fieldName: 'metadata', filename: 'dataset-manifest.json' },
];

export function validateDemoProvenance(batch: DemoImportBatch | null, files: DemoImportFile[], projectRoot: string): { passed: boolean; detail: string } {
  if (!batch) return { passed: false, detail: 'Synthetic demo import batch is missing' };
  if (batch.originalFilename !== 'energy-readings.csv') return { passed: false, detail: 'Synthetic demo batch filename is incorrect' };
  if (files.length !== EXPECTED_FILES.length) return { passed: false, detail: `Expected ${EXPECTED_FILES.length} files in the synthetic demo batch; found ${files.length}` };

  const root = path.resolve(projectRoot);
  const filesByField = new Map(files.map(file => [file.fieldName, file]));
  if (filesByField.size !== EXPECTED_FILES.length) return { passed: false, detail: 'Synthetic demo batch has duplicate or unexpected file fields' };

  for (const expected of EXPECTED_FILES) {
    const file = filesByField.get(expected.fieldName);
    if (!file || file.batchId !== batch.id || file.originalFilename !== expected.filename) {
      return { passed: false, detail: `Expected ${expected.filename} linked to the synthetic demo batch as ${expected.fieldName}` };
    }
    if (!/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes <= 0) {
      return { passed: false, detail: `${expected.filename} has invalid size or SHA-256 metadata` };
    }

    // The synthetic seed stores project-relative paths. Other application imports
    // may use absolute upload paths, so they must be excluded by batch before this
    // check rather than treated as demo fixtures.
    const expectedPath = path.join('datasets', 'demo', expected.filename);
    if (file.storagePath !== expectedPath || path.isAbsolute(file.storagePath)) {
      return { passed: false, detail: `${expected.filename} does not use its expected project-relative demo path` };
    }
    const resolvedPath = path.resolve(root, file.storagePath);
    const relativePath = path.relative(root, resolvedPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return { passed: false, detail: `${expected.filename} resolves outside the project directory` };
    }
    let actual: Buffer;
    try {
      const realRoot = fs.realpathSync(root);
      const realPath = fs.realpathSync(resolvedPath);
      const realRelative = path.relative(realRoot, realPath);
      if (realRelative.startsWith('..') || path.isAbsolute(realRelative) || !fs.statSync(realPath).isFile()) {
        return { passed: false, detail: `${expected.filename} is not a regular file inside the project directory` };
      }
      actual = fs.readFileSync(realPath);
    } catch {
      return { passed: false, detail: `${expected.filename} is missing or unreadable` };
    }
    if (actual.length !== file.sizeBytes) return { passed: false, detail: `${expected.filename} size does not match its provenance metadata` };
    const actualSha256 = crypto.createHash('sha256').update(actual).digest('hex');
    if (actualSha256 !== file.sha256) return { passed: false, detail: `${expected.filename} SHA-256 does not match its provenance metadata` };
  }

  const readings = filesByField.get('readings')!;
  if (batch.fileSha256 !== readings.sha256) return { passed: false, detail: 'Synthetic demo batch SHA-256 does not match energy-readings.csv' };
  return { passed: true, detail: `${files.length} synthetic demo files exist and match their size, SHA-256, and batch provenance` };
}
