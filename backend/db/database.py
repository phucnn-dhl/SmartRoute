import sqlite3
from pathlib import Path
from contextlib import contextmanager

DB_PATH = Path(__file__).parent.parent / "artifacts" / "traffic.db"

LOS_ENCODING = {'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5}
LOS_DECODING = {v: k for k, v in LOS_ENCODING.items()}


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA cache_size=-64000")
    return conn


@contextmanager
def get_db():
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS nodes (
                node_id INTEGER PRIMARY KEY,
                longitude REAL NOT NULL,
                latitude REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS segments (
                segment_id INTEGER PRIMARY KEY,
                s_node_id INTEGER,
                e_node_id INTEGER,
                long_snode REAL,
                lat_snode REAL,
                long_enode REAL,
                lat_enode REAL,
                length REAL,
                street_id INTEGER,
                max_velocity REAL,
                street_level INTEGER,
                street_name TEXT,
                street_type TEXT,
                has_xgboost_data INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_segments_bbox
                ON segments(lat_snode, long_snode);
            CREATE INDEX IF NOT EXISTS idx_segments_bbox_end
                ON segments(lat_enode, long_enode);
            CREATE INDEX IF NOT EXISTS idx_segments_xgb
                ON segments(has_xgboost_data);

            CREATE TABLE IF NOT EXISTS traffic_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                segment_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                hour INTEGER NOT NULL,
                minute INTEGER NOT NULL,
                weekday INTEGER NOT NULL,
                LOS TEXT NOT NULL,
                LOS_encoded INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_th_seg_time
                ON traffic_history(segment_id, date, hour, minute);
            CREATE INDEX IF NOT EXISTS idx_th_seg_id
                ON traffic_history(segment_id);

            CREATE TABLE IF NOT EXISTS historical_stats (
                segment_id INTEGER NOT NULL,
                hour INTEGER NOT NULL,
                weekday INTEGER NOT NULL DEFAULT -1,
                mean_los REAL NOT NULL,
                count INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (segment_id, hour, weekday)
            );
        """)
        conn.commit()
