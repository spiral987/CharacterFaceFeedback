from collections import defaultdict
from datetime import datetime, timezone
import logging
from threading import Lock
from uuid import uuid4

from app.schemas.session import (
    BOFeedbackRequest,
    BOFeedbackResponse,
    BOFinalResultResponse,
    BOCandidate,
    BOVectorMacro,
    BOVectorMicro,
    BONextCandidatesResponse,
    CandidateDelta,
    DiagnosisDelta,
    DiagnosisResponse,
    SessionRenderPayloadResponse,
    SelectionCreateRequest,
    SelectionResponse,
    SessionCreateRequest,
    SessionResponse,
)
from app.core.config import get_settings
from app.services.bo import (
    BOObservationMacro,
    BOObservationMicro,
    default_macro_vector,
    default_micro_vector,
    generate_candidates_macro,
    generate_candidates_micro,
)

logger = logging.getLogger(__name__)


class InMemorySessionStore:
    def __init__(self) -> None:
        self._lock = Lock()
        settings = get_settings()
        self._bo_debug = settings.bo_debug
        self._sessions: dict[str, SessionResponse] = {}
        self._selections: dict[str, list[SelectionResponse]] = defaultdict(list)
        self._bo_observations_macro: dict[str, list[BOObservationMacro]] = defaultdict(list)
        self._bo_observations_micro: dict[str, list[BOObservationMicro]] = defaultdict(list)
        self._bo_best_macro: dict[str, BOVectorMacro] = {}
        self._bo_best_micro: dict[str, BOVectorMicro] = {}
        self._render_payloads: dict[str, dict] = {}

    def create_session(self, payload: SessionCreateRequest) -> SessionResponse:
        with self._lock:
            session_id = str(uuid4())
            session = SessionResponse(
                id=session_id,
                goal=payload.goal,
                reference_image_url=payload.reference_image_url,
                metadata=payload.metadata,
                created_at=datetime.now(timezone.utc),
            )
            self._sessions[session_id] = session
            logger.info("[SESSION] created: session_id=%s goal=%s", session_id, payload.goal)
            return session

    def get_session(self, session_id: str) -> SessionResponse | None:
        return self._sessions.get(session_id)

    def add_selection(self, session_id: str, payload: SelectionCreateRequest) -> SelectionResponse | None:
        with self._lock:
            if session_id not in self._sessions:
                return None

            selection = SelectionResponse(
                id=str(uuid4()),
                session_id=session_id,
                round_index=payload.round_index,
                candidate_id=payload.candidate_id,
                deltas=payload.deltas,
                created_at=datetime.now(timezone.utc),
            )
            self._selections[session_id].append(selection)
            return selection

    def build_diagnosis(self, session_id: str) -> DiagnosisResponse | None:
        if session_id not in self._sessions:
            return None

        selections = self._selections.get(session_id, [])
        buckets: dict[str, list[float]] = defaultdict(list)

        for selection in selections:
            for delta in selection.deltas:
                buckets[delta.parameter].append(delta.value)

        summary: list[DiagnosisDelta] = []
        for parameter, values in sorted(buckets.items()):
            if not values:
                continue
            summary.append(
                DiagnosisDelta(
                    parameter=parameter,
                    average_value=sum(values) / len(values),
                    observation_count=len(values),
                )
            )

        return DiagnosisResponse(
            session_id=session_id,
            selection_count=len(selections),
            delta_summary=summary,
        )

    def next_bo_candidates(
        self,
        session_id: str,
        round_index: int,
        k: int,
    ) -> BONextCandidatesResponse | None:
        if session_id not in self._sessions:
            return None

        active_subspace = "macro" if round_index % 2 == 1 else "micro"
        observations_macro = self._bo_observations_macro.get(session_id, [])
        observations_micro = self._bo_observations_micro.get(session_id, [])

        best_macro = self._bo_best_macro.get(session_id, default_macro_vector())
        best_micro = self._bo_best_micro.get(session_id, default_micro_vector())

        logger.info(
            "[BO] next requested: session_id=%s round=%s k=%s active_subspace=%s obs_macro=%s obs_micro=%s",
            session_id,
            round_index,
            k,
            active_subspace,
            len(observations_macro),
            len(observations_micro),
        )

        candidates: list[BOCandidate] = []
        if active_subspace == "macro":
            macro_vectors, strategy = generate_candidates_macro(observations_macro, k)
            candidates = [
                BOCandidate(
                    id=f"cand-{index + 1}",
                    macro=macro_vector,
                    micro=best_micro,
                    acquisition=None,
                )
                for index, macro_vector in enumerate(macro_vectors)
            ]
            training_size = len(observations_macro)
        else:
            micro_vectors, strategy = generate_candidates_micro(observations_micro, k)
            candidates = [
                BOCandidate(
                    id=f"cand-{index + 1}",
                    macro=best_macro,
                    micro=micro_vector,
                    acquisition=None,
                )
                for index, micro_vector in enumerate(micro_vectors)
            ]
            training_size = len(observations_micro)

        logger.info(
            "[BO] next generated: session_id=%s round=%s strategy=%s candidates=%s",
            session_id,
            round_index,
            strategy,
            [c.id for c in candidates],
        )

        return BONextCandidatesResponse(
            session_id=session_id,
            round_index=round_index,
            active_subspace=active_subspace,
            strategy=strategy,
            training_size=training_size,
            candidates=candidates,
        )

    def ingest_bo_feedback(self, session_id: str, payload: BOFeedbackRequest) -> BOFeedbackResponse | None:
        with self._lock:
            if session_id not in self._sessions:
                return None

            chosen = next((candidate for candidate in payload.candidates if candidate.id == payload.chosen_id), None)
            if chosen is None:
                logger.warning(
                    "[BO] feedback invalid chosen_id: session_id=%s round=%s chosen_id=%s",
                    session_id,
                    payload.round_index,
                    payload.chosen_id,
                )
                return BOFeedbackResponse(
                    session_id=session_id,
                    round_index=payload.round_index,
                    stored_points=len(self._bo_observations_macro[session_id])
                    + len(self._bo_observations_micro[session_id]),
                )

            active_subspace = "macro" if payload.round_index % 2 == 1 else "micro"
            for candidate in payload.candidates:
                reward = 1.0 if candidate.id == payload.chosen_id else 0.0
                if active_subspace == "macro":
                    self._bo_observations_macro[session_id].append(
                        BOObservationMacro(vector=candidate.macro, reward=reward)
                    )
                else:
                    self._bo_observations_micro[session_id].append(
                        BOObservationMicro(vector=candidate.micro, reward=reward)
                    )

            if active_subspace == "macro":
                self._bo_best_macro[session_id] = chosen.macro
            else:
                self._bo_best_micro[session_id] = chosen.micro

            logger.info(
                "[BO] feedback stored: session_id=%s round=%s chosen_id=%s subspace=%s added=%s total=%s",
                session_id,
                payload.round_index,
                payload.chosen_id,
                active_subspace,
                len(payload.candidates),
                len(self._bo_observations_macro[session_id]) + len(self._bo_observations_micro[session_id]),
            )

            return BOFeedbackResponse(
                session_id=session_id,
                round_index=payload.round_index,
                stored_points=len(self._bo_observations_macro[session_id])
                + len(self._bo_observations_micro[session_id]),
            )

    def build_bo_final_result(self, session_id: str) -> BOFinalResultResponse | None:
        if session_id not in self._sessions:
            return None

        observations_macro = self._bo_observations_macro.get(session_id, [])
        observations_micro = self._bo_observations_micro.get(session_id, [])
        if not observations_macro and not observations_micro:
            return None

        best_macro = self._bo_best_macro.get(session_id, default_macro_vector())
        best_micro = self._bo_best_micro.get(session_id, default_micro_vector())

        candidate = BOCandidate(
            id="cand-final",
            macro=best_macro,
            micro=best_micro,
            acquisition=None,
        )

        logger.info(
            "[BO] final result built: session_id=%s strategy=%s training_size=%s candidate=%s",
            session_id,
            "composed-best",
            len(observations_macro) + len(observations_micro),
            candidate.id,
        )

        return BOFinalResultResponse(
            session_id=session_id,
            training_size=len(observations_macro) + len(observations_micro),
            strategy="composed-best",
            candidate=candidate,
        )

    def set_render_payload(self, session_id: str, payload: dict) -> SessionRenderPayloadResponse | None:
        with self._lock:
            if session_id not in self._sessions:
                return None

            self._render_payloads[session_id] = payload
            return SessionRenderPayloadResponse(session_id=session_id, payload=payload)

    def get_render_payload(self, session_id: str) -> SessionRenderPayloadResponse | None:
        if session_id not in self._sessions:
            return None

        payload = self._render_payloads.get(session_id)
        if payload is None:
            return None

        return SessionRenderPayloadResponse(session_id=session_id, payload=payload)


store = InMemorySessionStore()
