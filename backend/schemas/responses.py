from pydantic import BaseModel
from typing import Dict, List, Optional


class PredictionResult(BaseModel):
    segment_id: int
    los: str
    los_encoded: int
    confidence: float
    probabilities: Optional[Dict[str, float]] = None
    error: Optional[str] = None


class PredictResponse(BaseModel):
    predictions: List[PredictionResult]
    model_version: str
    feature_count: int


class SegmentResponse(BaseModel):
    segment_id: int
    s_lat: float
    s_lng: float
    e_lat: float
    e_lng: float
    street_name: str
    street_level: int
    max_velocity: Optional[float] = None
    length: float
    los: Optional[str] = None
    confidence: Optional[float] = None


class SegmentsResponse(BaseModel):
    segments: List[SegmentResponse]
    total: int
    prediction_time: Optional[Dict[str, int]] = None


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    db_records: Dict[str, int]
