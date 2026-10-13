# Policy Police — Technical Specification Document (TSD)

|         |                                   |
| ------- | --------------------------------- |
| Status  | Draft, revision 2                 |
| Date    | 2026-10-13                        |
| Related | [PRD](./PRD.md) · [FSD](./FSD.md) |

Requirement IDs (`F-…`) refer to the FSD.

## 1. Architecture

```
                         Firebase Hosting                Firebase App Hosting
                        ┌────────────────┐               ┌───────────────┐
   Browser ────────────►│ apps/dashboard │               │   apps/web    │
      │                 │ Vite + React   │               │ Next.js       │
      │                 └────────────────┘               │ landing page  │
      │                                                  └───────────────┘
      │  Firebase Auth (Google)        ID token
      │  Cloud Storage upload ─────────────────────┐
      │  Firestore onSnapshot (live progress)      │
      │                                            ▼
      │   POST /v1/analyses            ┌───────────────────────────┐
      └───────────────────────────────►│ apps/api  (Cloud Run)     │
                                       │ Hono + Google ADK (TS)    │
                                       │                           │
                                       │  Reader ─► RuleExtractor  │
                                       │     ─► ScenarioFuzzer     │
                                       │     ─► evaluate()  (code) │
                                       │     ─► ExpectationJudge   │
                                       │     ─► LegalResearcher    │
                                       │     ─► score()     (code) │
                                       └──────┬──────────┬─────────┘
                                              │          │
                         Gemini API (AI Studio key)      ├─ Google Search grounding
                                              │          └─ fetch + quote check
                                              ▼             (official legal sites)
                                Firestore · Cloud Storage · Secret Manager
```

Three deployables, all on Google Cloud, all scale to zero.

### Decisions

| Decision         | Choice                                                                      | Reason                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Backend language | TypeScript on Node 22                                                       | Official Gemini SDK and ADK support; one language in the monorepo. Replaces the template's Rust API.                          |
| HTTP framework   | Hono                                                                        | Small, typed, runs on Cloud Run with `@hono/node-server`.                                                                     |
| Agent framework  | Google ADK for TypeScript                                                   | Meets the hackathon's "agentic platform" requirement; built-in Google Search tool.                                            |
| Model access     | Gemini Developer API (AI Studio key) via `@google/genai`                    | Fastest start. Key lives in Secret Manager. Moving to Vertex AI later is a config change in the same SDK.                     |
| Outcome engine   | Plain TypeScript, no LLM                                                    | Determinism and traceability (F-RUN-2, F-RUN-3).                                                                              |
| Any document     | Fact schema derived per document; document packs are prompt content         | One engine for every document type. No per-type code. See section 3.2.                                                        |
| Law lookup       | Google Search grounding on an allowlist, then our own fetch and quote check | No corpus to build or keep fresh; a new country is one allowlist entry. Verified pages are stored, so the store fills itself. |
| Database         | Firestore                                                                   | Analyses are JSON documents; realtime listeners give live progress for free. No Cloud SQL.                                    |
| Files            | Cloud Storage for Firebase                                                  | Direct browser upload under security rules; lifecycle rule deletes after 7 days.                                              |
| Auth             | Firebase Auth, Google provider only                                         | F-AUTH-1.                                                                                                                     |
| Live progress    | Firestore `onSnapshot` from the browser                                     | No SSE or WebSocket code. The API only writes documents.                                                                      |
| Shared types     | Zod schemas in `@repo/api-types`                                            | One source of truth for API, agents' structured output, Firestore documents and UI.                                           |
| Long request     | The confirm request stays open for the run (Cloud Run timeout 600 s)        | Avoids a queue for the hackathon. Ceiling: one run per request; move to Cloud Tasks when runs outgrow a request.              |

### Models

Model IDs are constants in `apps/api/src/config.ts`. Pick the current stable IDs from the
Gemini model list on day 0; do not hard-code IDs anywhere else.

| Role                                   | Tier       | Why                                                            |
| -------------------------------------- | ---------- | -------------------------------------------------------------- |
| Reader, RuleExtractor, LegalResearcher | Pro tier   | Long documents, careful structured extraction, legal reasoning |
| ScenarioFuzzer, ExpectationJudge       | Flash tier | High volume, lower difficulty, runs in parallel                |

## 2. Repository layout

```
apps/
  web/            Next.js landing page
  dashboard/      Vite + React + TanStack Router product UI
  api/            TypeScript service: Hono + ADK
    src/
      index.ts            server entry
      app.ts              routes, auth middleware
      config.ts           env, model IDs, limits, legal-source allowlist
      pipeline.ts         stage orchestration, Firestore progress writes
      agents/             reader, rule-extractor, scenario-fuzzer, expectation-judge, legal-researcher
      packs/              one file per document type: scenario seeds, expectation hints
      engine/             evaluate.ts, score.ts, validate.ts  (pure functions, no I/O)
      legal/              search.ts (grounded search), fetch.ts (page fetch + cache), verify.ts (quote check)
      firebase.ts         Admin SDK init
    Dockerfile
packages/
  api-types/      Zod schemas + inferred types
  ui/ i18n/ tailwind-config/ typescript-config/
docs/             PRD, FSD, TSD, adr/
firebase.json  firestore.rules  storage.rules
```

## 3. Data model

### 3.1 Shared schemas (`@repo/api-types`)

The schemas, their inferred types and the meaning of each field are in
[`packages/api-types/src/index.ts`](../packages/api-types/src/index.ts). That file is the
reference; the schemas are not repeated here so the two cannot drift. In short: `Clause`,
`Fact` (with `FactSchema` as the list for one document), `Condition` (a tree of `all` /
`any` / `not` over fact comparisons), `Rule`, `Scenario`, `Outcome`, `Expectation`,
`LegalFinding` (with `Citation`), `Trap` and `AnalysisMeta`. A rule must cite at least one
clause, and only an `unmodeled` rule may have no condition.

A rule's `when` being true always means "this rule applies". For a `benefit` that is good
for the user; for every other kind it counts against them: the condition was breached, the
deadline missed, the exclusion, limit or charge triggered.

Rule kinds, read from the user's side:

| Kind        | Meaning                                                | Insurance             | Loan                         | Employment             | Lease                      |
| ----------- | ------------------------------------------------------ | --------------------- | ---------------------------- | ---------------------- | -------------------------- |
| `benefit`   | Something the user gets or may do                      | Covered event         | Right to repay early         | Severance, leave       | Deposit returned           |
| `exclusion` | Situation in which a benefit does not apply            | Exclusions            | —                            | Dismissal for cause    | Damage beyond wear         |
| `condition` | Something the user must have done                      | Disclosure            | Insurance on collateral      | Confidentiality        | No subletting              |
| `deadline`  | A time limit on the user                               | Notice period         | Grace period                 | Notice of resignation  | Notice to vacate           |
| `limit`     | A cap or deduction on what the user gets               | Sub-limit, deductible | —                            | Capped bonus           | —                          |
| `charge`    | Money the user must pay when triggered                 | —                     | Late fee, prepayment penalty | Training bond          | Early-exit penalty         |
| `unmodeled` | Matters, but not expressible (discretion, vague terms) | "as determined by us" | Unilateral rate change       | "reasonable" restraint | "at landlord's discretion" |

### 3.2 Fact schema per document

Rules and scenarios must speak the same language, or nothing can be executed. That
language is derived from the document, not hard-coded per document type:

1. RuleExtractor step 1 reads the clauses and returns a `FactSchema` (about 15–40 facts).
   A small fixed base is always included: `daysSinceStart`, `userPaidOnTime`,
   `userGaveNoticeDays`, `userDisclosedEverything`, `paperworkComplete`.
2. RuleExtractor step 2 writes rules whose `when` uses only those keys.
3. ScenarioFuzzer fills every key for every scenario.
4. Code validates all three against each other (section 5). Anything that does not fit is
   repaired once, then demoted (rule → `unmodeled`) or dropped (scenario).

Packs (`apps/api/src/packs/*.ts`) add prompt content only: typical facts worth looking
for, scenario seeds per strategy, and expectation hints. The `other` pack has general
seeds (termination, auto-renewal, fees, unilateral change, liability, dispute venue).

### 3.3 Firestore

```
analyses/{analysisId}
  ownerUid, status, stage, error?, createdAt, updatedAt
  meta: { docType, title, parties[], userRole, jurisdiction, lawChecked, language,
          pageCount, unreadablePages[] }
  factSchema: Fact[]
  counts: { clauses, rules, scenarios, fine, partlyBad, bad, undetermined, traps }
  grade, confidence
  clauses/{clauseId}        Clause
  rules/{ruleId}            Rule
  scenarios/{scenarioId}    Scenario + Outcome + expectation { result, reason }
  findings/{ruleId}         { status, reasoning, citations[] }
  traps/{trapId}            { title, severity, ruleId, scenarioIds[], action }

users/{uid}/usage/{yyyy-mm-dd}   { started }             // daily limit, F-UP-5

lawPages/{sha256(url)}                                   // F-CMP-6
  url, host, jurisdiction, text, fetchedAt
```

Storage: `uploads/{uid}/{analysisId}/{n}-{filename}`.

### 3.4 Security rules

- `analyses/**`: read if the analysis `ownerUid == request.auth.uid` (sub-collections check
  the parent). **No client writes**; only the API (Admin SDK) writes.
- `lawPages/**`, `users/**`: no client access.
- Storage `uploads/{uid}/**`: create if `request.auth.uid == uid`, content type is PDF,
  JPEG, PNG, WebP or HEIC (F-UP-1), size ≤ 30 MB. Read by owner. No update. The content
  type is declared by the client, so the reader checks the real file type.
- **Accepted risk:** the rules do not limit how many files a signed-in user uploads, and
  uploads do not pass through the API's daily quota. For the hackathon this is bounded
  only by the 7-day lifecycle rule and a billing budget alert. The fix, if needed, is
  signed upload URLs issued by the API after its quota check, with client writes closed.
- Storage lifecycle: delete objects under `uploads/` after 7 days (F-HIST-3).

## 4. API

All routes require `Authorization: Bearer <Firebase ID token>`, verified with the Admin SDK.

| Method   | Path                       | Body                                  | Behaviour                                                                                                                                                                 |
| -------- | -------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/health`                  | —                                     | Liveness, unauthenticated.                                                                                                                                                |
| `POST`   | `/v1/analyses`             | `{ analysisId, files: string[] }`     | Checks the daily limit and that the files exist under the caller's upload path. Creates the analysis, runs **Read**, sets `awaiting_confirmation` or `rejected`, returns. |
| `POST`   | `/v1/analyses/:id/confirm` | `{ docType, jurisdiction, userRole }` | Owner only. Runs the remaining stages. Holds the request open until `done` or `failed`.                                                                                   |
| `POST`   | `/v1/analyses/:id/retry`   | —                                     | Owner only. Resumes from the failed stage using stored sub-collections.                                                                                                   |
| `DELETE` | `/v1/analyses/:id`         | —                                     | Owner only. Recursive delete of the document tree and the upload folder.                                                                                                  |

Everything the UI displays is read directly from Firestore. There are no `GET` endpoints
for analyses.

Errors: `{ error: { code, message } }` with HTTP 400 / 401 / 403 / 404 / 429 / 500.
Request bodies are validated with the shared Zod schemas.

## 5. Pipeline

`pipeline.ts` runs the stages in order, writes `status`, `stage` and `counts` to the
analysis document after each step, and writes sub-collection documents as soon as they
exist (so the UI updates live).

### 5.1 Reader (agent, Pro)

- Input: the PDF or images as Gemini file parts (native PDF and image understanding; no
  separate OCR service).
- Output (structured): `meta` (including `isPolicyOrContract`, parties with roles) and `Clause[]`.
- Post-check in code: clause text non-empty; pages within range; `rejected` if
  `isPolicyOrContract` is false (F-READ-4). `docType` outside the five tuned types → `other`.
- Very long documents: process in page windows of 40 with clause IDs offset per window.

### 5.2 RuleExtractor (agent, Pro, two calls)

- Call 1 → `FactSchema`. Input: clauses, the pack's "facts worth looking for", the user's role.
- Call 2 → `Rule[]`. Input: clauses, fact schema, rule schema, worked examples, user's role.
- Post-check in code (F-RULE-1, F-RULE-2): drop rules whose `clauseIds` do not exist;
  every `fact` in `when` must be a key of the fact schema with a value of the right type;
  invalid rules are sent back once for repair, then demoted to `unmodeled`.

### 5.3 ScenarioFuzzer (agent, Flash)

- Input: rules, fact schema, pack seeds, strategies (F-FUZZ-4), the user's role.
- One call per strategy in parallel, then dedupe by fact equality and cap at 40.
- Boundary scenarios are completed in code: for a rule `daysSinceStart < 30`, code emits
  the facts for 29, 30 and 31 (all other facts at `neutral`) and asks the model only for
  the story.
- Post-check: `facts` has exactly the schema's keys with valid types; every
  `targetRuleId` exists. Invalid scenarios are dropped.

### 5.4 evaluate() (code)

Pure function `evaluate(rules: Rule[], factSchema: FactSchema, scenario: Scenario): Outcome`.
The fact schema supplies the `neutral` values for stage 4. A rule "fires" when its `when`
is true for the scenario's facts.

Order (the first stage that settles the result ends the run):

1. **Benefit** — if the scenario's `targetRuleIds` include a `benefit` rule and no
   `benefit` rule in the document fires → `bad` ("the document gives you nothing here").
   The first targeted benefit is the deciding rule.
2. **Conditions and deadlines** — any fires → `bad`.
3. **Exclusions** — any fires → `bad`.
4. **Unmodeled** — if an unmodeled rule's `touches` include a fact whose value differs
   from its `neutral` → `undetermined` (F-RUN-5), `loss` 0.
5. **Money** — for `limit` and `charge` rules that fire. An effect's value is its
   `amount`, else `percent` of the stake. The lowest `cap` is applied first, then every
   `deduct` (what is payable never goes below 0); `charge` values are owed on top, so
   `loss` = unpaid part of the stake + charges and can exceed the stake. With no stake,
   only fixed-amount charges count. `loss == 0` → `fine`; `loss >= stake` (or no stake
   and a loss) → `bad`; otherwise `partly_bad`.

A `bad` from stages 1 to 3 has `loss` = the stake (0 if there is none).

Every rule that fires in a stage that ran is appended to `trace` with the fact that
triggered it. `decidingRuleId` is the first rule, in the order the rules are listed, that
fired in the deciding stage; in the money stage, the first that cost the user something.

`evaluate()` expects input that passed the cross-validation in `engine/validate.ts`
(sections 5.2 and 5.3). A condition on a fact the scenario lacks, or an ordering
comparison on a non-number, throws instead of quietly evaluating to false.

### 5.5 ExpectationJudge (agent, Flash)

- Input: **only** the kind of document in neutral words ("a fixed-term residential lease
  in Singapore"), the user's role, the pack's expectation hints, the `benefit` rule
  summaries, and the scenario story. It does not see exclusions, conditions, charges or
  the outcome (F-CMP-1). This independence is the point: it stands in for the person who
  did not read the fine print.
- Output: `{ result, reason }` per scenario, batched.

### 5.6 LegalResearcher (agent, Pro, with Google Search)

Runs once per **deciding rule** of a `bad` or `partly_bad` scenario (deduplicated), in
parallel with a concurrency limit. Skipped entirely when the jurisdiction has no allowlist
(`meta.lawChecked = false`, F-READ-6).

Allowlist (`config.ts`), confirmed by the fetch spike in [ADR 4](./adr/0004-legal-source-fetch.md):

| Jurisdiction | Official sources                                                                  |
| ------------ | --------------------------------------------------------------------------------- |
| ID           | `peraturan.go.id`, `peraturan.bpk.go.id`, `jdih.*.go.id`, `ojk.go.id`, `pasal.id` |
| SG           | `sso.agc.gov.sg`, `mas.gov.sg`, `mom.gov.sg`                                      |
| AU           | `legislation.gov.au`, `asic.gov.au`, `fairwork.gov.au`                            |

Steps:

1. **Search** (`legal/search.ts`). Gemini call with the Google Search tool. The prompt
   carries the rule summary, document type, user's role and jurisdiction, and instructs
   `site:` restriction to the allowlist. Grounding redirect URLs are resolved; results
   whose host is not on the allowlist are discarded (F-CMP-5).
2. **Fetch** (`legal/fetch.ts`). For each surviving URL: read `lawPages` first; on a miss,
   HTTP GET with browser-like headers (allowlisted hosts only, 10 s timeout, 5 MB cap),
   strip HTML to text, store. If the page is unusable (not 200, not HTML, or under 1,000
   characters of text, which is the normal case for Indonesian statutes published as
   PDF), retrieve it with the URL context tool instead and store that text.
3. **Assess.** Second Gemini call, no tools, structured output, given the rule and the
   fetched page texts: `{ status, reasoning, citations: [{ instrument, section, quote, url }] }`.
4. **Verify** (`legal/verify.ts`, F-CMP-4). Quote and page text are normalised (whitespace,
   case, punctuation); the quote must be a substring of the text stored for that URL. A
   citation that fails is removed; a finding left with none becomes `no_finding`.

If search or fetch is unavailable, the finding is `no_finding` with
`error: 'lookup_unavailable'` and the pipeline continues.

The document's own text never reaches the search step; only the rule summary does.

### 5.7 score() (code)

`score(input, weights)`, where `input` holds the scenarios, outcomes, expectations (by
scenario ID), legal findings (by rule ID) and the analysis meta.

- Trap detection per F-TRAP-1, merge per deciding rule (F-TRAP-2). An `undetermined`
  outcome is never a trap (F-TRAP-5). `score()` leaves a trap's `title` and `action` null.
- Severity points: loss (share of stake lost: ≥ 80% = 3, ≥ 30% = 2, else 1; a scenario
  with no stake counts as 3) + frequency (`common` = 2, `occasional` = 1, `rare` = 0)
  - law (`conflicts` = 3, `restricted` = 2, else 0). Total ≥ 6 critical, 4–5 high,
    2–3 medium, else low. A merged trap takes the highest loss points and the highest
    frequency points among its scenarios.
- Grade: start at 100; minus 20 / 10 / 5 / 2 per critical / high / medium / low trap;
  A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 40, else F.
- Confidence: `high` if undetermined share < 10% and no unreadable pages, `medium` < 25%,
  else `low`. The general pack caps confidence at `medium`. A run with no outcomes is
  `low`: nothing tested is not the same as nothing found.
- Trap titles and "what you can do" text are written by one final Flash call from the
  structured trap data; the numbers above are never produced by the model.

The weights are a first guess and are kept in `config.ts` (`config.scoring`) for tuning
against real documents. The pipeline passes them to `score()`; the engine does not import
`config.ts`, and a lint rule keeps `engine/` to shared types and its own files.

### 5.8 Prompt-injection stance

The uploaded document is untrusted input. Agents that read it (Reader, RuleExtractor) have
**no tools** and can only return schema-validated JSON. The only agent with a tool
(LegalResearcher) receives rule summaries, not raw document text; its tool is read-only
search, and our fetcher only contacts allowlisted hosts. Fetched law pages are untrusted
too: the assess call has no tools. System instructions state that document and page
content is data, not instructions.

## 6. Law store

The law store is not built up front. It fills as a side effect of analyses.

| Stage             | What                                                                                                                                                                                                                                      | Status  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Page cache        | `lawPages` keyed by URL hash. Saves the fetch on every later analysis that cites the same page. Entries older than 30 days are refetched.                                                                                                 | P0      |
| Finding reuse     | Embed each **verified** finding (rule summary + document type + jurisdiction). Before searching, vector-search prior findings; on a close match, reuse its citations and re-run only the assess and verify steps against the cached page. | Stretch |
| Managed retrieval | Vertex AI Search over the allowlisted sites.                                                                                                                                                                                              | Later   |

Only text from official sources is stored, with its URL. Check each site's reuse terms
during the day-1 spike.

## 7. Front end

### dashboard (the product)

- Shell: layout, theme, error pages, `@repo/ui`, TanStack Router, React Query, Zustand,
  Vitest setup.
- Features: `auth` (Google button, route guard on `_authenticated`), `upload`,
  `analysis` (confirm, run tracker, report, trap detail, rules), `history`.
- Data: Firebase JS SDK. Firestore listeners wrapped as React Query subscriptions; API
  calls through one small `api.ts` client that attaches the ID token.
- UI strings live in the `en` locale file through `@repo/i18n`. The `id` locale is kept
  key-identical (the existing parity test enforces it) so that localisation later is not a rewrite.

### web (landing)

- Content per F-LAND. Primary button links to the dashboard URL (`NEXT_PUBLIC_APP_URL`).

## 8. Infrastructure and deployment

Commands below are a starting point written from memory; check flags against current
`gcloud` and `firebase` documentation when running them.

### From-zero setup (day 0)

```bash
gcloud projects create policy-police-<suffix> && gcloud config set project policy-police-<suffix>
gcloud billing projects link policy-police-<suffix> --billing-account <ACCOUNT>
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com firestore.googleapis.com firebase.googleapis.com \
  firebasestorage.googleapis.com identitytoolkit.googleapis.com
firebase projects:addfirebase policy-police-<suffix>
gcloud firestore databases create --location=asia-southeast2
# Firebase console: enable Google sign-in; create web app; create Storage bucket
# AI Studio: create API key in this project
printf '%s' "$GEMINI_API_KEY" | gcloud secrets create gemini-api-key --data-file=-
```

Region: `asia-southeast2` (Jakarta) for Cloud Run and Firestore.

### Deploy

```bash
# API: build the image from apps/api/Dockerfile with the repo root as context, then
gcloud run deploy api --image <IMAGE> --region asia-southeast2 \
  --timeout 600 --memory 1Gi --concurrency 4 --min-instances 0 --max-instances 5 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest --allow-unauthenticated
# Dashboard + rules
pnpm build:dashboard && firebase deploy --only hosting,firestore,storage
# Landing
firebase apphosting:backends:create   # once, points at apps/web
```

`--allow-unauthenticated` is at the Cloud Run level only; the app enforces Firebase ID
tokens on every route but `/health`. CORS allows the dashboard origin only.

### Environment

| App       | Variable                                                           | Notes                      |
| --------- | ------------------------------------------------------------------ | -------------------------- |
| api       | `GEMINI_API_KEY`                                                   | Secret Manager             |
| api       | `GOOGLE_CLOUD_PROJECT`, `STORAGE_BUCKET`, `ALLOWED_ORIGIN`, `PORT` |                            |
| dashboard | `VITE_FIREBASE_*`, `VITE_API_URL`                                  | Public Firebase web config |
| web       | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`                      |                            |

### Limits and cost guards

- Upload 30 MB / 100 pages; 40 scenarios; 10 analyses per user per day (transaction on
  `users/{uid}/usage`).
- Cloud Run `max-instances 5`; budget alert on the project.
- Per-call model timeout and one retry with backoff; a stage fails after the retry.

## 9. Testing

| Level         | What                                                                                                                            | Tool                                                 | Where                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------- |
| Unit          | `evaluate()` — table-driven: each rule kind, stage order, money maths, `undetermined`, determinism                              | Vitest                                               | `apps/api/src/engine/*.test.ts`  |
| Unit          | `score()` severity and grade; `verify.ts` quote matching (whitespace, case, partial, absent); allowlist host check              | Vitest                                               | `apps/api/src/**/*.test.ts`      |
| Unit          | Schema round-trips; cross-validation of fact schema ↔ rules ↔ scenarios                                                         | Vitest                                               | `packages/api-types`, `apps/api` |
| Integration   | Pipeline with agents stubbed by recorded outputs; asserts Firestore writes and state transitions                                | Vitest + Firestore emulator                          | `apps/api/src/pipeline.test.ts`  |
| Rules         | Owner-only access for Firestore and Storage                                                                                     | `@firebase/rules-unit-testing`                       | `apps/api/test/rules.test.ts`    |
| Component     | Upload validation, confirm step, run tracker, report rendering from fixture data                                                | Vitest + Testing Library                             | `apps/dashboard`                 |
| Eval (manual) | Real public documents: one per pack, spread over ID / SG / AU. Human checks rule fidelity and trap validity against PRD metrics | `pnpm --filter api eval <file>` writes a JSON report | `apps/api/scripts/eval.ts`       |

Live model calls are not part of `pnpm test`. The deterministic core carries the automated
coverage; model quality is judged by the eval script on real documents.

Real documents used for evaluation are **not committed** (copyright, personal data); the
eval script takes a local path.

## 10. Commands

```bash
pnpm dev                 # all apps
pnpm dev:web             # landing   → http://localhost:3000
pnpm dev:api             # API       → http://localhost:3001  (tsx watch)
pnpm dev:dashboard       # product   → http://localhost:5174
pnpm build | lint | type-check | test | check-all
pnpm --filter api eval <path-to-document.pdf>
firebase emulators:start --only auth,firestore,storage
```

Verification gate before any task is called done: `pnpm type-check && pnpm lint && pnpm test`.

## 11. Observability

Structured JSON logs to stdout (Cloud Logging) with `analysisId`, `stage`, duration, model,
token counts. No document text or clause text in logs. Stage durations are also stored on
the analysis document for the eval report.

## 12. Known shortcuts and their ceilings

| Shortcut                          | Ceiling                                                         | Upgrade path                                                 |
| --------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| Run inside the HTTP request       | One run per request, 600 s                                      | Cloud Tasks + worker service                                 |
| AI Studio key                     | Lower rate limits, key management                               | Vertex AI with service-account auth                          |
| Fact schema invented per document | Two analyses of similar documents are not directly comparable   | Canonical fact library per pack, mapped from derived schemas |
| Flat condition language           | Discretion, vagueness and multi-step procedures are `unmodeled` | Richer rule language; LLM adjudicator for unmodeled rules    |
| Search grounding for law          | May miss the relevant article; depends on site availability     | Finding reuse (section 6), then managed retrieval            |
| Hand-tuned grade weights          | Not validated                                                   | Calibrate against labelled documents                         |
| English-only UI                   | Excludes many JAPAC users                                       | Fill the `id` locale, add others                             |

## 13. Open technical questions

1. Resolved in [ADR 3](./adr/0003-agent-framework.md): agents run on `@google/adk`;
   search and structured output are separate calls; fan-out is plain concurrent calls.
2. Resolved in [ADR 4](./adr/0004-legal-source-fetch.md): direct fetch works for SG and
   AU with browser-like headers; Indonesian statutes go through the URL context tool.
3. Firebase App Hosting behaviour with a pnpm monorepo and Next.js 16; fallback is a
   Cloud Run container for `apps/web`.
