"""
Dataset library + session-from-dataset endpoints.
"""
from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel

import dataset_store as ds
from api.ingest import _run_pipeline
from store import store

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class CreateDatasetRequest(BaseModel):
    name: str
    description: str = ""


class CreateSessionRequest(BaseModel):
    dataset_id: str


# ---------------------------------------------------------------------------
# Dataset CRUD
# ---------------------------------------------------------------------------

@router.get("/datasets")
async def list_datasets() -> list[dict]:
    return ds.list_datasets()


@router.get("/datasets/{dataset_id}")
async def get_dataset(dataset_id: str) -> dict:
    meta = ds.get_dataset(dataset_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    return meta


@router.get("/datasets/{dataset_id}/files")
async def list_dataset_files(dataset_id: str) -> list[dict]:
    meta = ds.get_dataset(dataset_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    return meta.get("files", [])


@router.get("/datasets/{dataset_id}/files/{filename}")
async def get_dataset_file(
    dataset_id: str,
    filename: str,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=50, ge=1, le=500),
) -> dict:
    meta = ds.get_dataset(dataset_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    try:
        return ds.get_file_rows(dataset_id, filename, page=page, size=size)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File {filename} not found.")


@router.post("/datasets")
async def create_dataset(body: CreateDatasetRequest) -> dict:
    dataset_id = ds.create_dataset(name=body.name, description=body.description)
    meta = ds.get_dataset(dataset_id)
    return meta  # type: ignore[return-value]


@router.post("/datasets/{dataset_id}/files")
async def upload_dataset_files(
    dataset_id: str,
    files: list[UploadFile] = File(...),
) -> dict:
    meta = ds.get_dataset(dataset_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    if meta.get("is_sample"):
        raise HTTPException(status_code=403, detail="Cannot modify the sample dataset.")
    for f in files:
        content = await f.read()
        filename = f.filename or f"file_{uuid.uuid4().hex[:6]}"
        if filename.endswith(".json"):
            try:
                account_data = json.loads(content.decode("utf-8"))
                ds.add_account(dataset_id, account_data)
            except Exception:
                raise HTTPException(status_code=422, detail=f"Could not parse {filename} as JSON.")
        else:
            ds.add_file(dataset_id, filename, content)
    return ds.get_dataset(dataset_id)  # type: ignore[return-value]


@router.post("/datasets/{dataset_id}/account")
async def upload_dataset_account(
    dataset_id: str,
    file: UploadFile = File(...),
) -> dict:
    meta = ds.get_dataset(dataset_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    if meta.get("is_sample"):
        raise HTTPException(status_code=403, detail="Cannot modify the sample dataset.")
    content = await file.read()
    try:
        account_data = json.loads(content.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=422, detail="Could not parse file as JSON.")
    ds.add_account(dataset_id, account_data)
    return ds.get_dataset(dataset_id)  # type: ignore[return-value]


@router.delete("/datasets/{dataset_id}")
async def delete_dataset(dataset_id: str) -> dict:
    meta = ds.get_dataset(dataset_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    if meta.get("is_sample"):
        raise HTTPException(status_code=403, detail="Cannot delete the sample dataset.")
    ds.delete_dataset(dataset_id)
    return {"deleted": dataset_id}


# ---------------------------------------------------------------------------
# Session from dataset (runs the full analytics pipeline on stored files)
# ---------------------------------------------------------------------------

@router.post("/sessions")
async def create_session(body: CreateSessionRequest) -> dict:
    """Load a dataset from storage, run the analytics pipeline, return a session_id."""
    meta = ds.get_dataset(body.dataset_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Dataset not found.")

    raw_files = ds.get_raw_files(body.dataset_id)
    if not raw_files:
        raise HTTPException(status_code=422, detail="Dataset has no files.")

    try:
        session = _run_pipeline(raw_files)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline failed: {e}")

    session_id = str(uuid.uuid4())
    session["dataset_id"] = body.dataset_id
    store.set(session_id, session)

    return {
        "session_id": session_id,
        "dataset_id": body.dataset_id,
        "detected_schemas": session.get("detected_schemas", []),
        "period_detected": session.get("period_detected"),
    }
