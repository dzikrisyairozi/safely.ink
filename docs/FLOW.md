# How safely.ink works from end to end

|         |                                                                                                                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Status  | Living document                                                                                                                                 |
| Date    | 2026-10-18                                                                                                                                      |
| Related | [Roadmap](./ROADMAP.md) · [Technical stack](./research/2026-10-18-technical-stack.md) · [Setup](./SETUP.md) · [FSD](./FSD.md) · [TSD](./TSD.md) |

This is the whole path of the finished product: what a user does, what the system does at each
step, where data goes, and how a change reaches production. Each step names the milestone that
builds it. Steps marked v1.0.1 exist today.

## Two ways in

A user arrives either before signing or after something has gone wrong.

Before signing, the question is "where does this offer hurt me, and is another offer better". The
user brings a contract, an offer screenshot or a repayment schedule, and perhaps a second offer
to compare.

After signing, the question is "what happens to me now, and who do I tell". The user brings the
contract they signed and a timeline of what happened: a late payment, a fee they did not expect,
a collection call, a rejected claim.

Both paths share the same intake, the same reading of the document and the same engine. They
differ in the scenarios that run and in what the report offers as a next step.

## The user's path

1. Sign in with Google (v1.0.1).
2. Intake (R6). Structured questions in the order a legal aid intake asks them: country, document
   type, signed or not, the user's role, the counterparty and whether OJK licenses it, amounts
   and dates, urgency. A user who has already signed adds an event timeline. Answers save as the
   user goes.
3. Consent (R3). The user agrees to each purpose separately: analysing this document, keeping the
   report and its ratings, and, optionally, letting the team use the document for research. Each answer is
   stored with the policy version.
4. Upload (v1.0.1, screenshots and schedules from R7). The browser uploads the file straight to
   Cloud Storage under the user's own path.
5. Confirm (v1.0.1). The Reader's view of the document comes back: type, country, parties and
   unreadable pages. The user confirms or changes the type and country and picks which party they
   are. The rules screen shows the clauses each
   rule cites after the run, read-only.
6. Watch the run (v1.0.1). Progress updates live from Firestore while the stages run in the
   background (R2). The user can close the tab and come back.
7. Read the report (v1.0.1, deepened in R8 and R12). A grade with its coverage, and a ranked
   list of findings. Each finding has three scales (legal status, the gap from what a reasonable
   person expects, and confidence), whose interest it serves, the exact clause highlighted in the
   PDF, the scenario that shows the problem, and the law passage that applies.
8. Act on it (R9 to R11, R16). From a finding the user can:
   - compare it with another offer on the same scenarios (R10)
   - ask the provider a question, or draft a complaint to the provider, then to LAPS SJK, with
     SIPASTI for unlicensed lenders (R11)
   - export an evidence packet and find legal aid by location and subject (R9)
   - see a lawyer-reviewed alternative wording and whose interest it serves (R16)

   The user reviews and sends everything. safely.ink never contacts a provider.

9. Rate it (R1). A score from 1 to 5 on the report and on each finding, with an optional reason.
   A month later, the app asks whether the report shaped a decision, which feeds the north star.
10. Leave (v1.0.1 delete, R3 retention). The user can delete an analysis unless a run on it is making progress. A run with no update for
    15 minutes counts as stopped and can be deleted. Uploads are
    deleted after seven days, and reports and ratings expire on the retention schedule.

## The system's path

```
 Browser (dashboard, Firebase Hosting)
   │  ID token
   │  upload ───────────────► Cloud Storage, asia-southeast2 (R3)
   │  live reads ◄──────────── Firestore, asia-southeast2
   ▼
 API (Cloud Run)  ── POST /v1/analyses, /confirm, /retry, DELETE
   │  enqueue (R2)
   ▼
 Cloud Tasks queue ──OIDC──► Worker (Cloud Run, same image)
                               │  one stage per task, under a lease
                               ├─► Vertex AI Gemini, asia-southeast1 (R3)
                               ├─► Law corpus, Cloud SQL asia-southeast2 (R5)
                               ├─► Search grounding, only for gaps in the corpus
                               ├─► Jev, logged only (R13)
                               └─► Firestore: stage output, status, counts
```

Today the API runs the stages inside the confirm request. From R2 the API enqueues a task and
returns, and the worker runs one stage per task. Each stage already reads its input from Firestore
and keeps what an earlier attempt finished, so the move to tasks changes only who calls a stage.

| Stage          | Input                                      | Output                                                  | Done by                           | Since      |
| -------------- | ------------------------------------------ | ------------------------------------------------------- | --------------------------------- | ---------- |
| Read           | The upload                                 | Clauses with offsets and boxes, metadata, unread pages  | Gemini Pro, checked by code       | v1.0.1, R8 |
| Template match | Clause hashes, document signature          | A reviewed template, a near match, or none              | Code                              | R7         |
| Extract rules  | Clauses, pack, intake answers              | Fact schema and typed rules, each tied to a clause      | Gemini Pro, validated by code     | v1.0.1     |
| Fuzz           | Rules, pack, timeline                      | About 40 scenarios, both parties' views from R12        | Gemini Flash, checked by code     | v1.0.1     |
| Run            | Rules, scenarios                           | Outcome and trace per scenario                          | `evaluate()`, code only           | v1.0.1     |
| Contradictions | Rules                                      | Fact sets where rules clash or a deadline cannot be met | `z3-solver`, code                 | R12        |
| Judge          | Scenarios without the rules                | What a reasonable person expects                        | Gemini Flash, blinded             | v1.0.1     |
| Law            | Risk-bearing rules                         | Status with quotes found in the source text             | Corpus search, Gemini, code check | v1.0.1, R5 |
| Score          | Outcomes, expectations, findings, coverage | Grade, confidence, ranked findings                      | `score()`, code only              | v1.0.1, R0 |
| Write          | Findings                                   | Plain-language titles and next steps                    | Gemini Flash, filtered by code    | v1.0.1     |

A stage that fails sets the analysis to `failed` with the stage name, and the user can retry. A
model call that runs past its time limit is cancelled (R2). When monthly spend reaches the budget,
new analyses pause and running ones finish (R2).

## Where the data goes

| Data                          | Stored in                           | Leaves Indonesia                                                   | Kept for                                                   |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- |
| The uploaded file             | Cloud Storage, asia-southeast2 (R3) | Sent whole to Gemini in Singapore when the Reader reads it         | Seven days                                                 |
| Clause text, rules, report    | Firestore, asia-southeast2          | Sent to Gemini in Singapore for each model call                    | The retention period (R3)                                  |
| Rule summaries for law search | Firestore, with the rules           | Sent to Google Search grounding, which keeps them up to three days | The retention period (R3) here, up to three days at Google |
| Text sent to Jev              | Not stored by us                    | Yes, masked first (R3, R13)                                        | The processor's terms                                      |
| Ratings, consent records      | Firestore, asia-southeast2          | No                                                                 | The retention period (R3)                                  |
| Logs                          | Cloud Logging                       | No document text is logged                                         | The log bucket retention                                   |
| Law corpus                    | Cloud SQL, asia-southeast2          | No. It holds public statute text                                   | Versioned, kept                                            |

Every row that leaves Indonesia is a transfer under UU PDP and PP 33/2026, and counsel reviews it
before launch (R3, R14). The reasons are in the technical stack note.

## How a change reaches users

1. A feature branch starts from `staging`. Before committing, the developer runs
   `pnpm type-check`, `pnpm lint` and `pnpm test`, and Codex reviews the diff.
2. A pull request goes into `staging`. Merging it deploys to the `safely-ink-staging` project
   (R4), seeded with test documents only.
3. The change is checked on staging: a full run on the eval set's smoke documents, and the
   numbers in `docs/eval.md` must not drop (R1).
4. A release pull request goes from `staging` into `main`, where CI runs the full gate.
5. A `vX.Y.Z` tag on `main` deploys the API, the dashboard with its rules, and the landing page to
   production (v1.0.1).
6. Rollback is the previous tag's image on Cloud Run and the previous Hosting release
   (`docs/runbook.md` section 5).
