import json
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from ai.orchestrator import run_pipeline
from models import GenerateRequest
from store import store

router = APIRouter()


async def _stream(brief_id: str, request: GenerateRequest, session: dict):
    """Run the AI pipeline and stream SSE events. Store brief when done."""
    brief: dict | None = None

    try:
        async for event_str in run_pipeline(brief_id, request, session):
            # Intercept the internal _brief_payload event — store it, don't forward it
            try:
                event = json.loads(event_str.removeprefix("data: ").strip())
                if event.get("type") == "_brief_payload":
                    # Store immediately — before yielding done — so the brief
                    # is in Redis before the client navigates to /brief/{id}
                    brief = event.get("brief")
                    store.set(brief_id, {"brief": brief, "session_id": request.session_id})
                    continue
            except Exception:
                pass
            yield event_str
    except Exception as e:
        # Stage raised after emitting its error SSE — yield a clean terminal error
        yield f'data: {json.dumps({"type": "error", "message": str(e)})}\n\n'


@router.post("/generate")
async def generate(request: GenerateRequest) -> StreamingResponse:
    """Stream SSE progress events through the 5-stage AI pipeline."""
    session = store.get(request.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    if "metrics" not in session:
        raise HTTPException(status_code=422, detail="Session has no computed metrics.")

    brief_id = str(uuid.uuid4())

    return StreamingResponse(
        _stream(brief_id, request, session),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
