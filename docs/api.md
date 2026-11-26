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
  - Body: `{ horizonHours: 24, modelType: "xgboost" }`
  - Returns 24h/7d forecasts, confidence bounds, and MAE/RMSE/MAPE metrics.
- `GET /api/v1/forecast`

### 6. Anomaly Detection
- `POST /api/v1/anomalies/detect`
  - Body: `{ method: "combined", sensitivity: 2.5 }`
- `GET /api/v1/anomalies?severity=...&status=...`
- `PUT /api/v1/anomalies/:id/status`
  - Body: `{ status: "INVESTIGATING" | "RESOLVED" | "FALSE_POSITIVE" }`

### 7. Mathematical Optimization
- `POST /api/v1/optimization/run`
  - Body: `{ horizonHours: 24, batteryCapacityKwh: 150, peakDemandLimitKw: 75 }`
  - Returns MILP solver results, baseline vs optimized operating cost, and hourly battery dispatch schedule.
- `GET /api/v1/optimization/history`
- `GET /api/v1/optimization/:id`

### 8. Campus Digital Twin
- `POST /api/v1/scenarios/run`
  - Body: `{ name, description, modifications: { shift_operating_hours_end, occupancy_scaling_factor, solar_capacity_multiplier, battery_capacity_kwh } }`
  - Runs isolated scenario simulation without touching live telemetry.
- `GET /api/v1/scenarios`

### 9. AI Energy Assistant
- `POST /api/v1/assistant/query`
  - Body: `{ message: "Which building consumes the most electricity?" }`
  - Returns grounded answer with exact database citations.
