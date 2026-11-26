const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const { spawn } = require('child_process');
const dotenv = require('dotenv');

const backendDir = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendDir, '..');
const envFile = path.join(backendDir, '.env');
if (!fs.existsSync(envFile)) throw new Error('backend/.env is required for the isolated A8 PostgreSQL tests.');
const values = dotenv.parse(fs.readFileSync(envFile));
const databaseUrl = new URL(values.DATABASE_URL || '');
databaseUrl.pathname = '/ecogrid_a8_test';
if (databaseUrl.pathname !== '/ecogrid_a8_test' || !['127.0.0.1', 'localhost', '::1'].includes(databaseUrl.hostname)) {
  throw new Error('A8 tests only run against the local ecogrid_a8_test database.');
}
if (!values.IMPORT_SERVICE_TOKEN) throw new Error('IMPORT_SERVICE_TOKEN is required to run the A8 intelligence service.');

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new Error(`Health check returned HTTP ${response.statusCode}.`));
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    request.setTimeout(1000, () => request.destroy(new Error('Health check timed out.')));
    request.on('error', reject);
  });
}

async function waitForCurrentService(service, serviceUrl) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (service.exitCode !== null) throw new Error(`The A8 intelligence service exited with code ${service.exitCode}.`);
    try {
      const health = await getJson(`${serviceUrl}/health`);
      if (health.status !== 'healthy') throw new Error('A8 intelligence service did not report healthy status.');
      const openApi = await getJson(`${serviceUrl}/openapi.json`);
      const trainingRoute = openApi.paths?.['/api/forecast/models/train']?.post;
      const anomalyRoute = openApi.paths?.['/api/anomalies/detect']?.post;
      if (!trainingRoute || !anomalyRoute) throw new Error('A8 route set is missing from the current intelligence service.');
      return;
    } catch (error) {
      if (error.message.includes('route set') || error.message.includes('healthy status')) throw error;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  throw new Error('Timed out waiting for the current A8 intelligence service.');
}

async function main() {
  const port = await getAvailablePort();
  const serviceUrl = `http://127.0.0.1:${port}`;
  const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecogrid-a8-model-artifacts-'));
  const service = spawn(process.env.PYTHON_EXECUTABLE || 'python3', ['-m', 'uvicorn', 'intelligence.app.main:app',
    '--host', '127.0.0.1', '--port', String(port)], {
    cwd: projectRoot,
    env: { ...process.env, PYTHONPATH: [projectRoot, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
      IMPORT_SERVICE_TOKEN: values.IMPORT_SERVICE_TOKEN, MODEL_ARTIFACT_DIR: artifactDir },
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  try {
    await waitForCurrentService(service, serviceUrl);
    const test = spawn(process.execPath, ['--require', 'ts-node/register', '--test', 'src/modules/forecasts/forecast.a8.test.ts'], {
      cwd: backendDir,
      env: { ...process.env, ...values, DATABASE_URL: databaseUrl.toString(), PYTHON_SERVICE_URL: serviceUrl },
      stdio: 'inherit',
    });
    const exitCode = await new Promise((resolve, reject) => {
      test.once('error', reject);
      test.once('exit', (code, signal) => resolve(code === null ? (signal ? 1 : 0) : code));
    });
    process.exitCode = exitCode;
  } finally {
    if (service.exitCode === null) {
      service.kill('SIGTERM');
      await new Promise(resolve => service.once('exit', resolve));
    }
    fs.rmSync(artifactDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
