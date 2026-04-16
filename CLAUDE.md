# Abnormal Brief Studio

## Product thesis

An AI-native reporting studio for Abnormal Security customer data. Upload the security data you have, pick the audience, and get a consulting-grade executive brief in under three minutes. Every claim is grounded in evidence. Every recommendation is reasoned from the gaps.

Abnormal already wins the detection game. The reporting layer is where customers see, share, and renew on that value. This product is the layer that turns raw security data into a defensible, board-grade artifact for a CISO talking to the board or a CSM running a QBR.

## Users (both first-class)

**CISO** — preparing the quarterly board or exec update. Needs a business-value narrative, risk framing, and an investment ask. Tone: executive, declarative, restrained. Arc: risk posture → protection effectiveness → human layer → gaps and investment ask.

**CSM** — running a QBR across 50-100 accounts. Needs a value-realized story, benchmark context, expansion signals, and renewal framing. Tone: consultative, commercial, forward-looking. Arc: value realized → benchmark position → expansion opportunity → renewal ask.

Same engine, same data. Audience profile swaps the narrative arc, section mix, tone, and recommendation library.

## Scope

### In scope (MVP)

- Ingest: drag-and-drop CSVs + account.json. Schema detection by column signature, not filename. Period auto-detected. "Load Meridian sample" preset.
- Configure: audience selector (CISO or CSM), emphasis (Risk / Value / Balanced), tenant filter, period, length.
- Generate: 5-stage AI pipeline (see below). Live SSE progress UI.
- Brief: consulting-grade rendered artifact. Thesis, sectioned pillars, evidence chips inline, exhibits, recommendations, risks, signature.
- Evidence drawer: every `[E{n}]` chip opens a right-slide panel showing the metric, its calculation, and the source rows.
- Regenerate section: one-click rewrite of any section; keeps others intact.
- Edit prompt: power-user control that exposes the prompt used for a section and lets the user steer.
- Export: browser print-to-PDF via dedicated `/print` route with `@page` CSS rules. Copy-as-markdown.
- Audience toggle: switch audience on a rendered brief and regenerate.

### Out of scope (do not build)

- Authentication, user management, database persistence.
- PPTX export.
- Mind-map or canvas workspace.
- AI chat or Q&A over data.
- Real-time collaboration.
- Batch QBR generation across many accounts.
- Salesforce / Gainsight / Slack push.
- Email delivery.

## Stack

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Recharts, Framer Motion.
- **Backend:** FastAPI, pydantic, pandas, python-multipart.
- **AI:** Anthropic SDK. Claude Opus 4.6 for Stage 2 (Architect) and Stage 4 (Recommender). Claude Sonnet 4.6 for Stage 1, 3, 5.
- **Shared types:** JSON schema contract between backend and frontend.

## 5-stage AI architecture

All metrics are computed deterministically first. AI never sees raw CSVs. AI never does math. AI only consumes pre-computed, evidence-tagged observations.

1. **Data Interpreter.** Input: computed metrics bundle + benchmarks + anomalies + tenant deltas. Output: JSON list of 15-25 observations, each with `claim`, `magnitude`, `direction`, `evidence_refs`, `audience_relevance: {ciso: 0-1, csm: 0-1}`.

2. **Narrative Architect.** Input: observations + audience profile. Output: brief outline — governing thesis (one sentence), 3 pillars, section order, exhibits per section, what to demote, closing ask.

3. **Section Writer.** Input: one section intent + its observations + audience profile. Output: markdown with action-first headline, prose, `[E{n}]` evidence tokens, exhibit markers. Runs in parallel across sections.

4. **Recommendation Reasoner.** Input: gaps + audience. Output: 3-5 structured recommendations. Each names the gap, the action, the expected impact, the rationale chain, the evidence. CISO framing = budget / policy / headcount ask. CSM framing = expansion path.

5. **Evidence Auditor.** Input: generated brief + evidence index. Programmatic pass first (every `[E{n}]` resolves), then AI pass (numbers in prose match computed metrics within tolerance). Output: pass/fail + issues. Failed sections get regenerated once.

## File structure

```
abnormal-brief-studio/
├── CLAUDE.md
├── README.md
├── .env.example
├── data/sample/                    # Meridian CSVs + account.json
├── frontend/                       # Next.js 14
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                # Landing
│   │   ├── ingest/page.tsx
│   │   ├── configure/page.tsx
│   │   ├── generate/page.tsx
│   │   ├── brief/[id]/page.tsx
│   │   └── brief/[id]/print/page.tsx
│   ├── components/
│   │   ├── ui/                     # shadcn
│   │   ├── ingest/
│   │   ├── configure/
│   │   ├── brief/
│   │   └── generate/
│   ├── lib/
│   └── styles/print.css
├── backend/
│   ├── main.py
│   ├── api/
│   ├── ingest/
│   ├── analytics/
│   ├── ai/
│   ├── profiles/ciso.json, csm.json
│   ├── prompts/                    # 7 prompt markdown files
│   ├── store.py
│   └── models.py
└── scripts/run_dev.sh
```

## API contract

```
POST   /api/ingest                                     → {session_id, schemas, warnings, period}
POST   /api/generate                                   → SSE stream → {brief_id}
GET    /api/brief/{brief_id}                           → full brief JSON
GET    /api/evidence/{brief_id}/{evidence_id}          → {metric, value, calc, rows[]}
POST   /api/brief/{brief_id}/section/{id}/regenerate   → updated section
```

## Hard rules

- AI never computes metrics. Pandas does.
- AI never sees raw CSVs. Only pre-computed, evidence-tagged observations.
- Every AI claim carries an evidence reference.
- Every `[E{n}]` token must resolve to an entry in the evidence index.
- No new dependencies without explicit approval.
- No new routes beyond those listed above.
- No auth, DB, collaboration, chat, mind-map, or PPTX in MVP.
- One build phase at a time. Wait for user commit before moving on.
- If unsure between two options, ask. Do not guess.
- Every PR-sized change must pass typecheck and lint.
- Error messages are one sentence maximum.
- All prompts live in `/backend/prompts/` as markdown. Never inline prompts in Python code.

## Visual direction

Editorial and light. Think The Economist meets Stripe's annual report.

- Background: near-white (`#FAFAF7` or similar).
- Body text: deep charcoal (`#1A1A1A`).
- Accent: muted indigo (`#4C566A` or similar restrained tone). Used sparingly.
- Evidence chips: desaturated mustard background, small caps typography.
- Failing posture items: restrained brick red, never bright.
- Headlines: serif (Source Serif 4 or Playfair Display).
- Body: clean sans (Inter).
- Exhibits: numbered ("Exhibit 1", "Exhibit 2"), captioned, sourced.
- Generous whitespace. Minimum 64px vertical rhythm between major sections.
- Single accent color at a time. No rainbow dashboards.
- Charts: minimal grid lines, serif axis labels, no 3D, no gradients.

## Consulting-grade writing rules

Every section enforces:

- **Action-first headlines.** "VIP inbox exposure declined 67% quarter-over-quarter" not "VIP Exposure."
- **Pyramid principle.** One governing thesis → three pillars → evidence below each.
- **Every number has a so-what.** Raw numbers never appear without a comparative frame (trend, benchmark, or success criterion).
- **No buzzwords.** Forbidden: leverage, robust, synergies, seamless, cutting-edge, best-in-class, world-class, game-changing.
- **No em dashes in output.** Use commas, semicolons, or periods.
- **Short sentences.** Target 15-20 words average.
- **Active voice.** "Abnormal prevented 284 attacks" not "284 attacks were prevented."
- **Close with an ask.** CISO brief: budget, policy, or headcount. CSM brief: renewal or expansion conversation.

## Meridian sample data context

The sample customer is Meridian Healthcare, 2500 employees, Healthcare industry, multi-tenant (T-001 = meridian.com / Microsoft 365 / 1800 mailboxes, T-002 = meridianhealth.org / Google Workspace / 700 mailboxes, acquisition).

Period in data: Q1 2026 (Jan 1 - Mar 31).

Known strong narrative threads in this data:

- Attacks reaching VIP inboxes: 3 in Jan, 1 in Feb, 1 in Mar. Trending toward the "fewer than 1 per month" success criterion.
- User reporting rate climbed 27% → 37% → 45% across the quarter. March crosses the 40% success bar and lands at industry p99.
- But credential submission rate also rose: 2.1% → 4.0% → 6.4%. Bifurcated human-layer story.
- Auto-remediation rate at 67.6% is below industry p50 of 75.0%. Real gap.
- Median MTTR at 2.3 min beats industry p75 of 7.4 min.
- Tenant drift: T-002 (acquisition) at 72.1% posture pass vs T-001 at 79.8%. Classic post-acquisition hygiene gap.
- MFA Enforcement fails every single weekly check on T-001 with 56-70 affected users. Persistent critical unresolved finding.
- Legal department reporting rate is 19.7% — a clear outlier vs 36-42% across other departments.
- ATO risk climbing: mean risk score 62 → 66 → 70. 62% of ATO events still resolve as `soc_notified`, indicating manual SOC load.

These threads should emerge from deterministic analytics, not be hardcoded. But use them as correctness checks: if the analytics engine doesn't surface these, something is wrong.

## Build phase discipline

Phases execute in this order. Do not jump ahead.

0. Scaffolding: dir structure, Next.js init, FastAPI init, hello-world across the wire.
1. Analytics engine: schema detector, metrics, benchmarks, anomalies, trends, tenant drift, evidence index. Pure pandas. Pytest coverage.
2. FastAPI endpoints: ingest, generate (stub), brief (stub), evidence.
3. Audience profiles + 7 prompt files. User reviews each prompt before proceeding.
4. AI orchestration: all 5 stages wired, SSE progress, structured output parsing.
5. Frontend ingest + configure screens.
6. Generation progress UI with SSE.
7. Brief renderer (the main surface, iterate multiple times).
8. Print route with @page CSS.
9. Polish pass.

Commit after each phase. Wait for user go-ahead before starting the next.
