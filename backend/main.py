from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from api.ingest import router as ingest_router
from api.generate import router as generate_router
from api.evidence import router as evidence_router
from api.datasets import router as datasets_router
from dataset_store import seed_meridian_sample

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_meridian_sample()
    yield


app = FastAPI(
    title="Abnormal Brief Studio",
    description="AI-native reporting studio for Abnormal Security customer data.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest_router, prefix="/api")
app.include_router(generate_router, prefix="/api")
app.include_router(evidence_router, prefix="/api")
app.include_router(datasets_router, prefix="/api")


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "service": "abnormal-brief-studio"}

