from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.database import init_db
from models.xgboost_model import TrafficModel
from routers import health, predict, segments

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
