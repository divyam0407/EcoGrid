import dotenv from 'dotenv';
import path from 'path';
import { spawnSync } from 'child_process';

const backendDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendDir, '.env') });

function demoUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('backend/.env must define DATABASE_URL before demo database commands can run.');
  const base = new URL(raw);
  const baseName = base.pathname.replace(/^\//, '');
  if (!['postgresql:', 'postgres:'].includes(base.protocol) || !['127.0.0.1', 'localhost', '::1'].includes(base.hostname) || baseName !== 'ecogrid_db') {
    throw new Error('Demo commands require backend/.env to point to the local ecogrid_db configuration. No command was run.');
  }
  base.pathname = '/ecogrid_demo';
  return base.toString();
}

const action = process.argv[2];
const argsByAction: Record<string, string[]> = {
  migrate: ['prisma', 'migrate', 'deploy'],
  status: ['prisma', 'migrate', 'status'],
  schema: ['prisma', 'validate'],
  generate: ['prisma', 'generate'],
  seed: ['-r', 'ts-node/register', 'prisma/demo-seed.ts'],
  validate: ['-r', 'ts-node/register', 'scripts/validate-demo.ts'],
  dev: ['-r', 'ts-node/register', 'src/server.ts'],
};

if (!action || !argsByAction[action]) {
  console.error('Usage: npm run demo:db -- <migrate|status|schema|generate|seed|validate|dev>');
  process.exit(2);
}

try {
  const env = { ...process.env, DATABASE_URL: demoUrl() };
  const command = argsByAction[action][0].startsWith('-') ? process.execPath : process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = command === process.execPath ? argsByAction[action] : argsByAction[action];
  const result = spawnSync(command, args, { cwd: backendDir, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error: any) {
  console.error(error.message);
  process.exitCode = 1;
}
