from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from datetime import datetime
from typing import List, Dict, Any

from intelligence.app.api.schemas.forecast_schemas import (
    ForecastRequest, ForecastResponse, ForecastPoint, ForecastMetrics
)
from intelligence.app.api.schemas.anomaly_schemas import (
    AnomalyDetectionRequest, AnomalyDetectionResponse, DetectedAnomaly
)
from intelligence.app.api.schemas.optimization_schemas import (
    OptimizationRequest, OptimizationResponse
)
from intelligence.app.api.schemas.operational_schemas import (
    OperationalCorrelationRequest, OperationalCorrelationResponse
)
from intelligence.app.api.schemas.digital_twin_schemas import (
    ScenarioSimulationRequest, ScenarioComparisonResult
)

from intelligence.app.core.forecasting.ml_forecasting import DemandForecastingEngine
from intelligence.app.core.anomaly_detection.statistical import AnomalyDetectionEngine
from intelligence.app.core.optimization.energy_optimizer import MathematicalEnergyOptimizer
from intelligence.app.core.operational_intelligence.correlator import OperationalCorrelationEngine
from intelligence.app.core.solar.solar_model import SolarGenerationModel
from intelligence.app.core.digital_twin.simulator import CampusEnergyDigitalTwinSimulator

app = FastAPI(
    title="EcoGrid Intelligence Engine",
    description="Operational Intelligence, Demand Forecasting, Anomaly Detection & Mathematical Optimization API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize engines
optimizers = MathematicalEnergyOptimizer()
correlators = OperationalCorrelationEngine()
dt_simulators = CampusEnergyDigitalTwinSimulator()

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "ecogrid-intelligence",
        "timestamp": datetime.utcnow().isoformat(),
        "capabilities": [
            "xgboost_forecasting",
            "random_forest_forecasting",
            "pulp_milp_optimization",
            "operational_schedule_correlation",
            "isolation_forest_anomalies",
            "campus_digital_twin"
        ]
    }

@app.post("/api/forecast/predict", response_model=ForecastResponse)
def predict_demand(req: ForecastRequest):
    try:
        raw_hist = [h.dict() for h in req.historical_data]
        if not raw_hist:
            raise HTTPException(status_code=400, detail="Historical readings cannot be empty.")

        engine = DemandForecastingEngine(model_type=req.model_type)
        metrics_dict, _ = engine.train_and_evaluate(raw_hist)
        
        hist_df = pd.DataFrame(raw_hist)
        future_ops = [f.dict() for f in req.future_operational_data] if req.future_operational_data else None

        points_dict = engine.generate_forecast(
            historical_df=hist_df,
            horizon_hours=req.horizon_hours,
            future_ops=future_ops
        )

        return ForecastResponse(
            model_name=f"{req.model_type.upper()} Regressor",
            model_version="v1.2-operational-aware",
            forecast_generated_at=datetime.utcnow().isoformat(),
            horizon_hours=req.horizon_hours,
            metrics=ForecastMetrics(**metrics_dict),
            forecasts=[ForecastPoint(**p) for p in points_dict]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/anomalies/detect", response_model=AnomalyDetectionResponse)
def detect_anomalies(req: AnomalyDetectionRequest):
    try:
        readings = [r.dict() for r in req.readings]
        detector = AnomalyDetectionEngine(method=req.method, sensitivity=req.sensitivity)
        results = detector.detect(readings)

        return AnomalyDetectionResponse(
            total_analyzed=len(readings),
            anomalies_found=len(results),
            anomalies=[DetectedAnomaly(**a) for a in results]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/optimization/optimize", response_model=OptimizationResponse)
def optimize_energy_schedule(req: OptimizationRequest):
    try:
        return optimizers.optimize(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/operations/correlate", response_model=OperationalCorrelationResponse)
def correlate_operations(req: OperationalCorrelationRequest):
    try:
        return correlators.correlate(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/digital-twin/simulate", response_model=ScenarioComparisonResult)
def simulate_scenario(req: ScenarioSimulationRequest):
    try:
        return dt_simulators.simulate(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/solar/forecast")
def forecast_solar(payload: Dict[str, Any]):
    capacity = float(payload.get("capacity_kw", 120.0))
    timestamps = payload.get("timestamps", [])
    clouds = payload.get("cloud_cover_percent", None)
    model = SolarGenerationModel(capacity_kw=capacity)
    gen = model.calculate_generation(timestamps, clouds)
    return {"capacity_kw": capacity, "readings": gen}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
