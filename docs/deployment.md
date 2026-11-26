# EcoGrid Deployment & Operations Guide

EcoGrid can be deployed either locally for development or as containerized services using Docker Compose.

## 1. Quick Start (Local Development)

### Prerequisites
- Node.js >= 20.x and npm
- Python >= 3.10 with `pip`
- SQLite (included out-of-the-box) or PostgreSQL 16+

### Steps

1. **Install Python Intelligence Dependencies:**
   ```bash
   cd intelligence
   pip install -r requirements.txt
   ```

2. **Start the Intelligence Service:**
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

3. **Install Backend Dependencies & Seed Demo Database:**
   ```bash
   cd ../backend
   npm install
   npx prisma generate
   npx prisma db push
   npx ts-node prisma/seed.ts
   ```

4. **Start the Backend Server:**
   ```bash
   npm run dev
   # Runs on http://localhost:5001
   ```

5. **Start the Frontend Application:**
   ```bash
   cd ../frontend
   npm install
   npm run dev
   # Runs on http://localhost:5173
   ```

6. **Log in to the Demo System:**
   - URL: `http://localhost:5173/login`
   - Use the **One-Click Demo Login** or credentials:
     - Administrator: `admin@abc.edu` / `admin123`
     - Facility Manager: `facility@abc.edu` / `admin123`

---

## 2. Production Docker Compose Deployment

Run the complete stack including PostgreSQL 16, Python intelligence service, Express API, and Nginx frontend:

```bash
docker-compose up --build -d
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:5001`
- Python Intelligence Service: `http://localhost:8000`
- PostgreSQL: `localhost:5432`
