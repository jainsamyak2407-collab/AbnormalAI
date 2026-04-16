from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from api.ingest import router as ingest_router
from api.generate import router as generate_router
from api.evidence import router as evidence_router

load_dotenv()

app = FastAPI(
    title="Abnormal Brief Studio",
    description="AI-native reporting studio for Abnormal Security customer data.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest_router, prefix="/api")
app.include_router(generate_router, prefix="/api")
app.include_router(evidence_router, prefix="/api")


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "service": "abnormal-brief-studio"}
