from __future__ import annotations

from dataclasses import dataclass
import logging
from random import uniform

import numpy as np
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import ConstantKernel, RBF, WhiteKernel

from app.schemas.session import BOVectorMacro, BOVectorMicro

logger = logging.getLogger(__name__)

VECTOR_ROUND_DIGITS = 3
WARMUP_MIN_OBSERVATIONS = 6
PREDICTION_POOL_SIZE = 320
UCB_BETA = 0.5

KERNEL_CONSTANT = 1.0
KERNEL_CONSTANT_BOUNDS = (1e-3, 1e3)
KERNEL_LENGTH_SCALE = 1.0
KERNEL_NOISE_LEVEL = 0.1


@dataclass(frozen=True)
class BOObservationMacro:
    vector: BOVectorMacro
    reward: float


@dataclass(frozen=True)
class BOObservationMicro:
    vector: BOVectorMicro
    reward: float


@dataclass(frozen=True)
class ParameterRange:
    min_value: float
    max_value: float


MACRO_RANGES = {
    "global_x": ParameterRange(-2.0, 2.0),
    "global_y": ParameterRange(-2.0, 2.0),
    "global_scale": ParameterRange(-6.0, 6.0),
}

MICRO_RANGES = {
    "upper_eye_rotation": ParameterRange(-20.0, 20.0),
    "pupil_x": ParameterRange(-2.0, 2.0),
    "lower_upper_distance_y": ParameterRange(-2.0, 2.0),
}


def _clip(value: float, low: float, high: float) -> float:
    return float(min(max(value, low), high))


def _normalize(value: float, value_range: ParameterRange) -> float:
    # Maps API-space [min, max] to BO-space [-1, 1].
    center = (value_range.max_value + value_range.min_value) / 2.0
    half_width = (value_range.max_value - value_range.min_value) / 2.0
    return _clip((value - center) / half_width, -1.0, 1.0)


def _denormalize(value: float, value_range: ParameterRange) -> float:
    normalized = _clip(value, -1.0, 1.0)
    center = (value_range.max_value + value_range.min_value) / 2.0
    half_width = (value_range.max_value - value_range.min_value) / 2.0
    return center + normalized * half_width


def _sample_normalized_vector(dimensions: int) -> np.ndarray:
    return np.array([uniform(-1.0, 1.0) for _ in range(dimensions)], dtype=float)


def _fit_gp(x_train: np.ndarray, y_train: np.ndarray) -> GaussianProcessRegressor:
    kernel = (
        ConstantKernel(KERNEL_CONSTANT, KERNEL_CONSTANT_BOUNDS)
        * RBF(length_scale=KERNEL_LENGTH_SCALE)
        + WhiteKernel(noise_level=KERNEL_NOISE_LEVEL)
    )
    gp = GaussianProcessRegressor(kernel=kernel, normalize_y=True, random_state=42)
    gp.fit(x_train, y_train)
    return gp


def _generate_ucb_candidates(
    observations_x: np.ndarray,
    observations_y: np.ndarray,
    k: int,
) -> list[np.ndarray]:
    if len(observations_x) < WARMUP_MIN_OBSERVATIONS:
        return [_sample_normalized_vector(observations_x.shape[1]) for _ in range(k)]

    gp = _fit_gp(observations_x, observations_y)

    pool = np.vstack([
        _sample_normalized_vector(observations_x.shape[1]) for _ in range(PREDICTION_POOL_SIZE)
    ])
    mu, sigma = gp.predict(pool, return_std=True)
    ucb = mu + UCB_BETA * sigma

    ranked_indices = np.argsort(ucb)[::-1]
    picked = [pool[index] for index in ranked_indices[:k]]

    if len(picked) < k:
        picked.extend(_sample_normalized_vector(observations_x.shape[1]) for _ in range(k - len(picked)))

    return picked


def _macro_to_normalized_array(vector: BOVectorMacro) -> np.ndarray:
    return np.array(
        [
            _normalize(vector.global_x, MACRO_RANGES["global_x"]),
            _normalize(vector.global_y, MACRO_RANGES["global_y"]),
            _normalize(vector.global_scale, MACRO_RANGES["global_scale"]),
        ],
        dtype=float,
    )


def _micro_to_normalized_array(vector: BOVectorMicro) -> np.ndarray:
    return np.array(
        [
            _normalize(vector.upper_eye_rotation, MICRO_RANGES["upper_eye_rotation"]),
            _normalize(vector.pupil_x, MICRO_RANGES["pupil_x"]),
            _normalize(vector.lower_upper_distance_y, MICRO_RANGES["lower_upper_distance_y"]),
        ],
        dtype=float,
    )


def _normalized_array_to_macro(values: np.ndarray) -> BOVectorMacro:
    return BOVectorMacro(
        global_x=round(_denormalize(float(values[0]), MACRO_RANGES["global_x"]), VECTOR_ROUND_DIGITS),
        global_y=round(_denormalize(float(values[1]), MACRO_RANGES["global_y"]), VECTOR_ROUND_DIGITS),
        global_scale=round(_denormalize(float(values[2]), MACRO_RANGES["global_scale"]), VECTOR_ROUND_DIGITS),
    )


def _normalized_array_to_micro(values: np.ndarray) -> BOVectorMicro:
    return BOVectorMicro(
        upper_eye_rotation=round(
            _denormalize(float(values[0]), MICRO_RANGES["upper_eye_rotation"]),
            VECTOR_ROUND_DIGITS,
        ),
        pupil_x=round(_denormalize(float(values[1]), MICRO_RANGES["pupil_x"]), VECTOR_ROUND_DIGITS),
        lower_upper_distance_y=round(
            _denormalize(float(values[2]), MICRO_RANGES["lower_upper_distance_y"]),
            VECTOR_ROUND_DIGITS,
        ),
    )


def generate_candidates_macro(
    observations: list[BOObservationMacro],
    k: int,
) -> tuple[list[BOVectorMacro], str]:
    x_train = np.vstack([_macro_to_normalized_array(item.vector) for item in observations]) if observations else np.empty((0, 3))
    y_train = np.array([item.reward for item in observations], dtype=float) if observations else np.array([], dtype=float)

    candidates_normalized = _generate_ucb_candidates(x_train, y_train, k)
    strategy = "macro-random-warmup" if len(observations) < WARMUP_MIN_OBSERVATIONS else "macro-gp-ucb"

    return [_normalized_array_to_macro(values) for values in candidates_normalized], strategy


def generate_candidates_micro(
    observations: list[BOObservationMicro],
    k: int,
) -> tuple[list[BOVectorMicro], str]:
    x_train = np.vstack([_micro_to_normalized_array(item.vector) for item in observations]) if observations else np.empty((0, 3))
    y_train = np.array([item.reward for item in observations], dtype=float) if observations else np.array([], dtype=float)

    candidates_normalized = _generate_ucb_candidates(x_train, y_train, k)
    strategy = "micro-random-warmup" if len(observations) < WARMUP_MIN_OBSERVATIONS else "micro-gp-ucb"

    return [_normalized_array_to_micro(values) for values in candidates_normalized], strategy


def default_macro_vector() -> BOVectorMacro:
    return BOVectorMacro(global_x=0.0, global_y=0.0, global_scale=0.0)


def default_micro_vector() -> BOVectorMicro:
    return BOVectorMicro(upper_eye_rotation=0.0, pupil_x=0.0, lower_upper_distance_y=0.0)
