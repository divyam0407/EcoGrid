# A8 forecasting and predictive analytics

## Model lifecycle

`POST /api/v1/forecast/models/train` records a `QUEUED` model job and returns HTTP 202. The Express worker claims jobs atomically from PostgreSQL, moves them through training/evaluation stages, records errors for retry, and never trains during a forecast request. The training request is scoped to one organization, meter and data source. Successful jobs register an immutable version with chronological train/validation/test periods, quality counts, selected features, metrics, request configuration, data source and linked import batch/file hashes.

Python model artifacts are compressed Joblib files under `MODEL_ARTIFACT_DIR/<sha256(organizationId)>/<modelId>.joblib`, written with private directory/file permissions. The organization ID is hashed for the directory name; inference requires the organization scope and matching model ID. In Docker the intelligence service uses the persistent `modeldata` volume. Back up that volume with PostgreSQL model rows. Artifacts are excluded from Git. Model activation is explicit and replaces the active version only for the same organization, meter and source. Re-activating a prior ready version provides rollback.

`POST /api/v1/forecast/run` requires an active ready model and persists each forecast point with organization, building, meter, model version, source, interval, requested horizon and lead hour. A deterministic unique key makes retries idempotent. `GET /api/v1/forecast/monitoring` matches only compatible, quality-approved energy intervals; a missing actual remains pending. MAE, RMSE, MAPE for non-near-zero actuals and WAPE are reported by model/meter/building and requested horizon.

## Preparation and evaluation

Forecasting is meter-level and hourly. Express sends canonical UTC timestamps, normalized interval kWh, interval length, quality status, timezone, and available timetable/calendar context. UTC bins retain both sides of DST folds. Local hour, weekday, month, weekend and DST features use the organization's IANA timezone. Duplicate timestamps are reduced deterministically; invalid, reset and estimated readings are excluded; gaps remain missing and are not interpolated. A model requires at least 28 days of usable hourly history.

Candidates are last observation, previous-day, previous-week and same-hour seasonal median, plus Random Forest. XGBoost is optional and loaded only when explicitly requested. `auto` chooses by validation MAE. Test scores are computed only after selection is frozen. Metrics include MAE, RMSE, MAPE only for non-near-zero actuals and WAPE. Empirical p90 absolute validation-error bands are descriptive intervals, not calibrated prediction coverage.

## Operational inputs and limits

Timetable entries are used only as scheduled activity, never as actual occupancy. Historical timetable rows are excluded when their `updatedAt` is later than the energy timestamp, and calendar events are excluded before their `createdAt`, to avoid giving training periods information that was not recorded as available. Future schedules and known holiday/examination events are included when present. If the trained feature set requires an unavailable future operational feature, inference fails instead of filling it with a fabricated value.

Persisted occupancy records distinguish observed from scheduled/estimated sources, but occupancy is not yet an active forecast feature because future actual occupancy is not available consistently. Historical weather observations are not persisted with energy readings; weather is omitted. Solar generation is not a net-load feature. Building- and room-level disaggregation is not inferred. Anomalies use a prior same-local-hour weekday median/MAD baseline, require four historical comparisons, retain method/baseline/quality/context evidence, and do not create savings recommendations.

## ABC University data check (2026-11-26)

Read-only inspection found five populated meters with 1,440 hourly, usable readings each, covering 2026-09-26 through 2026-11-25, with no duplicate timestamps or missing hours in the prepared series. A sixth meter has no readings. The populated source is `SYNTHETIC_DEMO`, so these results validate pipeline behavior only and are not real-world benchmark or commercial accuracy evidence.

One chronological 70/15/15 split produced 890 train, 191 validation and 191 test samples per populated meter. `auto` selected Random Forest on validation for all five. On the common one-step test period, Random Forest MAE ranged 1.029–1.080 kWh (mean 1.045); previous-week baseline MAE ranged 1.248–1.384 kWh (mean 1.332). A single fixed-origin forecast at the start of the test window gave 24-hour MAE 1.026–1.100 kWh (mean 1.066) and 168-hour MAE 1.013–1.085 kWh (mean 1.038), with 24 and 168 target points respectively per meter. Each meter has only one origin in these multi-step checks, so they are exploratory diagnostics, not robust reliability estimates. These are synthetic-demo results, not evidence for energy savings or real-world performance.

## Operational and commercial limitations

No real-world licensed benchmark data was evaluated. No savings claims are derived from these forecasts. Before commercial claims, add repeated rolling-origin horizon-specific evaluation on licensed real data, assess actual occupancy/weather integration, and monitor drift with sufficient matched actuals.
