"""Train XGBoost model from SQLite data and save artifacts"""

import sys
import json
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from scipy.stats import mode

sys.path.insert(0, str(Path(__file__).parent.parent))

from db.database import get_db, DB_PATH, LOS_ENCODING

ARTIFACTS_DIR = Path(__file__).parent.parent / "artifacts"

PARAMS = {
    'n_estimators': 500,
    'max_depth': 6,
    'learning_rate': 0.05,
    'subsample': 0.8,
    'colsample_bytree': 0.8,
    'min_child_weight': 1,
    'gamma': 0,
    'reg_alpha': 0,
    'reg_lambda': 1,
    'random_state': 42,
    'use_label_encoder': False,
    'eval_metric': 'mlogloss',
    'early_stopping_rounds': 50,
}

LAG_PERIODS = [1, 2, 3, 48, 96, 336]
RUSH_HOURS = [7, 8, 9, 17, 18, 19]
NIGHT_HOURS = [22, 23, 0, 1, 2, 3, 4, 5, 6]
WEEKEND_DAYS = [0, 6]

FEATURE_COLS = [
    'hour', 'minute', 'weekday', 'month', 'day_of_month',
    'is_weekend', 'is_rush_hour', 'is_night',
    'street_type_encoded', 'street_level', 'length', 'max_velocity_imputed',
    'LOS_encoded_lag_1', 'LOS_encoded_lag_2', 'LOS_encoded_lag_3',
    'LOS_encoded_lag_48', 'LOS_encoded_lag_96', 'LOS_encoded_lag_336',
    'LOS_encoded_rolling_mean_3', 'LOS_encoded_rolling_mode_6', 'LOS_encoded_rolling_std_6',
    'LOS_encoded_same_hour_mean', 'LOS_encoded_same_weekday_mean',
]


def load_data_from_db():
    with get_db() as conn:
        df = pd.read_sql_query("SELECT * FROM traffic_history", conn)
        segs = pd.read_sql_query("SELECT * FROM segments", conn)

    df = df.merge(segs[['segment_id', 'length', 'street_level', 'street_type', 'max_velocity']], on='segment_id', how='left')
    df = df.sort_values(['segment_id', 'date', 'hour', 'minute']).reset_index(drop=True)
    return df


def preprocess(df):
    df['month'] = pd.to_datetime(df['date']).dt.month
    df['day_of_month'] = pd.to_datetime(df['date']).dt.day
    df['is_weekend'] = df['weekday'].isin(WEEKEND_DAYS).astype(int)
    df['is_rush_hour'] = df['hour'].isin(RUSH_HOURS).astype(int)
    df['is_night'] = df['hour'].isin(NIGHT_HOURS).astype(int)

    # Encode street_type
    street_types = sorted(df['street_type'].dropna().unique())
    street_type_map = {st: i for i, st in enumerate(street_types)}
    df['street_type_encoded'] = df['street_type'].map(street_type_map).fillna(0).astype(int)

    # Impute max_velocity
    velocity_medians = df.groupby('street_type')['max_velocity'].median().to_dict()
    global_median = df['max_velocity'].median()
    df['max_velocity_imputed'] = df.apply(
        lambda r: velocity_medians.get(r['street_type'], global_median)
        if pd.isna(r['max_velocity']) else r['max_velocity'], axis=1,
    )

    return df, street_type_map, velocity_medians


def create_features(df):
    # Lag features
    for period in LAG_PERIODS:
        df[f'LOS_encoded_lag_{period}'] = df.groupby('segment_id')['LOS_encoded'].shift(period)

    # Rolling features
    df['LOS_encoded_rolling_mean_3'] = (
        df.groupby('segment_id')['LOS_encoded']
        .transform(lambda x: x.shift(1).rolling(3, min_periods=1).mean())
    )

    def rolling_mode_fn(x):
        result = []
        for i in range(len(x)):
            if i < 6:
                result.append(x.iloc[i])
            else:
                window_data = x.iloc[i - 6 + 1:i + 1].values
                result.append(int(mode(window_data, keepdims=True).mode[0]))
        return pd.Series(result, index=x.index)

    df['LOS_encoded_rolling_mode_6'] = (
        df.groupby('segment_id')['LOS_encoded'].transform(rolling_mode_fn)
    )

    df['LOS_encoded_rolling_std_6'] = (
        df.groupby('segment_id')['LOS_encoded']
        .transform(lambda x: x.shift(1).rolling(6, min_periods=2).std())
    )

    # Historical features
    df['LOS_encoded_same_hour_mean'] = (
        df.groupby(['segment_id', 'hour'])['LOS_encoded'].transform('mean')
    )
    df['LOS_encoded_same_weekday_mean'] = (
        df.groupby(['segment_id', 'weekday', 'hour'])['LOS_encoded'].transform('mean')
    )

    return df


def split_data(df):
    df['_date'] = pd.to_datetime(df['date'])
    train = df[df['_date'] <= '2021-03-31'].copy()
    val = df[(df['_date'] >= '2021-04-01') & (df['_date'] <= '2021-04-14')].copy()
    test = df[df['_date'] >= '2021-04-15'].copy()

    # Drop rows with all NaN lag features
    lag_cols = [f'LOS_encoded_lag_{p}' for p in LAG_PERIODS]
    for split in [train, val, test]:
        split.dropna(subset=lag_cols, how='all', inplace=True)

    return train, val, test


def train_model(train, val, test):
    X_train = train[FEATURE_COLS].values
    y_train = train['LOS_encoded'].values
    X_val = val[FEATURE_COLS].values
    y_val = val['LOS_encoded'].values

    model = xgb.XGBClassifier(**PARAMS)
    model.fit(X_train, y_train, eval_set=[(X_train, y_train), (X_val, y_val)], verbose=100)

    # Evaluate
    X_test = test[FEATURE_COLS].values
    y_test = test['LOS_encoded'].values
    y_pred = model.predict(X_test)
    accuracy = (y_pred == y_test).mean()

    print(f"\nTest Accuracy: {accuracy:.4f}")
    print(f"Best iteration: {model.best_iteration}")

    return model, accuracy


def save_artifacts(model, street_type_map, velocity_medians, accuracy):
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    model_path = ARTIFACTS_DIR / "xgboost_traffic.model"
    model.save_model(str(model_path))
    print(f"Model saved to {model_path}")

    meta = {
        'feature_names': FEATURE_COLS,
        'n_features': len(FEATURE_COLS),
        'accuracy': accuracy,
        'params': {k: v for k, v in PARAMS.items() if k != 'early_stopping_rounds'},
        'model_file': model_path.name,
    }
    with open(ARTIFACTS_DIR / "xgboost_traffic.json", 'w') as f:
        json.dump(meta, f, indent=2)

    with open(ARTIFACTS_DIR / "street_type_map.json", 'w') as f:
        json.dump(street_type_map, f, indent=2)

    with open(ARTIFACTS_DIR / "velocity_medians.json", 'w') as f:
        json.dump(velocity_medians, f, indent=2)

    print(f"Artifacts saved to {ARTIFACTS_DIR}")


def main():
    print("Loading data from SQLite...")
    df = load_data_from_db()
    print(f"  {len(df):,} records loaded")

    print("Preprocessing...")
    df, street_type_map, velocity_medians = preprocess(df)

    print("Creating features...")
    df = create_features(df)
    print(f"  {len(df):,} records with {len(FEATURE_COLS)} features")

    print("Splitting data...")
    train, val, test = split_data(df)
    print(f"  Train: {len(train):,}, Val: {len(val):,}, Test: {len(test):,}")

    print("Training XGBoost model...")
    model, accuracy = train_model(train, val, test)

    print("Saving artifacts...")
    save_artifacts(model, street_type_map, velocity_medians, accuracy)

    print("\nDone!")


if __name__ == "__main__":
    main()
