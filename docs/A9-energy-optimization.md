# A9 Energy Optimization and Digital Twin

## Status and interpretation

A9 adds a solver-backed mixed-integer linear optimization path. Results use the labels `FORECAST` or `SIMULATED`; neither means realized savings. Savings remain `ESTIMATED_UNVERIFIED` until independently measured against a defined operating baseline. No schedule is returned when the solver cannot prove an optimum.

## Optimization model

The Python intelligence service solves with `scipy.optimize.milp` and its HiGHS backend. Inputs are interval-average kW, interval duration in hours, interval kWh prices, and timezone-aware ISO timestamps. Every input array must align to contiguous intervals. Energy is calculated as average kW multiplied by interval hours.

For each interval, the facility-load constraint is:

```text
grid import - grid-to-battery + solar-to-load + battery discharge = facility demand
```

The solar allocation constraint is:

```text
solar-to-load + solar-to-battery + permitted grid export + curtailed solar = available solar generation
```

Battery state of charge is:

```text
SOC[t] = SOC[t-1] + (solar charge + grid charge) × charge efficiency × interval hours
         - battery discharge / discharge efficiency × interval hours
```

Binary charge-mode variables prevent simultaneous charging and discharging. Capacity, SOC, reserve, power, final SOC, grid-charge permission, export permission and optional grid-import peak limits are enforced when configured. A battery is not created implicitly. A grid export is unavailable unless the tariff explicitly permits export and defines compensation.

The objective minimizes:

```text
sum(import kW × interval hours × import rate)
- sum(export kW × interval hours × export compensation)
+ battery throughput degradation penalty
+ configured demand-charge rate × maximum grid import in the selected horizon
+ any explicitly supplied fixed charge
```

The baseline compares the same demand and solar profile with direct solar self-consumption, no battery dispatch, and the same configured tariff. Results include cost components, imports, exports, solar self-consumption/curtailment, battery flows, peak kW, and grid emissions only when an emissions factor is configured.

## Tariffs and peak demand

Import prices use the selected organization tariff and its local-time periods. Ambiguous or missing periods block cost optimization. Export permission defaults to off. Demand charges require a configured charge and a demand window matching the input interval.

Demand charge is currently a selected-horizon peak proxy. The application does not model billing-cycle peaks, ratchets, coincident peaks, previous peaks, or sub-hourly demand. The present dispatch API accepts hourly forecasts (24 hours or 7 days), so 15- and 30-minute tariff demand windows are stored but optimization is rejected when they cannot be matched to hourly inputs. Fixed charges are retained as tariff metadata and excluded from the backend horizon comparison because their billing period is not defined.

## Solar, battery and data provenance

Solar installation capacity and generation history come from existing records. There is no configured weather-backed solar forecast. If a building has solar, optimization requires a supplied hourly solar profile and labels the result `SIMULATED`. The optional solar-shape endpoint also requires explicit capacity, cloud-cover assumptions and derating; it is not a weather forecast.

Battery configuration requires explicit capacity, min/max/initial SOC, power limits, efficiencies, and degradation penalty. A recently recorded SOC is used only through the new unit-explicit `stateOfChargeKwh` field and only when it is no older than six hours. Legacy `stateOfCharge` values are preserved but not interpreted because their unit was unspecified. If there is no recent unitized reading, the configured initial SOC is used and retained in run configuration.

## API and persistence

- `POST /api/v1/optimization/run` uses one organization-scoped active main-feeder meter, its active A8 forecast model, one effective configured tariff, configured equipment, and explicit solar assumptions when required.
- `GET /api/v1/optimization/history` and `GET /api/v1/optimization/:id` expose organization-scoped run results.
- `POST /api/v1/scenarios` saves a draft with a building and explicit assumptions; `PUT /api/v1/scenarios/:id` edits drafts; `POST /:id/duplicate` copies a scenario; `POST /:id/run` executes it; `POST /api/v1/scenarios/compare` compares completed scenarios with the same building, tariff, currency and timestamps.
- Organization tariff endpoints create and update flat/time-of-use terms, export settings, demand charges, fixed charges, and emissions factors. Battery and solar writes validate organization membership and configured operating limits.
- A9 adds tariff fields, battery operating settings, scenario scope/status timestamps, optional optimization financial fields for infeasible runs, and a unitized battery SOC reading field through two forward-only Prisma migrations. The second removes the default import tariff price while preserving all existing configured prices.

## Limitations and safe rollout

Multiple active main-feeder meters and multiple active batteries are rejected until their aggregation/dispatch topology can be represented safely. Solar forecasts remain explicit scenario inputs. Carbon intensity is a single configured factor, not a time-varying grid signal. Recommendations are not generated automatically from simulations. The A9 migration must first be deployed to an empty disposable PostgreSQL database and verified; only then should an operator schedule the additive migration for a backed-up deployment database. Do not reset, seed, or run `db push` against the ABC University database.
