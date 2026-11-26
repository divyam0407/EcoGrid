# EcoGrid Architecture & System Design

## 1. System Overview

EcoGrid is an operational energy intelligence and optimization platform. Unlike standard energy monitoring systems that merely display sub-meter kWh charts, EcoGrid connects an organization's planned operational activities (academic timetables, laboratory schedules, occupancy, holiday calendars) with historical energy telemetry, machine learning forecasting, and mathematical Mixed-Integer Linear Programming (MILP) cost optimization.

```
                           +----------------------------------------+
                           |           React + Vite Frontend        |
                           |   (Tailwind CSS + Recharts + Lucide)   |
                           +-------------------+--------------------+
                                               |
                                     REST APIs / JSON (v1)
                                               |
                                               v
                           +----------------------------------------+
                           |          Node.js + Express Backend     |
                           |         (TypeScript + Prisma ORM)      |
                           +---------+--------------------+---------+
                                     |                    |
                         Relational Queries          HTTP Payload
                                     |                    |
                                     v                    v
                   +-------------------+    +----------------------------------+
                   |  PostgreSQL / DB  |    |     FastAPI Intelligence Engine  |
                   | (Telemetry, Specs,|    |  - Demand Forecasting (XGBoost)  |
                   | Timetable, Models)|    |  - Outlier Detection (IsoForest) |
                   +-------------------+    |  - MILP Cost Optimization (PuLP) |
                                            |  - Operational Correlator        |
                                            |  - Campus Digital Twin           |
                                            +----------------------------------+
```

## 2. Component Design

### 2.1 Frontend (React + TypeScript + Vite)
- **State & Routing:** Multi-tenant session state via `AuthContext`, declarative client-side routing via React Router DOM.
- **Visual Design:** Professional dark-mode design system with accessible contrast using Tailwind CSS.
- **Charts & Visualizations:** Recharts for load curves, solar generation profiles, battery state of charge (SOC %), confidence intervals, and building share distribution.
- **AI Assistant Drawer:** Grounded natural-language query interface with verified database citations.

### 2.2 Application Backend (Node.js + Express + TypeScript)
- **Role-Based Access Control (RBAC):** Super Admin, Org Admin, Energy Manager, Department Manager, and Viewer.
- **Tenant Isolation:** Every request is authenticated via JWT; database queries are scoped to the authenticated user's `organizationId`.
- **CSV Data Ingest:** Multi-file stream parser validating timestamps, identifying impossible readings (>50,000 kWh), and preventing duplicate imports.

### 2.3 Intelligence Services (Python + FastAPI)
- **Operational Correlation Engine:** Evaluates room-level scheduled sessions against empirical idle baselines to uncover equipment overruns and low-occupancy energy wastage.
- **Forecasting Engine:** Sequential time-series feature engineering (lags, rolling averages, calendar encodings, academic class densities) feeding XGBoost and Random Forest regressors.
- **Optimization Engine:** Mixed-Integer Linear Programming (MILP) solved via PuLP / CBC solver to minimize total electricity expenditure under physical battery SOC dynamics and time-of-use tariffs.
- **Campus Digital Twin:** Isolated what-if simulator allowing facilities managers to evaluate modified operating hours, solar expansion, or battery capacity additions.
