# Where safely.ink goes next

|         |                                                                                                                                                                                                                                                                                           |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status  | Living document                                                                                                                                                                                                                                                                           |
| Date    | 2026-10-18                                                                                                                                                                                                                                                                                |
| Related | [PRD](./PRD.md) · [FSD](./FSD.md) · [TSD](./TSD.md) · [Literature review](./research/2026-10-18-literature-review.md) · [Market](./research/2026-10-18-market-and-competitors.md) · [Technical stack](./research/2026-10-18-technical-stack.md) · [Flow](./FLOW.md) · [Setup](./SETUP.md) |

## The goal

safely.ink helps people in Indonesia test how an agreement affects them before and after they
sign, compare their choices, and take reliable evidence into a clarification, a complaint or a
consultation.

The north star is the number of evidence-backed decisions per month. A decision counts when a
user confirms that a supported finding shaped an offer choice, a question to the provider, a
complaint or a consultation. We audit a sample each month, because a self-report alone does not
prove the finding caused the decision.

Three guardrails sit beside it:

1. Material-error rate. The share of reviewed reports with an unsupported consequential claim or
   a false reassurance.
2. Safe-action rate. The share of sampled complaints and referrals that went to the right channel
   with facts the evidence supports.
3. Trust-boundary breaches. Sponsor influence on findings, or sharing without consent. The target
   is zero.

## Where we are on 2026-10-18

Version 1.0.1 is deployed. A user signs in with Google, uploads a PDF or photos of pages, confirms
the document type, country and their role, and watches the run. Gemini reads the clauses and
writes rules, about 40 scenarios run through the deterministic engine, a blinded judge gives the
reasonable person's expectation, and Indonesian law is looked up with quotes checked against the
fetched page. The report, trap and rules views, history, delete, the English and Indonesian UI,
the landing page and blog, and tag-driven release CI all work.

Some things have not been shown. Nobody has walked the FSD acceptance criteria end to end, and
issue #16 is still open. There is no labelled document set and no `docs/eval.md`, so the PRD
targets (95% of rules trace to a clause, 80% of traps confirmed, 150 seconds) have no measurement
behind them.

Known weaknesses, all in issue #16 or found while writing this roadmap:

- `peraturan.bpk.go.id` blocks Cloud Run, and 8 of 13 law lookups were unavailable in one live
  Indonesian run.
- The fuzzer's baseline call timed out in 1 run of 3, and boundary scenarios step by 1 even for
  rupiah amounts.
- The run lives inside one HTTP request for up to 850 seconds, and a model call that times out
  keeps running and costs money.
- The upload bucket is in US-EAST1, reports have no expiry, and the privacy page has `[TBD]`
  fields.
- `staging` is a branch with no environment behind it, and the custom domains are not live.

Four engine and citation faults came out of a Codex review and were confirmed in the code:

- `apps/api/src/engine/evaluate.ts:104-116` treats any benefit that fires as the one the scenario
  targets, so an unrelated benefit can hide a denial.
- `evaluate.ts:115-122` returns as soon as a benefit, condition, deadline or exclusion denies the
  scenario, so the unmodeled check at line 124 never runs for it, and an unmodeled rule with no
  `touches` facts never affects any outcome. `apps/api/src/legal/research.ts:86` researches only
  rules that decided a bad outcome. A discretionary fee clause can escape both the run and the law
  check.
- `apps/api/src/legal/verify.ts:66` keeps the legal status when any one quote survives, even if
  the decisive quote failed.
- `apps/api/src/engine/score.ts:119` sets confidence without looking at rule coverage, so a run
  that never tested an exclusion can still get an A with high confidence.

For the hackathon submission the honest claim is a working demo on an Indonesian insurance
policy, with legal findings that may be partial and no accuracy figures.

## The wedge

Consumer finance first. Before signing, we start with multifinance and planned instalment
purchases, where people have time to compare offers, then move to paylater and online loans. The
first screen accepts an offer screenshot or a repayment schedule as well as a contract, and
answers concrete questions: what happens if I pay late, repay early or cancel.

Online-loan harm mostly arrives after signing, through fees and collection, so pinjol users come
in through the after-the-fact mode. Insurance is the second vertical, framed as "which
circumstances could stop payment". The reasoning and figures are in the
[market document](./research/2026-10-18-market-and-competitors.md).

The B2B line is a clause-testing and remediation workflow for one paid design partner. It is
never sold as proof of compliance with POJK 22/2023.

## Milestones

Each milestone is tagged by what it needs. "Code" means we can finish it in the repo. "People"
means labels, legal review or a partner set its pace.

| Horizon             | ID  | Milestone                                                       | Needs                               | Depends on |
| ------------------- | --- | --------------------------------------------------------------- | ----------------------------------- | ---------- |
| H1 Trustworthy core | R0  | Engine fixes                                                    | Code                                |            |
| H1                  | R1  | Evaluation foundation                                           | Code for tooling, people for labels | R0         |
| H1                  | R2  | Durable runs                                                    | Code                                |            |
| H1                  | R3  | Data protection                                                 | Decisions, counsel                  |            |
| H1                  | R4  | Staging environment                                             | GCP access                          | R2         |
| H2 Indonesian depth | R5  | Indonesian legal corpus                                         | Code, a legal check of the corpus   | R1         |
| H2                  | R6  | Counsellor-style intake                                         | Code                                | R0         |
| H2                  | R7  | Consumer-finance packs                                          | Code                                | R0, R1, R5 |
| H2                  | R8  | Clause highlighting                                             | Code                                | R0         |
| H3 Act on findings  | R9  | Referral with an evidence packet                                | Code, partner directory             | R6         |
| H3                  | R10 | Document comparison                                             | Code                                | R7         |
| H3                  | R11 | After-the-fact mode and complaint drafts                        | Code, counsel                       | R6, R5     |
| H3                  | R12 | Two-party and defect analysis, graded and party-bias warnings   | Code                                | R1, R5     |
| H3                  | R13 | Fast classifiers in shadow mode                                 | Code, a processing agreement        | R1         |
| H4 Reach            | R14 | Counsel review and public launch                                | People                              | R1, R3, R4 |
| H4                  | R15 | B2B design partner                                              | People                              | R12        |
| H4                  | R16 | Lawyer-reviewed rewording library                               | People                              | R12        |
| H4                  | R17 | Published Indonesian benchmark and reviewed product comparisons | People                              | R1, R14    |
| H5 Region           | R18 | Standard-contract regimes in Thailand and Vietnam               | People                              | R17        |

```
R0 ─┬─ R1 ─┬─ R5 ─┬─ R7 ── R10
    │      │      ├─ R11
    │      │      └─ R12 ─┬─ R15
    │      │              └─ R16
    │      └─ R13
    ├─ R6 ─┬─ R9
    │      └─ R11
    └─ R8
R2 ── R4
R3 ─────────────── R14 ── R17 ── R18
```

### R0 Engine fixes

Scope the benefit check to the targeted benefit. Evaluate unmodeled rules even when a denial
fires, and send risk-bearing clauses to the law check whether or not they decided an outcome.
Verify each legal claim against its own quotes and reassess the status on the quotes that
survive. Make confidence and the grade depend on rule and branch coverage, and withhold a good
grade when coverage is incomplete.

Record the model, prompt, engine and corpus versions on every analysis, so a report can be
reproduced. Add a filter on generated trap text for the writing tells listed under "How we
write", next to the existing `ACCUSING` filter in `apps/api/src/agents/trap-writer.ts`. Delete
the stale branch `feat/7-upload-read-confirm`, the last place the old "policy police" name and
Firebase project survive outside git history.

### R1 Evaluation foundation

Write an annotation guide in Bahasa Indonesia, using UNFAIR-ToS categories mapped to UUPK Pasal
18, POJK 22/2023 and UU PDP. Collect about 100 agreements with a clear right to use them, across
multifinance, paylater, online loans, insurance, employment and rental, including ordinary
contracts with no dispute. Two legal annotators label independently and a third adjudicates, and
agreement is reported with Krippendorff's alpha. Lay raters give the reasonable-person
expectations separately.

Split by provider and template family so near-copies do not leak between train and test, and
freeze a hidden test set. Extend `apps/api/scripts/eval.ts` to score extraction recall, citation
support, trap precision, false reassurance and abstention, and publish results in `docs/eval.md`.
Add adapters for CUAD, ContractNLI, UNFAIR-ToS and CLAUSE so each layer can be tested on public
data. Add a rating on each report and each trap inside the app, which is the user satisfaction
measure.

### R2 Durable runs

Move pipeline stages to Cloud Tasks workers with leases, attempt IDs and idempotent writes, and
recover expired leases. Cancel model calls on timeout: ADK's `runEphemeral` takes no abort
signal, so agent calls move to `runAsync`, which does. Log JSON with analysis ID, stage, duration,
model and token counts, never document text, and keep a cost figure per analysis. A budget alert
does not stop spending, so the budget publishes to Pub/Sub and a small function pauses new
analyses. Cloud Run's instance cap stays as the ceiling. Several of these tasks are carried over from #16.

### R3 Data protection

Set retention for reports, usage counters and logs, and fill the `[TBD]` fields on the privacy
page with a named operator. Decide between Cloud KMS keys and field-level encryption for clause
text. Create an upload bucket in asia-southeast2 and expire or move the US-EAST1 objects. Record
consent for each processing purpose, and write a data protection impact assessment against UU PDP
and its implementing regulation, PP 33/2026, which takes full effect on 2027-01-16. Move model
calls from the AI Studio key to Vertex AI in asia-southeast1, because Vertex does not serve
Gemini in Jakarta. Contract text therefore leaves Indonesia on every model call, and Google
Search grounding keeps what it is sent for up to three days, so both go to counsel as
transfers.

### R4 Staging environment

Create a `safely-ink-staging` project that mirrors production, deploy it from the `staging`
branch through Workload Identity Federation, and seed it with test data only. Changes reach
production only after they have run on staging.

### R5 Indonesian legal corpus

Ingest the consumer-finance instruments first: UU 8/1999 on consumer protection, POJK 22/2023,
POJK 40/2024 on online lending with the OJK circulars that set its daily cost ceilings, POJK 46/2024 on finance
companies as amended by POJK 35/2025, UU 27/2022 on personal data and its
implementing regulation, and Book III of the Civil Code. Insurance follows. Instrument numbers
and amendment status are confirmed against the official text at ingest. Chunk by Bab, Pasal, Ayat
and huruf with the parent text, definitions and Penjelasan attached, and store each version with
dates and a source hash.

Store the corpus in Cloud SQL for PostgreSQL 17 with pgvector, behind a retrieval interface. Search
with exact citation lookup, BM25 and dense vectors fused by reciprocal rank, filtered by date and
sector. Compare Gemini embeddings with BGE-M3 on our own queries, and add a reranker only if it
measures better. Statute links (amends, repeals, implements, interprets) are rows in the same
database. Google Search grounding stays only to find sources the corpus lacks.

### R6 Counsellor-style intake

Replace the single upload form with structured questions in the order a legal aid intake uses:
country, document type, signed or not, the user's role, the counterparty and whether OJK licenses
it, amounts and dates, and urgency. Capture an event timeline for users who are already in
trouble. Questions are radio buttons and fields, with no open chat. The product asks a question when
it is unsure, and does not guess.

### R7 Consumer-finance packs

Add packs for multifinance, paylater and online loans with cash-flow facts: principal, tenor,
schedule, fees, late charges and early repayment terms. Accept a repayment schedule or offer
screenshot as input. Keep a versioned registry of recognised templates so a known contract
reuses reviewed rules and only the personal figures are recomputed.

### R8 Clause highlighting

Store character offsets and page boxes for each clause, and show the exact span in a PDF viewer
when a user opens a finding.

### Later milestones

R9 exports an evidence packet (source clauses, document version, scenario assumptions, open
questions and legal passages, with the user's own statements kept apart) and routes it to LBH,
Posbakum or a lawyer marketplace by location, subject and eligibility.

R10 runs two offers, or a brochure and its fine print, through the same scenarios and shows where
the consequences differ.

R11 takes an event timeline and drafts a factual complaint to the provider's own complaint
channel first. If that fails, an eligible dispute goes to LAPS SJK, which accepts cases directly or
through OJK's APPK portal ([OJK FAQ](https://ojk.go.id/id/kanal/edukasi-dan-perlindungan-konsumen/pages/lembaga-alternatif-penyelesaian-sengketa.aspx)).
Reporting a provider to OJK is a separate path from resolving the dispute. Reports about
unlicensed lenders go to SIPASTI. The user reviews and sends it.

R12 moves the engine to one shared event model evaluated for both parties, runs alternative
readings of ambiguous clauses, searches for contradictions, checks omissions against per-type
lists and names the defects. It shows three scales on every finding: legal status (likely void,
open to dispute, lawful but harsh), the gap from expectations, and confidence. A party-bias
indicator shows whose interest each finding and each suggestion serves, and mirrored scenarios
test our own judge for a lean toward the drafting party.

R13 runs Jev beside Gemini on passage relevance, quote support and sole-discretion detection,
logged only, until calibration on R1 data shows it helps.

R14 to R18 are the launch with counsel's sign-off and the PSE registration with Komdigi, the B2B design partner, a rewording library
reviewed by lawyers, the published Indonesian benchmark with reviewed product comparisons, and
regional expansion.

## What to prepare

The full checklist is in [SETUP.md](./SETUP.md), grouped by the development machine, GitHub,
Google Cloud, outside accounts, data, people and decisions, with the milestone that first needs
each item and a "ready to start" row per milestone. The path a user and a request take through
the finished product is in [FLOW.md](./FLOW.md), and the technology chosen for each milestone is
in the [technical stack note](./research/2026-10-18-technical-stack.md).

The items that only you can supply are a monthly budget ceiling, the encryption and bucket
decisions, whether user documents may go to TypeSafe, Indonesian counsel, legal annotators, a
named operator entity, about 100 agreements with a clear right to use, and one design partner.

## The earlier to-do list

| Item                                                           | Where it lands                                                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Research                                                    | The two documents in `docs/research/`, and R1 for the benchmark                                                                             |
| 2. A flow like a real legal counsellor                         | R6, then R9 and R11                                                                                                                         |
| 3. User satisfaction rate                                      | R1 in-app ratings, with the north star above                                                                                                |
| 4. Remove every "policy police"                                | Gone from the working tree. R0 deletes the last stale branch, and #16 deletes the old Firebase project                                      |
| 5. Clauses that work against the user, labelled by us          | R1 gold set, R12 two-party analysis                                                                                                         |
| 6. A benchmark dataset                                         | R1, published in R17                                                                                                                        |
| 7. Launch                                                      | R14                                                                                                                                         |
| 8. Is all data encrypted                                       | R3. Today only Google's default encryption at rest applies                                                                                  |
| 9. Warn on a spectrum                                          | R12: three graded scales, plus the party-bias indicator                                                                                     |
| Which documents first                                          | Multifinance and instalment offers, paylater, online loans, then insurance, then employment and rental, then app terms and privacy policies |
| User flow first: country, document type, metadata, identifiers | R6                                                                                                                                          |
| Knowledge base                                                 | R5                                                                                                                                          |
| Update staging first                                           | R4, and the existing rule that feature branches target `staging`                                                                            |

## Decisions

| Date       | Decision                                                                                               | Why                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 2026-10-18 | Law checks cover Indonesia only. Singapore and Australia keep the search-based check, unmaintained     | Depth in one jurisdiction beats thin coverage of three                                               |
| 2026-10-18 | Consumer finance is the wedge, insurance second                                                        | Complaint volume, a clear legal yardstick, and harm that shows up in arithmetic                      |
| 2026-10-18 | The scope grows to referral, comparison, after-the-fact help and rewording, in that order              | Each step adds value with less legal risk than the next                                              |
| 2026-10-18 | The law corpus goes in Cloud SQL for PostgreSQL with pgvector. Graphs are rows, with no graph database | Small corpus, small team, and dated joins matter                                                     |
| 2026-10-18 | Jev runs in shadow mode only, and nothing is decided by vote                                           | Typed output is a format guarantee. Correctness has to be measured                                   |
| 2026-10-18 | Model calls move to Vertex AI in asia-southeast1 (Singapore)                                           | Vertex does not serve Gemini in Jakarta, and a regional endpoint keeps processing in one known place |
| 2026-10-18 | No public per-lender grades until counsel reviews publication                                          | One lender has many products and versions, and publication carries legal risk                        |

## Questions for Indonesian counsel

1. Which parts of complaint drafting and suggested rewording count as legal services under the
   Advocates Law after MK 006/PUU-II/2004?
2. What does UU PDP require for sending contract text to Gemini and to TypeSafe, both outside
   Indonesia?
3. What may we publish about a named provider's standard terms after MK 105/PUU-XXII/2024 narrowed
   Pasal 27A of the ITE Law, and which other rules still apply?
4. What must the disclaimer and the referral flow say so a user does not believe a lawyer-client
   relationship exists?

## How we write

Docs, issues, commits and the product's generated text follow the house rules in `AGENTS.md`, plus
the patterns in Wikipedia's
[signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing), read on
2026-10-18. In short: plain "is" and "has", the same term for the same thing, sentences of mixed
length, a definite statement where the source supports it and a real "perhaps" where it does not.
No puffery, no "not X but Y", no trailing "-ing" analysis, no vague attribution, no hedging about
what sources might say, and every link checked before it is committed.
