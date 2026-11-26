# EcoGrid REST API Documentation

All protected endpoints require HTTP Bearer Authentication:
`Authorization: Bearer <jwt-token>`

Base URL: `/api/v1`

---

### 1. Authentication
- `POST /api/v1/auth/register`
  - Body: `{ name, email, password, organizationName, industryType }`
  - Response: `{ token, user }`
- `POST /api/v1/auth/login`
  - Body: `{ email, password }`
  - Response: `{ token, user }`
- `GET /api/v1/auth/me`
  - Authenticated user profile and organization memberships.

### 2. Infrastructure & Organization
- `GET /api/v1/organizations`
- `GET /api/v1/organizations/:id`
- `PUT /api/v1/organizations/:id`
- `GET /api/v1/buildings`
- `POST /api/v1/buildings`
- `GET /api/v1/departments`
- `GET /api/v1/rooms`

### 3. Energy Telemetry
- `POST /api/v1/energy/preview` (multipart/form-data)
  - Previews CSV headers and detects suggested column mappings.
- `POST /api/v1/energy/upload` (multipart/form-data)
  - Ingests raw meter readings with timestamp and value validation.
- `GET /api/v1/energy/readings?buildingId=...&limit=...`
- `GET /api/v1/energy/summary?days=...`
- `GET /api/v1/energy/trends?interval=daily`
- `GET /api/v1/energy/building-comparison`

### 4. Operational Intelligence & Schedules
- `GET /api/v1/schedules`
- `POST /api/v1/schedules`
- `POST /api/v1/schedules/upload` (multipart/form-data)
- `GET /api/v1/schedules/correlate`
  - Correlates timetable bookings with real-time meter readings to identify equipment overruns and low-occupancy waste.

### 5. Demand Forecasting
- `POST /api/v1/forecast/run`
  - Requires an activated organization-owned meter model. Persists idempotent 24h/7d forecast intervals; empirical validation-error bounds are not calibrated confidence intervals.
- `POST /api/v1/forecast/models/train`
  - Queues background training; returns HTTP 202 and a model/job ID.
- `GET /api/v1/forecast/models` and `GET /api/v1/forecast/models/:modelId`
  - Lists organization-scoped versions, status, evaluation, features and provenance.
- `POST /api/v1/forecast/models/:modelId/activate`
  - Activates a ready version for its meter and source; activating an older ready version performs rollback.
- `POST /api/v1/forecast/models/:modelId/retry`
  - Queues a new version after a failed training job.
- `GET /api/v1/forecast/monitoring`
  - Matches forecasts to compatible observed intervals and reports measured errors only.
- `GET /api/v1/forecast`
  - Lists saved predictions for the caller's organization, optionally filtered by meter, building or source.

### 6. Anomaly Detection
- `POST /api/v1/anomalies/detect`
  - Body: `{ method: "combined", sensitivity: 2.5 }`
- `GET /api/v1/anomalies?severity=...&status=...`
- `PUT /api/v1/anomalies/:id/status`
  - Body: `{ status: "INVESTIGATING" | "RESOLVED" | "FALSE_POSITIVE" }`

### 7. Mathematical Optimization
- `POST /api/v1/optimization/run`
  - Body: `{ buildingId, horizonHours: 24, peakDemandLimitKw?, solarGenerationKw? }`.
  - Requires one active main-feeder meter, active A8 forecast, one consistent organization tariff and explicit hourly solar input when solar is installed. It uses configured batteries; it does not invent equipment or pricing.
  - Returns HiGHS MILP status, cost components, energy dispatch, constraints, tariff labels and limitations. Infeasible solver runs return diagnostics and no schedule.
- `GET /api/v1/optimization/history`
- `GET /api/v1/optimization/:id`

### 8. Campus Digital Twin
- `GET /api/v1/scenarios`
- `POST /api/v1/scenarios` and `PUT /api/v1/scenarios/:id`
  - Save/edit drafts with organization building and explicit forecast, tariff and scenario assumptions.
- `POST /api/v1/scenarios/:id/duplicate` and `POST /api/v1/scenarios/:id/run`
  - Duplicate scenario configuration or run it in simulation mode. Results are estimates and do not modify meter readings.
- `POST /api/v1/scenarios/compare`
  - Body: `{ scenarioIds: ["...", "..."] }`. Compares completed scenarios for the same building, tariff, currency and timestamps.

### 9. Equipment and Tariffs
- `POST /api/v1/organizations/:id/tariffs` and `PUT /api/v1/organizations/:id/tariffs/:tariffId`
  - Organization administrators configure import rates, local tariff periods, contractual export permission/compensation, demand charges, fixed charges and optional emissions factor.
- `POST /api/v1/batteries` / `PUT /api/v1/batteries/:id`
  - Configure explicit capacity, SOC limits, power, efficiencies, cycle penalty and grid-charge permission.
- `POST /api/v1/batteries/:id/readings`
  - Record unitized SOC in kWh and power in kW. Simultaneous charging/discharging and configured-limit violations are rejected.
- `POST /api/v1/solar`
  - Add an installation using explicitly supplied building and capacity.

### 10. AI Energy Assistant
- `POST /api/v1/assistant/query`
  - Body: `{ message: "Which building consumes the most electricity?" }`
  - Returns grounded answer with exact database citations.
