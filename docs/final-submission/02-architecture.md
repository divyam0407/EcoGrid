# 2. System architecture

## Runtime components

- **Frontend:** React + TypeScript + Vite. It provides authenticated navigation, campus dashboards, operational views, import workflows, forecasts, anomaly/recommendation pages, resource configuration and Digital Twin screens. Charts use Recharts.
- **Application API:** Node.js + Express + TypeScript, mounted under `/api/v1`. It authenticates requests, checks active organization membership and roles, applies entitlements on selected operations, validates application inputs and owns persistence/workflow orchestration.
- **Persistence:** PostgreSQL accessed through Prisma ORM. Tenant-bearing entities carry `organizationId`; APIs scope reads/writes to the authenticated organization. UTC timestamps are canonical for readings and forecasts; campus-local timezone drives calendar interpretation and display.
- **Intelligence service:** Python FastAPI. It implements preprocessing, chronological forecasting, statistical anomaly detection, operational correlation, solar-shape calculations and digital-twin/optimization endpoints. Backend-to-service calls use configured URLs and service authentication where applicable.
- **Optimization:** `scipy.optimize.milp` with SciPy’s HiGHS backend solves the mixed-integer linear program. It enforces configured energy, battery and grid constraints.
- **Forecast worker:** Backend worker handles model-training jobs and persists model lifecycle status and provenance; model artifacts are outside the relational schema and referenced by artifact path/hash.

## Request and data flow

A browser request carries the user session and active organization to Express. Express performs authentication and authorization, loads organization-scoped records through Prisma, then calls FastAPI for analytical work when needed. Results return to Express, are validated/persisted, and are returned to the client. Imports enter through multipart upload to the API, are hashed and validated, then normalized and persisted with batch/file/rejection records. The demo telemetry path uses the same authenticated API and database, but its source is marked `SYNTHETIC_DEMO` / `SIMULATED_LIVE_TELEMETRY`.

## Operational boundaries

The F4 demo runs a dedicated intelligence service on port 8001 with an explicitly configured model-artifact directory and a guarded `ecogrid_demo` database wrapper. This local demo startup is not a production deployment architecture. The application does not claim external cloud storage, transactional email, payment processing, distributed workers, or managed backups as part of the demonstration.

See `diagrams/01-overall-architecture.mmd` and `diagrams/02-component-interaction.mmd`.
