from __future__ import annotations

from dataclasses import dataclass
import logging
from random import uniform

import numpy as np
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import ConstantKernel, RBF, WhiteKernel

from app.schemas.session import BOCandidate, BOVector

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class BOObservation:
    vector: BOVector
    reward: float


def _sample_vector() -> BOVector:
    return BOVector(
        eye_x=round(uniform(-8, 8), 2),
        eye_y=round(uniform(-8, 8), 2),
        eye_scale=round(uniform(-12, 12), 2),
    )


def _to_array(vector: BOVector) -> np.ndarray:
    return np.array([vector.eye_x, vector.eye_y, vector.eye_scale], dtype=float)


def _distance(a: BOVector, b: BOVector) -> float:
    arr_a = _to_array(a)
    arr_b = _to_array(b)
    return float(np.linalg.norm(arr_a - arr_b))


def _stats_line(values: np.ndarray) -> str:
    return (
        f"min={float(np.min(values)):.4f} "
        f"mean={float(np.mean(values)):.4f} "
        f"max={float(np.max(values)):.4f}"
    )


def _build_random_candidates(k: int) -> list[BOCandidate]:
    return [
        BOCandidate(
            id=f"cand-{index + 1}",
            vector=_sample_vector(),
            acquisition=None,
        )
        for index in range(k)
    ]


def generate_candidates(
    observations: list[BOObservation],
    k: int,
    debug: bool = False,
) -> tuple[list[BOCandidate], str]:
    if debug:
        logger.info("[BO] generate_candidates start: observations=%s k=%s", len(observations), k)

    if len(observations) < 6:
        warmup = _build_random_candidates(k)
        if debug:
            logger.info(
                "[BO] warmup mode: generated=%s candidates=%s",
                len(warmup),
                [
                    {
                        "id": c.id,
                        "eye_x": c.vector.eye_x,
                        "eye_y": c.vector.eye_y,
                        "eye_scale": c.vector.eye_scale,
                    }
                    for c in warmup
                ],
            )
        return warmup, "random-warmup"

    x_train = np.vstack([_to_array(obs.vector) for obs in observations])
    y_train = np.array([obs.reward for obs in observations], dtype=float)

    kernel = ConstantKernel(1.0, (1e-3, 1e3)) * RBF(length_scale=2.0) + WhiteKernel(noise_level=0.1)
    gp = GaussianProcessRegressor(kernel=kernel, normalize_y=True, random_state=42)
    gp.fit(x_train, y_train)

    if debug:
        positive_count = int(np.sum(y_train > 0.5))
        zero_count = int(np.sum(y_train <= 0.5))
        logger.info(
            "[BO] gp fitted: x_shape=%s y_mean=%.4f y_std=%.4f y_positive=%s y_zero=%s kernel=%s",
            x_train.shape,
            float(np.mean(y_train)),
            float(np.std(y_train)),
            positive_count,
            zero_count,
            gp.kernel_,
        )

    pool = np.vstack([_to_array(_sample_vector()) for _ in range(320)])
    mu, sigma = gp.predict(pool, return_std=True)
    beta = 1.75
    ucb = mu + beta * sigma

    if debug:
        logger.info(
            "[BO][PREDICT] pool_size=%s beta=%.2f mu(%s) sigma(%s) ucb(%s)",
            len(pool),
            beta,
            _stats_line(mu),
            _stats_line(sigma),
            _stats_line(ucb),
        )

    ranked_indices = np.argsort(ucb)[::-1]
    picked: list[BOCandidate] = []
    skipped_by_distance = 0

    if debug:
        top_debug = []
        for rank, idx in enumerate(ranked_indices[:8], start=1):
            top_debug.append(
                {
                    "rank": rank,
                    "eye_x": float(round(pool[idx][0], 2)),
                    "eye_y": float(round(pool[idx][1], 2)),
                    "eye_scale": float(round(pool[idx][2], 2)),
                    "mu": float(round(mu[idx], 4)),
                    "sigma": float(round(sigma[idx], 4)),
                    "ucb": float(round(ucb[idx], 4)),
                }
            )

        logger.info("[BO][PREDICT] top_raw_by_ucb=%s", top_debug)

    for idx in ranked_indices:
        vector = BOVector(
            eye_x=float(round(pool[idx][0], 2)),
            eye_y=float(round(pool[idx][1], 2)),
            eye_scale=float(round(pool[idx][2], 2)),
        )

        if any(_distance(vector, existing.vector) < 2.0 for existing in picked):
            skipped_by_distance += 1
            continue

        picked.append(
            BOCandidate(
                id=f"cand-{len(picked) + 1}",
                vector=vector,
                acquisition=float(ucb[idx]),
            )
        )

        if len(picked) >= k:
            break

    if len(picked) < k:
        fallback = _build_random_candidates(k - len(picked))
        picked.extend(
            BOCandidate(
                id=f"cand-{len(picked) + i + 1}",
                vector=item.vector,
                acquisition=item.acquisition,
            )
            for i, item in enumerate(fallback)
        )

    if debug:
        picked_debug = []
        for candidate in picked:
            matched = np.where(
                (np.round(pool[:, 0], 2) == candidate.vector.eye_x)
                & (np.round(pool[:, 1], 2) == candidate.vector.eye_y)
                & (np.round(pool[:, 2], 2) == candidate.vector.eye_scale)
            )[0]
            if len(matched) > 0:
                match_idx = int(matched[0])
                picked_debug.append(
                    {
                        "id": candidate.id,
                        "eye_x": candidate.vector.eye_x,
                        "eye_y": candidate.vector.eye_y,
                        "eye_scale": candidate.vector.eye_scale,
                        "mu": float(round(mu[match_idx], 4)),
                        "sigma": float(round(sigma[match_idx], 4)),
                        "ucb": float(round(ucb[match_idx], 4)),
                    }
                )
            else:
                picked_debug.append(
                    {
                        "id": candidate.id,
                        "eye_x": candidate.vector.eye_x,
                        "eye_y": candidate.vector.eye_y,
                        "eye_scale": candidate.vector.eye_scale,
                        "mu": None,
                        "sigma": None,
                        "ucb": None,
                    }
                )

        logger.info(
            "[BO] gp-ucb mode: generated=%s skipped_by_distance=%s top_candidates=%s",
            len(picked),
            skipped_by_distance,
            picked_debug,
        )

    return picked, "gp-ucb"
