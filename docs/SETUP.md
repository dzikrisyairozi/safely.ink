# What to set up before the build passes

|         |                                                                                                                                                |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Status  | Living checklist                                                                                                                               |
| Date    | 2026-10-18                                                                                                                                     |
| Related | [Roadmap](./ROADMAP.md) · [End-to-end flow](./FLOW.md) · [Technical stack](./research/2026-10-18-technical-stack.md) · [Runbook](./runbook.md) |

This is everything outside the repo that a full pass through the roadmap needs, grouped by where
it lives, with the milestone that first needs it. The runbook keeps the steps for what already
exists, and this file covers what is new. Commands are for Linux with `mise` and were written on
2026-10-18. Check each flag against `--help` before running it.

## What exists today

Production runs in the `safely-ink` project: Cloud Run `api` in asia-southeast2, Firestore in
asia-southeast2, Firebase Hosting and App Hosting, Secret Manager with the Gemini key, Artifact
Registry, and Workload Identity Federation for the release workflow with the `github-deploy`
service account. The upload bucket is `safely-ink.firebasestorage.app` in US-EAST1.

## The development machine

On 2026-10-18 the development machine had Node 26, Docker, `psql`, `gh`, `codex` and `oras`, and
lacked the rest of this list. Node 26 ships without corepack, so pnpm comes from mise.

```bash
mise use -g pnpm@9.0.0 java@temurin-21 gcloud firebase age
gcloud auth login && gcloud auth application-default login
firebase login
```

Then, from the repo root:

```bash
pnpm install --frozen-lockfile
# The shared apps/api/.env, decrypted with age (runbook section 2). Needs your key
# on the recipients list, which the repo owner adds.
pnpm type-check && pnpm lint && pnpm test   # pnpm test needs Java 21 for the emulators
```

For R5 and R1, a local Postgres with pgvector, on the same major version as Cloud SQL:

```bash
docker run -d --name safely-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 \
  -v safely-pg:/var/lib/postgresql/data pgvector/pgvector:pg17
```

For R1, Label Studio on the same machine, so contracts stay off hosted services. It listens on
port 8090 because the Firestore emulator for `pnpm test` takes 8080:

```bash
docker run -d --name label-studio -p 8090:8080 -v label-studio:/label-studio/data \
  heartexlabs/label-studio:latest
```

Python 3.12 with `krippendorff` for agreement scores, in a virtual environment under
`apps/api/scripts/`.

## GitHub

| Item                                                                                                   | Needed by | Who        |
| ------------------------------------------------------------------------------------------------------ | --------- | ---------- |
| A `staging` environment with its own variables (`VITE_FIREBASE_*`, `VITE_API_URL`)                     | R4        | Repo owner |
| A deploy workflow on pushes to `staging`, a copy of `release.yml` for the staging project              | R4        | Developer  |
| Branch protection on `staging` and `main`: pull requests only, CI required on `main`                   | R4        | Repo owner |
| Labels `epic`, `milestone` and one per horizon                                                         | Issues    | Developer  |
| CI on pull requests into `staging` too, once runs are cheap enough (CI today runs only on release PRs) | R4        | Repo owner |

## Google Cloud: a new staging project

`safely-ink-staging` mirrors production. Every service in this section goes into both projects,
staging first. The runbook sets the active project to production, and `.firebaserc` defaults to
it, so every command here names its project with `--project`. The table below writes
`<PROJECT>` for it.

```bash
gcloud projects create safely-ink-staging
gcloud billing projects link safely-ink-staging --billing-account <ACCOUNT_ID>
firebase projects:addfirebase safely-ink-staging
gcloud services enable --project safely-ink-staging \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com firestore.googleapis.com firebasestorage.googleapis.com \
  identitytoolkit.googleapis.com cloudtasks.googleapis.com sqladmin.googleapis.com \
  aiplatform.googleapis.com cloudkms.googleapis.com logging.googleapis.com \
  pubsub.googleapis.com
```

In the Firebase console for the new project, turn on Google sign-in and create the web app. The
values from `firebase apps:sdkconfig web --project safely-ink-staging` become the staging GitHub
variables.

## Google Cloud: per milestone

| Item                                                                                                                                                                                                                                                                                                                                                                                    | Command or place                                                                                                                                                                                                                                                                                                                        | Needed by                   | Who           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------- |
| Firestore with CMEK, if R3 chooses it. CMEK is set only at creation, so staging creates its `(default)` database with it, and production needs a new named database, an export and import, the API and the dashboard (`getFirestore(app, '<NAME>')` in `apps/dashboard/src/lib/firebase.ts`) pointed at it, and a `database` entry in `firebase.json` so rules and indexes deploy to it | Staging: `gcloud kms keyrings create safely-ink --location asia-southeast2 --project <PROJECT>`, a key in it, then `gcloud firestore databases create --location asia-southeast2 --kms-key-name <KEY> --project <PROJECT>`. Production: the same with `--database <NAME>`, then `gcloud firestore export` and `gcloud firestore import` | R3, before R4 seeds staging | Project owner |
| An upload bucket in Jakarta with the 7-day lifecycle rule, then added to Firebase in the Storage console                                                                                                                                                                                                                                                                                | `gcloud storage buckets create gs://<NAME> --location asia-southeast2 --uniform-bucket-level-access --project <PROJECT>`, then `gcloud storage buckets update gs://<NAME> --lifecycle-file=storage-lifecycle.json --project <PROJECT>`                                                                                                  | R3                          | Project owner |
| TTL policies on every collection group that holds user data                                                                                                                                                                                                                                                                                                                             | `gcloud firestore fields ttls update expireAt --collection-group <GROUP> --enable-ttl --project <PROJECT>`, once per group                                                                                                                                                                                                              | R3                          | Developer     |
| A Cloud Tasks queue for analysis stages, with retries and a dispatch cap                                                                                                                                                                                                                                                                                                                | `gcloud tasks queues create analysis --location asia-southeast2 --max-attempts 5 --max-concurrent-dispatches 10 --project <PROJECT>`                                                                                                                                                                                                    | R2                          | Developer     |
| A worker service account with Cloud Run Invoker on the worker only, and Service Account User for the Cloud Tasks service agent                                                                                                                                                                                                                                                          | IAM, per the Cloud Tasks page cited in the technical stack note                                                                                                                                                                                                                                                                         | R2                          | Project owner |
| Vertex AI access for the worker account (`roles/aiplatform.user`), and the Gemini model IDs served in asia-southeast1 confirmed                                                                                                                                                                                                                                                         | IAM, and the Vertex model list                                                                                                                                                                                                                                                                                                          | R3                          | Project owner |
| A budget with Pub/Sub notifications on a `budget` topic                                                                                                                                                                                                                                                                                                                                 | Billing console                                                                                                                                                                                                                                                                                                                         | R2                          | Billing admin |
| Cloud SQL for PostgreSQL 17 in asia-southeast2 with IAM database authentication                                                                                                                                                                                                                                                                                                         | `gcloud sql instances create law --database-version POSTGRES_17 --region asia-southeast2 --edition enterprise --tier db-custom-1-3840 --database-flags cloudsql.iam_authentication=on --project <PROJECT>`                                                                                                                              | R5                          | Project owner |
| Extensions `vector`, `pg_trgm`, `unaccent`, and `pg_textsearch` when the preview reaches our region                                                                                                                                                                                                                                                                                     | `CREATE EXTENSION` in the `law` database                                                                                                                                                                                                                                                                                                | R5                          | Developer     |
| Log bucket retention set to the R3 schedule                                                                                                                                                                                                                                                                                                                                             | Cloud Logging console                                                                                                                                                                                                                                                                                                                   | R3                          | Project owner |
| A Workload Identity provider and deploy account in staging, like production's                                                                                                                                                                                                                                                                                                           | Runbook "Releases", repeated for the staging project                                                                                                                                                                                                                                                                                    | R4                          | Project owner |
| Terraform state in a bucket per project, once both projects exist                                                                                                                                                                                                                                                                                                                       | A versioned bucket in each project                                                                                                                                                                                                                                                                                                      | R4                          | Developer     |
| Sensitive Data Protection API, for masking before logs and before Jev                                                                                                                                                                                                                                                                                                                   | `gcloud services enable dlp.googleapis.com --project <PROJECT>`                                                                                                                                                                                                                                                                         | R13                         | Developer     |
| App Check with reCAPTCHA Enterprise, Cloud Armor in front of the API                                                                                                                                                                                                                                                                                                                    | Firebase and Cloud console                                                                                                                                                                                                                                                                                                              | R14                         | Project owner |

## Outside accounts

| Item                                                                                              | Needed by | Who           |
| ------------------------------------------------------------------------------------------------- | --------- | ------------- |
| A TypeSafe key for the app, separate from the developer plugin key, and its data processing terms | R13       | Product owner |
| A pasal.id account if we use its API, with its terms read (its MCP server code is AGPL-3.0)       | R5        | Product owner |
| DNS control for `safely.ink` and `app.safely.ink`, for the custom domains in the runbook          | R14       | Repo owner    |
| An error tracker account that lets us strip request bodies before sending                         | R14       | Developer     |

The AI Studio key stays in production until R3 moves model calls to Vertex AI, and is then
deleted.

## Data

| Item                                                                                                                                                                                             | Needed by | Who       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | --------- |
| About 100 Indonesian agreements with a clear right to use: public pinjol and multifinance terms, public insurance wordings, employment and rental templates, and documents users consent to give | R1        | Team      |
| A private bucket for the gold set and the hidden test set, readable only by the eval job                                                                                                         | R1        | Developer |
| Statute PDFs from peraturan.go.id and the regulators, fetched from a machine BPK does not block                                                                                                  | R5        | Developer |
| OJK's published lists of licensed lenders and finance companies, kept as dated copies                                                                                                            | R6        | Developer |
| A hand-kept table of accredited legal aid organisations with region, subjects and eligibility                                                                                                    | R9        | Team      |

## People

| Item                                                                                                                                 | Needed by    | Who           |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------- |
| Two Indonesian legal annotators and one adjudicator, plus a small panel of lay raters                                                | R1           | Product owner |
| Indonesian counsel for the product's claims, UU PDP and PP 33/2026, transfers abroad, complaint templates, rewording and publication | R3, R11, R14 | Product owner |
| A named operator entity and contact for the privacy page and the PSE registration                                                    | R3, R14      | Product owner |
| One paying B2B design partner                                                                                                        | R15          | Product owner |
| A contact at an LBH or YLKI to check the referral and complaint flows                                                                | R9, R11      | Product owner |

## Decisions

These are yours, and each blocks the milestone beside it.

| Decision                                                                                                    | Blocks |
| ----------------------------------------------------------------------------------------------------------- | ------ |
| The monthly ceiling for cloud and model spend                                                               | R2     |
| CMEK, field-level encryption, or both                                                                       | R3, R4 |
| Moving the upload bucket to Jakarta, and what happens to the US-EAST1 objects                               | R3     |
| Whether user documents may go to TypeSafe at all, masked or not                                             | R13    |
| Search grounding or Web Grounding for Enterprise, after counsel reads finding 2 in the technical stack note | R3     |

## Ready to start

A milestone can start when the milestones it depends on in the roadmap are merged and its row
here is true.

| Milestone | Ready when                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------- |
| R0        | The development machine runs the three gates                                                       |
| R1        | The local Postgres and Label Studio run, the first 20 documents are in, and annotators are named   |
| R2        | The staging project exists, with the queue and worker account in it, and the budget ceiling is set |
| R3        | The encryption and bucket decisions are made, and counsel is engaged                               |
| R4        | The staging project, its Firebase app and its deploy account exist                                 |
| R5        | Cloud SQL runs in staging, and the first statute PDFs are fetched                                  |
| R6, R8    | Nothing beyond the development machine                                                             |
| R7        | The first public multifinance and paylater terms are collected                                     |
| R9 to R13 | The people listed above for each                                                                   |
