const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');

const backendDir = path.resolve(__dirname, '..');
const envFile = path.join(backendDir, '.env');
if (!fs.existsSync(envFile)) throw new Error('backend/.env is required for isolated A10 integration tests.');
const values = dotenv.parse(fs.readFileSync(envFile));
const url = new URL(values.DATABASE_URL || '');
url.pathname = '/ecogrid_a10_test';
if (url.pathname !== '/ecogrid_a10_test' || url.hostname !== '127.0.0.1') throw new Error('A10 tests only run against local ecogrid_a10_test.');
const child = spawnSync(process.execPath, ['--require', 'ts-node/register', '--test', 'src/modules/auth/auth.a10.test.ts'], {
  cwd: backendDir, env: { ...process.env, ...values, DATABASE_URL: url.toString() }, stdio: 'inherit',
});
process.exitCode = child.status === null ? 1 : child.status;
