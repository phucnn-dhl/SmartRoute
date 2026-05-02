from pydantic import BaseModel
from typing import List, Optional


class PredictRequest(BaseModel):
    segment_ids: List[int]
    hour: int
    minute: int = 0
    weekday: int
    month: Optional[int] = None
    day_of_month: Optional[int] = None
