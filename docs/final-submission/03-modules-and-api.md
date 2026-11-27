# 3. Modules and API surface

All routes below are mounted below `/api/v1`; many require authentication, active organization membership and role checks. Read route middleware before treating an endpoint as public.

| Module | Purpose and processing | Representative APIs |
|---|---|---|
| Authentication and organizations | User sessions, memberships, organization selection, role and subscription administration | `/auth`, `/organizations` |
| Buildings and meters | Organization-scoped campus structure and meter metadata | `/buildings`, `/departments`, `/rooms` |
| Energy and telemetry | Readings, summaries, trends, comparisons; simulated telemetry ingestion/status | `GET /energy/readings`, `/summary`, `/trends`; `POST /energy/telemetry` |
| Dataset imports | Multipart upload of readings and optional metadata/weather/occupancy files; batch history and rejection CSV | `POST /imports`, `GET /imports`, `/imports/:id`, `/imports/:id/rejections.csv` |
| Operational context | Timetable and calendar records used as known operational features | `/schedules` and building/calendar APIs |
| Forecasting | Model training, lifecycle and activation, forecasts, history and monitoring | `POST /forecast/models/train`, `/forecast/run`, `GET /forecast/models`, `/forecast/monitoring` |
| Anomalies | Detection request and organization-scoped evidence/history | `/anomalies` |
| Recommendations | Evidence-driven recommendations, approval/status events and measurement | `/recommendations` |
| Solar and battery | Configuration and readings for modeled resources | `/solar`, `/batteries` |
| Optimization and scenarios | Optimization history/run, scenario create/update/duplicate/run/compare | `/optimization/run`, `/optimization/history`, `/scenarios` |
| Reporting | Dashboard/report outputs derived from persisted app data | `/reports` |

Legacy `POST /energy/upload` returns HTTP 410 and directs clients to the provenance-aware `/imports` flow. The Python service exposes internal analytical routes such as `/api/forecast/models/train`, `/api/forecast/models/{model_id}/predict`, `/api/anomalies/detect`, `/api/operations/correlate`, `/api/optimization/optimize`, `/api/digital-twin/simulate`, `/api/solar/forecast`, and `/api/imports/normalize`.

### Module contracts

- Imports preserve dataset name, license, optional source URL, filename, SHA-256, timezone, raw unit, preprocessing version, file metadata, progress, aggregate validation counts and rejected-row reasons. Supported multipart fields include readings, metadata, weather and occupancy. Dataset granularity is source-dependent; missing occupancy or room readings are not synthesized.
- Forecasts are hourly meter-level outputs. Models compare baselines and optionally Random Forest/XGBoost; model selection uses validation data before test evaluation. Forecasts do not infer room-level loads.
- Anomalies are retained with detection method, baseline count, quality and operational context; historical comparison uses prior same-local-hour/weekday records.
- Recommendations retain evidence, assumptions, limitations and lifecycle events. Estimated savings are not verified outcomes.
- Optimization scenarios require aligned hourly inputs and explicit configuration for tariffs/resources. Infeasible cases do not fabricate schedules.
