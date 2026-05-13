# HanaMart Chargeback Triage API

Backend service that ingests chargebacks, auto-categorizes them, computes a 0–100 risk score with evidence recommendations, and detects fraud patterns across disputes.

Built for the Yuno *Seoul Chargeback Tsunami* backend challenge.

**Stack:** Fastify 5 · TypeScript · Prisma · SQLite · Vitest.

---

## Deliverables Summary

| # | Requirement | Delivered | How to verify |
|---|-------------|-----------|---------------|
| **Core 1** | Ingest a new chargeback via API, see it correctly categorized and stored | `POST /chargebacks` returns category, urgency, risk score, recommendation, fraud flags | → [Example](#1-core-req-1--ingestion--categorization) |
| **Core 2** | Retrieve risk assessment and evidence recommendations for any dispute | `GET /chargebacks/:id/risk` returns 0-100 score, factor breakdown, required evidence, FIGHT/ACCEPT | → [Example](#2-core-req-2--risk-scoring--evidence) |
| **Core 3** | Query fraud patterns and see alerts with associated dispute IDs | `GET /fraud-patterns` lists patterns; `GET /fraud-patterns/:id` links disputes; `POST /fraud-patterns/scan` rebuilds | → [Example](#3-core-req-3--fraud-pattern-detection) |
| **Stretch A** | Analytics: monthly summary, win rates, avg response time, top fraud patterns | 4 analytics endpoints under `/analytics/` | → [Stretch Goals](#stretch-goals-also-implemented) |
| **Stretch B** | Simulate evidence auto-fetch from external systems | `POST /chargebacks/:id/evidence/fetch` mock | → [Stretch Goals](#stretch-goals-also-implemented) |
| **Docs** | Interactive API documentation | Swagger UI at `/docs` with full schemas and descriptions | → Open `/docs` |
| **Test data** | Pre-seeded chargebacks + fraud patterns for immediate evaluation | `npm run seed` plants ~100 chargebacks + 3 fraud rings | → Run seed, then `GET /chargebacks` |
| **Architecture** | Clean separation: routes / services / domain / lib | Documented in [Architecture](#architecture) section | → Source layout below |

---

## Production Deployment (Railway)

**Production URL:** [`https://hanamart-chargeback-production.up.railway.app/`](https://hanamart-chargeback-production.up.railway.app/)

The service is deployed on Railway with automatic seed on first deploy. The seed is **idempotent** — restarts will not delete or duplicate data.

### How to evaluate in 2 minutes

1. Open **[`/docs`](https://hanamart-chargeback-production.up.railway.app/docs)** to access Swagger UI
2. Execute `POST /chargebacks` with the example payload (provided in Swagger or the landing page)
3. Copy the returned `id`, then call `GET /chargebacks/{id}/risk`
4. Call `GET /fraud-patterns` to see seeded patterns
5. (Optional) `GET /fraud-patterns/{id}` to inspect a pattern's linked disputes

> **Note:** The production instance already has seed data from initial deploy. You can still `POST /chargebacks` to add new disputes and they will be automatically categorized, risk-scored, and checked against fraud patterns.

---

## Quick Start

```bash
cd hanaMart-chargeback
npm install
npx prisma db push          # creates SQLite DB
npm run seed                # 100+ chargebacks + planted fraud patterns
npm run dev                 # starts on :3000
```

Then open:

- **`http://localhost:3000`** — landing page with Quick Start guide, example payload, and every endpoint mapped to its challenge requirement.
- **`http://localhost:3000/docs`** — Swagger UI with full request/response schemas and natural-language descriptions for every endpoint.

---

## How to verify each Acceptance Criterion

The challenge says a reviewer should be able to:

> 1. Ingest a new chargeback via API and see it correctly categorized and stored
> 2. Retrieve risk assessment and evidence recommendations for any dispute
> 3. Query fraud patterns and see alerts with associated dispute IDs

### 1. Core Req 1 — Ingestion & Categorization

`POST /chargebacks` — automatically categorizes the dispute, calculates urgency (`<5 days = critical`), and returns the structured response.

```bash
curl -X POST http://localhost:3000/chargebacks \
  -H 'content-type: application/json' \
  -d '{
    "disputeId": "CB-DEMO-001",
    "transactionId": "TXN-DEMO-001",
    "amount": 149.99,
    "currency": "USD",
    "reasonCodeRaw": "4853",
    "reasonText": "Item arrived damaged, not as described",
    "cardholderName": "Kim Ji-woo",
    "cardholderEmail": "kim.jiwoo@example.com",
    "shippingAddress": "123 Gangnam-daero, Seoul",
    "ipAddress": "203.0.113.45",
    "orderDate": "2026-05-01T10:00:00Z",
    "filingDate": "2026-05-10T00:00:00Z",
    "responseDeadline": "2026-05-24T00:00:00Z",
    "hasTrackingNumber": true,
    "avsMatch": true
  }'
```

Response includes: `category`, `daysRemaining`, `critical`, `riskScore`, `recommendation`, `fraudFlags`.

Then list: `GET /chargebacks` (filter by `?critical=true`, `?category=FRAUD`, `?status=OPEN`).

### 2. Core Req 2 — Risk Scoring & Evidence

Pick any `id` from `GET /chargebacks` and call:

```bash
curl http://localhost:3000/chargebacks/<id>/risk
```

Response: `riskScore` (0–100), `recommendation` (`FIGHT` or `ACCEPT`), `breakdown` (factor-by-factor deltas), `requiredEvidence` (list of items to gather).

### 3. Core Req 3 — Fraud Pattern Detection

The seed plants three fraud rings, so right after seeding:

```bash
curl http://localhost:3000/fraud-patterns          # list all detected patterns
curl http://localhost:3000/fraud-patterns/<id>     # see disputes in a pattern
curl -X POST http://localhost:3000/fraud-patterns/scan   # rebuild from scratch
```

### Stretch Goals (also implemented)

```bash
# Stretch A — Analytics
curl "http://localhost:3000/analytics/summary?month=2026-04"
curl http://localhost:3000/analytics/win-rate-by-category
curl http://localhost:3000/analytics/avg-response-time
curl http://localhost:3000/analytics/top-fraud-patterns

# Stretch B — Evidence auto-fetch
curl -X POST http://localhost:3000/chargebacks/<id>/evidence/fetch
```

---

## Architecture

```
src/
├── routes/        # Fastify handlers + Swagger schemas (1 file per resource)
├── services/      # Business logic: categorization, risk, fraud detection, analytics, evidence
├── domain/        # Pure constants and helpers: risk weights, evidence catalog, money, urgency
├── lib/           # Prisma client, logger
├── config/        # env validation
└── seed/          # Deterministic test data generator
prisma/
└── schema.prisma  # Chargeback, FraudPattern, FraudPatternDispute
tests/
├── unit/          # categorization, risk, fraud-detection, urgency
└── integration/   # chargebacks, fraud (Fastify inject)
```

**Money handling:** stored as `amountMinor` (cents, integer) to avoid float drift. Helpers `toMinor` / `toMajor` in `src/domain/money.ts`.

**Validation:** Zod schemas validate every request body/query. Fastify schemas separately document the API for Swagger.

---

## Categorization logic (Core Req 1)

`src/services/categorization.service.ts` — priority-based:

1. **Reason code map** (Visa/MC codes like `4853`, `4855`, `4834`, etc.)
2. **Keyword match on `reasonText`** ("not received", "duplicate", "canceled", "refund", "damaged"…)
3. **Default**: `FRAUD`

Always returns one of the 6 categories the challenge specifies:
`FRAUD · PRODUCT_NOT_RECEIVED · NOT_AS_DESCRIBED · DUPLICATE · CREDIT_NOT_PROCESSED · SUBSCRIPTION_ISSUE`.

---

## Risk scoring logic (Core Req 2)

`src/services/risk.service.ts` — additive score, clamped to `[0, 100]`:

| Factor | Logic |
|---|---|
| **Base (by category)** | FRAUD 70 · NOT_AS_DESCRIBED 55 · PRODUCT_NOT_RECEIVED 50 · SUBSCRIPTION 45 · CREDIT_NOT_PROCESSED 35 · DUPLICATE 20 |
| **Amount** | ≥ $500 → +18 · ≥ $200 → +12 · ≥ $50 → +5 |
| **Time pressure** | < 2 days → +20 · < 5 days → +12 · < 10 days → +5 |
| **Historical** | Compares observed loss rate for the category vs. baseline (≥10 closed cases). Adjusts ±10. |
| **Mitigating** | `hasTrackingNumber` → −15 (PNR) · `priorRefundProcessed` → −25 (CNP) · `avsMatch` → −10 (FRAUD) |

**Recommendation:** `riskScore > 75` → `ACCEPT` (cut losses), otherwise `FIGHT`.

**Required evidence** comes from `src/domain/evidence-catalog.ts` (per-category list).

---

## Fraud detection logic (Core Req 3)

`src/services/fraud-detection.service.ts` — five detectors run on every ingest, plus a full `POST /fraud-patterns/scan`:

| Detector | Signal | Threshold |
|---|---|---|
| `ADDRESS` | normalized shipping address | ≥ 3 in last 90 days |
| `TIMING` | per-day 48h window | ≥ 7 disputes |
| `AMOUNT` | $5 bucket cluster | ≥ 6 in last 30 days |
| `EMAIL_DOMAIN` | non-generic domain | ≥ 4 in last 90 days |
| `IP` | same IP address | ≥ 3 in last 90 days |

Each match upserts a `FraudPattern` and links the dispute via `FraudPatternDispute`. Alerts return the pattern type, signature, dispute count, total amount, and the full dispute list.

---

## Test data (Acceptance Criteria)

`npm run seed` produces:

- **~100 chargebacks** spanning a 90-day window
- Category mix per the challenge: **40% FRAUD · 20% PRODUCT_NOT_RECEIVED · 15% NOT_AS_DESCRIBED · 10% DUPLICATE · 10% CREDIT_NOT_PROCESSED · 5% SUBSCRIPTION**
- **3 planted fraud patterns**: 8+ same-address cluster · 6+ same-day timing burst · 10+ disputes in $48–$52 amount band
- **60–70 closed disputes** (`WON`/`LOST`) to feed historical scoring
- Realistic Korean cardholder names, addresses, and email domains

---

## Tests

```bash
npm test
```

- **Unit:** `categorization.test.ts`, `risk.test.ts`, `fraud-detection.test.ts`, `urgency.test.ts`
- **Integration:** `chargebacks.test.ts`, `fraud.test.ts` (Fastify `inject` against an in-memory test DB)

---

## Evidence Checklist

### Build & Tests

```bash
# 1. Build compiles without errors (no P1012)
npm run build

# 2. All tests pass (unit + integration)
npm test
```

**Expected:** exit code 0 on both.

### Critical endpoints (local or production)

Replace `http://localhost:3000` with `https://hanamart-chargeback-production.up.railway.app` for production smoke tests.

```bash
# Health
curl http://localhost:3000/health

# Docs available
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/docs

# Seed data exists
curl -s http://localhost:3000/chargebacks | jq '.chargebacks | length'

# Risk assessment (replace :id with a real ID)
curl http://localhost:3000/chargebacks/<id>/risk | jq '{riskScore, recommendation, requiredEvidence}'

# Fraud patterns
curl http://localhost:3000/fraud-patterns | jq '.patterns[].type'

# Analytics
curl "http://localhost:3000/analytics/summary?month=2026-04"
```

### Error robustness

```bash
# 422 — invalid payload
curl -X POST http://localhost:3000/chargebacks -H 'content-type: application/json' -d '{}'

# 409 — duplicate disputeId
curl -X POST http://localhost:3000/chargebacks -H 'content-type: application/json' \
  -d '{"disputeId":"DUPE","transactionId":"T1","amount":10,"currency":"USD","reasonCodeRaw":"4853","reasonText":"test","cardholderName":"N","cardholderEmail":"e@e.com","emailDomain":"e.com","shippingAddress":"A","shippingAddressNorm":"a","orderDate":"2026-05-10","filingDate":"2026-05-10","responseDeadline":"2026-05-24","status":"OPEN","category":"FRAUD"}'

# 404 — non-existent ID
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/chargebacks/nonexistent/risk
```

**Expected:** 422 for invalid body, 409 for duplicate, 404 for missing resource.

---

## API reference

Full interactive documentation: **`http://localhost:3000/docs`** or **production [`/docs`](https://hanamart-chargeback-production.up.railway.app/docs)**

Every endpoint has a natural-language description, full request/response schema, and the homepage at `/` maps each route to the exact challenge requirement it covers.
