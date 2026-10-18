# safely.ink technical specification

|         |                                                                                                                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Status  | Revision 3, describes v1.0.1                                                                                                                    |
| Date    | 2026-10-18                                                                                                                                      |
| Related | [PRD](./PRD.md) · [FSD](./FSD.md) · [Roadmap](./ROADMAP.md) · [Technical stack](./research/2026-10-18-technical-stack.md) · [Setup](./SETUP.md) |

Requirement IDs (`F-…`) refer to the FSD. This document describes the deployed build. Where the
roadmap replaces a decision, the row says which milestone does it, and the
[technical stack note](./research/2026-10-18-technical-stack.md) has the design.

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

| Decision         | Choice                                                                      | Reason                                                                                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend language | TypeScript on Node 24                                                       | Official Gemini SDK and ADK support; one language in the monorepo. Replaces the template's Rust API.                                                                                                                         |
| HTTP framework   | Hono                                                                        | Small, typed, runs on Cloud Run with `@hono/node-server`.                                                                                                                                                                    |
| Agent framework  | Google ADK for TypeScript                                                   | Meets the hackathon's "agentic platform" requirement; built-in Google Search tool.                                                                                                                                           |
| Model access     | Gemini Developer API (AI Studio key) via `@google/genai`                    | Fastest start. Key lives in Secret Manager. R3 moves calls to Vertex AI, which serves Gemini in asia-southeast1 and not in Jakarta.                                                                                          |
| Outcome engine   | Plain TypeScript, no LLM                                                    | Determinism and traceability (F-RUN-2, F-RUN-3).                                                                                                                                                                             |
| Any document     | Fact schema derived per document; document packs are prompt content         | One engine for every document type. No per-type code. See section 3.2.                                                                                                                                                       |
| Law lookup       | Google Search grounding on an allowlist, then our own fetch and quote check | No corpus to build or keep fresh, and a new country is one allowlist entry. Verified pages are stored, so the store fills itself. R5 replaces it with a versioned Indonesian corpus in Cloud SQL, and search stays for gaps. |
| Database         | Firestore                                                                   | Analyses are JSON documents, and realtime listeners give live progress for free. Analyses stay here. The R5 law corpus goes in Cloud SQL for PostgreSQL.                                                                     |
| Files            | Cloud Storage for Firebase                                                  | Direct browser upload under security rules; lifecycle rule deletes after 7 days.                                                                                                                                             |
| Auth             | Firebase Auth, Google provider only                                         | F-AUTH-1.                                                                                                                                                                                                                    |
| Live progress    | Firestore `onSnapshot` from the browser                                     | No SSE or WebSocket code. The API only writes documents.                                                                                                                                                                     |
| Shared types     | Zod schemas in `@repo/api-types`                                            | One source of truth for API, agents' structured output, Firestore documents and UI.                                                                                                                                          |
| Long request     | The confirm request stays open for the run (Cloud Run timeout 900 s)        | Avoids a queue for the hackathon. Ceiling: one run per request. R2 moves stages to Cloud Tasks and a worker service.                                                                                                         |

### Models

Model IDs are constants in `apps/api/src/config.ts`. Pick the current stable IDs from the
Gemini model list on day 0; do not hard-code IDs anywhere else.

| Role                                                          | Tier       | Why                                                            |
| ------------------------------------------------------------- | ---------- | -------------------------------------------------------------- |
| Reader, RuleExtractor, law assessment                         | Pro tier   | Long documents, careful structured extraction, legal reasoning |
| ScenarioFuzzer, ExpectationJudge, law search and page reading | Flash tier | High volume, lower difficulty, runs in parallel                |

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
      pipeline/           pure code around the agents: reader-check.ts, rule-check.ts,
                          boundary.ts, scenario-check.ts
      routes/             analyses.ts
      uploads.ts          fetch and check the uploaded files
      usage.ts            daily limit
      agents/             run.ts (the one call to the model), reader, rule-extractor,
                          scenario-fuzzer, expectation-judge, legal-researcher
      packs/              one file per document type: prompt content
      engine/             evaluate.ts, score.ts, validate.ts  (pure functions, no I/O)
      legal/              search.ts (grounded search), fetch.ts (page fetch + cache), verify.ts (quote check),
                          research.ts (one lookup per deciding rule)
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

A document is from one of `COUNTRIES` (the JAPAC codes AU, CN, HK, IN, ID, JP, MY, NZ, PH,
SG, KR, TW, TH, VN) or is `GLOBAL`, governed by no single country; `Jurisdiction` is that
enum. The user picks the type and the country before upload. `meta.docType` and
`meta.jurisdiction` hold the pick; `meta.detected` holds what the Reader found on its own
(any ISO code, or empty), which the confirm screen shows when it differs. `GRADE_FORMULA`
(points per trap, grade bands) is shared so the report shows the formula the API grades
with.

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

Packs (`apps/api/src/packs/*.ts`) add prompt content only. A pack holds the facts worth
looking for, per strategy the situations worth trying (the scenario seeds), and what
people in that role take for granted (the expectation hints, read only by the judge).
Every document type has its own pack (`insurance`, `loan`, `employment`, `nda`, `lease`,
`terms`), and the type of the pack map makes a missing one a compile error. Only `other`
uses the general pack (termination, auto-renewal, fees, unilateral change, liability,
dispute venue), so a report is labelled "general analysis" exactly when its type is
`other` (F-READ-5). Where the side matters (NDA, loan, employment, lease), a hint names
the role it applies to; the judge is told the user's role.

### 3.3 Firestore

```
analyses/{analysisId}
  ownerUid, status, stage, error?, createdAt, reservedAt, updatedAt
  meta: { docType, title, parties[], userRole, jurisdiction, lawChecked,
          detected: { docType, jurisdiction }, language, pageCount, unreadablePages[] }
  factSchema: Fact[]
  counts: { clauses, rules, scenarios, fine, partlyBad, bad, undetermined, traps }
  grade, confidence
  clauses/{clauseId}        Clause
  rules/{ruleId}            Rule
  scenarios/{scenarioId}    Scenario + outcome: Outcome + expectation { result, reason }
  findings/{ruleId}         { ruleId, status, reasoning, citations[], error }
  traps/{trapId}            { title, severity, ruleId, scenarioIds[], action }

users/{uid}/usage/{yyyy-mm-dd}   { started, attempts }   // daily limit, F-UP-5; attempts
                                                         // never goes down, cap 30

lawPages/{sha256(url)}                                   // F-CMP-6
  url, host, jurisdiction, text, via: 'fetch' | 'url_context', fetchedAt
```

Storage: `uploads/{uid}/{analysisId}/{n}-{filename}`.

The history screen lists `analyses` where `ownerUid` is the user's, by `createdAt`
descending. That query needs the composite index in
[`firestore.indexes.json`](../firestore.indexes.json), deployed with the rules.

### 3.4 Security rules

- `analyses/**`: read if the analysis `ownerUid == request.auth.uid` (sub-collections check
  the parent). **No client writes**; only the API (Admin SDK) writes, and deletes
  (`DELETE /v1/analyses/:id`).
- `lawPages/**`, `users/**`: no client access.
- Storage `uploads/{uid}/**`: create if `request.auth.uid == uid`, content type is PDF,
  JPEG, PNG, WebP or HEIC (F-UP-1), size ≤ 30 MB. Read by owner. No update. The content
  type is declared by the client, so the reader checks the real file type.
- **Accepted risk:** the rules do not limit how many files a signed-in user uploads, and
  uploads do not pass through the API's daily quota. For the hackathon this is bounded
  only by the 7-day lifecycle rule and a billing budget alert. The fix, if needed, is
  signed upload URLs issued by the API after its quota check, with client writes closed.
- Storage lifecycle: delete objects under `uploads/` after 7 days (F-HIST-3), from
  [`storage-lifecycle.json`](../storage-lifecycle.json). The Firebase CLI does not deploy
  lifecycle rules; the runbook applies the file with `gcloud`. Only `POST /v1/analyses`
  reads the upload, so the report and its clause quotes do not need it afterwards.

## 4. API

All routes require `Authorization: Bearer <Firebase ID token>`, verified with the Admin SDK.

| Method   | Path                       | Body                                                     | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------- | -------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/health`                  | —                                                        | Liveness, unauthenticated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `POST`   | `/v1/analyses`             | `{ analysisId, files: string[], docType, jurisdiction }` | Type and country are what the user picked (400 without them). Checks that the files exist under the caller's upload path and are one PDF or 1 to 30 images within the limits (real type from the first bytes), then reserves a daily slot. Creates the analysis as `reading`, runs **Read** (which does not see the pick; its finding goes to `meta.detected`), sets `awaiting_confirmation`, `rejected` or `failed` (slot given back for both), returns `{ analysisId, status }`. 409 if the analysis exists.                                                                                     |
| `POST`   | `/v1/analyses/:id/confirm` | `{ docType, jurisdiction, userRole }`                    | Owner only; anyone else gets 404. Only from `awaiting_confirmation` (else 409). Stores the confirmed type, jurisdiction and role, sets `extracting_rules`, then runs the remaining stages and holds the request open for them. Returns `{ analysisId, status }` with the status the run ended in: `done` or `failed`. A failed stage is that status with 200, not an HTTP error.                                                                                                                                                                                                                   |
| `POST`   | `/v1/analyses/:id/retry`   | —                                                        | Owner only (else 404). From `failed` in a pipeline stage, or from `done` when a finding has `error: 'lookup_unavailable'` (then the stage is `comparing`); else 409 (a failed reading is uploaded again). Reserves a daily slot again (429 `daily_limit`), deletes the sub-collection the stage writes (`rules`, `scenarios` or `traps`) and its result fields, sets the status to that stage and runs from there with what earlier stages stored, holding the request open like confirm. `comparing` keeps stored expectations and usable findings. A retry that fails again gives its slot back. |
| `DELETE` | `/v1/analyses/:id`         | —                                                        | Owner only (else 404). 409 while the analysis is in a running stage whose `updatedAt` is newer than `RUN_STALE_SECONDS` (900 s, above every stage limit); an older one is a run that died and may go. The analysis document is deleted in the transaction that checks this, so a racing confirm or retry gets 404; then every sub-collection and `uploads/{uid}/{id}/` are deleted. Returns `{ analysisId }`. The daily slot stays used.                                                                                                                                                           |

Everything the UI displays is read directly from Firestore. There are no `GET` endpoints
for analyses.

Errors: `{ error: { code, message } }` with HTTP 400 / 401 / 403 / 404 / 409 / 429 / 500.
A 429 `daily_limit` also carries `resetAt`, the next UTC midnight. Upload refusals use the
codes `file_missing`, `unsupported_type`, `mixed_input`, `too_large` and `too_many_pages`.
Request bodies are validated with the shared Zod schemas.

## 5. Pipeline

`pipeline.ts` runs the stages in order, writes `status`, `stage` and `counts` to the
analysis document after each step, and writes sub-collection documents as soon as they
exist (so the UI updates live). A stage that throws sets `failed` with the stage name and
gives back the daily slot of the day it was taken on (`reservedAt`).

Built so far: `extracting_rules`, `fuzzing`, `running`, `comparing`. Each stage names the
status that follows it, and the run starts at the stage that matches the status of the
analysis. A stage reads its input from Firestore, not from the stage before it, so what is
evaluated is what is stored. After `comparing` the analysis is `done`. `comparing` runs
the ExpectationJudge (5.5), then the legal lookup (5.6), then `score()` (5.7)
with both. It keeps what an earlier attempt stored: it judges only scenarios without an
expectation and looks up only rules without a usable finding, so a retry finishes what is
missing.

### 5.1 Reader (agent, Pro)

- Input: the PDF or images as Gemini file parts (native PDF and image understanding; no
  separate OCR service).
- Output (structured): `meta` (including `isPolicyOrContract`, parties with roles) and `Clause[]`.
- Post-check in code: clause text non-empty; pages within range; `rejected` if
  `isPolicyOrContract` is false (F-READ-4). `docType` outside the six tuned types → `other`.
- Very long documents: process in page windows of 40. The windows are joined before the
  post-check, which numbers the clauses, so IDs are unique without an offset.
- The page count comes from the files (PDF page tree, or the number of images), not from
  the model. Files reach the model through the Gemini Files API and are deleted from it
  after the call.

### 5.2 RuleExtractor (agent, Pro, three calls)

- Call 1 → `FactSchema`. Input: clauses, the pack's "facts worth looking for", the user's
  role. Code puts the five base facts first and drops a proposed fact that repeats a key
  or does not fit its own definition.
- Call 2 → `Rule[]`. Input: clauses, fact schema, rule schema, worked examples, user's role.
  The model never chooses a rule ID; code numbers the rules `r-001` onwards.
- The model gets the condition tree written out to three levels. For the recursive
  `Condition` schema Gemini returns an empty answer with no error.
- Post-check in code (`pipeline/rule-check.ts`, F-RULE-1, F-RULE-2): clause IDs that do
  not exist are removed from a rule, and a rule left with none is discarded; every `fact`
  in `when` must be a key of the fact schema with a value of the right type.
- Invalid rules are sent back once, in one call, with the reason for each. What still
  does not fit is demoted to `unmodeled` and kept with its summary and clauses (F-RULE-3),
  also when none of the facts it names is real. If the repair made a rule worse (no
  summary, no real clause), the rule as it was first written is demoted instead. If no
  rule is left, the stage fails.
- The answer to each call only has to be a list. Every fact and every rule in it is
  checked on its own, so one entry that does not fit does not cost the others. A fact key
  must be a camelCase name, and at most 35 proposed facts are kept.
- Time limits per call: facts 100 s, rules 240 s, repair 120 s. The stages of the
  confirm request must end within 850 s; the fuzzer gets what these calls leave of it
  (5.3).
- An `unmodeled` rule lists in `touches` only facts about that clause alone, and none
  when there is no such fact: stage 4 of `evaluate()` answers `undetermined` as soon as
  one touched fact is not neutral. A clause with a fixed amount, percentage or number of
  days is written as a rule (a deductible as `deduct`, an annual limit as `cap`), not as
  `unmodeled`.
- An `exclusion`, `condition` or `deadline` whose condition is true when every fact has
  its neutral value is invalid: it would make every scenario end badly. A `limit` or a
  `charge` may be true there, because a deductible is taken from every claim.
- Known gap: `daysSinceStart` is 0 when nothing happened, so a waiting period on an
  illness is true at neutral, fails this check and is kept as `unmodeled`. Scenarios it
  touches end `undetermined`.

### 5.3 ScenarioFuzzer (agent, Flash, six calls)

- Six calls side by side, none with a tool. Five return whole scenarios, one per
  strategy (baseline, overlap, definition, procedure, combination). Input: rules (ID,
  kind, summary, condition, the facts each touches), fact schema, the pack's seeds for that strategy, the user's
  role. The output schema is built from the fact schema of the document, so the model is
  asked for a value for every fact by name and type.
- Boundary scenarios are built in code (`pipeline/boundary.ts`): for a rule
  `daysSinceStart < 30`, code emits the facts for 29, 30 and 31. If the comparison is a
  member of an `all` group at the top of the condition, the other comparisons of that
  group are set so that they hold; otherwise a compound rule would never apply at its own
  boundary. Every other fact is `neutral`. Under `any` and `not` all other facts are
  `neutral`. The step is 1 for every unit, and at most 5 thresholds are used, rules
  against the user first. The sixth call gets these situations in words and returns only
  the story, the frequency and the stake.
- A call may take what is left of the 850 s of the request when the stage starts, less
  the 150 s kept for the judge and the wording (5.5, 5.7), at
  least 90 s and at most 240 s. The earlier calls seldom use their whole limit, and at a
  fixed 90 s the baseline call did not answer in 1 live run of 3. A call that fails or
  does not answer in time is logged and the stage goes on with the others.
- Post-check and selection in code (`pipeline/scenario-check.ts`): a scenario is dropped
  if it does not parse, has no story or one over 600 characters, lacks a fact or has one
  the schema does not have, has a value of the wrong type, or targets a rule that does
  not exist. Scenarios with the same value for every fact become one, with the targets
  of both. Above the cap of 40 the order of keeping is: up to 4 baseline scenarios; every
  boundary scenario, because one says something only next to its two neighbours; then
  the first scenario of each rule against the user that has none yet (F-FUZZ-3); then one
  of each strategy in turn. Code numbers what is kept `s-001` onwards.
- Fewer than 20 scenarios is logged and the run goes on; none fails the stage. A rule
  against the user that no scenario tries is logged by ID.

The `running` stage then calls `evaluate()` for every stored scenario, writes the outcome
into the scenario document and the four result counts into the analysis.

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
- Output: `{ result, reason }` per scenario, batched. `reason` is at most 300 characters,
  and the report runs it through the neutral check (5.7) before showing it.
- The input is built by one function, `judgeInput()` in `agents/expectation-judge.ts`,
  and a test fails when it holds anything else. The description of the document is made by
  code from the document type and the country; the title and the names of the parties are
  not passed, because they can say more than the kind of document does.
- Batches of 10 scenarios run side by side, 90 s each (with 20, a call did not always
  answer in time). An answer is kept if it parses and
  is for a scenario of its batch. A batch that fails is logged, and its scenarios have no
  expectation, so they are not traps by expectation. If no scenario at all has one, the
  stage fails: a report without traps would say the document is fine.
- `counts.judged` is the number of scenarios with an expectation. When it is below
  `counts.scenarios` the grade may be too good, so the stage stores a confidence of
  `medium` at best. The cap is in the stage and not in `score()`, which sees only what
  was judged.

### 5.6 LegalResearcher (agents, Flash search, Pro assessment)

`lookUpLaw()` in `legal/research.ts` runs once per **deciding rule** of a `bad` or
`partly_bad` scenario (deduplicated), the rules deciding the most such scenarios first,
`limits.law.atOnce` at a time, after the ExpectationJudge: side by side, every call slowed
and judge batches did not answer in 90 s (eval of 2026-10-14). A rule not done by the request
deadline minus the wording call is `lookup_unavailable`. Each finding is written to
`findings/{ruleId}` as soon as it exists. Skipped entirely when the jurisdiction has no
allowlist (`meta.lawChecked = false`, F-READ-6).

Allowlist (`config.ts`), confirmed by the fetch spike in [ADR 4](./adr/0004-legal-source-fetch.md):

| Jurisdiction | Official sources                                                      |
| ------------ | --------------------------------------------------------------------- |
| ID           | `peraturan.go.id`, `peraturan.bpk.go.id`, `jdih.*.go.id`, `ojk.go.id` |
| SG           | `sso.agc.gov.sg`, `mas.gov.sg`, `mom.gov.sg`                          |
| AU           | `legislation.gov.au`, `asic.gov.au`, `fairwork.gov.au`                |

Steps:

1. **Search** (`legal/search.ts`). Flash with the Google Search tool, thinking low (15 to
   21 s instead of 37 to 115 s), no schema (ADR 3). The input, built by `searchInput()`,
   is the rule summary, its kind, the kind of document, the user's role and the country,
   plus `site:` for each allowlisted host. Source URLs come from the grounding metadata;
   each grounding redirect is resolved by reading its `Location` header, never followed.
   Results whose host is not on the allowlist are discarded (F-CMP-5); at most
   `limits.law.pagesPerRule` (3) pages are kept.
2. **Fetch** (`legal/fetch.ts`). For each URL: read `lawPages` first (used while under 30
   days old); on a miss, HTTP GET with browser-like headers, redirects followed only while
   they stay on the allowlist, 20 s timeout, 5 MB cap. HTML is stripped to text in code;
   a PDF is read in code with `unpdf`, which covers the Indonesian statutes on
   `peraturan.bpk.go.id`. A page with under 1,000 characters (an error, a metadata page,
   or a firewall that answers 200, as `ojk.go.id` does) is read with the URL context tool
   instead (`readLawPage()`, on `@google/genai` because ADK drops the URL context
   metadata); its text is used only when the retrieval status is a success and the answer
   did not end in `RECITATION`, and is stored with `via: 'url_context'`. A page that
   cannot be fetched again keeps its old text.
3. **Assess.** Pro, no tools, `LegalAssessment` schema, given the same input as the search
   and the page texts: `{ status, reasoning, citations: [{ instrument, section, quote, url }] }`.
   The pages share a budget of 1.5 million characters, in the order found: s 117 of the
   Fair Work Act starts at character 393,000 of one page, and the whole page took 38 s.
4. **Verify** (`legal/verify.ts`, F-CMP-4). Quote and page text are normalised (NFKC,
   case, punctuation and symbols removed, whitespace collapsed). A citation is kept only
   when its URL is one of the pages given to the assessment that we fetched ourselves
   (`via: 'fetch'`), its host is allowlisted, and the quote, at least 30 normalised
   characters, is a substring of the stored text. A page read with the URL context tool
   is the model's own copy: it informs the assessment but never verifies a quote. A
   finding left with no citation becomes `no_finding`.

If the search, every page or the assessment fails, or the deadline passes, the finding is
`no_finding` with `error: 'lookup_unavailable'` and the pipeline continues; the report
offers "Check the law again" (section 4, retry). A search that finds no allowlisted page
is `no_finding` with no error.

The document's own text never reaches the lookup; only the rule summary does.

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
- Trap titles and "what you can do" text are written by one final Flash call (60 s) from
  the structured trap data: the deciding rule and up to two example scenarios per trap.
  The numbers above are never produced by the model; only `title` and `action` are read
  from its answer. `action` is questions to ask the other party. Where to get help (F-REP-4) is a fixed
  list per law-checked country and document type in the dashboard
  (`features/report/help.ts`), shown on critical and high traps.
- The traps, the grade and the confidence are stored before that call. If it fails, the
  analysis is still `done` and `title` and `action` stay null; the report shows the rule's
  summary instead.
- Neutral wording (F-REP-7) is asked for in the instruction and checked by code: a title
  or an action with an accusing word (`ACCUSING` in `agents/trap-writer.ts`) is stored as
  null. So is one with a number that is not in what the model was told about that trap:
  the numbers of a trap come from code, never from the model.

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

In v1.0.1 the law store is not built up front. It fills as a side effect of analyses. R5 replaces
the plans below with a curated corpus: statutes chunked by Bab, Pasal, Ayat and huruf, stored with
versions and statute links in Cloud SQL for PostgreSQL, and searched by citation, full text and
vectors with reciprocal rank fusion.

| Stage             | What                                                                                                                                                                                                                                      | Status                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Page cache        | `lawPages` keyed by URL hash. Saves the fetch on every later analysis that cites the same page. Entries older than 30 days are refetched.                                                                                                 | Built                     |
| Finding reuse     | Embed each **verified** finding (rule summary + document type + jurisdiction). Before searching, vector-search prior findings; on a close match, reuse its citations and re-run only the assess and verify steps against the cached page. | Dropped for the R5 corpus |
| Managed retrieval | Vertex AI Search over the allowlisted sites.                                                                                                                                                                                              | Dropped for the R5 corpus |

Only text from official sources is stored, with its URL. Check each site's reuse terms
during the day-1 spike.

## 7. Front end

### dashboard (the product)

- Shell: layout, theme, error pages, `@repo/ui`, TanStack Router, React Query, Zustand,
  Vitest setup.
- Features: `auth` (Google button, route guard on `_authenticated`), `upload`,
  `analysis` (confirm, run tracker, report, trap detail), `rules` (how we read your
  document), `history`.
- Data: Firebase JS SDK. The analysis document and its sub-collections are read with live
  Firestore listeners (`useAnalysis`, `useSubcollection`), so the run tracker, report and
  trap detail update without a reload; API calls go through one small `api.ts` client that
  attaches the ID token.
- Screens: `/` asks the document type and country (`components/document-fields.tsx`,
  shared with the confirm screen) before the upload; `/analyses/$id` is the confirm step,
  the run tracker (`run-tracker.tsx`), the report (`features/report/report-view.tsx`) or a
  failed stage with retry, by status; `/analyses/$id/traps/$trapId` is the trap detail.
  Clause links point at `/analyses/$id/rules#<clauseId>`.
- UI strings live in `apps/dashboard/src/i18n/locales/en.json` and `id.json`, both translated.
  The parity test keeps their keys identical.

### web (landing)

- Content per F-LAND. Primary button links to the dashboard URL (`NEXT_PUBLIC_APP_URL`).

## 8. Infrastructure and deployment

Commands below are a starting point written from memory; check flags against current
`gcloud` and `firebase` documentation when running them.

### From-zero setup (day 0)

```bash
gcloud projects create safely-ink-<suffix> && gcloud config set project safely-ink-<suffix>
gcloud billing projects link safely-ink-<suffix> --billing-account <ACCOUNT>
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com firestore.googleapis.com firebase.googleapis.com \
  firebasestorage.googleapis.com identitytoolkit.googleapis.com
firebase projects:addfirebase safely-ink-<suffix>
gcloud firestore databases create --location=asia-southeast2
# Firebase console: enable Google sign-in; create web app; create Storage bucket
# AI Studio: create API key in this project
printf '%s' "$GEMINI_API_KEY" | gcloud secrets create gemini-api-key --data-file=-
```

Region: `asia-southeast2` (Jakarta) for Cloud Run and Firestore. The upload bucket,
`safely-ink.firebasestorage.app`, is in US-EAST1. R3 creates one in asia-southeast2.

### Deploy

```bash
# API: build the image from apps/api/Dockerfile with the repo root as context, then
gcloud run deploy api --image <IMAGE> --region asia-southeast2 \
  --timeout 900 --memory 1Gi --concurrency 4 --min-instances 0 --max-instances 5 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest --allow-unauthenticated
# Dashboard, rules and the Firestore index
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
- Per-call model timeout (`limits.modelCallSeconds`); a stage fails when a call times out.
  There is no retry: a second wait does not fit in one request next to the first.
- The law lookup: `limits.law` (rules at once, pages per rule, 5 MB and 20 s per page,
  30 days in `lawPages`) and 1.5 million characters of pages per assessment. The fuzz
  stage leaves the comparing the longer of the judge and one lookup, plus the wording.

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

| Shortcut                          | Ceiling                                                            | Upgrade path                                                 |
| --------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| Run inside the HTTP request       | One run per request, 900 s                                         | Cloud Tasks and a worker service (R2)                        |
| AI Studio key                     | Lower rate limits, key management                                  | Vertex AI with service-account auth (R3)                     |
| Fact schema invented per document | Two analyses of similar documents are not directly comparable      | Canonical fact library per pack, mapped from derived schemas |
| Flat condition language           | Discretion, vagueness and multi-step procedures are `unmodeled`    | Richer rule language; LLM adjudicator for unmodeled rules    |
| Search grounding for law          | May miss the relevant article, and depends on site availability    | The R5 corpus                                                |
| Whole pages to the assessment     | Cost and time grow with page length (338,000 tokens for one Act)   | Send the passages around the section the search named        |
| URL context for blocked hosts     | The model's copy is context only: a blocked host gives no citation | Fetch through an allowed route, or drop such hosts           |
| Hand-tuned grade weights          | Not validated                                                      | Calibrate against labelled documents                         |
| English-only report text          | The interface is in Indonesian, the generated findings are not     | Indonesian report text (R6)                                  |

### Known faults

A Codex review found these four on 2026-10-18, and each was confirmed in the code. R0 fixes them.

1. `apps/api/src/engine/evaluate.ts:104-116` treats any benefit that fires as the one the scenario
   targets, so an unrelated benefit can hide a denial.
2. `evaluate.ts:115-122` returns as soon as a denial fires, so the unmodeled check at line 124 never
   runs for that scenario. `apps/api/src/legal/research.ts:86` looks up only rules that decided a
   bad outcome, so a discretionary clause can escape both the run and the law check.
3. `apps/api/src/legal/verify.ts:66` keeps the legal status when any one quote survives, even if the
   decisive quote failed.
4. `apps/api/src/engine/score.ts:119` sets confidence without looking at rule coverage.

## 13. Open technical questions

1. Resolved in [ADR 3](./adr/0003-agent-framework.md): agents run on `@google/adk`;
   search and structured output are separate calls; fan-out is plain concurrent calls.
2. Resolved in [ADR 4](./adr/0004-legal-source-fetch.md): direct fetch works for SG and
   AU with browser-like headers; Indonesian statutes are fetched as the official PDFs and
   read with `unpdf`. The URL context tool is only the fallback for a blocked or short
   page, and its text never verifies a quote.
3. Resolved: the landing page builds and deploys on Firebase App Hosting from release tags
   (`.github/workflows/release.yml`).
4. Whether Cloud Tasks and Cloud SQL run in asia-southeast2, checked at the start of R2 and R5.
5. Whether the `pg_textsearch` BM25 preview is available on Cloud SQL in asia-southeast2 (R5).
6. Which Gemini model IDs Vertex AI serves in asia-southeast1 for the Pro and Flash roles (R3).
