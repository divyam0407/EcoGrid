# EcoGrid F4 presenter walkthrough (8–12 minutes)

This guide uses the local synthetic `ecogrid_demo` environment. It does not connect to a physical meter or production database. Use the local demo credentials already documented in the project’s setup instructions; passwords are intentionally not copied into the submission package.

## Before the presentation

1. Ensure local PostgreSQL is running and validate only the dedicated demo database: `npm run demo:db -- validate`.
2. In a terminal, activate the existing intelligence virtual environment and start the dedicated demo service: `source intelligence/venv/bin/activate && npm run demo:intelligence`.
3. In another terminal start the guarded demo backend: `npm run demo:live`.
4. Start the frontend: `npm run dev:frontend`, then open `http://localhost:5173`.
5. Sign in using the locally documented demo account. Do not display the password in the slides or report.

The demo service uses port 8001 and project model artifact directory. Keep it paired with the demo backend; this avoids relying on another intelligence service already listening on port 8000.

## Presentation sequence

| Time | Screen and action | Explain |
|---|---|---|
| 0:00–1:00 | Sign in; Overview | The campus is fictional, synthetic and organization scoped. Show five buildings and source badges. |
| 1:00–2:00 | Dashboard energy trend | The demo has 10,805 historical hourly readings and 2,161 hourly solar readings covering 29 Aug–27 Nov 2026 UTC. Display local campus time in Asia/Kolkata. |
| 2:00–3:00 | Operational Intelligence | Schedules and calendar annotate expected activity; zero occupancy records exist. |
| 3:00–4:00 | Demand Forecasting | Show the persisted model/forecast. Explain hourly meter-level predictions and that model performance has not been established on real campus data. |
| 4:00–5:00 | Anomaly Detection | Show stored detector evidence (method, baseline, observed/expected). Synthetic anomaly demonstrates workflow only. |
| 5:00–6:00 | Recommendations | Review assumptions and lifecycle. Any savings are estimates, not measured outcomes. |
| 6:00–7:15 | Live Monitoring | Point to `SIMULATED TELEMETRY`; start simulator and observe a new batch/reading. It runs in-browser, sends one simulated hourly interval per 15 seconds and is not a meter connection. |
| 7:15–9:30 | Solar/Battery → Campus Digital Twin | Use the existing campus scenario; show the 24-hour forecast window and completed optimization. Explain HiGHS solver `OPTIMAL` and the `ESTIMATED_UNVERIFIED` label. |
| 9:30–10:30 | Close | Summarize implemented prototype and the real-data/field-validation work still required. |

## Forecast-to-optimization result recorded for F4

The final verified forecast window contained 24 contiguous UTC hourly points from `2026-11-27T14:00Z` through `2026-11-28T13:00Z`. The Digital Twin scenario completed with 24 dispatch intervals and solver status `OPTIMAL`. This was exercised only against `ecogrid_demo`; it does not mean 24-hour load forecasts are accurate in the field or that estimated savings occurred.

## Recovery and stop

- If API requests fail, confirm the demo backend is on its configured port and frontend `VITE_API_URL` matches it.
- If model artifacts are missing, ensure `npm run demo:intelligence` is used from repository root and that the demo backend targets port 8001.
- If the forecast worker is still training, wait for the model state to become ready before generating a forecast.
- If the scenario rejects its inputs, verify the selected future window has all 24 hourly predictions and required tariff/resource assumptions; do not substitute fabricated values.
- Stop the simulator in Live Monitoring, then stop frontend, backend and intelligence terminal processes with Ctrl+C. Leave PostgreSQL running if another local application uses it.
