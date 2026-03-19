# ChainIQ — Audit-Ready Autonomous Sourcing Agent

> **STARThack 2026** · Built for the ChainIQ challenge

---

## The Problem

Enterprise procurement is broken — and nobody talks about it enough.

Every day, procurement managers receive a flood of purchase requests written in plain language, often vague, sometimes contradictory, frequently in multiple languages. A buyer must manually interpret what is actually being requested, look up which suppliers cover the region, apply a maze of internal policies (approval thresholds, restricted suppliers, data sovereignty rules, mandatory quote counts), compute realistic costs across pricing tiers, flag edge cases for human review, and produce a decision trail that can withstand an audit months later.

This process is slow, inconsistent, and error-prone. When it fails, the consequences are real: regulatory violations, budget overruns, preferred suppliers used when they're restricted, orders placed without the required approvals.

**ChainIQ automates this entire workflow** — from raw free-text request to a structured, policy-enforced, audit-ready supplier recommendation — in seconds.

---

## The Idea

Instead of replacing human judgment with a black-box AI, we built a **hybrid procurement engine** that combines the speed and consistency of deterministic rule enforcement with the reasoning ability of large language models, only where it actually adds value.

The core insight: most procurement decisions are not ambiguous. A 200-unit laptop order in Germany with a €180,000 budget follows clear, mechanical rules — which suppliers serve DE, which pricing tier applies, which approval level is required, whether the budget covers the cost. A deterministic engine handles this correctly, fast, every time, with a full audit trail.

The LLM is invoked selectively — when scores are tied, when a request has complex data residency implications, when the budget is borderline, or when the system cannot confidently choose a winner. In those cases, the engine escalates to an AI-augmented reasoning layer that weighs trade-offs and explains its rationale in plain language.

The result is a system that is **explainable, auditable, and defensible** — not just a recommendation, but a documented decision.

---

## What It Does

### Two-Role Portal

**Employees** submit purchase requests in plain text — or by speaking them aloud. The system interprets the request, auto-fills structured fields, and lets the employee review and confirm before submitting to the procurement queue.

**Procurement officers** pick up requests from an inbox, run them through the full pipeline (validation → policy checks → supplier ranking), review the AI-enriched output, select a supplier, and confirm the order with a complete purchase receipt and next-steps checklist.

### The Pipeline

```
Free-text request (any language)
         │
         ▼
┌─────────────────────────────┐
│  Stage 1 · LLM Interpret    │  Azure GPT-4o extracts category, quantity,
│                             │  budget, delivery country, preferred supplier,
│                             │  data residency needs, urgency, contradictions.
│                             │  Returns confidence score + alternatives.
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Stage 2 · Validate         │  Five deterministic validators run in parallel:
│                             │  completeness · supplier eligibility ·
│                             │  lead time feasibility · contradiction detection ·
│                             │  policy rule checks (category + geography)
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Stage 3 · Explain          │  Azure GPT-4o generates a user-facing summary
│                             │  of issues and proposed fixes, in the requester's
│                             │  language (EN/FR/DE/ES/PT/IT/JA).
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Deterministic Ranking      │  Filter by category, region, restrictions,
│                             │  capacity → price tier lookup → weighted
│                             │  composite score (price · quality · risk ·
│                             │  ESG · lead time) → policy evaluation →
│                             │  escalation checks → ranked shortlist.
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Confidence Gate            │  Is the result confident? Score spread,
│                             │  budget sufficiency, escalation flags, tie-breaks.
│                             │  If YES → return deterministic output.
│                             │  If NO  → invoke LLM fallback.
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Audit-Ready Output         │  Ranked supplier shortlist · compliance checks
│                             │  per supplier · escalations with owner names ·
│                             │  approval threshold with quote requirements ·
│                             │  full audit trail (policies checked, sources,
│                             │  method used, pricing tiers applied).
└─────────────────────────────┘
```

---

## Key Features

### Intelligent Request Interpretation
- Parses free-text procurement requests including messy, multilingual, and contradictory inputs
- Auto-detects category (L1 + L2), quantity, delivery country, currency, preferred supplier, data residency requirements
- Surfaces ambiguities with confidence scores and up to 3 alternative interpretations
- Detects internal contradictions (quantity vs. free text, budget vs. pricing reality)

### Policy-First Governance Engine
Every request is evaluated against the full policy rulebook — not summarized, not approximated:

| Policy Area | Rules Applied |
|---|---|
| Approval Thresholds | 5 tiers per currency (EUR/CHF/USD) — quote count, approvers |
| Restricted Suppliers | Category × country × value conditions |
| Category Rules | Mandatory comparisons, engineering reviews, CV checks, brand safety |
| Geography Rules | Data sovereignty (CH/US/APAC/LATAM/MEA), language support, local compliance |
| Escalation Rules | 8 triggers → named escalation owners (Procurement Manager, Head of Category, CPO…) |

### Supplier Ranking with Full Scoring Transparency
- Filters suppliers by category, geographic coverage, capacity, restrictions
- Matches quantity to correct pricing tier (up to 4 tiers per supplier)
- Scores each supplier on five weighted dimensions:
  - **Price** (35%) — relative cost competitiveness
  - **Quality** (25%) — dataset quality rating
  - **Risk** (15%) — risk profile, inverted (lower risk = higher score)
  - **ESG** (10%) — sustainability score
  - **Lead time** (15%) — feasibility against deadline
- Provides per-supplier compliance check cards with Pass / Warning / Fail status
- Lists excluded suppliers with explicit reasons

### Hybrid Deterministic + LLM Architecture
- Deterministic engine handles the majority of cases: fast, consistent, zero hallucination risk
- LLM fallback activates only when confidence is insufficient — tied scores, borderline budgets, complex constraints
- Output is always labelled: `DETERMINISTIC`, `LLM_FALLBACK`, or `HYBRID`
- If the LLM call fails, the system gracefully returns the deterministic result

### Audit-Ready Outputs
Every decision record includes:
- Which policies were evaluated and what they found
- Which suppliers were considered and why each was included or excluded
- Which pricing tier was applied and to what quantity
- Which data sources were consulted
- Whether historical awards were considered
- The full escalation chain with named owners and blocking/non-blocking status

### Voice-Enabled Input
- Employees can speak their procurement request; the system transcribes and extracts structured fields
- ElevenLabs TTS reads back clarification questions in a conversational loop
- Works across all 7 supported languages

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│  React 19 · TypeScript · Tailwind CSS · Vite                │
│                                                             │
│  Employee Portal          Procurement Portal                │
│  ─────────────────        ─────────────────────             │
│  RequestForm              PendingRequestsView (inbox)       │
│  VoiceInput               ValidationView                    │
│  EmployeeReviewStep       SupplierRankingView               │
│  (submit to inbox)        OrderConfirmationView             │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP (REST)
┌───────────────────────────▼─────────────────────────────────┐
│                        BACKEND (FastAPI)                    │
│                                                             │
│  /api/validate          pipeline.py                         │
│  /api/rank              ├── interpreter.py (LLM stage 1)    │
│  /api/order             ├── validators/  (5 modules)        │
│  /api/employee/*        │   ├── completeness.py             │
│  /api/parse-voice       │   ├── supplier_checker.py         │
│                         │   ├── lead_time.py                │
│                         │   ├── contradiction.py            │
│                         │   └── policy_rules.py             │
│                         ├── message_generator.py (LLM 3)    │
│                         ├── ranking_engine.py  (deterministic)
│                         ├── ranking_orchestrator.py         │
│                         └── ranking_llm.py (LangChain)      │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼────────────────────┐
        │                   │                    │
┌───────▼──────┐  ┌─────────▼──────┐  ┌─────────▼────────┐
│ Azure OpenAI │  │  Reference Data │  │   ElevenLabs     │
│  GPT-4o      │  │  (CSV / JSON)   │  │   (TTS, opt.)    │
│ LangChain    │  │  suppliers      │  └──────────────────┘
└──────────────┘  │  pricing tiers  │
                  │  categories     │
                  │  policies       │
                  │  history        │
                  └─────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS 4, Vite 8 |
| Backend | Python 3.13, FastAPI, Uvicorn |
| AI / LLM | Azure OpenAI (GPT-4o), LangChain, Anthropic SDK |
| Voice | Browser Web Audio API (STT), ElevenLabs (TTS) |
| Data | CSV + JSON reference files, in-memory DataStore |
| Validation | Pydantic v2, structured output parsing |
| Internationalisation | Custom i18n with 7 languages (EN, FR, DE, ES, PT, IT, JA) |

---

## Dataset

The system processes requests against a curated reference dataset:

| File | Records | Description |
|---|---|---|
| `requests.json` | 304 | Unstructured purchase requests (messy, multilingual, contradictory) |
| `suppliers.csv` | 151 rows / 40 suppliers | Capabilities, risk scores, ESG ratings, regions, restrictions |
| `pricing.csv` | 599 tiers | Volume-based pricing by supplier, category, region |
| `categories.csv` | 30 | Taxonomy: IT, Facilities, Professional Services, Marketing |
| `policies.json` | 6 sections | Approval thresholds, restrictions, category rules, geo rules, escalations |
| `historical_awards.csv` | 590 | Past sourcing decisions used as contextual precedent |

Request scenario distribution: `standard` (141) · `threshold` (29) · `lead_time` (29) · `missing_info` (28) · `contradictory` (21) · `restricted` (18) · `multilingual` (18) · `capacity` (18) · `multi_country` (3)

---

## Getting Started

### Prerequisites
- Python 3.13+
- Node.js 18+
- Azure OpenAI resource with a `gpt-4o` deployment
- ElevenLabs API key *(optional — only needed for voice TTS)*

### Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd STARThack2026

# 2. Configure environment
cp .env.example .env
# Edit .env with your Azure OpenAI credentials:
#   AZURE_OPENAI_ENDPOINT=https://your-resource.cognitiveservices.azure.com
#   AZURE_OPENAI_API_KEY=your-api-key
#   AZURE_OPENAI_DEPLOYMENT=gpt-4o
#   AZURE_OPENAI_API_VERSION=2025-01-01-preview
#   ELEVENLABS_API_KEY=  (optional)

# 3. Start everything
chmod +x start.sh
./start.sh
```

The startup script creates the Python virtual environment, installs all dependencies, and launches both the backend (`localhost:8000`) and frontend (`localhost:5173`) in a single command.

### Manual Startup

```bash
# Backend
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/uvicorn api.main:app --reload --host 0.0.0.0 --port 8000

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

### API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/validate` | Run full validation pipeline on a request |
| `POST` | `/api/rank` | Rank suppliers for a validated order |
| `POST` | `/api/rank/custom-weights` | Rank with custom scoring weights |
| `POST` | `/api/order` | Confirm a supplier selection and generate order receipt |
| `POST` | `/api/employee/submit` | Submit a request to the procurement inbox |
| `GET` | `/api/employee/requests` | List pending requests in the procurement inbox |
| `POST` | `/api/parse-voice` | Parse a voice transcript into structured form fields |

---

## Example Output

For a request to purchase 240 laptop docking stations for delivery in Germany:

```json
{
  "request_id": "REQ-000004",
  "request_interpretation": {
    "category_l1": "IT",
    "category_l2": "Docking Stations",
    "quantity": 240,
    "budget_amount": 25199.55,
    "currency": "EUR",
    "delivery_country": "DE",
    "days_until_required": 6
  },
  "validation": {
    "completeness": "pass",
    "issues_detected": [
      {
        "severity": "critical",
        "type": "budget_insufficient",
        "description": "Budget of EUR 25,199 cannot cover 240 units at the applicable tier (EUR 148.80/unit = EUR 35,712 total).",
        "action_required": "Requester must increase budget or reduce quantity."
      }
    ]
  },
  "policy_evaluation": {
    "approval_threshold": {
      "rule_applied": "AT-002",
      "quotes_required": 2,
      "approvers": ["Business Owner", "Procurement Manager"]
    }
  },
  "supplier_shortlist": [
    {
      "rank": 1,
      "supplier_name": "Bechtle Workplace Solutions",
      "unit_price": 148.80,
      "total_price": 35712.00,
      "composite_score": 0.81,
      "policy_compliant": true,
      "recommendation_note": "Lowest-cost compliant option, incumbent supplier, preferred for DE region."
    }
  ],
  "escalations": [
    {
      "rule": "ER-001",
      "trigger": "Budget insufficient — requester clarification needed.",
      "escalate_to": "Requester",
      "blocking": true
    }
  ],
  "recommendation": {
    "status": "cannot_proceed",
    "minimum_budget_required": 35712.00,
    "preferred_supplier_if_resolved": "Bechtle Workplace Solutions"
  },
  "audit_trail": {
    "policies_checked": ["AT-002", "CR-001", "GR-002", "ER-001"],
    "supplier_ids_evaluated": ["SUP-0001", "SUP-0003", "SUP-0007", "SUP-0008"],
    "method_used": "DETERMINISTIC"
  }
}
```

---

## Why This Matters

Procurement governance is a high-stakes, under-automated domain. The average enterprise spends 60–80% of its revenue on procurement. Even small improvements in compliance, supplier selection quality, and process speed translate to significant savings and risk reduction.

Current tools are either rigid ERP systems that require perfectly structured input, or general-purpose AI assistants that produce fluent but unauditable recommendations. Neither is acceptable when decisions involve hundreds of thousands of euros and regulatory obligations across multiple jurisdictions.

ChainIQ occupies the gap: a system that can handle the messiness of real-world procurement input while producing the structured, policy-compliant, auditable output that finance, legal, and compliance teams actually need.

---

## Evaluation Criteria Alignment

| Criteria | Weight | How We Address It |
|---|---|---|
| **Creativity** | 20% | Hybrid deterministic + LLM architecture; voice input; dual-role portal; confidence-gated AI fallback |
| **Visual Design** | 10% | Clean supplier comparison cards with score bars, compliance check panels, and escalation banners |
| **Feasibility** | 25% | FastAPI + React stack; Azure OpenAI as AI layer; deployable with a single `./start.sh` command |
| **Reachability** | 20% | Directly addresses the stated procurement challenges: multilingual input, policy enforcement, supplier comparison |
| **Robustness & Escalation** | 25% | 8 escalation rules with named owners; 5 validators; contradiction detection; budget feasibility checks; graceful LLM fallback |

---

## Team

Built at **STARThack 2026** for the ChainIQ challenge.

Data repository: [ChainIQ-START-Hack-2026](https://github.com/adriank71/ChainIQ-START-Hack-2026-.git)
