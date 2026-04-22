from fastapi import APIRouter, HTTPException, status
import logging
from pathlib import Path
from fastapi.responses import FileResponse

from app.schemas.session import (
    BOFeedbackRequest,
    BOFeedbackResponse,
    BOFinalResultResponse,
    BONextCandidatesResponse,
    DiagnosisResponse,
    SessionRenderPayloadResponse,
    SessionRenderPayloadUpsertRequest,
    SelectionCreateRequest,
    SelectionResponse,
    SessionCreateRequest,
    SessionResponse,
)
from app.services.store import store

router = APIRouter(prefix="/sessions", tags=["sessions"])
logger = logging.getLogger(__name__)
DEFAULT_PSD_PATH = Path(__file__).resolve().parents[3] / "chinatsu.psd"


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def create_session(payload: SessionCreateRequest) -> SessionResponse:
    return store.create_session(payload)


@router.get("/{session_id}", response_model=SessionResponse)
def get_session(session_id: str) -> SessionResponse:
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


@router.post("/{session_id}/selections", response_model=SelectionResponse, status_code=status.HTTP_201_CREATED)
def create_selection(session_id: str, payload: SelectionCreateRequest) -> SelectionResponse:
    selection = store.add_selection(session_id, payload)
    if not selection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return selection


@router.get("/{session_id}/diagnosis", response_model=DiagnosisResponse)
def get_diagnosis(session_id: str) -> DiagnosisResponse:
    diagnosis = store.build_diagnosis(session_id)
    if not diagnosis:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return diagnosis


@router.get("/{session_id}/bo/next", response_model=BONextCandidatesResponse)
def get_next_bo_candidates(
    session_id: str,
    round_index: int = 1,
    k: int = 4,
) -> BONextCandidatesResponse:
    logger.info(
        "[API] GET /sessions/%s/bo/next?round_index=%s&k=%s",
        session_id,
        round_index,
        k,
    )

    candidate_set = store.next_bo_candidates(
        session_id=session_id,
        round_index=round_index,
        k=k,
    )
    if not candidate_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    logger.info(
        "[API] BO next response: session_id=%s strategy=%s training_size=%s candidates=%s",
        session_id,
        candidate_set.strategy,
        candidate_set.training_size,
        [candidate.id for candidate in candidate_set.candidates],
    )
    return candidate_set


@router.post("/{session_id}/bo/feedback", response_model=BOFeedbackResponse, status_code=status.HTTP_201_CREATED)
def create_bo_feedback(session_id: str, payload: BOFeedbackRequest) -> BOFeedbackResponse:
    logger.info(
        "[API] POST /sessions/%s/bo/feedback round=%s chosen_id=%s candidates=%s",
        session_id,
        payload.round_index,
        payload.chosen_id,
        [candidate.id for candidate in payload.candidates],
    )
    result = store.ingest_bo_feedback(session_id=session_id, payload=payload)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    logger.info(
        "[API] BO feedback response: session_id=%s round=%s stored_points=%s",
        session_id,
        result.round_index,
        result.stored_points,
    )
    return result


@router.get("/{session_id}/bo/final", response_model=BOFinalResultResponse)
def get_final_bo_result(session_id: str) -> BOFinalResultResponse:
    logger.info("[API] GET /sessions/%s/bo/final", session_id)
    result = store.build_bo_final_result(session_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="BO result not available")
    logger.info(
        "[API] BO final response: session_id=%s strategy=%s training_size=%s candidate=%s",
        session_id,
        result.strategy,
        result.training_size,
        result.candidate.id,
    )
    return result


@router.post("/{session_id}/render-payload", response_model=SessionRenderPayloadResponse, status_code=status.HTTP_201_CREATED)
def upsert_render_payload(session_id: str, payload: SessionRenderPayloadUpsertRequest) -> SessionRenderPayloadResponse:
    result = store.set_render_payload(session_id=session_id, payload=payload.payload)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return result


@router.get("/{session_id}/render-payload", response_model=SessionRenderPayloadResponse)
def get_render_payload(session_id: str) -> SessionRenderPayloadResponse:
    result = store.get_render_payload(session_id=session_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Render payload not found")
    return result


@router.get("/debug/default-psd")
def get_default_psd() -> FileResponse:
    if not DEFAULT_PSD_PATH.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Default PSD not found")

    return FileResponse(
        path=DEFAULT_PSD_PATH,
        media_type="application/octet-stream",
        filename=DEFAULT_PSD_PATH.name,
    )
