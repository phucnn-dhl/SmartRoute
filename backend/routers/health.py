from fastapi import APIRouter, Depends
import sqlite3

from db.database import get_db
from models.xgboost_model import TrafficModel

router = APIRouter()


def get_model():
    from main import model
    return model


@router.get("/health")
def health(model: TrafficModel = Depends(get_model)):
    with get_db() as conn:
        counts = {}
        for table in ["nodes", "segments", "traffic_history", "historical_stats"]:
            counts[table] = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]

    return {
        "status": "ok",
        "model_loaded": model.model is not None,
        "db_records": counts,
    }


@router.get("/model-info")
def model_info(model: TrafficModel = Depends(get_model)):
    if model.model is None:
        return {"error": "Model not loaded"}

    return {
        "feature_count": len(model.meta.get('feature_names', [])),
        "accuracy": model.meta.get('accuracy'),
        "params": model.meta.get('params'),
    }
