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
   pip install -r intelligence/requirements.txt
   ```

2. **Configure and start PostgreSQL:**
   ```bash
   cp .env.example .env
   docker compose up -d db
   ```

   A locally installed PostgreSQL service can be used instead. The host-run
   backend reads `backend/.env`; configure its PostgreSQL `DATABASE_URL` there.
   Do not replace a populated backend `.env` with the example file. For Compose,
   the root `.env` supplies `POSTGRES_*`, `JWT_SECRET`, and
   `IMPORT_SERVICE_TOKEN`. Replace the password placeholder with a generated
   local password before starting Compose, and use managed secrets outside
   local development.

3. **Apply migrations and start the intelligence service:**
   ```bash
   python -m uvicorn intelligence.app.main:app --host 127.0.0.1 --port 8000
   ```

4. **Install backend dependencies and start Express:**
   ```bash
   cd backend
   npm install
   npx prisma generate
   npm run prisma:migrate:status
   npm run dev
   ```

   The current PostgreSQL database has the applied schema and migrated ABC
   University demo records. The original `backend/prisma/dev.db` remains
   unchanged, with a verified backup retained under `backend/prisma/backups/`.
   `migrate deploy` is repeatable and applies only pending migrations.

5. **Start the frontend:**
   ```bash
   cd ../frontend
   npm install
   npm run dev
   # Runs on http://localhost:5173
   ```

7. **Log in to the Demo System:**
   - URL: `http://localhost:5173/login`
   - Use the **One-Click Demo Login** or credentials:
     - Administrator: `admin@abc.edu` / `admin123`
     - Facility Manager: `facility@abc.edu` / `admin123`

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

## 2. Production Docker Compose Deployment

Set `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, a strong `JWT_SECRET`,
and a high-entropy `IMPORT_SERVICE_TOKEN` through the deployment environment.
Do not use local example credentials in production. Apply migrations as a controlled deployment step
with `npm run db:migrate:deploy`, then run the stack:

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
