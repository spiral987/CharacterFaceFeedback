from __future__ import annotations

from dataclasses import dataclass
import logging
from random import uniform

import numpy as np
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import ConstantKernel, RBF, WhiteKernel

from app.schemas.session import BOCandidate, BOVector

logger = logging.getLogger(__name__)

# BO parameter bounds and settings

#　生成される候補のパラメータ範囲
EYE_X_MIN = -2.0
EYE_X_MAX = 2.0
EYE_Y_MIN = -2.0
EYE_Y_MAX = 2.0
EYE_SCALE_MIN = -6.0
EYE_SCALE_MAX = 6.0

# BOアルゴリズムの設定
VECTOR_ROUND_DIGITS = 2
WARMUP_MIN_OBSERVATIONS = 6
PREDICTION_POOL_SIZE = 320
UCB_BETA = 0.5
DIVERSITY_MIN_DISTANCE = 6
LOCAL_DIVERSITY_MIN_DISTANCE = 0.5

LOCAL_TRUST_RADIUS_X = 0.6
LOCAL_TRUST_RADIUS_Y = 0.6
LOCAL_TRUST_RADIUS_SCALE = 2.0
LOCAL_PREDICTION_POOL_SIZE = 192

# カーネルの定数項とノイズレベルの設定
KERNEL_CONSTANT = 1.0
KERNEL_CONSTANT_BOUNDS = (1e-3, 1e3)
KERNEL_LENGTH_SCALE = 2.0
KERNEL_NOISE_LEVEL = 0.1

# BOのデバッグ用に、予測候補の上位をログに出力する数
DEBUG_TOP_RANKS = 8


@dataclass(frozen=True)
class BOObservation:
    vector: BOVector
    reward: float


def _sample_vector() -> BOVector:
    return _sample_vector_in_bounds(
        x_min=EYE_X_MIN,
        x_max=EYE_X_MAX,
        y_min=EYE_Y_MIN,
        y_max=EYE_Y_MAX,
        scale_min=EYE_SCALE_MIN,
        scale_max=EYE_SCALE_MAX,
    )


def _sample_vector_in_bounds(
    *,
    x_min: float,
    x_max: float,
    y_min: float,
    y_max: float,
    scale_min: float,
    scale_max: float,
) -> BOVector:
    return BOVector(
        eye_x=round(uniform(x_min, x_max), VECTOR_ROUND_DIGITS),
        eye_y=round(uniform(y_min, y_max), VECTOR_ROUND_DIGITS),
        eye_scale=round(uniform(scale_min, scale_max), VECTOR_ROUND_DIGITS),
    )


def _clip_bounds(value: float, low: float, high: float) -> float:
    return float(min(max(value, low), high))


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


def _build_random_candidates(
    k: int,
    center_vector: BOVector | None = None,
    trust_region: tuple[float, float, float] | None = None,
) -> list[BOCandidate]:
    if center_vector is not None:
        radius_x, radius_y, radius_scale = trust_region or (
            LOCAL_TRUST_RADIUS_X,
            LOCAL_TRUST_RADIUS_Y,
            LOCAL_TRUST_RADIUS_SCALE,
        )
        x_min = _clip_bounds(center_vector.eye_x - radius_x, EYE_X_MIN, EYE_X_MAX)
        x_max = _clip_bounds(center_vector.eye_x + radius_x, EYE_X_MIN, EYE_X_MAX)
        y_min = _clip_bounds(center_vector.eye_y - radius_y, EYE_Y_MIN, EYE_Y_MAX)
        y_max = _clip_bounds(center_vector.eye_y + radius_y, EYE_Y_MIN, EYE_Y_MAX)
        scale_min = _clip_bounds(center_vector.eye_scale - radius_scale, EYE_SCALE_MIN, EYE_SCALE_MAX)
        scale_max = _clip_bounds(center_vector.eye_scale + radius_scale, EYE_SCALE_MIN, EYE_SCALE_MAX)
        sampler = lambda: _sample_vector_in_bounds(
            x_min=x_min,
            x_max=x_max,
            y_min=y_min,
            y_max=y_max,
            scale_min=scale_min,
            scale_max=scale_max,
        )
    else:
        sampler = _sample_vector

    return [
        BOCandidate(
            id=f"cand-{index + 1}",
            vector=sampler(),
            acquisition=None,
        )
        for index in range(k)
    ]


def generate_candidates(
    observations: list[BOObservation],
    k: int,
    center_vector: BOVector | None = None,
    trust_region: tuple[float, float, float] | None = None,
    debug: bool = False,
) -> tuple[list[BOCandidate], str]:
    if debug:
        logger.info("[BO] generate_candidates start: observations=%s k=%s", len(observations), k)

    if len(observations) < WARMUP_MIN_OBSERVATIONS:
        warmup = _build_random_candidates(k, center_vector=center_vector, trust_region=trust_region)
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
        return warmup, "local-random-warmup" if center_vector is not None else "random-warmup"

    x_train = np.vstack([_to_array(obs.vector) for obs in observations])
    y_train = np.array([obs.reward for obs in observations], dtype=float)

    kernel = (
        ConstantKernel(KERNEL_CONSTANT, KERNEL_CONSTANT_BOUNDS)
        * RBF(length_scale=KERNEL_LENGTH_SCALE)
        + WhiteKernel(noise_level=KERNEL_NOISE_LEVEL)
    )
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

    pool_size = LOCAL_PREDICTION_POOL_SIZE if center_vector is not None else PREDICTION_POOL_SIZE
    if center_vector is not None:
        radius_x, radius_y, radius_scale = trust_region or (
            LOCAL_TRUST_RADIUS_X,
            LOCAL_TRUST_RADIUS_Y,
            LOCAL_TRUST_RADIUS_SCALE,
        )
        x_min = _clip_bounds(center_vector.eye_x - radius_x, EYE_X_MIN, EYE_X_MAX)
        x_max = _clip_bounds(center_vector.eye_x + radius_x, EYE_X_MIN, EYE_X_MAX)
        y_min = _clip_bounds(center_vector.eye_y - radius_y, EYE_Y_MIN, EYE_Y_MAX)
        y_max = _clip_bounds(center_vector.eye_y + radius_y, EYE_Y_MIN, EYE_Y_MAX)
        scale_min = _clip_bounds(center_vector.eye_scale - radius_scale, EYE_SCALE_MIN, EYE_SCALE_MAX)
        scale_max = _clip_bounds(center_vector.eye_scale + radius_scale, EYE_SCALE_MIN, EYE_SCALE_MAX)
        pool = np.vstack(
            [
                _to_array(
                    _sample_vector_in_bounds(
                        x_min=x_min,
                        x_max=x_max,
                        y_min=y_min,
                        y_max=y_max,
                        scale_min=scale_min,
                        scale_max=scale_max,
                    )
                )
                for _ in range(pool_size)
            ]
        )
    else:
        pool = np.vstack([_to_array(_sample_vector()) for _ in range(pool_size)])
    mu, sigma = gp.predict(pool, return_std=True)
    beta = UCB_BETA
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
    diversity_min_distance = LOCAL_DIVERSITY_MIN_DISTANCE if center_vector is not None else DIVERSITY_MIN_DISTANCE

    if debug:
        top_debug = []
        for rank, idx in enumerate(ranked_indices[:DEBUG_TOP_RANKS], start=1):
            top_debug.append(
                {
                    "rank": rank,
                    "eye_x": float(round(pool[idx][0], VECTOR_ROUND_DIGITS)),
                    "eye_y": float(round(pool[idx][1], VECTOR_ROUND_DIGITS)),
                    "eye_scale": float(round(pool[idx][2], VECTOR_ROUND_DIGITS)),
                    "mu": float(round(mu[idx], 4)),
                    "sigma": float(round(sigma[idx], 4)),
                    "ucb": float(round(ucb[idx], 4)),
                }
            )

        logger.info("[BO][PREDICT] top_raw_by_ucb=%s", top_debug)

    for idx in ranked_indices:
        vector = BOVector(
            eye_x=float(round(pool[idx][0], VECTOR_ROUND_DIGITS)),
            eye_y=float(round(pool[idx][1], VECTOR_ROUND_DIGITS)),
            eye_scale=float(round(pool[idx][2], VECTOR_ROUND_DIGITS)),
        )

        if any(_distance(vector, existing.vector) < diversity_min_distance for existing in picked):
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
        fallback = _build_random_candidates(
            k - len(picked),
            center_vector=center_vector,
            trust_region=trust_region,
        )
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
                (np.round(pool[:, 0], VECTOR_ROUND_DIGITS) == candidate.vector.eye_x)
                & (np.round(pool[:, 1], VECTOR_ROUND_DIGITS) == candidate.vector.eye_y)
                & (np.round(pool[:, 2], VECTOR_ROUND_DIGITS) == candidate.vector.eye_scale)
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

    return picked, "local-gp-ucb" if center_vector is not None else "gp-ucb"
