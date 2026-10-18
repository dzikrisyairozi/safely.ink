# How to build each milestone

|         |                                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status  | Research note                                                                                                                                               |
| Date    | 2026-10-18                                                                                                                                                  |
| Related | [Roadmap](../ROADMAP.md) · [End-to-end flow](../FLOW.md) · [Setup](../SETUP.md) · [Literature review](./2026-10-18-literature-review.md) · [TSD](../TSD.md) |

This note picks the technology and the working practice for each roadmap milestone. The
vendor pages cited here were read on 2026-10-18. Two claims were also tried on this machine:
the Indonesian text search configuration and a reciprocal rank fusion query, both on the
`pgvector/pgvector:pg17` image. Package versions are the npm `latest` tags on the same day.

The rule from the TSD stands throughout: models read, propose and research, and code decides.
Nothing below moves an outcome into a model.

## The stack at a glance

| Layer             | Today (v1.0.1)                                     | Target                                                                                  | Milestone |
| ----------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- | --------- |
| Model access      | Gemini Developer API with an AI Studio key         | Vertex AI with a service account, in asia-southeast1 (Singapore)                        | R2, R3    |
| Agent runtime     | `@google/adk` 2.2.1, `InMemoryRunner.runEphemeral` | Same library, `runAsync` with an abort signal                                           | R2        |
| Run orchestration | One HTTP request held open for up to 850 s         | Cloud Tasks queue, one task per stage, a worker service on Cloud Run                    | R2        |
| Analysis store    | Firestore, asia-southeast2                         | Same, with TTL on every collection that holds user data, CMEK if R3 decides so          | R3        |
| Uploads           | Cloud Storage, US-EAST1, 7-day lifecycle rule      | A new bucket in asia-southeast2, same lifecycle                                         | R3        |
| Law corpus        | `lawPages` page cache in Firestore                 | Cloud SQL for PostgreSQL 17 with pgvector, full-text search and statute link tables     | R5        |
| Embeddings        | None                                               | `gemini-embedding-2` measured against BGE-M3                                            | R5        |
| PDF text          | `unpdf`, text only                                 | `unpdf` text items with positions, kept as character offsets and page boxes             | R8        |
| PDF viewer        | None                                               | `react-pdf-highlighter-extended` on PDF.js                                              | R8        |
| Evaluation        | `apps/api/scripts/eval.ts`, one document at a time | The same script over a gold set, Label Studio for labels, `krippendorff` for agreement  | R1        |
| Solver            | None                                               | `z3-solver` in the worker for contradiction search                                      | R12       |
| Fast classifiers  | None                                               | Jev, logged beside Gemini                                                               | R13       |
| Environments      | Production only                                    | `safely-ink-staging` and production, both deployed through Workload Identity Federation | R4        |

## Findings that change the plan

These came out of the reading and are not yet in the roadmap.

1. Vertex AI does not serve Gemini in Jakarta. The
   [generative AI locations page](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations)
   lists Singapore (asia-southeast1) as the nearest region and leaves asia-southeast2 out. The
   same page says the global endpoint "doesn't support data residency requirements". So
   contract text leaves Indonesia for every model call whichever API we use, and the UU PDP
   transfer question for counsel covers Google as well as TypeSafe. Storage can stay in
   Jakarta.
2. Grounding with Google Search keeps prompts. The
   [zero data retention page](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/vertex-ai-zero-data-retention)
   says there is no way to turn off that storage, and logs may be kept up to three days. It
   points to Web Grounding for Enterprise instead, which ADK ships as `ENTERPRISE_WEB_SEARCH`.
   Our search calls send rule summaries. A rule summary can still name a person or an amount.
3. A Cloud Tasks HTTP task may run for 30 minutes at most and defaults to 10
   ([Cloud Tasks](https://docs.cloud.google.com/tasks/docs/creating-http-target-tasks)). A
   Cloud Run request may run for 60 minutes
   ([Cloud Run timeout](https://docs.cloud.google.com/run/docs/configuring/request-timeout)).
   One task per stage fits easily. One task for a whole run would also fit today, which is a
   reason to split by stage anyway: retries then repeat only the stage that failed.
4. ADK cannot cancel the calls we make. `runEphemeral`, which `apps/api/src/agents/run.ts`
   uses, takes no abort signal in ADK 2.2.1. `runAsync` does, after a session is created.
   The direct `@google/genai` call in `legal-researcher.ts` already passes
   `abortSignal: AbortSignal.timeout(...)`. This is the code change behind the #16 item about
   timed-out calls that keep running.
5. Firestore CMEK can only be chosen when a database is created
   ([Firestore CMEK](https://docs.cloud.google.com/firestore/native/docs/cmek)). Choosing it
   for production means a new database and an export and import. Staging can start with it.
6. Firestore TTL deletes within about 24 hours of expiry and does not delete subcollections
   ([Firestore TTL](https://docs.cloud.google.com/firestore/native/docs/ttl)). Our scenarios,
   traps and rules live in subcollections, so each one needs its own `expireAt` field and its
   own TTL policy.
7. Cloud SQL now lists `pg_textsearch`, a BM25 extension for PostgreSQL 17 and later
   ([Cloud SQL extensions](https://docs.cloud.google.com/sql/docs/postgres/extensions)). Google
   announced it as a preview on 2026-09-19 with an example that fuses BM25 and vector ranks in
   SQL ([Google Cloud blog](https://cloud.google.com/blog/products/databases/native-bm25-search-in-alloydb-and-cloud-sql)).
   The built-in `ts_rank_cd` is not BM25. We start on PostgreSQL 17 so the switch is one
   index.
8. PostgreSQL ships an `indonesian` text search configuration. Tried locally, it stems
   "mengembalikan" to "embali" and loses the k of "kembali". Citations must not pass through
   it, so the search column joins an `indonesian` vector of the body with a `simple` vector of
   the citation.
9. The UU PDP implementing regulation exists. PP 33/2026 was signed on 2026-07-16 with six
   months to comply, and it has articles on transfers abroad and on impact assessments before
   high-risk processing, AI included ([Justisio summary](https://justisio.com/blog/pp-pdp-disahkan-jangan-sampai-kena-sanksi)).
   The summary is secondary. R3 reads the official text.
10. A platform that serves Indonesian users must register as a private electronic system
    operator (PSE lingkup privat) under Permenkominfo 5/2020. Komdigi warned 36 operators of
    blocking in May 2025, 23 of them unregistered
    ([detikInet](https://inet.detik.com/law-and-policy/d-7939055/daftar-36-pse-privat-terancam-diblokir-komdigi-google-dan-apple-termasuk)).
    Registration needs the operator entity from R3, so it joins R14.
11. A budget alert does not cap spending
    ([Cloud Billing budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets)). A
    budget can publish to Pub/Sub, and a small function can then stop new analyses. R2 builds
    that stop.
12. The online-lending rule the roadmap calls "the OJK rule for online lending" is POJK
    40/2024, which revoked POJK 10/2022 from 2024-12-27
    ([OJK](https://ojk.go.id/id/regulasi/Pages/POJK-40-Tahun-2024-Layanan-Pendanaan-Bersama-Berbasis-Teknologi-Informasi.aspx)).
    For multifinance it is POJK 46/2024, amended by POJK 35/2025
    ([OJK](https://ojk.go.id/id/regulasi/Pages/POJK-35-Tahun-2025-Perubahan-POJK-46-Tahun-2024.aspx)).
    The daily cost ceilings for online loans were first set on a schedule in SEOJK 19/2023
    ([RRI](https://rri.co.id/keuangan/439247/ojk-tetapkan-besaran-bunga-dan-denda-keterlambatan-pinjol)),
    and OJK changed them from 2025-01-01, splitting consumer loans at a six-month tenor
    ([ANTARA](https://www.antaranews.com/berita/4558606/ojk-ubah-batas-bunga-harian-pinjaman-online-per-1-januari-2025)).
    The R7 pack reads the ceiling from the corpus with its effective date and never from a
    constant in code.

## R0 Engine fixes

The engine stays plain TypeScript in `apps/api/src/engine`. The four faults are logic bugs, so
the fix is tests first: one failing table-driven case per fault in the existing Vitest files,
then the change.

Property tests catch the class of bug behind faults 1 and 2, where a rule fires for the wrong
reason. `fast-check` (4.10.2) generates random fact sets and checks invariants: an unrelated
benefit never changes a denial into a payout, an unmodeled rule is reported whenever its clause
is touched, and the same input gives the same output. Coverage for the grade (fault 4) is a
number the engine already has the data for: the share of rules and of rule branches that at
least one scenario reached.

Version pinning is a `versions` object written on each analysis: model IDs, a hash of each
prompt file, the engine package version and, from R5, the corpus snapshot ID. The model IDs in
`apps/api/src/config.ts` are previews (`gemini-3.1-pro-preview`), and a preview can change
under the same name, which is why the hash and date go on the analysis.

The writing-tell filter sits next to `ACCUSING` in `apps/api/src/agents/trap-writer.ts` as a
word and pattern list with its own unit tests. A hit sends the text back for one rewrite and
then drops the sentence. The same list can back a `lint:prose` script for the docs.

## R1 Evaluation foundation

Labels are made in [Label Studio](https://github.com/HumanSignal/label-studio) (Apache-2.0),
run in Docker on a team machine or a private Cloud Run service. It labels spans over text,
which is what clause-level unfair-term labels need, and exports JSON. doccano (MIT) does the same
with less. Contracts never go to a hosted labelling service.

Agreement is measured with the [`krippendorff`](https://pypi.org/project/krippendorff/)
package (0.9.0) in a small Python script under `apps/api/scripts/`, because the alpha handles
more than two annotators and missing labels. Splits use the provider and the template family as
the group, so near-copies stay on one side. The hidden test set lives in a private bucket and is
read only by the eval job.

The eval runner is the existing `apps/api/scripts/eval.ts`, extended to read a manifest of
documents and gold labels and to write one JSON result per run plus a summary that
`docs/eval.md` quotes. [promptfoo](https://github.com/promptfoo/promptfoo) (MIT) is worth a
look for prompt regression checks on single agents, with its own assertions in JavaScript, but
the full pipeline is ours and the scoring stays in our script. Benchmark adapters for CUAD,
ContractNLI, UNFAIR-ToS and CLAUSE are loaders that turn each dataset into our clause and label
types, so each agent can be scored alone.

The dataset is documented with a datasheet ([Gebru et al.](https://arxiv.org/abs/1803.09010))
before R17 publishes it. In-app ratings are a Firestore subcollection per analysis with a 1 to
5 score and an optional reason code, and they get the same TTL as the analysis.

## R2 Durable runs

The API enqueues a Cloud Tasks task when a user confirms, and returns. A worker service on Cloud
Run, deployed from the same image with a different entry point, handles one stage per task and
enqueues the next. Cloud Tasks calls the worker with an OIDC token for a service account that
has Cloud Run Invoker on the worker and nothing else
([Cloud Tasks](https://docs.cloud.google.com/tasks/docs/creating-http-target-tasks)). The worker
does not accept unauthenticated requests. The client is `@google-cloud/tasks` (7.3.0).

Each stage writes under a lease: the analysis document holds `stage`, `attemptId` and
`leaseUntil`, and a transaction claims the stage only when the lease is free or expired. Writes
are keyed by the attempt so a retried task overwrites its own partial output. A stage that has
finished is never run again, which makes Cloud Tasks' at-least-once delivery harmless. Model
calls move from `runEphemeral` to `runAsync` with `AbortSignal.timeout`, so a timeout stops the
call that costs money.

Cloud Run jobs are the wrong fit here. They suit batch work with no caller, and they allow
tasks of up to 168 hours ([Cloud Run jobs](https://docs.cloud.google.com/run/docs/create-jobs)).
They suit the R5 corpus ingest and the R1 eval runs.

Logs stay JSON on stdout with `analysisId`, `stage`, `attemptId`, model, input and output token
counts and duration. A cost figure per analysis is the token counts times a price table kept in
config with its date. Implicit context caching applies by default on current Gemini models above
4,096 input tokens ([Gemini caching](https://ai.google.dev/gemini-api/docs/caching)). Our stages
send the same clauses several times, so the prompt order puts the document first and the
instructions last to get cache hits, and `usage.total_cached_tokens` goes in the log.

The budget stop is a Pub/Sub topic on the billing budget and a function that sets a
`pauseNewAnalyses` flag the API reads. Cloud Run `max-instances` stays as the hard ceiling.

## R3 Data protection

Storage moves to Jakarta: a new upload bucket in asia-southeast2 with the 7-day lifecycle rule,
added to Firebase so the browser SDK can upload to it, and a one-off copy or expiry of the
US-EAST1 objects. Firestore is already in asia-southeast2.

Retention uses Firestore TTL on an `expireAt` field set when each document is written, on the
analysis and on each of its subcollections, with log retention set on the Cloud Logging bucket.

For encryption the choice is between CMEK through Cloud KMS on Firestore and the bucket, and
field-level encryption of clause text in our code. CMEK protects against a storage-layer leak and
lets us destroy a key to destroy data, at the cost of a new database. Field-level encryption also
keeps clause text unreadable to anyone with Firestore console access, at the cost of losing
queries on those fields, which we do not run. A perfectionist does both. A pragmatist starts with
CMEK on staging, because it costs a flag at creation, and adds field-level encryption only if
counsel asks.

Sensitive Data Protection has an `INDONESIA_NIK_NUMBER` detector
([infoType reference](https://docs.cloud.google.com/sensitive-data-protection/docs/high-sensitivity-infotypes-reference)).
It can mask NIK, phone numbers and names in clause text before the text is logged or sent to
Jev, while the model call that reads the document still needs the original.

Model calls move to Vertex AI with the worker's service account, which removes the shared key.
Request-response logging stays off and the in-memory cache can be turned off per project, both
on the zero data retention page. Search grounding moves to Web Grounding for Enterprise if
counsel objects to finding 2.

The DPIA follows PP 33/2026, read from the official text, and consent is a record per purpose
(analysing the document, keeping the report and its ratings, research use of the document) with a timestamp and the policy version.

## R4 Staging environment

Production already deploys from tags through Workload Identity Federation with service account
impersonation (`.github/workflows/release.yml`). Staging copies that: a second pool provider and
deploy account in `safely-ink-staging`, and a workflow on pushes to `staging`.
`google-github-actions/auth@v3` calls direct federation the preferred method, and impersonation is
the method that also mints ID tokens, which a staging smoke test against the private worker
service needs ([auth action](https://github.com/google-github-actions/auth)). So staging keeps
the method production already uses.

Infrastructure for both projects goes into Terraform once there are two, because two hand-made
projects drift. The first Terraform pass covers the buckets, queues, Cloud SQL instance, KMS keys,
service accounts and IAM. Firebase Auth providers stay manual.

Firebase App Check with reCAPTCHA Enterprise can attest the dashboard to the API, and custom
backends can verify its tokens ([App Check](https://firebase.google.com/docs/app-check)). It
belongs to R14, with staging as the place to try it.

## R5 Indonesian legal corpus

The store is Cloud SQL for PostgreSQL 17 in asia-southeast2 with `vector` (0.8.5 on Cloud SQL),
`pg_trgm` and `unaccent` ([Cloud SQL extensions](https://docs.cloud.google.com/sql/docs/postgres/extensions)).
The API reaches it through the Cloud SQL connector with IAM database authentication, so there is
no password to keep. The client is `pg` (8.23.1) with SQL in files. An ORM adds little for a few
tables queried by hand-written ranking SQL.

Tables: `instrument` (type, number, year, title, status, dates, source URL, source hash),
`chunk` (instrument, Bab, Pasal, Ayat, huruf, text, parent text, definitions in scope,
Penjelasan, valid from, valid to, embedding), and `link` (from chunk or instrument, to chunk or
instrument, kind: amends, revokes, implements, interprets, refers). A corpus snapshot ID is the
latest ingest run, and analyses record it (R0).

Ingest is a Cloud Run job or a local script, because BPK blocks Cloud Run. It fetches the PDF
from peraturan.go.id or the regulator, stores the file and its hash, extracts text with `unpdf`,
and splits on the Bab, Pasal and Ayat headings with a parser we test on each instrument. A
person checks each instrument's split before it is published to the corpus. Document AI's
layout parser builds heading-aware chunks
([layout parser](https://docs.cloud.google.com/document-ai/docs/layout-parse-chunk)), but its
v1.6 processors use the global Gemini endpoint, and Indonesian statutes have regular headings
that a parser handles.

Search runs three ways and fuses the ranks: exact citation lookup ("Pasal 18 ayat (1)" against
the structured columns), full-text search, and vector search with an HNSW index. The fusion is
reciprocal rank with k = 60, written in SQL as in the Google example. A version of this query
returned the Pasal 18 chunk first on a three-row test table. Embeddings start with
`gemini-embedding-2`, which takes 8,192 input tokens and output sizes from 128 to 3,072 and no
longer takes `task_type`, so queries and documents get text prefixes instead
([Gemini embeddings](https://ai.google.dev/gemini-api/docs/embeddings)). BGE-M3 is the open
comparison, served from a Cloud Run GPU service only if it wins on our queries.

## R6 Counsellor-style intake

The intake is a form in the dashboard, built from Zod schemas in `@repo/api-types` like the rest
of the app. Each step has a schema, and the next step is a pure function of the answers so far.
That function is unit tested like the engine, because a wrong branch sends a user down the
wrong path. Answers save as the user goes, so a user who leaves can come back. Every label and
help text goes through `t()` in both locales.

The counterparty check reads OJK's published lists of licensed lenders and finance companies.
The ingest keeps a dated copy so the report can say "licensed according to the OJK list of
<date>".

## R7 Consumer-finance packs

Money is integer rupiah in code, never a float, and rates are basis points or exact fractions.
The cash-flow facts (principal, tenor, schedule, fees, late charges, early repayment terms) become
a schedule the engine computes, and the effective cost per day and per year is checked against
the ceiling for that product and date from the corpus (finding 12). The boundary step for amounts
becomes a share of the amount, which fixes the rupiah step of 1.

Screenshots and repayment schedules go to Gemini's image input through the Reader with a schema
for the schedule, and the engine re-adds the rows: a schedule whose rows do not sum to its total
is shown as unreadable.

The template registry stores a hash of each clause's normalised text and a MinHash signature of
the document. A new upload that matches a reviewed template reuses its reviewed rules and
recomputes only the figures. A near match is shown as "similar to", never treated as the same.

## R8 Clause highlighting

`unpdf` runs on PDF.js, and PDF.js text items carry a transform with the x and y position plus a
width and height. The Reader keeps, for each clause, the start and end character offsets in the
page text and the boxes of the items it covers, converted to page-relative units so they do not
depend on zoom. Scanned pages have no text layer, so for them the Reader asks Gemini for boxes
and the report labels the highlight as approximate.

The viewer is [react-pdf-highlighter-extended](https://github.com/DanielArnould/react-pdf-highlighter-extended)
(8.1.0, MIT), which stores highlights in a zoom-independent format and renders through PDF.js.
It loads the PDF from a short-lived signed URL, and it is a lazy route so the report page stays
light.

## R9 to R13 Act on findings

R9 builds the evidence packet as a PDF with `pdf-lib`, already a dependency, plus a JSON file
with the same content and a SHA-256 hash of both, so a lawyer can check nothing changed. The
referral directory is a table of legal aid organisations with region, subjects and eligibility,
kept by hand from the national legal aid body's list of accredited organisations.

R10 runs both documents through one shared scenario set. It needs the canonical fact library the
TSD lists as a shortcut ceiling, because two documents with different derived schemas cannot run
the same scenarios.

R11 stores the event timeline as dated, typed events. Complaint drafts are templates filled from
the timeline and the findings, never free model text, so counsel can review each template once.

R12 uses `z3-solver` (5.3.1) in the worker to search for contradictions: rules become
constraints, and the solver looks for a fact set where two rules demand opposite outcomes, or
where a deadline cannot be met. The package needs threads and runs one long call at a time per
module, and Node needs `killThreads` to exit ([z3 JS README](https://github.com/Z3Prover/z3/blob/master/src/api/js/PUBLISHED_README.md)).
So it runs in the worker with a time limit, never in the API or the browser.

R13 calls Jev from the worker through its HTTP API with a pinned version, logs its answer next to
Gemini's, and changes nothing a user sees. The questions are in a file in the repo, and the
calibration script scores them with a Brier score on R1 labels.

## From R14 on

Launch adds the PSE registration (finding 10), App Check, Cloud Armor rate limiting in front of
the API, an error tracker that strips document text before sending, and a status page. The
published benchmark in R17 goes out as a gated dataset with a licence that forbids
re-identification, with the hidden test set kept back.

## Open checks

On 2026-10-18 these were not yet confirmed and are first tasks in their milestones:

- Cloud Tasks and Cloud SQL availability in asia-southeast2, with `gcloud tasks locations list`
  and the Cloud SQL region list (R2, R5).
- Whether `pg_textsearch` is enabled on Cloud SQL instances in asia-southeast2 during its
  preview (R5).
- Which Gemini model IDs Vertex serves in asia-southeast1 for our Pro and Flash roles (R3).
- The official text of PP 33/2026 (R3).
