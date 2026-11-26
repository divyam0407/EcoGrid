# EcoGrid
### Operational Intelligence for Energy Optimization

EcoGrid is an operational energy intelligence and mathematical optimization platform. While standard energy management platforms simply monitor sub-meter electricity readings, EcoGrid introduces a crucial intelligence layer: **understanding an organization's planned operational activities (academic timetables, laboratory experiments, classroom bookings, occupancy rates, and holiday calendars) and using them to predict energy demand, pinpoint latency wastage, and calculate mathematically optimal battery & solar dispatch schedules.**

---

## 🌟 Core Highlights & Architectural Features

- 🏢 **Multi-Tier Infrastructure Hierarchy:** Manage organizations, buildings, departments, rooms, sub-meters, solar arrays, and battery banks.
- 📅 **Operational Intelligence Engine:** Compares validated meter readings with academic timetables, calendars, configured room hours, and available occupancy evidence to surface explainable operational patterns for review.
- 📈 **Machine Learning Demand Forecasting:** Multi-horizon (24-Hour & 7-Day) forecasting using XGBoost and Random Forest with chronological train/test splits, time-lag features, and evaluation metrics (MAE, RMSE, MAPE).
- 🚨 **Multi-Model Anomaly Detection:** Combines statistical moving-average Z-scores with Scikit-learn Isolation Forests to catch surges, spikes, and nocturnal idle leaks with a facility management resolution workflow.
- ⚡ **Mathematical Optimization Engine (MILP):** Formulated in PuLP (CBC Solver) to optimize multi-source energy dispatch (Grid, Rooftop Solar, Battery Bank) under time-of-use tariffs, battery SOC physics, and peak demand constraints.
- ☀️ **Solar & Battery Storage Management:** State-of-charge (SOC %) monitoring, degradation cost factoring, and peak demand shaving.
- 💡 **Actionable Recommendation Engine:** Evidence-backed operational interventions with review workflows. Savings are only reported when a validated calculation supports them.
- 🔮 **Campus Energy Digital Twin:** Data-driven sandbox simulating hypothetical changes (e.g. compressing hours to 5 PM, hybrid attendance, expanding solar arrays) completely isolated from live meter records.
- 📄 **Executive Reporting & Scope 2 Carbon Analytics:** Automatic generation of daily, weekly, and monthly audits with configurable grid carbon emission factors.
- 💬 **AI-Powered Energy Assistant:** Grounded Natural Language Question-Answering assistant providing direct citations to database meter logs and optimization runs.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js:** v20+ / v26
- **Python:** v3.10+ with `pip`
- **Database:** PostgreSQL 16+ (required for development and production)

### 2. Start Intelligence Service
```bash
cd intelligence
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
*(Intelligence Service health check available at `http://localhost:8000/health`)*

### 3. Configure PostgreSQL and start the backend
```bash
cd backend
npm install
# Create an empty PostgreSQL database and configure DATABASE_URL in backend/.env.
npx prisma generate
npm run prisma:migrate:deploy
npm run dev
```
Use the same PostgreSQL deployment process in development and production. Do not run `prisma db push`, `prisma migrate reset`, or the demo seed against an existing database. The legacy SQLite demo database is retained as a read-only migration source; it is not an application datasource.

### 4. Start React Frontend
```bash
cd frontend
npm install
npm run dev
```
*(Open browser at `http://localhost:5173`)*

---

## 🧪 Demonstration Account & Dataset

The platform includes a pre-seeded, realistic 60-day operational dataset for **ABC University**:
- **5 Major Campus Facilities:** Academic Block, Computer Science Block, Library, Hostel Complex, Auditorium.
- **25 Academic Spaces:** 20 Classrooms, 5 Computer Laboratories with sub-meter telemetry.
- **7,200 Hourly Energy Readings & 1,440 Solar Readings.**
- **Seeded Anomalies & Class Timetable Overrun Scenarios.**

An existing ABC University demo database may be provisioned separately. A new empty PostgreSQL database does not contain demo users or readings; do not seed over existing records.

## Timetables and academic calendars

The authenticated **Operations** page supports CSV import, manual entry, cancellation, import history, SHA-256 file provenance, rejected-row downloads, and date/building-filtered operational analysis. Imports are scoped to the signed-in organization and commit accepted rows, rejected-row details, and batch metadata in one PostgreSQL transaction. Re-uploading the same file to the same organization returns its existing import batch.

Download the current templates from the Operations page or `GET /api/v1/schedules/timetable/template` and `GET /api/v1/schedules/calendar/template`.

### Timetable CSV

Required columns: `building_id` or exact `building` name; `room_id` or exact `room` number within the selected building; `activity_name`; `day_of_week` (Monday=0 through Sunday=6, or a day name); `start_time` and `end_time` (`HH:mm`); and `timezone` (IANA name, such as `America/New_York`). `activity_type` is optional (`LECTURE`, `LAB_SESSION`, `EXAMINATION`, `EVENT`, or `MAINTENANCE`). `recurrence` is `WEEKLY` (default) or `NONE`; a `NONE` row also needs a `date` column in `YYYY-MM-DD` format. `recurrence_end` is optional. `expected_occupancy` is an optional non-negative count and is schedule metadata only; leave it blank when unknown. It is never treated as an occupancy observation.

Room and department IDs must belong to the selected organization and building. Overlapping active weekly sessions in a room are rejected. A row with a DST-ambiguous or nonexistent local time must use an explicit UTC offset or be corrected. Invalid rows are retained in the batch rejection report rather than silently discarded.

### Academic calendar CSV

Required columns: `title`, `event_type` (`HOLIDAY`, `EXAMINATION`, `VACATION`, or `SPECIAL_EVENT`), `start_datetime`, `end_datetime`, and `timezone`. `building_id`, `room_id`, and `department_id` are optional scope mappings; when omitted, an event can apply across the organization. `all_day` accepts `true`/`false` (or `1`/`0`), and `status` defaults to `ACTIVE`. Timestamps may include an explicit UTC offset; local timestamps are interpreted in the supplied IANA zone and DST gaps/folds are rejected unless an offset resolves them.

### Operational insight calculations and limitations

The operations analysis includes only readings in validated/measured/calculated interval quality states and reports measured kWh grouped by the mapped building or room meter scope. It compares readings with active timetable windows using each schedule's timezone, applies holiday/vacation dates, and reports energy outside the room's stored `expectedOperatingHours` setting in the organization timezone. That existing field defaults to `08:00-18:00` unless changed, so users should review it before interpreting after-hours results. A building-level meter remains building-level and is not presented as room consumption. “Outside schedule,” “holiday,” and “after hours” are context for investigation, not proof of waste or savings; no financial savings are inferred.

Occupancy is reported as `OBSERVED`, `ESTIMATED`, or `UNKNOWN`, with record source and granularity. Scheduled activity is a separate `SCHEDULED_ACTIVITY` signal and does not prove presence. Building-level occupancy stays at building scope. Missing readings or occupancy remain unknown; the system does not invent measurements or interpolate attendance.

### A7 energy recommendations, savings, and follow-up

The Recommendations page reads persisted A7 engine records and legacy recommendations are labelled separately as unverified. It does not create cards as a side effect of viewing the page. An energy manager or organization administrator starts analysis with `POST /api/v1/recommendations/refresh`; refreshes are idempotent per organization, meter, and opportunity category, update the evidence snapshot, and retain status, assignment, approval and action history. A single persisted recommendation is refreshed over time rather than creating monthly copies.

The current deterministic engine considers valid `VALIDATED`, `MEASURED`, and `CALCULATED_INTERVAL` readings mapped to meters and buildings in the caller's organization. It identifies repeated calendar holiday, room after-hours, outside-schedule, and robust historical outlier patterns. Schedule absence and an anomaly are evidence for review, never proof of waste. It creates a quantified operating opportunity only when readings show positive excess over the same meter, interval duration, local weekday/hour and operating context, using a historical median. At least eight comparable intervals and three occurrence days are required by default. Only excess within the observed window is counted; no monthly or annual extrapolation is made. If a building-scoped meter and another meter have coincident readings, savings are withheld because the schema cannot establish whether their loads overlap. Data is grouped by the organization timezone. Daylight-saving fold/gap adjustment is not inferred by this calculation, so intervals around clock changes should be reviewed.

Financial potential is calculated as each eligible interval's positive kWh difference multiplied by the applicable organization tariff rate at that timestamp. A flat tariff uses its configured rate; a time-of-use tariff requires a matching effective tariff period. If any included interval lacks a rate, the financial estimate is withheld. Currency is the organization's configured currency. No default rate, demand-charge estimate, solar self-consumption estimate, or fabricated load/generation split is used. Peak demand and solar opportunity models remain investigation-only because the current tariff and source data do not reliably express demand-charge rules or coincident grid load and solar self-consumption.

Priority is a transparent relative score per refresh: 30% energy percentile, 20% configured-tariff financial percentile (energy percentile substitutes when cost is unavailable), 30% evidence rubric, 10% recurrence, and 10% operational feasibility. The displayed confidence is an evidence-strength rubric based on comparable sample count, distinct readings, and recurrence; it is not a statistical probability or model accuracy. Recommendation evidence stores source reading IDs, comparison observations, rate, window, data sources, scoring components, assumptions, and limitations.

Lifecycle states are `NEW`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `IN_PROGRESS`, `COMPLETED`, and `DISMISSED`. Approval may store an explicit kWh target separate from potential savings. Assignment requires an organization member. Status changes, implementation dates, notes, measurements and completion details are recorded in recommendation history and the audit log. `POST /api/v1/recommendations/:id/measurements` compares valid post-action intervals with an equally long immediately preceding interval window using mean baseline kWh per interval. It requires a recorded implementation date, at least eight valid intervals in each period to produce an estimate, and reports overlapping implemented recommendations. The result is only `ESTIMATED_UNVERIFIED`; it does not claim causal attribution or verified savings. Weather, schedule and seasonal normalization are not yet included, so assess the stored limitations before using results for reporting.

Relevant APIs: `GET /api/v1/recommendations`, `/summary`, and `/:id`; `POST /refresh`; `PUT /:id/status`; `PATCH /:id/assignment`, `/implementation`, and `/completion`; `POST /:id/notes` and `/measurements`; `GET /:id/history` and `/measurements`. All are authenticated and organization-scoped; generation and write operations require an organization administrator or energy manager.

The isolated recommendation integration suite is run with `cd backend && npm run test:a7`. It only accepts the `ecogrid_a7_test` database. It is separate from `ecogrid_db` and the preserved SQLite demo database.

---

## 📂 Project Directory Structure

```text
ecogrid/
├── frontend/               # React 18 + TypeScript + Vite + Tailwind CSS + Recharts
│   ├── src/
│   │   ├── components/     # Layout, Sidebar, Navbar, AI Assistant Drawer
│   │   ├── pages/          # 12 Functional Modules + Auth pages
│   │   ├── context/        # Multi-tenant Auth state
│   │   └── services/       # Central Axios REST client
├── backend/                # Node.js + Express + TypeScript + Prisma ORM
│   ├── prisma/
│   │   ├── schema.prisma   # 22 Relational Database Models
│   │   └── seed.ts         # ABC University 60-day dataset generator
│   └── src/
│       ├── modules/        # 13 Modular Controller & Route packages
│       └── middleware/     # JWT Auth & Multi-tenant isolation
├── intelligence/           # Python + FastAPI Service
│   └── app/
│       ├── core/           # Forecasting, Optimization, Anomalies, Correlator, Digital Twin
│       ├── api/            # Pydantic schemas & FastAPI endpoints
│       └── main.py         # Main entry point
├── datasets/sample/        # Downloadable sample CSV meter readings and timetable templates
├── docs/                   # Architecture, Database, API, and Deployment guides
├── docker-compose.yml      # Complete multi-container deployment
└── package.json            # Monorepo workspaces & runner scripts
```

---

## 🛡️ License

Proprietary enterprise energy intelligence software. Built for educational, commercial, and industrial facilities.
