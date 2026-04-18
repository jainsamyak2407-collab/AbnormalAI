"""
Validates detected schemas, type-coerces data, and parses dates.
Returns cleaned DataFrames ready for analytics.
"""

from __future__ import annotations

import io
import json
import logging
from typing import Any  # noqa: F401  (used in _normalize_v2_schemas agg_dict type annotation)

import pandas as pd

from ingest.schema_detector import DetectedSchema

logger = logging.getLogger(__name__)

# Columns that should be parsed as datetimes per schema type
DATETIME_COLUMNS: dict[str, list[str]] = {
    "threat_log": ["timestamp"],
    "remediation_log": ["started_at", "completed_at"],
    "ato_events": ["detected_at"],
    "posture_checks": ["check_date"],
    # v2 schemas
    "email_attacks": ["timestamp", "remediation_timestamp"],
    "account_takeover_events": ["timestamp", "resolved_at"],
    "phishing_simulations": ["campaign_date"],
    "security_posture": ["evaluation_date"],
}

# Columns that should be parsed as booleans per schema type
BOOL_COLUMNS: dict[str, list[str]] = {
    "threat_log": ["is_vip"],
    "posture_checks": ["resolved"],
    # v2 schemas
    "employees": ["is_vip", "is_admin"],
    "phishing_simulations": [
        "email_delivered",
        "email_opened",
        "link_clicked",
        "credentials_submitted",
        "reported_to_aism",
    ],
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

    # Normalize v2 / new-format schemas into canonical analytics schemas
    result = _normalize_v2_schemas(result)

    return result


def _normalize_v2_schemas(result: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
    """
    Transform new-format (v2) schemas into the canonical schemas expected by the
    analytics engine.  All operations are defensive: missing columns and missing
    source DataFrames are handled gracefully.
    """

    # ------------------------------------------------------------------
    # A. employees — coerce is_vip to bool; keep in result for later use
    # ------------------------------------------------------------------
    employees_df = result.get("employees")
    if employees_df is not None and not employees_df.empty:
        if "is_vip" in employees_df.columns:
            employees_df["is_vip"], warns = _coerce_bool_series(employees_df["is_vip"])
            for w in warns:
                logger.warning("[employees][is_vip] %s", w)
        result["employees"] = employees_df

    # ------------------------------------------------------------------
    # B. email_attacks → threat_log
    # ------------------------------------------------------------------
    email_attacks_df = result.get("email_attacks")
    if email_attacks_df is not None and "threat_log" not in result:
        df = email_attacks_df.copy()

        # Rename columns
        rename_map: dict[str, str] = {}
        if "attack_id" in df.columns:
            rename_map["attack_id"] = "event_id"
        if "remediation_action" in df.columns:
            rename_map["remediation_action"] = "disposition"
        if rename_map:
            df = df.rename(columns=rename_map)

        # Join employees to add is_vip
        if employees_df is not None and not employees_df.empty and "email" in employees_df.columns:
            vip_lookup = (
                employees_df[["email", "is_vip"]]
                .drop_duplicates(subset=["email"])
                .rename(columns={"email": "recipient_email"})
            )
            if "recipient_email" in df.columns:
                df = df.merge(vip_lookup, on="recipient_email", how="left")
            else:
                df["is_vip"] = False
        else:
            df["is_vip"] = False

        # Fill missing is_vip as False and coerce to bool
        if "is_vip" in df.columns:
            df["is_vip"] = df["is_vip"].fillna(False)
            df["is_vip"], _ = _coerce_bool_series(df["is_vip"])
        else:
            df["is_vip"] = False

        # Ensure timestamp is datetime
        if "timestamp" in df.columns and not pd.api.types.is_datetime64_any_dtype(df["timestamp"]):
            df["timestamp"], warns = _coerce_datetime_series(df["timestamp"])
            for w in warns:
                logger.warning("[email_attacks->threat_log][timestamp] %s", w)

        result["threat_log"] = df.reset_index(drop=True)
        result.pop("email_attacks", None)

    # ------------------------------------------------------------------
    # C. Derive remediation_log from email_attacks (via threat_log)
    # ------------------------------------------------------------------
    if "remediation_log" not in result:
        tl_df = result.get("threat_log")
        if tl_df is not None and not tl_df.empty:
            needed_cols = {"event_id", "disposition", "timestamp"}
            if needed_cols.issubset(set(tl_df.columns)):
                rem_df = tl_df[
                    list(needed_cols | ({"remediation_timestamp", "tenant_id"} & set(tl_df.columns)))
                ].copy()

                rem_df = rem_df.rename(columns={"event_id": "remediation_id"})
                rem_df["method"] = "auto"

                # outcome: success where disposition (original remediation_action) was non-empty
                if "disposition" in rem_df.columns:
                    rem_df["outcome"] = rem_df["disposition"].apply(
                        lambda v: "success" if pd.notna(v) and str(v).strip() != "" else "unknown"
                    )
                else:
                    rem_df["outcome"] = "unknown"

                rem_df["started_at"] = rem_df.get("timestamp", pd.NaT)
                rem_df["completed_at"] = rem_df.get(
                    "remediation_timestamp", pd.NaT
                ) if "remediation_timestamp" in rem_df.columns else pd.NaT

                # Ensure datetime types
                for col in ("started_at", "completed_at"):
                    if col in rem_df.columns and not pd.api.types.is_datetime64_any_dtype(rem_df[col]):
                        rem_df[col], warns = _coerce_datetime_series(rem_df[col])
                        for w in warns:
                            logger.warning("[remediation_log][%s] %s", col, w)

                # Compute mttr_minutes
                if (
                    "started_at" in rem_df.columns
                    and "completed_at" in rem_df.columns
                    and pd.api.types.is_datetime64_any_dtype(rem_df["completed_at"])
                    and pd.api.types.is_datetime64_any_dtype(rem_df["started_at"])
                ):
                    delta = rem_df["completed_at"] - rem_df["started_at"]
                    rem_df["mttr_minutes"] = (delta.dt.total_seconds() / 60).clip(lower=0)
                else:
                    rem_df["mttr_minutes"] = float("nan")

                # Drop rows where mttr_minutes is NaN
                rem_df = rem_df.dropna(subset=["mttr_minutes"]).reset_index(drop=True)

                result["remediation_log"] = rem_df

    # ------------------------------------------------------------------
    # D. security_posture → posture_checks
    # ------------------------------------------------------------------
    security_posture_df = result.get("security_posture")
    if security_posture_df is not None and "posture_checks" not in result:
        df = security_posture_df.copy()

        rename_map = {}
        if "evaluation_id" in df.columns:
            rename_map["evaluation_id"] = "check_id"
        if "evaluation_date" in df.columns:
            rename_map["evaluation_date"] = "check_date"
        if "risk_level" in df.columns:
            rename_map["risk_level"] = "severity"
        if "affected_users_count" in df.columns:
            rename_map["affected_users_count"] = "affected_users"
        if rename_map:
            df = df.rename(columns=rename_map)

        if "status" in df.columns:
            df["resolved"] = df["status"].str.lower() == "pass"
        else:
            df["resolved"] = False

        result["posture_checks"] = df.reset_index(drop=True)
        result.pop("security_posture", None)

    # ------------------------------------------------------------------
    # E. account_takeover_events → ato_events
    # ------------------------------------------------------------------
    ato_raw_df = result.get("account_takeover_events")
    if ato_raw_df is not None and "ato_events" not in result:
        df = ato_raw_df.copy()

        rename_map = {}
        if "event_id" in df.columns:
            rename_map["event_id"] = "ato_id"
        if "timestamp" in df.columns:
            rename_map["timestamp"] = "detected_at"
        if "trigger_event_type" in df.columns:
            rename_map["trigger_event_type"] = "risk_factors"
        if "resolution" in df.columns:
            rename_map["resolution"] = "outcome"
        if rename_map:
            df = df.rename(columns=rename_map)

        df["ttd_minutes"] = 0.0

        if "resolved_at" in df.columns and "detected_at" in df.columns:
            # Ensure both are datetime
            for col in ("detected_at", "resolved_at"):
                if not pd.api.types.is_datetime64_any_dtype(df[col]):
                    df[col], warns = _coerce_datetime_series(df[col])
                    for w in warns:
                        logger.warning("[account_takeover_events->ato_events][%s] %s", col, w)

            delta = df["resolved_at"] - df["detected_at"]
            df["ttr_minutes"] = (delta.dt.total_seconds() / 60).clip(lower=0).fillna(0.0)
        else:
            df["ttr_minutes"] = 0.0

        # Ensure detected_at is datetime
        if "detected_at" in df.columns and not pd.api.types.is_datetime64_any_dtype(df["detected_at"]):
            df["detected_at"], warns = _coerce_datetime_series(df["detected_at"])
            for w in warns:
                logger.warning("[account_takeover_events->ato_events][detected_at] %s", w)

        result["ato_events"] = df.reset_index(drop=True)
        result.pop("account_takeover_events", None)

    # ------------------------------------------------------------------
    # F. phishing_simulations → user_reporting
    # ------------------------------------------------------------------
    phishing_df = result.get("phishing_simulations")
    if phishing_df is not None and "user_reporting" not in result:
        df = phishing_df.copy()

        # Parse campaign_date and extract month/year
        if "campaign_date" in df.columns:
            if not pd.api.types.is_datetime64_any_dtype(df["campaign_date"]):
                df["campaign_date"], warns = _coerce_datetime_series(df["campaign_date"])
                for w in warns:
                    logger.warning("[phishing_simulations->user_reporting][campaign_date] %s", w)
            df["month"] = df["campaign_date"].dt.strftime("%B")  # e.g. "January"
            df["year"] = df["campaign_date"].dt.year
        else:
            df["month"] = "Unknown"
            df["year"] = 0

        # Coerce boolean columns
        for bool_col in ("credentials_submitted", "reported_to_aism", "link_clicked"):
            if bool_col in df.columns:
                df[bool_col], warns = _coerce_bool_series(df[bool_col])
                for w in warns:
                    logger.warning("[phishing_simulations->user_reporting][%s] %s", bool_col, w)
                # Convert BooleanDtype to plain int for groupby aggregation
                df[bool_col] = df[bool_col].fillna(False).astype(bool).astype(int)

        # Group by department, month, year
        dept_col = "employee_department" if "employee_department" in df.columns else None
        if dept_col is None:
            df["department"] = "Unknown"
            dept_col = "department"

        group_cols = [dept_col, "month", "year"]
        agg_dict: dict[str, Any] = {}
        if "reported_to_aism" in df.columns:
            agg_dict["reported_count"] = ("reported_to_aism", "sum")
        if "credentials_submitted" in df.columns:
            agg_dict["credential_submitted"] = ("credentials_submitted", "sum")
        agg_dict["total_received_suspicious"] = (group_cols[0], "count")

        grouped = df.groupby(group_cols, as_index=False).agg(**agg_dict)

        if "reported_count" not in grouped.columns:
            grouped["reported_count"] = 0
        if "credential_submitted" not in grouped.columns:
            grouped["credential_submitted"] = 0

        grouped["total_received_suspicious"] = grouped["total_received_suspicious"].replace(0, pd.NA)
        grouped["reporting_rate"] = (
            grouped["reported_count"] / grouped["total_received_suspicious"]
        ).fillna(0.0)
        grouped["credential_submission_rate"] = (
            grouped["credential_submitted"] / grouped["total_received_suspicious"]
        ).fillna(0.0)

        grouped = grouped.rename(columns={dept_col: "department"})

        result["user_reporting"] = grouped.reset_index(drop=True)
        result.pop("phishing_simulations", None)

    # ------------------------------------------------------------------
    # G. benchmarks_wide → industry_benchmarks
    # ------------------------------------------------------------------
    benchmarks_wide_df = result.get("benchmarks_wide")
    if benchmarks_wide_df is not None and "industry_benchmarks" not in result:
        df = benchmarks_wide_df.copy()

        # Rename company_size_bucket → segment if present
        if "company_size_bucket" in df.columns:
            df = df.rename(columns={"company_size_bucket": "segment"})
        elif "segment" not in df.columns:
            df["segment"] = "mid_market"

        # Identify id_vars (everything except the percentile columns)
        percentile_cols = [c for c in ("p25", "p50", "p75", "p99") if c in df.columns]
        id_vars = [c for c in df.columns if c not in percentile_cols]

        melted = df.melt(
            id_vars=id_vars,
            value_vars=percentile_cols,
            var_name="percentile",
            value_name="value",
        )

        # Drop NaN values and coerce value to float
        melted = melted.dropna(subset=["value"])
        melted["value"], warns = _coerce_numeric_series(melted["value"])
        for w in warns:
            logger.warning("[benchmarks_wide->industry_benchmarks][value] %s", w)
        melted = melted.dropna(subset=["value"])

        result["industry_benchmarks"] = melted.reset_index(drop=True)
        result.pop("benchmarks_wide", None)

    return result
