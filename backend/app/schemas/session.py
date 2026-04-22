from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SessionCreateRequest(BaseModel):
    goal: str = Field(min_length=1, max_length=500)
    reference_image_url: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class SessionResponse(BaseModel):
    id: str
    goal: str
    reference_image_url: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class CandidateDelta(BaseModel):
    parameter: str = Field(min_length=1, max_length=100)
    value: float


class SelectionCreateRequest(BaseModel):
    round_index: int = Field(ge=1, le=100)
    candidate_id: str = Field(min_length=1, max_length=100)
    deltas: list[CandidateDelta] = Field(default_factory=list)


class SelectionResponse(BaseModel):
    id: str
    session_id: str
    round_index: int
    candidate_id: str
    deltas: list[CandidateDelta] = Field(default_factory=list)
    created_at: datetime


class DiagnosisDelta(BaseModel):
    parameter: str
    average_value: float
    observation_count: int


class DiagnosisResponse(BaseModel):
    session_id: str
    selection_count: int
    delta_summary: list[DiagnosisDelta] = Field(default_factory=list)


class BOVectorMacro(BaseModel):
    global_x: float = Field(ge=-2, le=2)
    global_y: float = Field(ge=-2, le=2)
    global_scale: float = Field(ge=-6, le=6)


class BOVectorMicro(BaseModel):
    upper_eye_rotation: float = Field(ge=-20, le=20)
    pupil_x: float = Field(ge=-2, le=2)
    lower_upper_distance_y: float = Field(ge=-2, le=2)


class BOCandidate(BaseModel):
    id: str
    macro: BOVectorMacro
    micro: BOVectorMicro
    acquisition: float | None = None


class BONextCandidatesResponse(BaseModel):
    session_id: str
    round_index: int
    active_subspace: str
    strategy: str
    training_size: int
    candidates: list[BOCandidate]


class BONextQuery(BaseModel):
    round_index: int = Field(ge=1, le=100)
    k: int = Field(default=4, ge=2, le=9)


class BOFeedbackRequest(BaseModel):
    round_index: int = Field(ge=1, le=100)
    chosen_id: str = Field(min_length=1, max_length=100)
    candidates: list[BOCandidate] = Field(min_length=2, max_length=9)


class BOFeedbackResponse(BaseModel):
    session_id: str
    round_index: int
    stored_points: int


class BOFinalResultResponse(BaseModel):
    session_id: str
    training_size: int
    strategy: str
    candidate: BOCandidate


class SessionRenderPayloadUpsertRequest(BaseModel):
    payload: dict[str, Any] = Field(default_factory=dict)


class SessionRenderPayloadResponse(BaseModel):
    session_id: str
    payload: dict[str, Any] = Field(default_factory=dict)
