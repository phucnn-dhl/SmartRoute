import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.database import init_db
from models.xgboost_model import TrafficModel
from routers import health, predict, segments, hotspots


def load_local_env() -> None:
    env_path = Path(__file__).parent / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


load_local_env()

app = FastAPI(title="Traffic Prediction API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

model = TrafficModel()


@app.on_event("startup")
def startup():
    init_db()
    try:
        model.load()
        print("Model loaded successfully")
    except Exception as e:
        print(f"Warning: Could not load model: {e}")
        print("Run 'python scripts/train_model.py' first")


app.include_router(health.router, tags=["health"])
app.include_router(predict.router, tags=["predict"])
app.include_router(segments.router, tags=["segments"])
app.include_router(hotspots.router, tags=["hotspots"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
