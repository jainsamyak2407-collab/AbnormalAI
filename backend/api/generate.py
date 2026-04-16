import asyncio
import json
import uuid

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from models import GenerateRequest
from store import store

router = APIRouter()

STAGES = [
    "Data Interpreter",
    "Narrative Architect",
    "Section Writer",
    "Recommendation Reasoner",
    "Evidence Auditor",
]


async def _stream_generate(request: GenerateRequest):
    """Stub SSE stream: emits one stage_complete event per pipeline stage, then brief_id."""
    brief_id = str(uuid.uuid4())

    for i, stage_name in enumerate(STAGES, start=1):
        await asyncio.sleep(0.4)  # simulate work
        event = {
            "type": "stage_complete",
            "stage": i,
            "stage_name": stage_name,
            "total_stages": len(STAGES),
        }
        yield f"data: {json.dumps(event)}\n\n"

    # Store a stub brief so GET /api/brief/{brief_id} has something to return.
    store.set(
        brief_id,
        {
            "brief_id": brief_id,
            "session_id": request.session_id,
            "audience": request.audience,
            "period": "Q1 2026",
            "company_name": "Meridian Healthcare",
            "thesis": "Stub thesis — Phase 4 will populate this.",
            "sections": [],
            "recommendations": [],
            "risks": [],
        },
    )

    done_event = {"type": "done", "brief_id": brief_id}
    yield f"data: {json.dumps(done_event)}\n\n"


@router.post("/generate")
async def generate(request: GenerateRequest) -> StreamingResponse:
    """Stub: streams SSE progress events then emits brief_id on completion."""
    return StreamingResponse(
        _stream_generate(request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
