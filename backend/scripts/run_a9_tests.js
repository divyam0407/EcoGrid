const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');

const envFile = path.resolve(__dirname, '../.env');
if (!fs.existsSync(envFile)) throw new Error('backend/.env is required for the isolated A9 PostgreSQL tests.');
const values = dotenv.parse(fs.readFileSync(envFile));
const url = new URL(values.DATABASE_URL || '');
url.pathname = '/ecogrid_a9_test';
if (url.pathname !== '/ecogrid_a9_test' || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
  throw new Error('A9 tests only run against the local ecogrid_a9_test database.');
}
const child = spawnSync(process.execPath, ['--require', 'ts-node/register', '--test', 'src/modules/optimization/optimization.a9.test.ts'], {
  cwd: path.resolve(__dirname, '..'), env: { ...process.env, ...values, DATABASE_URL: url.toString() }, stdio: 'inherit',
});
process.exitCode = child.status || 0;
