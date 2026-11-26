const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');
const envFile = path.resolve(__dirname, '../.env');
if (!fs.existsSync(envFile)) throw new Error('backend/.env is required for the local PostgreSQL A6 integration tests.');
const values = dotenv.parse(fs.readFileSync(envFile));
const url = new URL(values.DATABASE_URL || '');
url.pathname = '/ecogrid_a6_test';
const child = spawnSync(process.execPath, ['--require', 'ts-node/register', '--test', 'src/modules/schedules/schedule.a6.test.ts'], {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, ...values, DATABASE_URL: url.toString() },
  stdio: 'inherit',
});
process.exitCode = child.status || 0;
