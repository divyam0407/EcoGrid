# EcoGrid
### Operational Intelligence for Energy Optimization

EcoGrid is an operational energy intelligence and mathematical optimization platform. While standard energy management platforms simply monitor sub-meter electricity readings, EcoGrid introduces a crucial intelligence layer: **understanding an organization's planned operational activities (academic timetables, laboratory experiments, classroom bookings, occupancy rates, and holiday calendars) and using them to predict energy demand, pinpoint latency wastage, and calculate mathematically optimal battery & solar dispatch schedules.**

---

## 🌟 Core Highlights & Architectural Features

- 🏢 **Multi-Tier Infrastructure Hierarchy:** Manage organizations, buildings, departments, rooms, sub-meters, solar arrays, and battery banks.
- 📅 **Operational Intelligence Engine (Signature Module):** Correlates organizational timetables with real-time meter telemetry. Pinpoints equipment left powered after lectures, excessive idle baselines, and empty rooms cooling at full blast.
- 📈 **Machine Learning Demand Forecasting:** Multi-horizon (24-Hour & 7-Day) forecasting using XGBoost and Random Forest with chronological train/test splits, time-lag features, and evaluation metrics (MAE, RMSE, MAPE).
- 🚨 **Multi-Model Anomaly Detection:** Combines statistical moving-average Z-scores with Scikit-learn Isolation Forests to catch surges, spikes, and nocturnal idle leaks with a facility management resolution workflow.
- ⚡ **Mathematical Optimization Engine (MILP):** Formulated in PuLP (CBC Solver) to optimize multi-source energy dispatch (Grid, Rooftop Solar, Battery Bank) under time-of-use tariffs, battery SOC physics, and peak demand constraints.
- ☀️ **Solar & Battery Storage Management:** State-of-charge (SOC %) monitoring, degradation cost factoring, and peak demand shaving.
- 💡 **Actionable Recommendation Engine:** Concrete, evidence-backed operational interventions with estimated monthly dollar savings and a human-in-the-loop approval workflow.
- 🔮 **Campus Energy Digital Twin:** Data-driven sandbox simulating hypothetical changes (e.g. compressing hours to 5 PM, hybrid attendance, expanding solar arrays) completely isolated from live meter records.
- 📄 **Executive Reporting & Scope 2 Carbon Analytics:** Automatic generation of daily, weekly, and monthly audits with configurable grid carbon emission factors.
- 💬 **AI-Powered Energy Assistant:** Grounded Natural Language Question-Answering assistant providing direct citations to database meter logs and optimization runs.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js:** v20+ / v26
- **Python:** v3.10+ with `pip`
- **Database:** SQLite (embedded out-of-the-box in `backend/prisma/dev.db`) or PostgreSQL 16 via Docker

### 2. Start Intelligence Service
```bash
cd intelligence
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
*(Intelligence Service health check available at `http://localhost:8000/health`)*

### 3. Start Backend & Seed ABC University Demo
```bash
cd backend
npm install
npx prisma generate
npx prisma db push
npx ts-node prisma/seed.ts
npm run dev
```
*(Backend running at `http://localhost:5001/health`)*

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

### Instant Demo Credentials:
- **Campus Administrator:** `admin@abc.edu` / `admin123`
- **Energy Facility Manager:** `facility@abc.edu` / `admin123`
- *Or click **"Explore Pre-Seeded Demo"** on the login screen for one-click access.*

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
