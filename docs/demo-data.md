# ABC University synthetic demonstration

EcoGrid's local end-to-end demonstration uses a separate PostgreSQL database named `ecogrid_demo`. Demo database commands intentionally derive the connection from `backend/.env`, verify that its base connection points to local `ecogrid_db`, and replace only the database name with `ecogrid_demo`. They fail closed if the base URL is remote or points elsewhere. Never run the legacy `seed` command for this workflow.

## Initialize and seed

The database must first exist and be owned by the local application role. A local PostgreSQL administrator can create it once with:

```sh
createdb --owner ecogrid_app ecogrid_demo
```

Then run from the repository root:

```sh
npm run demo:db -- migrate
npm run demo:db -- status
npm run demo:db -- schema
npm run demo:db -- generate
npm run demo:db -- seed
npm run demo:db -- validate
```

`migrate` applies the checked-in Prisma migrations only to `ecogrid_demo`. It does not use `db push`, reset, truncate, or access the live database. `seed` can be rerun: the demo organization and its entities have stable IDs, energy observations use the schema uniqueness key, solar readings use deterministic primary keys, and schedules/calendar rows use stable record keys. The script refuses to run if the demo database contains an organization outside the dedicated ABC synthetic organization. It never deletes existing records.

The default local demo login is `demo-admin@abc.edu` with password `EcoGrid-Demo-2026!`. To choose another password on first seed, set `DEMO_ADMIN_PASSWORD` in the environment before running the seed. A rerun does not change an existing account password.

## Data and provenance

The seed generates five building feeder meters with hourly UTC timestamps for a rolling 90-day window, plus hourly solar output for the Academic Block. Local source timestamps include their UTC offset so repeated daylight-saving-time hours remain distinguishable. Values are deterministic for each timestamp and fixed PRNG seed. Re-running later extends the end of the window; existing energy and solar readings are not rewritten.

Generated input artifacts are stored under `datasets/demo/`: `energy-readings.csv`, `solar-readings.csv`, and `dataset-manifest.json`. SHA-256 digests, sizes, relative paths, source timezone, units, dataset version, time range, and synthetic assumptions are stored in the manifest/import records. The batch is classified `SYNTHETIC_DEMO`. Solar readings do not have a batch foreign key in the current schema; their installation mapping and file digest are recorded in the batch manifest and mapping metadata.

The fictional campus has one non-overlapping main feeder per building, 26 weekly schedule rows for weekday classes/labs, daily library/residence operations, and weekend auditorium availability (Monday is weekday 0 in the application), plus local-time holidays/breaks. Expected schedule counts describe planned activity only. **No observed or estimated occupancy records are created.** The flat USD 0.15/kWh import price, USD 0.04/kWh export price, 120 kW solar capacity, and 200 kWh battery configuration are illustrative assumptions, not local utility tariffs, real equipment specifications, or verified savings. Synthetic data is not evidence of real-world model accuracy or customer performance.

## Run EcoGrid against the demo database

Start the API with the guarded connection wrapper:

```sh
npm run demo:db -- dev
```

Start the intelligence service and frontend in separate terminals using the project's normal development commands. The intelligence service must be available at the backend's configured `PYTHON_SERVICE_URL`. If `backend/.env` sets an explicit API port, keep the frontend API base URL consistent with that port. Forecast training runs through the existing background worker; allow it to finish before running a forecast or the optimization scenario.

Run the integrity check at any time with `npm run demo:db -- validate`. It checks organization labeling, expected entities, reading relationships and value ranges, aligned hourly coverage, input hashes, calendar/schedule timezones, occupancy separation, and optimizer configuration. Forecasts, anomaly findings, recommendations, and optimization results are generated through their application/Python services; the seed does not insert synthetic model outputs or recommendation/anomaly records.
