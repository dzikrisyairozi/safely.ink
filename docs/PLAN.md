# The order of work, from today to launch and after

|         |                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------- |
| Status  | Living document                                                                                               |
| Date    | 2026-11-12                                                                                                    |
| Related | [Roadmap](./ROADMAP.md) · [Setup](./SETUP.md) · [Flow](./FLOW.md) · [Runbook](./runbook.md) · [TSD](./TSD.md) |

The [roadmap](./ROADMAP.md) says what each milestone is and why. This document puts the milestones in order, says who does each step, and says when a milestone counts as deployed. The task list for a milestone stays in its GitHub issue, and the commands stay in the [runbook](./runbook.md).

## When a milestone counts as deployed

A milestone moves through five states. Merged code is the first of them.

1. Built. The code is merged into `staging` after `pnpm type-check`, `pnpm lint` and `pnpm test` pass and Codex has reviewed the diff.
2. Set up. The cloud resources and settings the code reads exist, created from the runbook.
3. Checked on staging. The extraction smoke gate passes on the `safely-ink-staging` project, and the numbers in `docs/eval.md` have not dropped.
4. Released. A release pull request from `staging` is merged into `main`, and a version tag on `main` deploys the API, the dashboard with its rules, and the landing page.
5. Checked in production. The checks in runbook section 4 pass, and one full analysis finishes.

The staging project does not exist until stage 2. Before then, state 3 is a run on the development machine with the Firebase emulators and a live Gemini key.

Each step names who can do it:

| Tag    | Who                                                                  |
| ------ | -------------------------------------------------------------------- |
| Code   | A developer with the repository. Nothing outside it is needed        |
| Cloud  | Someone with owner access to the Google Cloud and Firebase projects  |
| Owner  | The product owner: a decision, an account or a contract              |
| People | Annotators, lay raters, Indonesian counsel or a partner set the pace |

## Where each milestone stands on 2026-11-12

Production runs v1.0.1. Nothing built since then is released.

| Milestone                | Built                                      | Set up                                  | Checked on staging        | Released                               | Checked in production |
| ------------------------ | ------------------------------------------ | --------------------------------------- | ------------------------- | -------------------------------------- | --------------------- |
| R0 Engine fixes          | Yes (#49)                                  | Nothing to set up                       | Local tests only          | No                                     | No                    |
| R1 regression tests      | Yes (#59)                                  | Needs a Gemini key for a first live run | Never run on a live model | Not deployed, it is a development tool | Not deployed          |
| R1 gold set and scoring  | No                                         | No                                      | No                        | No                                     | No                    |
| R2 Durable runs          | Yes (#51, #53, #57), two tasks open in #42 | No queue, worker or budget exists       | Mocks only                | No                                     | No                    |
| R3m Singapore model move | Only the rejected parameter is removed     | No                                      | No                        | No                                     | No                    |
| R3, R4, R5 to R8, R13    | No                                         | No                                      | No                        | No                                     | No                    |
| R9 to R12, R14 to R18    | No                                         | No                                      | No                        | No                                     | No                    |

## Releases

A release is named here by what it carries. It gets its version number when it is tagged.

| Release | Carries                                                  | Must be true first                                                                     |
| ------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| A       | R0, the R2 code with its settings unset                  | A first live smoke run is saved, and FSD section 8 is walked on a local build          |
| B       | R2 turned on: queue, worker and budget pause             | The staging project exists, and stop, stall recovery and the pause work there          |
| C       | R3m: Vertex AI in Singapore on the two listed models     | The smoke gate passes on the old and the new models, and every other caller is checked |
| D       | R3: retention, the Jakarta bucket, consent, privacy page | The owner's decisions are made, and counsel has read the transfers                     |
| H2      | R6, R8, R5 and R7, each in its own release               | Each has passed states 1 to 3                                                          |
| Launch  | R14                                                      | The launch checklist in stage 7 is complete                                            |

Release A is safe without the queue, because the API runs stages inside the request when `TASKS_QUEUE`, `WORKER_URL` and `TASKS_SERVICE_ACCOUNT` are unset.

## The sequence

Stages 1 to 4 run in order. Stage 5 starts now and runs beside them, because people set its pace. In stage 6, R6 and R8 can also start now.

```
1 Release A ── 2 Staging, release B ── 3 Release C ── 4 Release D ──┐
5 Evaluation (R1) ──────────────────────────────────────────────────┼── 7 Launch ── 8 After launch
6 Indonesian depth (R6, R8, then R5, then R7), R13 offline ─────────┘
```

### Stage 1: release what is built

Milestones: R0 (#40), the code of R2 (#42), and the open items of #16 that still apply.

1. Owner: put a Gemini key in `apps/api/.env` on the development machine.
2. Code: run `pnpm --filter api smoke` and keep the saved run as the baseline for later model changes.
3. Code: walk FSD section 8, criteria 1 to 12, on a local build of `staging`, and fix what fails.
4. Code: open the release pull request from `staging` into `main`. CI runs the full gate.
5. Code: tag `main`. The release workflow deploys the API, the dashboard with its rules, and the landing page (runbook "Releases").
6. Code: run the checks in runbook section 4, then one full analysis on an Indonesian document. Confirm that the analysis records its versions and its token cost.
7. If a check fails, roll back with runbook section 5.

### Stage 2: staging, then durable runs turned on

Milestones: R4 (#44), then the setup half of R2 (#42).

1. Owner: decide between Cloud KMS keys, field-level encryption, or both. Firestore takes a customer-managed key only when the database is created, so this decision comes before the project.
2. Owner: set the monthly ceiling for cloud and model spend.
3. Cloud: create `safely-ink-staging` with Firebase Auth (Google), Firestore and Storage in asia-southeast2.
4. Cloud: create the Workload Identity provider and the deploy service account in staging.
5. Code: add a deploy workflow for pushes to `staging`, with a GitHub `staging` environment. Run `actionlint` on it.
6. Cloud: turn on branch protection for `staging` and `main`.
7. Code: seed staging with test documents only, and run the smoke gate after each staging deploy.
8. Cloud: create the queue, the worker and its service account in staging (runbook "Task queue and worker").
9. Code: on staging, run an analysis through the queue, stop one, let one stall and recover it, and retry a failed stage.
10. Cloud: create the budget, its Pub/Sub topic and the push subscription in staging (runbook "Budget pause").
11. Code: publish a test budget message on staging. Upload, confirm and retry answer 503 `paused`, and a running stage finishes. Clear it and confirm that new analyses start.
12. Code: close the two open tasks in #42, the listener warning at the reading stage and the prompt order.
13. Cloud: repeat steps 8 and 10 in production.
14. Code: release B, then repeat steps 9 and 11 in production with a test document.
15. Code: write the resources of both projects as Terraform, with state in a bucket for each project.

### Stage 3: the Singapore model move

Milestone: R3m (#56).

1. Cloud: give the API and worker service accounts access to Vertex AI in asia-southeast1.
2. Code: confirm that `gemini-4-argon` and `gemini-3.5-flash` answer on the asia-southeast1 endpoint.
3. Code: move the ADK calls and the direct page reader from the AI Studio key to Vertex AI.
4. Code: add the Vertex prices to `config.prices` with their dates.
5. Code: run the smoke gate on the old and the new models, and record both in `docs/eval.md`.
6. Code: check each caller the smoke gate does not cover: the fuzzer, the judge, the trap writer, the legal researcher with grounding, and the URL context call.
7. Code: deploy to staging, run a full analysis, then release C.
8. Cloud: delete the AI Studio key after release C is checked in production and nothing reads the key.

### Stage 4: data protection

Milestone: R3 (#43).

1. Owner: decide on the bucket move and what happens to the US-EAST1 objects.
2. Owner: engage Indonesian counsel, and name the operator entity and its contact.
3. People: counsel reads the transfers in FLOW "Where the data goes", and the choice between Search grounding and Web Grounding for Enterprise.
4. Cloud: create the upload bucket in asia-southeast2 with the 7-day lifecycle rule, and add it to Firebase.
5. Code: point the API and the dashboard at the new bucket.
6. Code: add `expireAt` to the analysis and each subcollection document. Cloud: add a TTL policy for each collection group, and set log retention.
7. Code: record consent for each purpose with a timestamp and the policy version.
8. Code: fill the `[TBD]` fields on the privacy page.
9. Cloud: restrict the Firebase browser key by HTTP referrer.
10. People: write the data protection impact assessment against UU PDP and PP 33/2026, with counsel.
11. Code: check on staging that an expired analysis is gone, then release D.
12. Cloud: expire or move the US-EAST1 objects, as decided in step 1.
13. Cloud and Code, only if stage 2 chose a customer-managed key: production needs a new named Firestore database with the key, an export and import, and the API, the dashboard and `firebase.json` pointed at it ([setup](./SETUP.md), "Google Cloud: per milestone"). Rehearse the move on staging first, and pause new analyses during it.

### Stage 5: evaluation

Milestone: R1 (#41). Most of it is never deployed. Its output is `docs/eval.md`, which stage 7 needs.

1. Code: write the annotation guide in Bahasa Indonesia.
2. Owner: name two legal annotators, one adjudicator and a small panel of lay raters.
3. Code: run Label Studio on a team machine or a private service.
4. People: collect about 100 agreements with a clear right to use them. Start with 20.
5. People: two annotators label, the third adjudicates. Code: report Krippendorff's alpha.
6. People: lay raters give the reasonable-person expectations.
7. Code: split by provider and template family, and freeze the hidden test set in a private bucket.
8. Code: extend `apps/api/scripts/eval.ts` to score extraction recall, citation support, trap precision, false reassurance and abstention.
9. Code: add the adapters for CUAD, ContractNLI, UNFAIR-ToS and CLAUSE.
10. Code: publish `docs/eval.md` with the date, the versions and the numbers, and a datasheet for the dataset.
11. Code: add the rating on each report and each trap, and the follow-up question a month later. These two ship in a release like any feature.

### Stage 6: Indonesian depth

Milestones: R6 (#46), R8 (#48), R5 (#45), R7 (#47) and the offline phase of R13 (#55). The order inside the stage follows the dependencies.

1. R6 Counsellor-style intake. Code only, and it can start now.
   1. Build the intake steps and the timeline (#46).
   2. Check on staging with the smoke documents, and in both languages.
   3. Release.
2. R8 Clause highlighting. Code only, and it can start now.
   1. Build the offsets, the boxes and the viewer (#48).
   2. Check on staging with a text PDF and a photographed page.
   3. Release.
3. R5 Indonesian legal corpus. Needs stage 2 and the R1 tooling.
   1. Cloud: create the Cloud SQL instance in staging.
   2. Code: build the tables, the splitter, the ingest job and the retrieval interface (#45).
   3. Code: ingest the consumer-finance instruments from the development machine.
   4. People: a person with legal training checks each instrument's split.
   5. Code: compare the search methods and the embeddings on our own queries, and record the result in `docs/eval.md`.
   6. Cloud: create the instance in production and load the checked snapshot.
   7. Release, then confirm in production that an Indonesian run finds its passages in the corpus.
4. R7 Consumer-finance packs. Needs R5 and R6.
   1. Code: build the packs, the schedule arithmetic and the ceiling table (#47).
   2. People: counsel reviews the ceiling rules and when each applies.
   3. Code: add smoke cases for a charge above and below each ceiling.
   4. Check on staging, then release.
5. R13 offline. Needs the R1 tooling and the owner's TypeSafe key.
   1. Code: build the client and the two scripts (#55).
   2. Code: run them on public or consented documents, and publish the calibration in `docs/eval.md`.
   3. Nothing is deployed. A live phase starts only after its error bound is met on Indonesian labels (ADR 5).

### Stage 7: launch

Milestone: R14 (#64). It needs stages 1 to 5.

One decision is open: whether the launch waits for stage 6. The dependency table in the roadmap does not require it. The wedge is consumer finance, and without R5 a share of law lookups come back unavailable, so the proposal is to wait for R5, R6 and R7.

1. Code: every accuracy claim in the PRD, the landing page and the app matches a number in `docs/eval.md`, or the claim is removed.
2. People: counsel answers the five questions in the roadmap, and reviews the disclaimer, the privacy page and the terms.
3. Owner: register as a PSE with Komdigi under the named operator.
4. Owner and Cloud: point `safely.ink` and `app.safely.ink` at the product (runbook "Custom domains").
5. Cloud: turn on App Check with reCAPTCHA Enterprise after its trial on staging, and Cloud Armor rate limiting in front of the API.
6. Code: add an error tracker that strips request bodies and document text, and a status page.
7. Code: walk FSD section 8 on staging, and run a fresh-user pass in Indonesian and in English on a phone.
8. Code: rehearse the rollback in runbook section 5 on staging.
9. Cloud: delete the old `policy-police-96af6` project after the key check in #16.
10. Code: the release, then the production checks, including a test budget message.
11. Owner: the announcement.

### Stage 8: after launch

These milestones have no order between them beyond their dependencies. Each one moves through the same five states.

| Milestone                                    | Issue | Needs first             | Who sets the pace                   |
| -------------------------------------------- | ----- | ----------------------- | ----------------------------------- |
| R9 Referral with an evidence packet          | #60   | R6                      | Code, and a partner directory       |
| R10 Document comparison                      | #61   | R7                      | Code                                |
| R11 After-the-fact mode and complaint drafts | #62   | R5, R6                  | Code, and counsel for each template |
| R12 Two-party and defect analysis            | #63   | R1, R5                  | Code                                |
| R13 live phases                              | #55   | R1 gate, R2, R3, R5, R6 | The error bound in ADR 5            |
| R15 B2B design partner                       |       | R12                     | One paid partner                    |
| R16 Lawyer-reviewed rewording library        |       | R12                     | Lawyers                             |
| R17 Published Indonesian benchmark           |       | R1, R14                 | Counsel, for publication            |
| R18 Thailand and Vietnam                     |       | R17                     | Local counsel                       |

R15 to R18 get an issue when the milestone before them is released.

## What blocks the next step today

| Blocked step                 | Waiting for                                               | Who   |
| ---------------------------- | --------------------------------------------------------- | ----- |
| Stage 1, the live smoke run  | A Gemini key on the development machine                   | Owner |
| Stage 2, the staging project | The encryption decision, the budget ceiling, cloud access | Owner |
| Stage 4                      | Counsel, the operator entity, the bucket decision         | Owner |
| Stage 5, labelling           | Annotators and the first 20 agreements                    | Owner |
| Stage 6, R13 offline         | A TypeSafe key for the product                            | Owner |
| Stage 6, R6 and R8           | Nothing                                                   | Code  |
