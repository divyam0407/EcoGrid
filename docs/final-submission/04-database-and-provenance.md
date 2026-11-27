# 4. Database design and provenance

## Storage model

PostgreSQL is the configured primary database and Prisma is the schema/client layer. `Organization` is the tenant root. Core records such as buildings, meters, readings, schedules, calendar events, imports, forecasts, anomalies, recommendations, optimization runs, scenarios, tariffs, solar and battery records are scoped to organizations directly or through their parent entity. The application layer enforces active membership and organization-scoped access; database foreign keys enforce declared parent relationships.

## Principal relationships

- `Organization` → `OrganizationMember` ↔ `User`; one organization contains `Building` records.
- `Building` → `Department`, `Room`, `Meter`; these structure records support campus-level mapping.
- `Meter` → `EnergyReading`; each energy record also references organization/building and may reference a room and import batch. A uniqueness constraint protects `(organizationId, meterId, timestamp)`.
- `DataImportBatch` → `ImportFile`, `ImportRejectedRow`, and imported readings/occupancy/schedule/calendar records. Batch records preserve process state and aggregate quality counts; file rows store individual digest/size/storage metadata.
- `ForecastModel` → `Prediction`; a model is associated with organization, building and meter. `Prediction` also references its building and optionally meter/model.
- `Anomaly` and `Recommendation` reference organization/building and optional meter/room. Recommendations have event and measurement children.
- `ElectricityTariff` → tariff periods; solar installation → solar readings; battery → battery readings.
- `OptimizationRun` references organization/building. `Scenario` references organization and optionally building; its configuration/result are JSON strings. There is no direct schema foreign key from a scenario to an optimization run.

The diagram is intentionally a focused view of these declared Prisma relationships, not an exhaustive schema dump. See `diagrams/08-database-er.mmd`; confirm any future schema edits against `backend/prisma/schema.prisma`.

## Provenance and quality

Energy readings include canonical UTC timestamp, optional original local-time string, normalized kWh, optional average kW, original raw value/unit, interval, source/data-source label and quality status. A batch records dataset/license/source/timezone/preprocessor version and file hash; additional files are individually hashed in `ImportFile`. Invalid rows remain available through `ImportRejectedRow` and downloadable CSV. Synthetic demo records are labeled as synthetic. Simulated telemetry also has a dedicated source label.

## Tenant isolation

Authorization middleware resolves the user’s active organization and membership before protected workflows. Controllers use organization IDs for scoped data access. Organization-specific uniqueness keys and Prisma parent relations add consistency safeguards but do not replace API authorization. Integration suites include tenant-isolation coverage; consult each milestone report for exact run status.

## Time and granularity

UTC is the storage and interchange standard for instants. `Asia/Kolkata` is the campus-local calendar/time interpretation context. India has no daylight-saving transition. A schedule is expected activity and its expected headcount is not an observed occupancy record. Dataset resolution is not upgraded by inference: meter-level history remains meter-level.
