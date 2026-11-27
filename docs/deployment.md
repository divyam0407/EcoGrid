# EcoGrid Deployment & Operations Guide

EcoGrid can be deployed either locally for development or as containerized services using Docker Compose.

## 1. Quick Start (Local Development)

### Prerequisites
- Node.js >= 20.x and npm
- Python >= 3.10 with `pip`
- PostgreSQL 16 (local service or Docker Compose)

### Steps

1. **Install Python Intelligence Dependencies:**
   ```bash
   python3 -m pip install -r intelligence/requirements.txt
   ```

2. **Configure and start PostgreSQL:**
   ```bash
   # Only if no root .env already exists; never overwrite local configuration.
   cp .env.example .env
   docker compose up -d db
   ```

   Choose either the Docker database or a locally installed PostgreSQL service;
   do not start both on port 5432 unless you change the Compose host port. The host-run
   backend reads `backend/.env`; configure its PostgreSQL `DATABASE_URL` there.
   Do not replace a populated backend `.env` with the example file. For Compose,
   the root `.env` supplies `POSTGRES_*`, `JWT_SECRET`, and
   `IMPORT_SERVICE_TOKEN`. Replace the password placeholder with a generated
   local password before starting Compose, and use managed secrets outside
   local development.

3. **Start the intelligence service:**
   ```bash
   npm run dev:intelligence
   ```

4. **Install backend dependencies and start Express:**
   ```bash
   cd backend
   npm install
   npx prisma generate
   npm run prisma:migrate:status
   npm run dev
   ```

   `ecogrid_db` contains migrated ABC University demo records, but its current
   Prisma status has three pending migrations: `20261128000000_a9_optimization_configuration`,
   `20261128001000_require_explicit_tariff_price`, and
   `20261129000000_a10_saas_foundation`. Do not apply them as part of local
   startup. The app's A9/A10 APIs may fail against this database until that
   migration is separately approved and verified. The isolated `ecogrid_a10_test`
   database has the complete 15-migration chain but contains test data, not the
   ABC demo records. The original SQLite database has not been changed in this
   workflow. `migrate deploy` is repeatable but will apply pending migrations to
   whichever database `DATABASE_URL` selects, so verify the target before use.

6. **Start the frontend:**
   ```bash
   cd ../frontend
   npm install
   npm run dev
   # Runs on http://localhost:5173
   ```

7. **Create the first organization:**
   - Open `http://localhost:5173/register` and create an account with a unique
     email address and a 12-character-or-longer password.
   - This creates an organization and a trial subscription. No payment is
     processed. An empty database has no ABC University demo account.

---

## Dataset imports

Sign in with an organization administrator or energy manager, then open
**Dataset Imports**. Review the source terms and attribution obligations before
uploading any file. EcoGrid does not fetch datasets for you. The uploader stores
one source building mapped to one EcoGrid building and meter per batch; provide
the source building ID for BDG2 and ASHRAE. Optional weather and I-BLEND
building-level occupancy files are preserved and hashed when supplied. No
occupancy or timetable data is synthesized. See [dataset import requirements](dataset-imports.md)
for accepted inputs and the current data limitations.

Imports are tenant-scoped. Their input files, including metadata, weather and
occupancy files, are hashed and stored in the configured private import storage
directory/volume. Back up and restrict that storage in production. A completed
batch exposes source identification, unit/timezone details, target mapping,
file hashes and a downloadable rejected-row report.

### Forecast model artifacts

Express starts a PostgreSQL-backed training worker with the application server;
training requests return immediately and can be polled through the model API.
The Python intelligence service stores compressed model artifacts under
`MODEL_ARTIFACT_DIR`, isolated into organization-hash directories. Compose mounts
the persistent `modeldata` volume at `/app/model-artifacts`. Back up that volume
with PostgreSQL, and restrict local artifact directory permissions. Artifacts
are not committed to Git. Activate a ready version explicitly; a previous ready
version can be re-activated as rollback. See [A8 forecasting](A8-forecasting.md)
for data requirements and evaluation limits.

## A9 optimization migration and data safety

A9 adds two forward-only Prisma migrations. Before any shared or production rollout,
apply the migration to an empty disposable PostgreSQL database with
`npx prisma migrate deploy`, verify `npx prisma migrate status`, and exercise the
optimization and scenario suites there. Then schedule the same additive migration
as a backed-up deployment step. Do not run `prisma db push`, `migrate reset`, or
the seed script against the ABC University database. The A9 tests are guarded to
`ecogrid_a9_test` and do not target `ecogrid_db` or SQLite.

Optimization uses the SciPy/HiGHS MILP backend included by the existing SciPy
dependency. No separate solver binary is installed. Review
[`A9 energy optimization`](A9-energy-optimization.md) for the model assumptions,
tariff requirements, solar forecast input requirements, and current interval
limitations before enabling user-facing optimization.

## 2. Production Docker Compose Deployment

Compose is a local deployment aid, not a hardened production topology. Set
`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, a randomly generated
`JWT_SECRET` (at least 32 characters), a separate high-entropy
`IMPORT_SERVICE_TOKEN` (at least 32 characters), `CORS_ORIGIN`, and the Python
service URL through the deployment environment. Do not use checked-in example
values for production. Run migrations as a separate controlled step with
`cd backend && npm run prisma:migrate:deploy`, then start the stack:

```bash
docker compose up --build -d
```

The PostgreSQL container has a readiness check, and the backend waits for the
database to become healthy. Compose does not automatically migrate the existing
SQLite demo records or run the demo seed script.

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:5001`
- Python Intelligence Service: `http://localhost:8000`
- PostgreSQL: `localhost:5432`

## A10 SaaS operations and launch boundaries

### Tenant access and roles

Every authenticated request checks current account state, token version and
active organization membership in PostgreSQL. The role comes from the current
membership record. Organization membership APIs support administrator role
changes, deactivation and invitations; platform administrators are represented
by a separate account flag. Invitation tokens are single use and stored hashed.
Until transactional email is configured, an organization administrator must
deliver the one-time token securely. Password reset and email verification are
not implemented; public account registration is therefore not appropriate for
an open commercial launch without an onboarding policy.

### Sessions, limits and billing

Access tokens have a configurable short lifetime. Refresh tokens rotate and are
stored hashed in HTTP-only cookies; membership and account revocation is checked
against the database. Login and other auth endpoints have per-process rate
limits. Production must also configure distributed gateway limits because
in-process counters do not coordinate across replicas. Configure exact HTTPS
origins in `CORS_ORIGIN`; wildcard production origins are rejected.

Starter, Professional and Enterprise entitlement dimensions are configured in
code, without prices. New organizations receive a trial; migrated organizations
receive a legacy entitlement. There is no payment provider, invoice issuance,
renewal webhook or automated cancellation integration. Do not represent an
entitlement as paid billing. Subscription endpoints expose status and usage;
plan enforcement applies to selected creation and compute routes, and should be
reviewed before commercial limits are promised.

### Files and background work

Dataset imports and model artifacts currently use private local directories or
Compose named volumes. They are not yet backed by an S3-compatible abstraction,
presigned access service, object retention policy or cross-region backup. Keep
these paths private and persist/backup the volumes. The forecast work queue is
PostgreSQL-backed through forecast model status; a polling worker currently runs
inside the Express process, supports interrupted-claim recovery and graceful
shutdown, and exposes `/health/worker`. For multiple API replicas, run exactly
one designated worker or add a database-coordinated lease before scaling it.
Other long-running workflows should be reviewed before relying on retries.

### Database change and recovery procedure

The A10 schema change is additive and was validated on an isolated PostgreSQL
database. The live `ecogrid_db` and original SQLite file have not received this
migration. Before migrating any deployment database:

1. Confirm the database identity, environment and owner with a read-only query.
2. Take a PostgreSQL custom-format backup (`pg_dump -Fc`) and record its hash.
3. Restore that backup into a separate disposable database and verify table
   counts, foreign keys and representative organization workflows.
4. Apply only `npx prisma migrate deploy` to the confirmed target in a scheduled
   maintenance window. Never use `prisma db push`, `migrate reset` or seed in a
   populated deployment.
5. Run `npx prisma migrate status`, check readiness, compare expected counts and
   exercise login plus organization-scoped reads.
6. If verification fails, stop application rollout and restore the backup to a
   new database, then point the deployment back after investigation. Do not
   attempt to reverse an applied migration by deleting rows or editing migration
   history.

For a manual backup: `pg_dump -Fc --file ecogrid-YYYYMMDD.dump "$DATABASE_URL"`.
Restore only into an empty, separately named recovery database with
`pg_restore --create` avoided; create the target explicitly, then use
`pg_restore --dbname "$RECOVERY_DATABASE_URL" ecogrid-YYYYMMDD.dump`. Verify
with `pg_restore --list`, table counts and application checks before considering
the backup usable. No scheduled backup or restoration drill is configured by
this repository, so backup reliability is unverified. Back up import and model
artifact storage separately with retention and access controls.

### Monitoring and deployment

`/health` is a process liveness check, `/ready` checks PostgreSQL, and
`/health/worker` reports the in-process forecast worker. Express logs structured
request IDs, method, path, status and duration without request bodies or tokens.
Python logs and an external error/metrics backend still need deployment-level
configuration. Do not expose health endpoints publicly without network controls.

Dockerfiles provide a repeatable container build, but this repository does not
configure a cloud deployment, TLS termination, managed secrets, CI workflow,
object storage provider, distributed rate limiter or production monitoring.
Use separate development/test/production databases and secrets. Build and
validate images in CI, deploy backend and Python privately, serve the frontend
behind HTTPS, and run migrations as a one-off release job. Confirm `/ready` and
worker health after rollout.

### Data governance and launch acceptance

Customer-uploaded source data remains customer-controlled; define retention,
export and deletion procedures contractually before onboarding. A complete
organization data export/deletion workflow and automated retention service are
not implemented. Preserve dataset license, attribution and file provenance.
Do not fabricate occupancy or schedules. ABC University is
`SYNTHETIC_DEMO`; benchmark data must remain labeled separately from real
customer records. Forecast metrics on synthetic or benchmark data are not
commercial accuracy evidence. Optimization outcomes are simulated estimates,
not measured energy savings.

Commercial launch remains blocked on a security review, configured email and
billing providers, private object storage, backup restoration drill, production
deployment/observability, data export/deletion controls, and acceptance testing
with appropriately licensed real-world university data.

### Exact integration configuration status

The following values are currently consumed by the application: backend
`DATABASE_URL`, `JWT_SECRET`, `JWT_ACCESS_TTL_SECONDS`, `COOKIE_SAME_SITE`,
`CORS_ORIGIN`, `IMPORT_SERVICE_TOKEN`, `IMPORT_STORAGE_DIR`,
`PYTHON_SERVICE_URL`, and `PORT`; `TRUST_PROXY=1` enables one trusted proxy hop.
The Python service consumes `IMPORT_SERVICE_TOKEN`, `IMPORT_STORAGE_DIR`, and
`MODEL_ARTIFACT_DIR`. Compose also requires `POSTGRES_USER`,
`POSTGRES_PASSWORD`, and `POSTGRES_DB`.

No provider credentials can activate the following capabilities today because
there is no corresponding adapter or configuration reader:

| Capability | Current implementation | Required next integration work |
| --- | --- | --- |
| S3-compatible storage | Private local paths only: `IMPORT_STORAGE_DIR` and `MODEL_ARTIFACT_DIR` | Add a storage adapter for endpoint, bucket, region, access credentials, private object ACLs, scoped keys, retention and signed downloads; migrate files with hash verification. No S3 environment keys are currently supported. |
| Transactional email/password recovery | Invitation token is returned once for secure manual delivery; no password reset or verification | Select an email provider, add provider API key/from-address configuration, invitation/verification/reset templates, token expiry/revocation, and delivery tests. No mail variables are currently supported. |
| Billing | Subscription/entitlement records only; `billingProvider` is `UNCONFIGURED` | Select a provider and implement API key, webhook signing secret, customer/subscription mapping, idempotent event handling, invoices, renewals and cancellation synchronization. No billing credentials are currently supported. |
| Distributed rate limits | Per-process memory limiter | Configure an API gateway/shared limiter or add a shared store and its private connection URL; test multi-replica behavior. No Redis/shared-store setting is currently supported. |
| Scheduled backups | Manual `pg_dump`/`pg_restore` procedure only | Configure a protected scheduled job, encrypted destination, retention, alerting and a tested restore drill. No backup scheduler is included. |
| Export/deletion | No customer export or organization deletion endpoint | Define retention/legal-hold policy, export format, deletion scope, asynchronous execution, audit and verification tests before promising these controls. |
| Separate forecast worker | Worker starts in every Express server process | Keep one API replica for now, or add a worker-only entrypoint/role and coordinated lease/heartbeat before scaling API replicas. No worker role flag is currently supported. |
| Complete entitlement metering | Limits cover selected creates/compute operations; pending invites reserve user seats | Add atomic usage reservation for concurrent requests and account for meter creation, actual inference runs, uploaded bytes and model artifacts. Current counters do not enforce every dimension. |
| CI/cloud deployment | Dockerfiles and local Compose only; no CI workflow or cloud resources | Add CI with ephemeral PostgreSQL, build/test/migration checks, then choose a cloud target and configure managed secrets, TLS, private networking, object storage, monitoring and release migrations. No deployment credentials or cloud configuration are present. |
