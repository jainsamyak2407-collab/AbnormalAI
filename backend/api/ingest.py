import uuid

from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse

from models import IngestResponse
from store import store

router = APIRouter()


@router.post("/ingest", response_model=IngestResponse)
async def ingest(
    files: list[UploadFile] = File(default=[]),
    sample: bool = Form(default=False),
) -> IngestResponse:
    """Stub: accept uploaded files or load sample data. Returns session metadata."""
    session_id = str(uuid.uuid4())

    # TODO: wire up schema_detector and validator in Phase 1
    detected_schemas: list[str] = []
    warnings: list[str] = []
    period_detected: str | None = None

    if sample:
        detected_schemas = [
            "threat_log",
            "posture_checks",
            "remediation_log",
            "user_reporting",
            "ato_events",
            "industry_benchmarks",
        ]
        period_detected = "Q1 2026"
        store.set(session_id, {"source": "sample", "schemas": detected_schemas})
    else:
        for f in files:
            detected_schemas.append(f.filename or "unknown")
        store.set(session_id, {"source": "upload", "schemas": detected_schemas})

    return IngestResponse(
        session_id=session_id,
        detected_schemas=detected_schemas,
        warnings=warnings,
        period_detected=period_detected,
    )
