from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Header
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from datetime import datetime
from typing import List, Dict, Any
from pathlib import Path
from tempfile import TemporaryDirectory
import secrets
import os
import shutil

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
from datasets.importers.ashrae_importer import AshraeImporter
from datasets.importers.bdg2_importer import BDG2Importer
from datasets.importers.iblend_importer import IBlendImporter

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


def _import_service_token() -> str:
    token = os.environ.get("IMPORT_SERVICE_TOKEN", "")
    if token:
        return token
    env_file = Path(__file__).resolve().parents[2] / "backend" / ".env"
    if env_file.is_file():
        for line in env_file.read_text().splitlines():
            if line.startswith("IMPORT_SERVICE_TOKEN="):
                return line.split("=", 1)[1].strip().strip("\"'")
    return ""


def _save_upload(upload: UploadFile, directory: Path, filename: str) -> str:
    destination = directory / filename
    with destination.open("wb") as output:
        shutil.copyfileobj(upload.file, output)
    return str(destination)


@app.post("/api/imports/normalize")
def normalize_dataset(
    dataset_type: str = Form(...),
    building_id: str = Form(...),
    meter_id: str = Form(...),
    external_building_id: str = Form(""),
    raw_unit: str = Form("kWh"),
    power_unit: str = Form("W"),
    cumulative_limit_kwh: str = Form(""),
    readings_file: UploadFile = File(...),
    metadata_file: UploadFile | None = File(None),
    weather_file: UploadFile | None = File(None),
    occupancy_file: UploadFile | None = File(None),
    x_import_service_token: str | None = Header(None),
):
    expected_token = _import_service_token()
    if not expected_token or not x_import_service_token or not secrets.compare_digest(expected_token, x_import_service_token):
        raise HTTPException(status_code=401, detail="Import service authentication failed.")

    files = {"readings": readings_file, "metadata": metadata_file, "weather": weather_file, "occupancy": occupancy_file}
    try:
        with TemporaryDirectory(prefix="ecogrid-normalize-") as temp_dir:
            directory = Path(temp_dir)
            paths = {
                name: _save_upload(upload, directory, f"{name}.csv")
                for name, upload in files.items()
                if upload is not None
            }
            if dataset_type == "IBLEND_REAL_WORLD":
                unit = power_unit.strip()
                importer = IBlendImporter()
                normalized, summary = importer.import_electrical_csv(
                    paths["readings"], external_building_id or building_id, meter_id,
                    power_unit=unit,
                    cumulative_limit_kwh=float(cumulative_limit_kwh) if cumulative_limit_kwh.strip() else None,
                )
                occupancy, occupancy_rejected = ([], [])
                if "occupancy" in paths:
                    occupancy, occupancy_rejected = importer.import_building_occupancy_csv(
                        paths["occupancy"], external_building_id or building_id
                    )
                rejected = [
                    {**row.to_dict(), "file_field": "readings"}
                    for row in summary.rejected_rows
                ] + [
                    {**row.to_dict(), "file_field": "occupancy"}
                    for row in occupancy_rejected
                ]
                return {
                    "readings": [row.to_dict() for row in normalized],
                    "occupancy": [row.to_dict() for row in occupancy],
                    "buildings": [],
                    "summary": summary.to_dict(),
                    "rejections": rejected,
                    "source_granularity": "BUILDING_LEVEL" if occupancy else None,
                }

            if dataset_type == "BDG2_BENCHMARK":
                if "metadata" not in paths:
                    raise ValueError("BDG2 requires a metadata file.")
                buildings, normalized, summary = BDG2Importer().import_electricity_csv(
                    paths["readings"], paths["metadata"], paths.get("weather"),
                    building_filter=[external_building_id] if external_building_id else None,
                    raw_unit=raw_unit,
                )
            elif dataset_type == "ASHRAE_GEPIII":
                if "metadata" not in paths:
                    raise ValueError("ASHRAE requires a building metadata file.")
                buildings, normalized, summary = AshraeImporter().import_train_csv(
                    paths["readings"], paths["metadata"], paths.get("weather"),
                    building_filter=[external_building_id] if external_building_id else None,
                    raw_unit=raw_unit,
                )
            else:
                raise ValueError("Unsupported dataset type.")

            if external_building_id and not any(item.external_id == external_building_id for item in buildings):
                raise ValueError("The selected external building ID was not found in the metadata.")
            return {
                "readings": [row.to_dict() for row in normalized],
                "occupancy": [],
                "buildings": [row.to_dict() for row in buildings],
                "summary": summary.to_dict(),
                "rejections": [
                    {**row.to_dict(), "file_field": "readings"}
                    for row in summary.rejected_rows
                ],
                "source_granularity": "BUILDING_LEVEL",
            }
    except (KeyError, TypeError, ValueError, FileNotFoundError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=422, detail=f"Dataset normalization failed: {type(error).__name__}") from error

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
