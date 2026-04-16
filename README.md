# Abnormal Brief Studio

An AI-native reporting studio for Abnormal Security customer data. Upload your security data, pick an audience, and get a consulting-grade executive brief in under three minutes.

## Quick start

### Prerequisites

- Python 3.11+
- Node.js 18+
- An Anthropic API key

### 1. Clone and configure

```bash
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY=sk-ant-...
```

### 2. Start both servers (one command)

```bash
bash scripts/run_dev.sh
```

This creates the Python venv, installs backend dependencies, installs frontend dependencies (first run only), and starts both servers.

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API docs: http://localhost:8000/docs

### 3. Manual start (alternative)

**Backend:**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

## Project structure

```
abnormal-brief-studio/
├── CLAUDE.md              # Product spec and build rules for AI assistants
├── .env.example           # Environment variable template
├── data/sample/           # Meridian Healthcare sample data (Q1 2026)
├── frontend/              # Next.js 14 (App Router)
├── backend/               # FastAPI + pandas analytics engine
└── scripts/run_dev.sh     # One-command dev startup
```

## Current phase: 0 (Scaffolding)

The project follows a strict phase discipline. See `CLAUDE.md` for the full phase list.

Phase 0 delivers: directory structure, Next.js init, FastAPI init, and a hello-world health check across the wire.

The landing page at http://localhost:3000 shows a "Backend: Connected" badge once both servers are running.

## Sample data

Load the Meridian Healthcare sample via the "Load Meridian sample" button on the landing page. The sample covers Q1 2026 (January through March) across two tenants:

- T-001: meridian.com / Microsoft 365 / 1800 mailboxes
- T-002: meridianhealth.org / Google Workspace / 700 mailboxes (acquisition)

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Recharts, Framer Motion |
| Backend | FastAPI, pydantic, pandas |
| AI | Anthropic SDK (Claude Opus 4.6 + Sonnet 4.6) |
