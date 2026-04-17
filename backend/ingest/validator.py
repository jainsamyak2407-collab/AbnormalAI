"""
Validates detected schemas, type-coerces data, and parses dates.
Returns cleaned DataFrames ready for analytics.
"""

from __future__ import annotations

import io
import json
import logging
from typing import Any

import pandas as pd

from ingest.schema_detector import DetectedSchema

logger = logging.getLogger(__name__)

# Columns that should be parsed as datetimes per schema type
DATETIME_COLUMNS: dict[str, list[str]] = {
    "threat_log": ["timestamp"],
    "remediation_log": ["started_at", "completed_at"],
    "ato_events": ["detected_at"],
    "posture_checks": ["check_date"],
}

# Columns that should be parsed as booleans per schema type
BOOL_COLUMNS: dict[str, list[str]] = {
    "threat_log": ["is_vip"],
    "posture_checks": ["resolved"],
}

# Columns that should be parsed as numeric per schema type
NUMERIC_COLUMNS: dict[str, list[str]] = {
    "threat_log": [],
    "posture_checks": ["affected_users"],
    "remediation_log": ["mttr_minutes"],
    "user_reporting": [
        "reported_count",
        "total_received_suspicious",
        "reporting_rate",
        "credential_submitted",
        "credential_submission_rate",
        "year",
    ],
    "ato_events": ["risk_score", "ttd_minutes", "ttr_minutes"],
    "industry_benchmarks": ["value", "percentile"],
}

# Truthful string representations for boolean coercion
_TRUE_VALUES = {"true", "yes", "1", "t", "y"}
_FALSE_VALUES = {"false", "no", "0", "f", "n"}


def _coerce_bool_series(series: pd.Series) -> tuple[pd.Series, list[str]]:
    """Coerce a series to boolean. Returns (coerced_series, warnings)."""
    warnings: list[str] = []
    if pd.api.types.is_bool_dtype(series):
        return series, warnings

    def _parse_bool(val: Any) -> Any:
        if pd.isna(val):
            return pd.NA
        s = str(val).strip().lower()
        if s in _TRUE_VALUES:
            return True
        if s in _FALSE_VALUES:
            return False
        warnings.append(f"Cannot coerce '{val}' to bool; left as NA")
        return pd.NA

    result = series.map(_parse_bool)
    return result.astype(pd.BooleanDtype()), warnings


def _coerce_numeric_series(series: pd.Series) -> tuple[pd.Series, list[str]]:
    """Coerce a series to numeric. Returns (coerced_series, warnings)."""
    warnings: list[str] = []
    coerced = pd.to_numeric(series, errors="coerce")
    failed_mask = coerced.isna() & series.notna()
    if failed_mask.any():
        bad_vals = series[failed_mask].unique().tolist()
        warnings.append(f"Could not coerce {len(bad_vals)} value(s) to numeric: {bad_vals[:5]}")
    return coerced, warnings


def _coerce_datetime_series(series: pd.Series) -> tuple[pd.Series, list[str]]:
    """Parse a series to datetime using multiple formats. Returns (coerced_series, warnings)."""
    warnings: list[str] = []

    # Try pandas default (handles ISO 8601, including 'Z' suffix)
    try:
        result = pd.to_datetime(series, utc=True, errors="coerce")
        failed_mask = result.isna() & series.notna()
        if failed_mask.any():
            # Try without UTC
            result2 = pd.to_datetime(series, errors="coerce")
            still_failed = result2.isna() & series.notna()
            if still_failed.sum() < failed_mask.sum():
                result = result2
                failed_mask = still_failed

        if failed_mask.any():
            bad_vals = series[failed_mask].unique().tolist()
            warnings.append(
                f"Could not parse {failed_mask.sum()} datetime value(s): {bad_vals[:5]}"
            )

        # Normalize to tz-naive UTC for consistent comparison
        if hasattr(result.dtype, "tz") and result.dtype.tz is not None:
            result = result.dt.tz_localize(None)

        return result, warnings
    except Exception as exc:
        warnings.append(f"Datetime parse error: {exc}")
        return series, warnings


def _parse_csv(content: bytes) -> pd.DataFrame:
    """Parse CSV bytes to DataFrame."""
    text = content.decode("utf-8-sig")
    return pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False)


def _parse_json_account(content: bytes) -> dict:
    """Parse JSON account file."""
    return json.loads(content.decode("utf-8"))


def validate_and_parse(
    raw_files: dict[str, bytes],
    detected: list[DetectedSchema],
) -> dict[str, pd.DataFrame]:
    """
    Validate and parse ingested files.

    Parameters
    ----------
    raw_files:
        Mapping of filename -> raw bytes.
    detected:
        List of DetectedSchema (one per file, same order as raw_files).

    Returns
    -------
    dict[str, pd.DataFrame]
        Mapping of schema_type -> cleaned DataFrame.
        For account_json, the value is stored under key "account_json" but
        callers should handle it via the raw JSON separately. CSV-based schemas
        are returned as DataFrames.

    Notes
    -----
    Multiple files of the same schema type are concatenated.
    """
    schema_map: dict[str, list[pd.DataFrame]] = {}
    all_warnings: list[str] = []

    filenames = list(raw_files.keys())

    for i, det in enumerate(detected):
        filename = det.filename if det.filename else (filenames[i] if i < len(filenames) else f"file_{i}")
        content = raw_files.get(filename, b"")

        if det.file_type == "unknown":
            logger.warning("Skipping unknown file type: %s", filename)
            continue

        if det.file_type == "account_json":
            # Not a DataFrame; skip (handled separately by callers)
            continue

        if not content:
            logger.warning("Empty content for file: %s", filename)
            continue

        try:
            df = _parse_csv(content)
        except Exception as exc:
            logger.error("Failed to parse CSV '%s': %s", filename, exc)
            continue

        # Normalise column names to lowercase stripped
        df.columns = [c.strip().lower() for c in df.columns]

        schema_type = det.file_type

        # Coerce booleans
        for col in BOOL_COLUMNS.get(schema_type, []):
            if col in df.columns:
                df[col], warns = _coerce_bool_series(df[col])
                for w in warns:
                    all_warnings.append(f"[{filename}][{col}] {w}")

        # Coerce numerics
        for col in NUMERIC_COLUMNS.get(schema_type, []):
            if col in df.columns:
                df[col], warns = _coerce_numeric_series(df[col])
                for w in warns:
                    all_warnings.append(f"[{filename}][{col}] {w}")

        # Coerce datetimes
        for col in DATETIME_COLUMNS.get(schema_type, []):
            if col in df.columns:
                df[col], warns = _coerce_datetime_series(df[col])
                for w in warns:
                    all_warnings.append(f"[{filename}][{col}] {w}")

        schema_map.setdefault(schema_type, []).append(df)

    if all_warnings:
        for w in all_warnings:
            logger.warning(w)

    # Concatenate multiple files of the same type
    result: dict[str, pd.DataFrame] = {}
    for schema_type, dfs in schema_map.items():
        if len(dfs) == 1:
            result[schema_type] = dfs[0].reset_index(drop=True)
        else:
            result[schema_type] = pd.concat(dfs, ignore_index=True)

    return result
