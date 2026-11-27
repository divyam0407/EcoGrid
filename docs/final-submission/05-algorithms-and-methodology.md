# 5. Algorithms and methodology

## Input preparation

Readings are parsed, validated and normalized to hourly energy. The quality-aware preprocessing handles timestamp order/duplicates and hourly series preparation. Missing values are not silently presented as measured readings. Importers retain source units/raw values and conversion/provenance metadata. A forecast model may use recursive predictions to bridge a limited gap to a requested future window; those bridge values are estimates and are not meter observations. Missing required lags or operational features produce validation errors.

## Demand forecasting

The Python `DemandForecastingEngine` compares `last`, `previous_day`, `previous_week`, and `seasonal_median` baselines. With `auto` or Random Forest mode, it also evaluates a deterministic RandomForestRegressor. XGBoost is optional. Hourly features include cyclic local hour/day/month, weekend and lag/rolling statistics; operational/calendar variables are used where available and required for the selected model. At least 28 days of usable hourly history is required. Chronological data is split 70% train, 15% validation and 15% test. Candidate selection uses validation MAE; test results are reported after selection. Horizon checks at 24 and 168 hours can be single fixed-origin diagnostics, not a guarantee of future accuracy.

For observed demand `y_t` and prediction `ŷ_t`, MAE is `mean(|y_t − ŷ_t|)`. The project’s synthetic data diagnostics are exploratory and are not real-world model validation.

## Anomaly detection

The robust detector builds a historical baseline from prior readings for the same meter, local hour, weekday and available operational-context matches. It requires at least four baseline samples. Median `m` and median absolute deviation `MAD` produce robust scale `1.4826 × MAD`; the score is `|x − m| / (1.4826 × MAD)` when scale is nonzero. Combined mode can also apply Isolation Forest when enough comparison points exist. Detection output retains expected/observed values, deviation, sample count, method, quality and context. A detector finding is a candidate deviation, not proof of equipment fault.

## Operational intelligence and recommendations

Schedules and calendar records provide contextual features such as scheduled classes, holidays and exam periods. Context is descriptive evidence; it does not confirm room occupancy. Recommendation generation combines persisted observations and operational evidence and records methodology, assumptions, limitations and lifecycle events. Savings estimates remain unverified until measured against a suitable baseline and post-action data.

## Optimization and Digital Twin

The optimizer formulates a mixed-integer linear program over hourly power/energy, grid imports/exports, solar allocation, battery charge/discharge and SOC. For each interval, energy balance equates grid import minus grid charging plus solar-to-load plus battery discharge to facility demand. Solar allocation splits generation among load, battery, permitted export and curtailment. SOC advances with configured charge/discharge efficiencies and interval duration. Binary charge-mode constraints prevent simultaneous charging/discharging. Capacity, SOC, power, reserve, final SOC, grid-charge and export permissions apply where configured. Objective includes energy cost, permitted export compensation, throughput degradation and configured peak proxy. Scenario results are persisted and compared only when their relevant scope/tariff/time window is compatible.

A solver result `OPTIMAL` means the configured mathematical problem was solved to optimality under the supplied inputs. It does not establish that inputs represent a real facility or that savings occurred. The interface marks savings `ESTIMATED_UNVERIFIED`.

## Simulated telemetry

The browser demo submits deterministic readings for five demo meters through authenticated `POST /api/v1/energy/telemetry`. One request represents a 60-minute interval while the browser sends on a 15-second demonstration cadence. Records are synthetic and idempotent by meter/timestamp. The simulator is not an IoT device connector and stops with the browser session.
