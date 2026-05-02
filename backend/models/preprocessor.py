"""Feature computation for XGBoost prediction at serve time"""

import sqlite3
import numpy as np
from typing import Optional
from collections import defaultdict

LOS_ENCODING = {'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5}

RUSH_HOURS = [7, 8, 9, 17, 18, 19]
NIGHT_HOURS = [22, 23, 0, 1, 2, 3, 4, 5, 6]
WEEKEND_DAYS = [0, 6]  # Sunday=0, Saturday=6 in this dataset

LAG_PERIODS = [1, 2, 3, 48, 96, 336]

FULL_FEATURES = [
    'hour', 'minute', 'weekday', 'month', 'day_of_month',
    'is_weekend', 'is_rush_hour', 'is_night',
    'street_type_encoded', 'street_level', 'length', 'max_velocity_imputed',
    'LOS_encoded_lag_1', 'LOS_encoded_lag_2', 'LOS_encoded_lag_3',
    'LOS_encoded_lag_48', 'LOS_encoded_lag_96', 'LOS_encoded_lag_336',
    'LOS_encoded_rolling_mean_3', 'LOS_encoded_rolling_mode_6', 'LOS_encoded_rolling_std_6',
    'LOS_encoded_same_hour_mean', 'LOS_encoded_same_weekday_mean',
]


def _compute_temporal(hour: int, minute: int, weekday: int, month: int, day_of_month: int):
    return {
        'hour': hour,
        'minute': minute,
        'weekday': weekday,
        'month': month,
        'day_of_month': day_of_month,
        'is_weekend': int(weekday in WEEKEND_DAYS),
        'is_rush_hour': int(hour in RUSH_HOURS),
        'is_night': int(hour in NIGHT_HOURS),
    }


def _compute_spatial(segment: sqlite3.Row, street_type_map: dict, velocity_medians: dict):
    street_type = segment['street_type'] or ''
    return {
        'street_type_encoded': street_type_map.get(street_type, 0),
        'street_level': segment['street_level'],
        'length': segment['length'],
        'max_velocity_imputed': velocity_medians.get(
            street_type,
            segment['max_velocity'] if segment['max_velocity'] else 40.0,
        ),
    }


def _compute_historical_features(conn: sqlite3.Connection, segment_id: int,
                                 hour: int, weekday: int):
    """Look up precomputed historical stats."""
    row = conn.execute(
        "SELECT mean_los FROM historical_stats WHERE segment_id = ? AND hour = ? AND weekday = -1",
        (segment_id, hour),
    ).fetchone()

    same_hour_mean = row['mean_los'] if row else 2.0

    row = conn.execute(
        "SELECT mean_los FROM historical_stats WHERE segment_id = ? AND hour = ? AND weekday = ?",
        (segment_id, hour, weekday),
    ).fetchone()

    same_weekday_mean = row['mean_los'] if row else same_hour_mean

    return {
        'LOS_encoded_same_hour_mean': same_hour_mean,
        'LOS_encoded_same_weekday_mean': same_weekday_mean,
    }


def build_features(conn: sqlite3.Connection, segment_id: int,
                   hour: int, minute: int, weekday: int,
                   month: int, day_of_month: int, date: str,
                   segment: sqlite3.Row,
                   street_type_map: dict, velocity_medians: dict):
    """Build all 23 features for a single segment prediction."""
    temporal = _compute_temporal(hour, minute, weekday, month, day_of_month)
    spatial = _compute_spatial(segment, street_type_map, velocity_medians)

    lag_result = _compute_lag_features(conn, segment_id, date, hour, minute)
    if lag_result is not None:
        lag_features, obs = lag_result
        rolling = _compute_rolling_features(obs)
    else:
        lag_features = {f'LOS_encoded_lag_{p}': 2.0 for p in LAG_PERIODS}
        rolling = {
            'LOS_encoded_rolling_mean_3': 2.0,
            'LOS_encoded_rolling_mode_6': 2,
            'LOS_encoded_rolling_std_6': 0.5,
        }

    historical = _compute_historical_features(conn, segment_id, hour, weekday)

    feature_vector = {}
    feature_vector.update(temporal)
    feature_vector.update(spatial)
    feature_vector.update(lag_features)
    feature_vector.update(rolling)
    feature_vector.update(historical)

    return np.array([[feature_vector[f] for f in FULL_FEATURES]])


def _compute_lag_features(conn: sqlite3.Connection, segment_id: int,
                          date: str, hour: int, minute: int):
    """Get the most recent observations for lag features from traffic_history."""
    rows = conn.execute(
        """SELECT LOS_encoded, date, hour, minute
           FROM traffic_history
           WHERE segment_id = ? AND (date < ? OR (date = ? AND (hour < ? OR (hour = ? AND minute <= ?))))
           ORDER BY date DESC, hour DESC, minute DESC
           LIMIT 350""",
        (segment_id, date, date, hour, hour, minute),
    ).fetchall()

    if not rows:
        return None

    obs = [(r['LOS_encoded'], r['date'], r['hour'], r['minute']) for r in rows]
    features = {}
    for period in LAG_PERIODS:
        idx = min(period - 1, len(obs) - 1)
        features[f'LOS_encoded_lag_{period}'] = obs[idx][0]

    return features, obs


def _compute_rolling_features(obs: list):
    """Compute rolling features from observations."""
    if len(obs) < 2:
        return {
            'LOS_encoded_rolling_mean_3': obs[0][0] if obs else 2.0,
            'LOS_encoded_rolling_mode_6': obs[0][0] if obs else 2.0,
            'LOS_encoded_rolling_std_6': 0.0,
        }

    los_values = [o[0] for o in obs]

    window = min(3, len(los_values))
    features = {
        'LOS_encoded_rolling_mean_3': float(np.mean(los_values[:window])),
    }

    window = min(6, len(los_values))
    vals = los_values[:window]
    features['LOS_encoded_rolling_mode_6'] = int(np.bincount(vals).argmax())

    window = min(6, len(los_values))
    features['LOS_encoded_rolling_std_6'] = float(np.std(los_values[:window])) if window >= 2 else 0.0

    return features


def _bulk_load_lag_features(conn: sqlite3.Connection, segment_ids: list,
                            date: str, hour: int, minute: int):
    """Load lag features for all segment_ids in one query."""
    if not segment_ids:
        return {}

    placeholders = ','.join('?' * len(segment_ids))
    rows = conn.execute(
        f"""SELECT segment_id, LOS_encoded, date, hour, minute
            FROM traffic_history
            WHERE segment_id IN ({placeholders})
            AND (date < ? OR (date = ? AND (hour < ? OR (hour = ? AND minute <= ?))))
            ORDER BY segment_id, date DESC, hour DESC, minute DESC""",
        (*segment_ids, date, date, hour, hour, minute),
    ).fetchall()

    # Group by segment_id
    by_segment = defaultdict(list)
    for r in rows:
        by_segment[r['segment_id']].append(r['LOS_encoded'])

    result = {}
    for sid in segment_ids:
        obs = by_segment.get(sid, [])
        if not obs:
            continue

        features = {}
        for period in LAG_PERIODS:
            idx = min(period - 1, len(obs) - 1)
            features[f'LOS_encoded_lag_{period}'] = obs[idx]

        # Rolling features
        window3 = min(3, len(obs))
        window6 = min(6, len(obs))

        features['LOS_encoded_rolling_mean_3'] = float(np.mean(obs[:window3]))

        vals6 = obs[:window6]
        features['LOS_encoded_rolling_mode_6'] = int(np.bincount(vals6).argmax())

        features['LOS_encoded_rolling_std_6'] = (
            float(np.std(obs[:window6])) if window6 >= 2 else 0.0
        )

        result[sid] = features

    return result


def _bulk_load_historical_stats(conn: sqlite3.Connection, segment_ids: list,
                                hour: int, weekday: int):
    """Load historical stats for all segment_ids in one query."""
    if not segment_ids:
        return {}

    placeholders = ','.join('?' * len(segment_ids))
    rows = conn.execute(
        f"""SELECT segment_id, weekday, mean_los
            FROM historical_stats
            WHERE segment_id IN ({placeholders})
            AND hour = ?
            AND weekday IN (-1, ?)""",
        (*segment_ids, hour, weekday),
    ).fetchall()

    # Build lookup: segment_id -> {weekday_value: mean_los}
    by_segment = defaultdict(dict)
    for r in rows:
        by_segment[r['segment_id']][r['weekday']] = r['mean_los']

    result = {}
    for sid in segment_ids:
        stats = by_segment.get(sid, {})
        same_hour = stats.get(-1, 2.0)
        same_weekday = stats.get(weekday, same_hour)
        result[sid] = {
            'LOS_encoded_same_hour_mean': same_hour,
            'LOS_encoded_same_weekday_mean': same_weekday,
        }

    return result


def build_features_batch(conn: sqlite3.Connection, segments: list,
                         hour: int, minute: int, weekday: int,
                         month: int, day_of_month: int, date: str,
                         street_type_map: dict, velocity_medians: dict):
    """Build feature matrix for multiple segments at once.
    Returns (segment_ids, feature_matrix) where feature_matrix is numpy array."""
    if not segments:
        return [], np.empty((0, len(FULL_FEATURES)))

    segment_ids = [s['segment_id'] for s in segments]

    # Bulk load lag + rolling features
    lag_data = _bulk_load_lag_features(conn, segment_ids, date, hour, minute)

    # Bulk load historical stats
    hist_data = _bulk_load_historical_stats(conn, segment_ids, hour, weekday)

    # Build feature matrix
    temporal = _compute_temporal(hour, minute, weekday, month, day_of_month)
    feature_idx = {name: i for i, name in enumerate(FULL_FEATURES)}
    n = len(segments)
    X = np.zeros((n, len(FULL_FEATURES)), dtype=np.float32)

    for i, seg in enumerate(segments):
        sid = seg['segment_id']
        spatial = _compute_spatial(seg, street_type_map, velocity_medians)

        # Temporal features (same for all)
        for k, v in temporal.items():
            X[i, feature_idx[k]] = v

        # Spatial features
        for k, v in spatial.items():
            X[i, feature_idx[k]] = v

        # Lag + rolling features
        if sid in lag_data:
            for k, v in lag_data[sid].items():
                X[i, feature_idx[k]] = v
        else:
            for p in LAG_PERIODS:
                X[i, feature_idx[f'LOS_encoded_lag_{p}']] = 2.0
            X[i, feature_idx['LOS_encoded_rolling_mean_3']] = 2.0
            X[i, feature_idx['LOS_encoded_rolling_mode_6']] = 2
            X[i, feature_idx['LOS_encoded_rolling_std_6']] = 0.5

        # Historical features
        hist = hist_data.get(sid, {
            'LOS_encoded_same_hour_mean': 2.0,
            'LOS_encoded_same_weekday_mean': 2.0,
        })
        for k, v in hist.items():
            X[i, feature_idx[k]] = v

    return segment_ids, X


def heuristic_predict(segment, hour: int, weekday: int):
    """Heuristic LOS prediction for segments without XGBoost data."""
    is_weekend = weekday in WEEKEND_DAYS
    is_rush_hour = hour in RUSH_HOURS
    is_night = hour in NIGHT_HOURS
    is_major_road = segment['street_level'] == 1 if segment['street_level'] else False

    seed = (segment['segment_id'] * 9301 + hour * 49297 + weekday * 233280) % 233280
    noise = seed / 233280

    if is_night:
        return {'los': 'A', 'confidence': 0.88}

    if is_weekend:
        if 8 <= hour <= 20:
            return {'los': 'C' if noise > 0.65 else 'B', 'confidence': 0.72 if noise > 0.65 else 0.76}
        return {'los': 'A', 'confidence': 0.84}

    if is_rush_hour:
        if is_major_road:
            if noise > 0.78:
                return {'los': 'E', 'confidence': 0.74}
            if noise > 0.46:
                return {'los': 'D', 'confidence': 0.71}
            return {'los': 'C', 'confidence': 0.66}
        return {'los': 'D' if noise > 0.58 else 'C', 'confidence': 0.69 if noise > 0.58 else 0.70}

    return {'los': 'C' if noise > 0.5 else 'B', 'confidence': 0.74 if noise > 0.5 else 0.77}
