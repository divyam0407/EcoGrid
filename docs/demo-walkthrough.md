# EcoGrid F4 Demonstration Walkthrough

This walkthrough demonstrates historical campus data plus simulated hourly meter intervals. The simulator writes only through the authenticated EcoGrid API into the local `ecogrid_demo` database. It does not connect to physical meters.

## Before the presentation

1. Start the local PostgreSQL 16 service if it is stopped:

   ```bash
   brew services start postgresql@16
   ```

2. The single command that starts the simulator-enabled local backend is `npm run demo:live` (it sets `DEMO_TELEMETRY_ENABLED=true` for that process only). The backend refuses simulated telemetry when `NODE_ENV=production`. The demo database helper also verifies the local `ecogrid_db` base configuration and rewrites its child process to `ecogrid_demo`; do not replace the base `DATABASE_URL` with a protected database.

3. Correct and validate the synthetic campus seed in the isolated demo database:

   ```bash
   npm run demo:db -- seed
   npm run demo:db -- validate
   ```

   The seed keeps the existing 90-day UTC range and deterministic IDs, updates the synthetic hourly profile for India local time, and upserts matching records without deleting them. It does not migrate, seed, or query the other EcoGrid databases.

## Start the application

Use a separate terminal for each process.

**Intelligence service** (uses the existing project-local Python environment, a dedicated demo port, and the model artifact directory shared with the backend):

```bash
source intelligence/venv/bin/activate
npm run demo:intelligence
```

**Backend** (the demo wrapper targets only `ecogrid_demo`):

```bash
npm run demo:live
```

The demo backend connects to the intelligence service on `127.0.0.1:8001`. Keep these two demo processes paired; the normal development service may use port 8000 and a different model-artifact root. If port 8001 is unavailable, choose the same alternate port for both processes, for example `INTELLIGENCE_PORT=8002 npm run demo:intelligence` and `PYTHON_SERVICE_URL=http://127.0.0.1:8002 npm run demo:live`.

**Frontend:**

```bash
npm run dev:frontend
```

If the backend's default port 5001 is already in use, run `PORT=5011 npm run demo:live` and start the frontend with `VITE_API_URL=http://localhost:5011/api/v1 npm run dev:frontend`.

Open `http://localhost:5173`. The local demo login details are documented in [demo-data.md](demo-data.md). Use the demo account only for this local workspace.

## Presentation sequence

1. **Historical campus context:** On Overview, show the 90-day synthetic energy history, campus buildings, illustrative solar generation and the configured battery. Explain that tariff, solar and battery values are labelled assumptions.
2. **Operations evidence:** Open **Operational Intelligence** and show weekday schedules and the academic calendar. Times are interpreted as India local time. Expected schedule headcounts are not measured occupancy.
3. **Live monitoring:** Open **Live Monitoring**. Point out the `SIMULATED TELEMETRY` badge and the statement that no physical meters are connected. Select the Research Labs meter, then click **Start simulator**.
4. **Observe ingestion:** EcoGrid submits a reproducible batch for all five demo meters immediately and then every 15 seconds. Each accepted batch represents one 60-minute interval, timestamped after the existing history. The timeline runs at presentation speed (one simulated hour per 15 seconds) to remain compatible with the hourly forecasting model. Watch the latest reading, last successful ingestion, API status and trend update.
5. **Show the unusual interval:** The deterministic Research Labs profile emits a higher-load interval every sixth simulated hour. After six successful ticks (about 75 seconds), select **Analyze research-lab readings**. The button calls the existing anomaly API, which runs the existing Python seasonal detector over persisted readings and stores returned evidence. Open **Anomaly Detection** to review findings and their timestamp, baseline and severity. If you scan before the unusual interval arrives, wait for the next six-tick event and scan again.
6. **Forecast inference:** Click **Run existing 24-hour forecast**. This uses the already active hourly model for Academic Block; it does not start model training. Review the resulting intervals in **Demand Forecasting**.
7. **Recommendations:** Click **Refresh evidence-based recommendations**. Review the source readings, schedule context, configured illustrative tariff and limitations in **Recommendations**. Any savings are estimates for the observed evidence window, not verified savings.
8. **Solar, battery and optimization:** Open **Solar Management** and **Battery Management** to show the synthetic configuration. Then open **Campus Digital Twin**, select the campus scenario and run the existing optimizer. Present its result as a modelled scenario outcome, not a measured saving.
9. **Stop simulation:** Return to **Live Monitoring** and click **Pause** to hold the current timeline, **Resume** to continue, or **Stop** to end it. Stop the three app processes with `Ctrl+C` in their terminals.

## Expected behavior

- Historical and simulated measurements remain visibly distinguished in the live trend and are stored as `SYNTHETIC_DEMO` with source `SIMULATED_LIVE_TELEMETRY`.
- The API validates UTC timestamps, interval energy type, value and supported unit; verifies the authenticated user's demo organization and meter; stores records transactionally; and treats repeat timestamps as idempotent retries.
- Dashboard summary and daily trend values poll every 15 seconds for the demo source. Live Monitoring polls the ingestion API every five seconds.
- The campus timezone is `Asia/Kolkata` (UTC+05:30). Database timestamps remain UTC. India has no daylight-saving transition.
- Forecasting, anomaly analysis and recommendations call the existing backend and Python intelligence workflows. No model is retrained for each incoming reading.

## Known limitations

- The simulator is an in-browser local demonstration tool. It stops when the page is closed or reloaded; starting again continues after the latest stored campus interval.
- The wall-clock interval is 15 seconds but each interval represents one simulated hour. It is not a physical meter cadence or a live operational feed.
- The synthetic anomalous load is designed to exercise the statistical detector and is not evidence of a real fault.
- Forecast, anomaly and recommendation outputs depend on the existing model, historical data and analysis windows. They may return no qualifying output; the interface reports the actual service response rather than fabricating one.
- Solar generation, tariff and battery parameters are illustrative assumptions. No real weather, observed occupancy, verified utility billing or measured savings are represented.
- The demo control is disabled unless `DEMO_TELEMETRY_ENABLED=true` is configured and is always disabled when the backend runs with `NODE_ENV=production`.

## Stop services

Use `Ctrl+C` in the intelligence, backend and frontend terminals. The simulator stops with its browser page. PostgreSQL may be left running for other local applications; if you choose to stop it, only do so when no other local database user depends on it:

```bash
brew services stop postgresql@16
```
