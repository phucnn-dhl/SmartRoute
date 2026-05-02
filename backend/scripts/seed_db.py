"""Seed SQLite database from BOTH original HCMC data + research dataset"""

import sys
from pathlib import Path
import pandas as pd
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from db.database import init_db, get_db, DB_PATH, LOS_ENCODING

# Original HCMC data (84K segments, 577K nodes)
ORIG_NODES_PATH = Path(r"C:\Users\Admin\Desktop\GIT CLONE\webdev-vong-2\traffic-map-poc\public\data\nodes.csv")
ORIG_SEGMENTS_PATH = Path(r"C:\Users\Admin\Desktop\GIT CLONE\webdev-vong-2\traffic-map-poc\public\data\segments.csv")

# Research dataset (10K segments with LOS data)
RESEARCH_PATH = Path(r"C:\Users\Admin\Desktop\GIT CLONE\webdev-vong-2\ref app\data traffic hcm\data2\train.csv")


def seed_original_nodes(conn):
    """Import 577K nodes from original nodes.csv"""
    cur = conn.execute("SELECT COUNT(*) FROM nodes")
    if cur.fetchone()[0] > 0:
        print(f"  Nodes already seeded ({cur.fetchone()[0] if cur.fetchone() else '?'} rows), skipping.")
        return

    print(f"  Loading nodes from {ORIG_NODES_PATH}...")
    df = pd.read_csv(ORIG_NODES_PATH)
    print(f"  Inserting {len(df):,} nodes...")

    # Batch insert
    conn.executemany(
        "INSERT OR IGNORE INTO nodes (node_id, longitude, latitude) VALUES (?, ?, ?)",
        [(int(r['_id']), r['long'], r['lat']) for _, r in df.iterrows()],
    )
    conn.commit()
    print(f"  Done: {len(df):,} nodes")


def seed_original_segments(conn):
    """Import 84K segments from original segments.csv with node coordinates"""
    cur = conn.execute("SELECT COUNT(*) FROM segments")
    count = cur.fetchone()[0]
    if count > 10000:
        print(f"  Segments already seeded ({count:,} rows), skipping.")
        return

    print(f"  Loading segments from {ORIG_SEGMENTS_PATH}...")
    df = pd.read_csv(ORIG_SEGMENTS_PATH)
    print(f"  Inserting {len(df):,} segments with node lookup...")

    # Load node coordinates into memory for fast lookup
    nodes = {}
    for row in conn.execute("SELECT node_id, longitude, latitude FROM nodes"):
        nodes[row['node_id']] = (row['longitude'], row['latitude'])

    batch = []
    missing_nodes = 0
    for _, r in df.iterrows():
        s_id = int(r['_id'])
        s_node = int(r['s_node_id'])
        e_node = int(r['e_node_id'])

        s_coord = nodes.get(s_node)
        e_coord = nodes.get(e_node)

        if not s_coord or not e_coord:
            missing_nodes += 1
            continue

        batch.append((
            s_id,
            s_node, e_node,
            s_coord[0], s_coord[1],
            e_coord[0], e_coord[1],
            r['length'] if pd.notna(r['length']) else 0,
            int(r['street_id']) if pd.notna(r['street_id']) else None,
            r['max_velocity'] if pd.notna(r['max_velocity']) else None,
            int(r['street_level']),
            r['street_name'],
            r['street_type'],
            0,  # has_xgboost_data = False initially
        ))

    print(f"  Inserting {len(batch):,} segments ({missing_nodes:,} skipped due to missing nodes)...")
    conn.executemany(
        """INSERT OR IGNORE INTO segments
           (segment_id, s_node_id, e_node_id, long_snode, lat_snode,
            long_enode, lat_enode, length, street_id, max_velocity,
            street_level, street_name, street_type, has_xgboost_data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        batch,
    )
    conn.commit()
    print(f"  Done: {len(batch):,} segments inserted")


def seed_research_data(conn):
    """Import research dataset: mark segments as XGBoost-available + load traffic history"""
    df = pd.read_csv(RESEARCH_PATH)
    print(f"  Research dataset: {len(df):,} records, {df['segment_id'].nunique():,} unique segments")

    # Mark research segments as having XGBoost data
    research_seg_ids = df['segment_id'].unique()
    print(f"  Marking {len(research_seg_ids):,} segments as XGBoost-available...")

    # Also add any segments from research data that aren't in the original dataset
    existing = {r['segment_id'] for r in conn.execute("SELECT segment_id FROM segments")}
    new_segments = []
    for seg_id in research_seg_ids:
        if seg_id not in existing:
            row = df[df['segment_id'] == seg_id].iloc[0]
            new_segments.append((
                int(seg_id),
                int(row['s_node_id']), int(row['e_node_id']),
                row['long_snode'], row['lat_snode'],
                row['long_enode'], row['lat_enode'],
                row['length'],
                int(row['street_id']) if pd.notna(row['street_id']) else None,
                row['max_velocity'] if pd.notna(row['max_velocity']) else None,
                int(row['street_level']),
                row['street_name'],
                row['street_type'],
                1,  # has_xgboost_data = True
            ))

    if new_segments:
        print(f"  Adding {len(new_segments):,} new segments from research data...")
        conn.executemany(
            """INSERT OR IGNORE INTO segments
               (segment_id, s_node_id, e_node_id, long_snode, lat_snode,
                long_enode, lat_enode, length, street_id, max_velocity,
                street_level, street_name, street_type, has_xgboost_data)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            new_segments,
        )

    # Mark all research segments as having XGBoost data
    conn.executemany(
        "UPDATE segments SET has_xgboost_data = 1 WHERE segment_id = ?",
        [(int(sid),) for sid in research_seg_ids],
    )
    conn.commit()

    # Seed traffic history
    cur = conn.execute("SELECT COUNT(*) FROM traffic_history")
    if cur.fetchone()[0] > 0:
        print(f"  Traffic history already seeded, skipping.")
    else:
        df_processed = df.copy()
        period_parts = df_processed["period"].str.split("_", expand=True)
        df_processed["hour"] = period_parts[1].astype(int)
        df_processed["minute"] = period_parts[2].astype(int)
        df_processed["LOS_encoded"] = df_processed["LOS"].map(LOS_ENCODING)

        print(f"  Inserting {len(df_processed):,} traffic history records...")
        conn.executemany(
            """INSERT INTO traffic_history
               (segment_id, date, hour, minute, weekday, LOS, LOS_encoded)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            [
                (
                    int(r["segment_id"]), r["date"],
                    int(r["hour"]), int(r["minute"]),
                    int(r["weekday"]), r["LOS"], int(r["LOS_encoded"]),
                )
                for _, r in df_processed.iterrows()
            ],
        )
        conn.commit()

    # Seed historical stats
    cur = conn.execute("SELECT COUNT(*) FROM historical_stats")
    if cur.fetchone()[0] > 0:
        print(f"  Historical stats already seeded, skipping.")
    else:
        print("  Computing historical stats...")
        conn.execute("""
            INSERT INTO historical_stats (segment_id, hour, weekday, mean_los, count)
            SELECT segment_id, hour, -1, AVG(LOS_encoded), COUNT(*)
            FROM traffic_history GROUP BY segment_id, hour
        """)
        conn.execute("""
            INSERT INTO historical_stats (segment_id, hour, weekday, mean_los, count)
            SELECT segment_id, hour, weekday, AVG(LOS_encoded), COUNT(*)
            FROM traffic_history GROUP BY segment_id, hour, weekday
        """)
        conn.commit()


def verify(conn):
    for table in ["nodes", "segments", "traffic_history", "historical_stats"]:
        count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"  {table}: {count:,} rows")

    xgb_count = conn.execute("SELECT COUNT(*) FROM segments WHERE has_xgboost_data = 1").fetchone()[0]
    total = conn.execute("SELECT COUNT(*) FROM segments").fetchone()[0]
    print(f"  Segments with XGBoost data: {xgb_count:,} / {total:,} ({xgb_count/total*100:.1f}%)")


def main():
    for path, name in [(ORIG_NODES_PATH, "nodes"), (ORIG_SEGMENTS_PATH, "segments"), (RESEARCH_PATH, "research")]:
        if not path.exists():
            print(f"ERROR: {name} file not found at {path}")
            sys.exit(1)

    print("Initializing database...")
    init_db()

    with get_db() as conn:
        print("\nStep 1: Import original nodes...")
        seed_original_nodes(conn)

        print("\nStep 2: Import original segments...")
        seed_original_segments(conn)

        print("\nStep 3: Import research data + mark XGBoost segments...")
        seed_research_data(conn)

        print("\nVerification:")
        verify(conn)

    print(f"\nDone! Database at: {DB_PATH}")


if __name__ == "__main__":
    main()
