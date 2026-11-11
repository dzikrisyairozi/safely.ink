# Where safely.ink goes next

|         |                                                                                                                                                                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status  | Living document                                                                                                                                                                                                                                                                                                                                   |
| Date    | 2026-11-11                                                                                                                                                                                                                                                                                                                                        |
| Related | [PRD](./PRD.md) · [FSD](./FSD.md) · [TSD](./TSD.md) · [Literature review](./research/2026-10-18-literature-review.md) · [Market](./research/2026-10-18-market-and-competitors.md) · [Technical stack](./research/2026-10-18-technical-stack.md) · [Plan refresh](./research/2026-11-11-plan-refresh.md) · [Flow](./FLOW.md) · [Setup](./SETUP.md) |

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

## Where we are on 2026-11-11

Version 1.0.1 is deployed and is what users get. A user signs in with Google, uploads a PDF or photos of pages, confirms the document type, country and their role, and watches the run. Gemini reads the clauses and writes rules, about 40 scenarios run through the deterministic engine, a blinded judge gives the reasonable person's expectation, and Indonesian law is looked up with quotes checked against the fetched page.

`staging` is ahead of it and has no release yet:

| Milestone       | State on `staging`                                                                                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R0 Engine fixes | Done (#49). The four faults are fixed with tests, each stage records its versions, grades are capped when a rule goes untested, and generated text passes a writing filter                                                                                    |
| R2 Durable runs | Part 1 is done (#51): model calls are cancelled at their limit, each call is logged with tokens and cost. Part 2, Cloud Tasks with leases, stop and stall recovery, is done (#53), behind settings that production has not set. The budget pause is not built |
| Docs            | The FSD, TSD, runbook and ADRs pass `pnpm lint:prose` (#50)                                                                                                                                                                                                   |

Some things have not been shown. Nobody has walked the FSD acceptance criteria end to end, and issue #16 is still open. There is no labelled document set and no `docs/eval.md`, so the accuracy targets have no measurement behind them. Cloud Tasks has only run against mocks, because the queue and worker need the setup in `docs/runbook.md`.

Weaknesses still open:

- `peraturan.bpk.go.id` blocks Cloud Run, and 8 of 13 law lookups were unavailable in one live Indonesian run. R5 fixes this with our own corpus.
- Boundary scenarios step by 1 even for rupiah amounts (R7).
- The upload bucket is in US-EAST1, reports have no expiry, and the privacy page has `[TBD]` fields (R3).
- `staging` is a branch with no environment behind it, and the custom domains are not live (R4).
- Neither Gemini model in use is listed for processing in Singapore, and our calls still set a parameter Google will reject in a future release. The [plan refresh](./research/2026-11-11-plan-refresh.md) has both.

The honest claim today is a working demo on an Indonesian insurance policy, with legal findings that may be partial and no accuracy figures.

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

| Horizon             | ID  | Milestone                                                       | Needs                               | Depends on      |
| ------------------- | --- | --------------------------------------------------------------- | ----------------------------------- | --------------- |
| H1 Trustworthy core | R0  | Engine fixes                                                    | Code                                |                 |
| H1                  | R1  | Evaluation foundation                                           | Code for tooling, people for labels | R0              |
| H1                  | R2  | Durable runs                                                    | Code                                |                 |
| H1                  | R3  | Data protection                                                 | Decisions, counsel                  |                 |
| H1                  | R3m | Singapore model move                                            | Code, GCP access                    | R1 smoke        |
| H1                  | R4  | Staging environment                                             | GCP access                          | R2              |
| H1                  | R13 | Verification layer with Jev (ADR 5), offline first              | Code, the owner's key, R1 for gates | R1 tooling      |
| H2 Indonesian depth | R5  | Indonesian legal corpus                                         | Code, a legal check of the corpus   | R1              |
| H2                  | R6  | Counsellor-style intake                                         | Code                                | R0              |
| H2                  | R7  | Consumer-finance packs and the reviewed ceiling check           | Code, counsel for the ceiling rules | R0, R1, R5, R6  |
| H2                  | R8  | Clause highlighting                                             | Code                                | R0              |
| H3 Act on findings  | R9  | Referral with an evidence packet                                | Code, partner directory             | R6              |
| H3                  | R10 | Document comparison                                             | Code                                | R7              |
| H3                  | R11 | After-the-fact mode and complaint drafts                        | Code, counsel                       | R6, R5          |
| H3                  | R12 | Two-party and defect analysis, graded and party-bias warnings   | Code                                | R1, R5          |
| H4 Reach            | R14 | Counsel review and public launch                                | People                              | R1, R3, R3m, R4 |
| H4                  | R15 | B2B design partner                                              | People                              | R12             |
| H4                  | R16 | Lawyer-reviewed rewording library                               | People                              | R12             |
| H4                  | R17 | Published Indonesian benchmark and reviewed product comparisons | People                              | R1, R14         |
| H5 Region           | R18 | Standard-contract regimes in Thailand and Vietnam               | People                              | R17             |

```
R0 ─┬─ R1 ─┬─ R3m
    │      ├─ R13 offline
    │      └─ R5 ─┬─ R7 ── R10
    │             ├─ R11
    │             └─ R12 ─┬─ R15
    │                     └─ R16
    ├─ R6 ─┬─ R9
    │      └─ R11
    └─ R8
R2 ── R4
R3, R3m ────────── R14 ── R17 ── R18
```

R14 also waits for R1 and R4, and R7 for R6, as the table says. R13's first live phase waits for R1's gate, R2, R3, R5 and R6.

### R0 Engine fixes

Done on `staging` in #49, and released with the next tag.

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
data. Report citations in three columns: the quote exists, the quote supports the claim, the provision
applies.

Perturbation tests start first, because their regression half needs no annotators. Take public Indonesian agreements, make a known edit, and state the expected relation: code checks amounts, extraction and engine outcomes, reviewed expectations cover legal status, and irrelevant edits and legally equivalent paraphrases must change nothing. Role-swapped pairs test the judge for a lean toward the drafter only where the swap keeps the law the same. Each case runs several times. A small smoke set from these gates every model change.

Add a rating on each report and each trap inside the app, which is the user satisfaction
measure.

### R2 Durable runs

Model calls now cancel at their limit through ADK's `runAsync`, and each call logs its tokens and cost and adds them to the analysis. Each stage can run as a named Cloud Task on a worker, under a Firestore lease with a run generation, and a user can stop a run or recover one that stopped responding. The queue and worker still have to be created (`docs/runbook.md`). Part 3 is the budget: a billing budget alert does not stop spending, so the budget publishes to Pub/Sub and a small endpoint pauses new analyses. Cloud Run's instance cap stays as the ceiling.

### R3 Data protection

Set retention for reports, usage counters and logs, and fill the `[TBD]` fields on the privacy
page with a named operator. Decide between Cloud KMS keys and field-level encryption for clause
text. Create an upload bucket in asia-southeast2 and expire or move the US-EAST1 objects. Record
consent for each processing purpose, and write a data protection impact assessment against UU PDP
and its implementing regulation, PP 33/2026, which takes full effect on 2027-01-16. R3m moves model calls from the AI Studio key to Vertex AI in asia-southeast1, because Vertex does
not serve Gemini in Jakarta. The residency table lists `gemini-4-argon` and `gemini-3.5-flash` for
Singapore, so it is also a model change. It runs against the R1 smoke set first, and confirms the
exact models, the regional endpoint, PDF reading, structured output, grounding and the URL context
call on Vertex. Contract text leaves Indonesia on every model call, and Google
Search grounding keeps what it is sent for up to three days, so both go to counsel as
transfers.

### R4 Staging environment

Create a `safely-ink-staging` project that mirrors production, deploy it from the `staging`
branch through Workload Identity Federation, and seed it with test data only. Changes reach
production only after they have run on staging.

### R5 Indonesian legal corpus

Ingest the consumer-finance instruments first: UU 8/1999 on consumer protection, POJK 22/2023,
POJK 40/2024 on online lending with SEOJK 19/SEOJK.06/2025, which sets its daily cost ceilings, POJK 46/2024 on finance
companies as amended by POJK 35/2025, UU 27/2022 on personal data and its
implementing regulation, and Book III of the Civil Code. Insurance follows. Instrument numbers
and amendment status are confirmed against the official text at ingest. Chunk by Bab, Pasal, Ayat
and huruf with the parent text, definitions and Penjelasan attached, and store each version with
dates and a source hash.

Store the corpus in Cloud SQL for PostgreSQL 17 with pgvector, behind a retrieval interface. Search
with exact citation lookup, BM25 and dense vectors fused by reciprocal rank, filtered by date and
sector. Compare Gemini embeddings with BGE-M3 on our own queries, and add a reranker only if it
measures better, with Jev (ADR 5) as a candidate. Statute links (amends, repeals, implements, interprets) are rows in the same
database. Google Search grounding stays only to find sources the corpus lacks.

### R6 Counsellor-style intake

Replace the single upload form with structured questions in the order a legal aid intake uses:
country, document type, signed or not, the user's role, the counterparty and whether OJK licenses
it, amounts and dates, and urgency. Capture an event timeline for users who are already in
trouble. Questions are radio buttons and fields, with no open chat. The product asks a question when
it is unsure, and does not guess. Report text is written in Indonesian for users of the Indonesian
interface.

### R7 Consumer-finance packs

Add packs for multifinance, paylater and online loans with cash-flow facts: principal, tenor,
schedule, fees, late charges and early repayment terms. Where the law states a number, code does the arithmetic from a dated table of the SEOJK 19/SEOJK.06/2025 ceilings, reviewed by counsel. It classifies each charge, states its assumptions, returns `indeterminate` when a fact is missing, and reports a breach as `conflicts` only under a reviewed rule whose applicability is established. The [plan refresh](./research/2026-11-11-plan-refresh.md) lists the conditions. Accept a repayment schedule or offer
screenshot as input. Keep a versioned registry of recognised templates so a known contract
reuses reviewed rules and only the personal figures are recomputed.

### R13 Verification layer with Jev

The quote check proves a citation exists. Jev, a fast model that returns typed probabilities, adds two checks it misses: does the passage support the claim, and does the provision apply here. [ADR 5](./adr/0005-jev-verification-cascade.md) has the design. Code still decides every outcome, and a Jev answer can add caution and never remove it. It starts offline on public or consented documents, and each action goes live only after passing a stated error bound on Indonesian labels. Later phases rerank statute passages (R5), flag clauses that no rule covers, which is the false reassurance the PRD names, and measure the judge's lean (R12). Anything that sends contract-derived text waits for masking and agreed processing terms.

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
decisions, whether contract-derived text may go to TypeSafe, Indonesian counsel, legal annotators, a
named operator entity, about 100 agreements with a clear right to use, and one design partner.

## The earlier to-do list

| Item                                                           | Where it lands                                                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Research                                                    | The two documents in `docs/research/`, and R1 for the benchmark                                                                             |
| 2. A flow like a real legal counsellor                         | R6, then R9 and R11                                                                                                                         |
| 3. User satisfaction rate                                      | R1 in-app ratings, with the north star above                                                                                                |
| 4. Remove every "policy police"                                | Gone from the working tree and branches. #16 deletes the old Firebase project                                                               |
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

| Date       | Decision                                                                                                        | Why                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 2026-10-18 | Law checks cover Indonesia only. Singapore and Australia keep the search-based check, unmaintained              | Depth in one jurisdiction beats thin coverage of three                                                         |
| 2026-10-18 | Consumer finance is the wedge, insurance second                                                                 | Complaint volume, a clear legal yardstick, and harm that shows up in arithmetic                                |
| 2026-10-18 | The scope grows to referral, comparison, after-the-fact help and rewording, in that order                       | Each step adds value with less legal risk than the next                                                        |
| 2026-10-18 | The law corpus goes in Cloud SQL for PostgreSQL with pgvector. Graphs are rows, with no graph database          | Small corpus, small team, and dated joins matter                                                               |
| 2026-11-11 | Jev joins as a verification layer that can add caution and never remove it, offline first                       | A wrong answer must not erase a true warning, and correctness has to be measured on Indonesian data            |
| 2026-11-11 | Model calls move to Vertex AI in Singapore on `gemini-4-argon` and `gemini-3.5-flash`, after a smoke run        | Vertex does not serve Gemini in Jakarta, and these are the models that process in Singapore                    |
| 2026-11-11 | Where the law states a number, code does the arithmetic from a reviewed, dated table and states its assumptions | The ceilings are arithmetic, the inputs around them are legal judgments, and a false pass is the worst outcome |
| 2026-10-18 | No public per-lender grades until counsel reviews publication                                                   | One lender has many products and versions, and publication carries legal risk                                  |

## Questions for Indonesian counsel

1. Which parts of complaint drafting and suggested rewording count as legal services under the
   Advocates Law after MK 006/PUU-II/2004?
2. What does UU PDP require for sending contract text to Gemini and to TypeSafe, both outside
   Indonesia?
3. What may we publish about a named provider's standard terms after MK 105/PUU-XXII/2024 narrowed
   Pasal 27A of the ITE Law, and which other rules still apply?
4. What must the disclaimer and the referral flow say so a user does not believe a lawyer-client
   relationship exists?
5. Does the right to object to automated processing in PP 33/2026 reach an automatically generated
   report on a user's own agreement, and what must the product offer?

## How we write

Docs, issues, commits and the product's generated text follow the house rules in `AGENTS.md`, plus
the patterns in Wikipedia's
[signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing), read on
2026-10-18. In short: plain "is" and "has", the same term for the same thing, sentences of mixed
length, a definite statement where the source supports it and a real "perhaps" where it does not.
No puffery, no "not X but Y", no trailing "-ing" analysis, no vague attribution, no hedging about
what sources might say, and every link checked before it is committed.

`pnpm lint:prose` checks `README.md` and `docs/` for dashes, semicolons, curly quotes, tracking
parameters, chatbot citation artifacts and a list of inflated words, and lint-staged runs it on
those files at each commit. The trap writer checks the product's generated text against a similar
list (`TELLS` in `apps/api/src/agents/trap-writer.ts`).
