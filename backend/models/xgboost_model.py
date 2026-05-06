"""XGBoost model wrapper: load, predict, with heuristic fallback"""

import json
import sqlite3
from pathlib import Path
from typing import Optional

import numpy as np
import xgboost as xgb

from models.preprocessor import (
    build_features, build_features_batch, heuristic_predict, FULL_FEATURES,
)

ARTIFACTS_DIR = Path(__file__).parent.parent / "artifacts"

LOS_DECODING = {0: 'A', 1: 'B', 2: 'C', 3: 'D', 4: 'E', 5: 'F'}


class TrafficModel:
    def __init__(self):
        self.model: Optional[xgb.XGBClassifier] = None
        self.street_type_map: dict = {}
        self.velocity_medians: dict = {}
        self.meta: dict = {}

    def load(self, model_path: Optional[str] = None):
        if model_path is None:
            model_path = str(ARTIFACTS_DIR / "xgboost_traffic.model")

        meta_path = Path(model_path).with_suffix('.json')
        if meta_path.exists():
            with open(meta_path) as f:
                self.meta = json.load(f)
        else:
            self.meta = {}

        self.model = xgb.XGBClassifier()
        self.model.load_model(model_path)

        stm_path = ARTIFACTS_DIR / "street_type_map.json"
        if stm_path.exists():
            with open(stm_path) as f:
                self.street_type_map = json.load(f)

        vm_path = ARTIFACTS_DIR / "velocity_medians.json"
        if vm_path.exists():
            with open(vm_path) as f:
                self.velocity_medians = json.load(f)

    def predict_one(self, conn: sqlite3.Connection, segment_id: int,
                    segment: sqlite3.Row, hour: int, minute: int,
                    weekday: int, month: int, day_of_month: int,
                    date: str):
        has_xgb = segment['has_xgboost_data'] if 'has_xgboost_data' in segment.keys() else False

        if not has_xgb or self.model is None:
            return heuristic_predict(segment, hour, weekday)

        try:
            X = build_features(
                conn, segment_id, hour, minute, weekday, month, day_of_month,
                date, segment, self.street_type_map, self.velocity_medians,
            )
            pred = self.model.predict(X)[0]
            proba = self.model.predict_proba(X)[0]
            return {
                'los': LOS_DECODING[int(pred)],
                'los_encoded': int(pred),
                'confidence': float(proba[pred]),
                'probabilities': {LOS_DECODING[i]: round(float(p), 4) for i, p in enumerate(proba)},
            }
        except Exception:
            return heuristic_predict(segment, hour, weekday)

    def predict_viewport(self, conn: sqlite3.Connection, rows: list,
                         hour: int, minute: int, weekday: int,
                         month: int, day_of_month: int, date: str):
        """Batch predict for all segments in a viewport.
        Returns dict: segment_id -> {los, confidence}."""
        if not rows or self.model is None:
            return {}

        # Split into XGBoost vs heuristic groups
        xgb_segments = []
        heuristic_results = {}

        for row in rows:
            has_xgb = row['has_xgboost_data'] if 'has_xgboost_data' in row.keys() else False
            if has_xgb:
                xgb_segments.append(row)
            else:
                pred = heuristic_predict(row, hour, weekday)
                heuristic_results[row['segment_id']] = pred

        if not xgb_segments:
            return heuristic_results

        # Batch build features for all XGBoost segments
        segment_ids, X = build_features_batch(
            conn, xgb_segments, hour, minute, weekday,
            month, day_of_month, date,
            self.street_type_map, self.velocity_medians,
        )

        if len(X) == 0:
            return heuristic_results

        # Single batch predict
        preds = self.model.predict(X)
        probas = self.model.predict_proba(X)

        xgb_results = {}
        for i, sid in enumerate(segment_ids):
            pred = int(preds[i])
            xgb_results[sid] = {
                'los': LOS_DECODING[pred],
                'los_encoded': pred,
                'confidence': float(probas[i][pred]),
            }

        heuristic_results.update(xgb_results)
        return heuristic_results

    def predict_batch(self, conn: sqlite3.Connection, segment_ids: list,
                      hour: int, minute: int, weekday: int,
                      month: int, day_of_month: int, date: str):
        rows = []
        row_by_id = {}
        for sid in segment_ids:
            row = conn.execute(
                "SELECT * FROM segments WHERE segment_id = ?", (sid,)
            ).fetchone()
            if row:
                rows.append(row)
                row_by_id[sid] = row

        # Use batch prediction for all segments at once
        predictions = self.predict_viewport(
            conn, rows, hour, minute, weekday,
            month, day_of_month, date,
        )

        results = []
        for sid in segment_ids:
            pred = predictions.get(sid)
            if not pred:
                results.append({
                    'segment_id': sid,
                    'los': 'C',
                    'los_encoded': 2,
                    'confidence': 0.0,
                })
            else:
                pred['segment_id'] = sid
                results.append(pred)
        return results
