"""
Filesystem-based dataset store.

Layout:
  backend/storage/datasets/{dataset_id}/
    metadata.json
    files/
      threat_log.csv
      account.json
      ...
"""
from __future__ import annotations

import csv
import io
import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ingest.schema_detector import detect_all

STORAGE_DIR = Path(__file__).parent / "storage" / "datasets"
SAMPLE_DIR = Path(__file__).parent.parent / "data" / "sample"
MERIDIAN_ID = "ds_meridian_sample"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _file_meta(filename: str, content: bytes, detected_schema: str) -> dict:
    """Build the file entry for metadata.json."""
    row_count = 0
    columns: list[str] = []
    if filename.endswith(".csv"):
        try:
            text = content.decode("utf-8-sig")
            reader = csv.reader(io.StringIO(text))
            header = next(reader, [])
            columns = header
            row_count = sum(1 for _ in reader)
        except Exception:
            pass
    return {
        "original_name": filename,
        "detected_schema": detected_schema,
        "row_count": row_count,
        "columns": columns,
        "size_bytes": len(content),
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def list_datasets() -> list[dict]:
    """Return all dataset metadata dicts, samples first then by updated_at desc."""
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    results: list[dict] = []
    for d in STORAGE_DIR.iterdir():
        meta_path = d / "metadata.json"
        if meta_path.exists():
            try:
                results.append(json.loads(meta_path.read_text("utf-8")))
            except Exception:
                pass
    samples = [r for r in results if r.get("is_sample")]
    others = sorted(
        [r for r in results if not r.get("is_sample")],
        key=lambda r: r.get("updated_at", ""),
        reverse=True,
    )
    return samples + others


def get_dataset(dataset_id: str) -> dict | None:
    meta_path = STORAGE_DIR / dataset_id / "metadata.json"
    if not meta_path.exists():
        return None
    return json.loads(meta_path.read_text("utf-8"))


def create_dataset(name: str, description: str = "") -> str:
    """Create a new empty dataset and return its id."""
    dataset_id = f"ds_{uuid.uuid4().hex[:12]}"
    dataset_dir = STORAGE_DIR / dataset_id
    (dataset_dir / "files").mkdir(parents=True, exist_ok=True)
    metadata = {
        "dataset_id": dataset_id,
        "name": name,
        "description": description,
        "is_sample": False,
        "created_at": _now(),
        "updated_at": _now(),
        "files": [],
        "account": None,
        "period_detected": None,
    }
    (dataset_dir / "metadata.json").write_text(json.dumps(metadata, indent=2), "utf-8")
    return dataset_id


def add_file(dataset_id: str, filename: str, content: bytes) -> dict:
    """Add or replace a file in the dataset. Returns updated metadata."""
    dataset_dir = STORAGE_DIR / dataset_id
    if not dataset_dir.exists():
        raise ValueError(f"Dataset {dataset_id} not found.")
    (dataset_dir / "files").mkdir(exist_ok=True)
    dest = dataset_dir / "files" / filename
    dest.write_bytes(content)

    # Detect schema for this file
    detected_schema = "unknown"
    if filename.endswith(".csv"):
        detected = detect_all({filename: content})
        if detected:
            detected_schema = detected[0].file_type

    # Build file meta
    fmeta = _file_meta(filename, content, detected_schema)

    # Update metadata
    meta = _load_meta(dataset_id)
    files = [f for f in meta.get("files", []) if f["original_name"] != filename]
    files.append(fmeta)
    meta["files"] = files
    meta["updated_at"] = _now()
    _save_meta(dataset_id, meta)
    return meta


def add_account(dataset_id: str, account_data: dict) -> dict:
    """Store account.json data and update metadata."""
    dataset_dir = STORAGE_DIR / dataset_id
    if not dataset_dir.exists():
        raise ValueError(f"Dataset {dataset_id} not found.")
    (dataset_dir / "files").mkdir(exist_ok=True)
    content = json.dumps(account_data, indent=2).encode("utf-8")
    (dataset_dir / "files" / "account.json").write_bytes(content)

    # Parse period from account
    period: dict | None = None
    period_label: str | None = account_data.get("period_label")
    if period_label:
        period = {"label": period_label}

    meta = _load_meta(dataset_id)
    meta["account"] = account_data
    meta["period_detected"] = period
    meta["updated_at"] = _now()
    _save_meta(dataset_id, meta)
    return meta


def delete_dataset(dataset_id: str) -> None:
    meta = get_dataset(dataset_id)
    if meta is None:
        raise ValueError(f"Dataset {dataset_id} not found.")
    if meta.get("is_sample"):
        raise ValueError("Cannot delete the sample dataset.")
    shutil.rmtree(STORAGE_DIR / dataset_id)


def get_file_rows(dataset_id: str, filename: str, page: int = 1, size: int = 50) -> dict:
    """Return paginated rows from a CSV file in the dataset."""
    file_path = STORAGE_DIR / dataset_id / "files" / filename
    if not file_path.exists():
        raise FileNotFoundError(f"{filename} not found in dataset {dataset_id}.")
    content = file_path.read_bytes()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    all_rows = list(reader)
    total = len(all_rows)
    start = (page - 1) * size
    end = start + size
    return {
        "filename": filename,
        "total_rows": total,
        "page": page,
        "page_size": size,
        "total_pages": max(1, -(-total // size)),
        "columns": reader.fieldnames or [],
        "rows": all_rows[start:end],
    }


def get_raw_files(dataset_id: str) -> dict[str, bytes]:
    """Return all files in a dataset as {filename: bytes} for pipeline ingestion."""
    files_dir = STORAGE_DIR / dataset_id / "files"
    if not files_dir.exists():
        return {}
    return {p.name: p.read_bytes() for p in files_dir.iterdir()}


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------

def seed_meridian_sample() -> None:
    """Seed the Meridian sample dataset from data/sample/ if it doesn't exist."""
    if (STORAGE_DIR / MERIDIAN_ID).exists():
        return
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    dataset_dir = STORAGE_DIR / MERIDIAN_ID
    files_dir = dataset_dir / "files"
    files_dir.mkdir(parents=True, exist_ok=True)

    sample_files: dict[str, bytes] = {}
    for path in sorted(SAMPLE_DIR.iterdir()):
        if path.suffix in {".csv", ".json"}:
            sample_files[path.name] = path.read_bytes()

    # Detect schemas
    detected = detect_all({k: v for k, v in sample_files.items() if k.endswith(".csv")})
    schema_map = {d.filename: d.file_type for d in detected}

    file_metas: list[dict] = []
    account_data: dict = {}
    for filename, content in sample_files.items():
        (files_dir / filename).write_bytes(content)
        if filename.endswith(".json"):
            try:
                account_data = json.loads(content.decode("utf-8"))
            except Exception:
                pass
        else:
            schema = schema_map.get(filename, "unknown")
            file_metas.append(_file_meta(filename, content, schema))

    period: dict | None = None
    if account_data:
        label = account_data.get("period_label")
        if label:
            period = {"label": label}

    metadata: dict[str, Any] = {
        "dataset_id": MERIDIAN_ID,
        "name": "Meridian Healthcare (Sample)",
        "description": "Q1 2026 multi-tenant healthcare customer. Use this to explore the product.",
        "is_sample": True,
        "created_at": _now(),
        "updated_at": _now(),
        "files": file_metas,
        "account": account_data,
        "period_detected": period,
    }
    (dataset_dir / "metadata.json").write_text(json.dumps(metadata, indent=2), "utf-8")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load_meta(dataset_id: str) -> dict:
    path = STORAGE_DIR / dataset_id / "metadata.json"
    return json.loads(path.read_text("utf-8"))


def _save_meta(dataset_id: str, meta: dict) -> None:
    path = STORAGE_DIR / dataset_id / "metadata.json"
    path.write_text(json.dumps(meta, indent=2), "utf-8")
