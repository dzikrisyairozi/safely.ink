# Runbook: setup and deploy

How to stand the project up from nothing and how to deploy it. Project ID used below:
`safely-ink` (number 774697783852), on the Blaze plan. Region: `asia-southeast2`
(Jakarta), except the Storage bucket, which the console created in `US-EAST1`. A
bucket's region cannot be changed; the API reads each upload once and uploads are
deleted after 7 days, so the distance costs little.

Until 2026-10-14 the app ran on an earlier project on the free Spark plan, which had no
Storage or Cloud Run. That project is no longer used.

Sections 1, 3 and 4 were run against `safely-ink` on 2026-10-14. Commands marked
**(not yet run)** were written from the documentation and have not been executed against
this project. Check them against `gcloud help` the first time.

## 1. One-time project setup

| Step | Where                                                                                                 | State on 2026-10-14 |
| ---- | ----------------------------------------------------------------------------------------------------- | ------------------- |
| 1    | Firebase console: create project, Blaze plan                                                          | Done                |
| 2    | Security → Authentication → Sign-in method → enable Google                                            | Done                |
| 3    | Storage → Get started                                                                                 | Done (`US-EAST1`)   |
| 4    | Install the [gcloud CLI](https://cloud.google.com/sdk/docs/install), `gcloud auth login --update-adc` | Done                |

Then, from the CLI:

```bash
gcloud config set project safely-ink
gcloud services enable firestore.googleapis.com firebasestorage.googleapis.com \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com generativelanguage.googleapis.com
gcloud firestore databases create --location=asia-southeast2

# The dashboard's web app; sdkconfig prints the VITE_FIREBASE_* values.
pnpm exec firebase apps:create web dashboard
pnpm exec firebase apps:sdkconfig web <app ID>

# The team's shared Gemini key (the one in apps/api/.env, section 2) into Secret
# Manager. Paste the key when prompted, then Ctrl+Z, Enter
# (Windows) or Ctrl+D (macOS, Linux). Do not put the key on the command line.
gcloud secrets create gemini-api-key --data-file=-
# Cloud Run reads the secret as its runtime service account (the default compute
# account unless the service is given another one).
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member=serviceAccount:774697783852-compute@developer.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor

# Image registry for the API.
gcloud artifacts repositories create api --repository-format=docker \
  --location=asia-southeast2
gcloud auth configure-docker asia-southeast2-docker.pkg.dev

# Uploaded documents are deleted after 7 days (F-HIST-3). The Firebase CLI does
# not deploy lifecycle rules, so the committed file is applied with gcloud.
gcloud storage buckets update gs://safely-ink.firebasestorage.app \
  --lifecycle-file=storage-lifecycle.json
# Check: the rule is listed.
gcloud storage buckets describe gs://safely-ink.firebasestorage.app \
  --format="default(lifecycle_config)"
```

Set a budget alert on the billing account (Billing → Budgets & alerts).

## 2. Local development

Each app has a committed `.env.example` that already holds every value except the
Gemini key. Copy each one to `.env`; `.env` files are ignored by git.

| File                  | Values to fill in                  |
| --------------------- | ---------------------------------- |
| `apps/api/.env`       | `GEMINI_API_KEY`, or pull the file |
| `apps/dashboard/.env` | Nothing to change                  |
| `apps/web/.env`       | Nothing to change                  |

The team shares one Gemini key. The whole `apps/api/.env` is encrypted with
[age](https://github.com/FiloSottile/age) for the SSH public keys listed in
`apps/api/.env.recipients` and stored as a private package on GitHub's registry with
[ORAS](https://oras.land). Only the people in that file can decrypt it.

Sign in to the registry once. Reading needs the `read:packages` scope, pushing needs
`write:packages`:

```bash
gh auth refresh -h github.com -s read:packages
gh auth token | oras login ghcr.io -u <your GitHub user> --password-stdin
```

Pull and decrypt with the private half of your key in `.env.recipients`:

```bash
oras pull ghcr.io/dzikrisyairozi/safely-ink-env:latest
age -d -i ~/.ssh/id_ed25519 -o apps/api/.env api.env.age
rm api.env.age
```

Push after the key or the recipients change:

```bash
age -R apps/api/.env.recipients -o api.env.age apps/api/.env
oras push ghcr.io/dzikrisyairozi/safely-ink-env:latest api.env.age \
  --annotation org.opencontainers.image.source=https://github.com/dzikrisyairozi/safely.ink
rm api.env.age
```

To add a developer, add their public key to `.env.recipients` and push again. To remove
one, do the same and create a new Gemini key, because they have seen the old one. The
production key lives in Secret Manager (section 1).

```bash
pnpm install
pnpm dev                                  # web :3000, api :3001, dashboard :5174
pnpm type-check && pnpm lint && pnpm test # the gate; the api tests start the emulators
```

The API verifies ID tokens with the project ID alone, so no service-account key is
needed on a developer machine. `pnpm test` needs Java 21 (see CONTRIBUTING for the
Windows `PATH` note).

The eval script (TSD 9) writes to the real project as `--owner`, so it needs
Application Default Credentials: `gcloud auth login --update-adc` once. Use your own uid
as the owner to open each eval report from `/history`; eval runs count against that
user's daily limit.

```bash
pnpm --filter api eval <file> --type loan --country SG --role Borrower --owner <uid>
```

To try a whole run by hand, upload `apps/api/test/fixtures/demo-policy.pdf`, a made-up
health policy. No test reads it. Its source is `demo-policy.md` next to it: when the
wording changes, make the PDF again from that file, with text that can be selected.

## 3. Deploy

Sign in once: `pnpm exec firebase login`.

### Rules and dashboard

`apps/dashboard/.env.production.local` holds the production values and is read by the
build. It has the same `VITE_FIREBASE_*` values as `.env`, and `VITE_API_URL` set to the
Cloud Run URL from the next section.

```bash
pnpm --filter dashboard build
pnpm exec firebase deploy --only hosting,firestore,storage   # rules and the history index
```

The dashboard is served at `https://safely-ink.web.app`. That domain and
`localhost` are authorised for sign-in by default; a custom domain must be added under
Authentication → Settings → Authorised domains.

### Custom domains **(not yet run)**

The landing page is served from `safely.ink` and the dashboard from `app.safely.ink`.

1. Firebase console → Hosting → Add custom domain, once per domain. Add the DNS records
   it shows at the registrar and wait for the certificate.
2. Authentication → Settings → Authorised domains: add `app.safely.ink`.
3. Set `ALLOWED_ORIGIN=https://app.safely.ink` on the Cloud Run service and redeploy it;
   the API allows one origin only.
4. Set `NEXT_PUBLIC_SITE_URL=https://safely.ink` and
   `NEXT_PUBLIC_APP_URL=https://app.safely.ink` for the landing build.

### API on Cloud Run

The build context is the repository root. `docker push` signs in through
`docker-credential-gcloud`, which lives in the gcloud `bin` folder; that folder must be
on `PATH`. The service URL is `https://api-774697783852.asia-southeast2.run.app`.

```bash
IMAGE=asia-southeast2-docker.pkg.dev/safely-ink/api/api:$(git rev-parse --short HEAD)
docker build -f apps/api/Dockerfile -t $IMAGE .
docker push $IMAGE

gcloud run deploy api --image $IMAGE --region asia-southeast2 \
  --timeout 900 --memory 1Gi --concurrency 4 --min-instances 0 --max-instances 5 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLOUD_PROJECT=safely-ink,STORAGE_BUCKET=safely-ink.firebasestorage.app,ALLOWED_ORIGIN=https://safely-ink.web.app \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest
```

`--allow-unauthenticated` opens the service at the Cloud Run level only. The app itself
rejects every request without a valid Firebase ID token, except `GET /health`.

The first deploy prints the service URL. Put it in
`apps/dashboard/.env.production.local` as `VITE_API_URL`, then rebuild and redeploy the
dashboard.

## 4. Check a deploy

```bash
API=<Cloud Run URL>
curl -i $API/health                               # 200 {"status":"ok"}
curl -i $API/v1/x                                 # 401 {"error":{"code":"unauthenticated",...}}
curl -i -H "Authorization: Bearer nope" $API/v1/x # 401
curl -i -H "Origin: https://evil.example" $API/health | grep -i access-control  # prints nothing
```

In a private browser window, open `https://safely-ink.web.app/`. Expected:
redirect to `/sign-in?redirect=%2F`, and after Google sign-in, the dashboard. Reload: no
visit to `/sign-in`. Sign out from the profile menu: back at `/sign-in`.

## 5. Roll back

- API: `gcloud run services update-traffic api --region asia-southeast2 --to-revisions <previous>=100`
- Dashboard: Firebase console → Hosting → release history → Roll back.
- Rules: Firebase console → Firestore (or Storage) → Rules → history.
