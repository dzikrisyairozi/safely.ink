# Runbook: setup and deploy

How to stand the project up from nothing and how to deploy it. Project ID used below:
`policy-police-96af6`. Region: `asia-southeast2` (Jakarta).

Commands marked **(not yet run)** were written from the documentation and have not been
executed against this project. Check them against `gcloud help` the first time.

## 1. One-time project setup

| Step | Where                                                                                    | State on 2026-10-13    |
| ---- | ---------------------------------------------------------------------------------------- | ---------------------- |
| 1    | Firebase console: create project                                                         | Done                   |
| 2    | Security → Authentication → Sign-in method → enable Google                               | Done                   |
| 3    | Firestore Database → create `(default)`                                                  | Done                   |
| 4    | Project settings → Your apps → register web app `dashboard`                              | Done                   |
| 5    | AI Studio: create a Gemini API key in this project                                       | Done                   |
| 6    | Upgrade to the Blaze plan (bottom-left of the console)                                   | **Open**               |
| 7    | Storage → Get started, same region                                                       | **Open**, needs step 6 |
| 8    | Install the [gcloud CLI](https://cloud.google.com/sdk/docs/install), `gcloud auth login` | **Open**               |

Cloud Run, Cloud Build, Secret Manager and Cloud Storage all need Blaze. Hosting,
Authentication and Firestore work on the free plan.

After steps 6 to 8 **(not yet run)**:

```bash
gcloud config set project policy-police-96af6
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com

# Gemini key into Secret Manager. Paste the key when prompted, then Ctrl+Z, Enter
# (Windows) or Ctrl+D (macOS, Linux). Do not put the key on the command line.
gcloud secrets create gemini-api-key --data-file=-
# Cloud Run reads the secret as its runtime service account (the default compute
# account unless the service is given another one).
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member=serviceAccount:438667935208-compute@developer.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor

# Image registry for the API.
gcloud artifacts repositories create api --repository-format=docker \
  --location=asia-southeast2
gcloud auth configure-docker asia-southeast2-docker.pkg.dev

# Uploaded documents are deleted after 7 days (F-HIST-3).
echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":7,"matchesPrefix":["uploads/"]}}]}' > lifecycle.json
gcloud storage buckets update gs://policy-police-96af6.firebasestorage.app \
  --lifecycle-file=lifecycle.json
rm lifecycle.json
```

Set a budget alert on the billing account (Billing → Budgets & alerts).

## 2. Local development

Each app has a committed `.env.example`. Copy it to `.env` and fill it in; `.env` files
are ignored by git.

| File                  | Values                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `apps/api/.env`       | `GOOGLE_CLOUD_PROJECT`, `STORAGE_BUCKET`, `GEMINI_API_KEY`; `PORT` and `ALLOWED_ORIGIN` have working defaults |
| `apps/dashboard/.env` | The web app config from Project settings → Your apps, and `VITE_API_URL`                                      |
| `apps/web/.env`       | Nothing to change                                                                                             |

```bash
pnpm install
pnpm dev                                  # web :3000, api :3001, dashboard :5174
pnpm type-check && pnpm lint && pnpm test # the gate; the api tests start the emulators
```

The API verifies ID tokens with the project ID alone, so no service-account key is
needed on a developer machine. `pnpm test` needs Java 21 (see CONTRIBUTING for the
Windows `PATH` note).

## 3. Deploy

Sign in once: `pnpm exec firebase login`.

### Rules and dashboard (work on the free plan)

`apps/dashboard/.env.production.local` holds the production values and is read by the
build. It has the same `VITE_FIREBASE_*` values as `.env`, and `VITE_API_URL` set to the
Cloud Run URL from the next section.

```bash
pnpm --filter dashboard build
pnpm exec firebase deploy --only hosting,firestore:rules
pnpm exec firebase deploy --only storage        # after Storage is set up
```

The dashboard is served at `https://policy-police-96af6.web.app`. That domain and
`localhost` are authorised for sign-in by default; a custom domain must be added under
Authentication → Settings → Authorised domains.

### API on Cloud Run (needs Blaze) **(not yet run)**

The build context is the repository root.

```bash
IMAGE=asia-southeast2-docker.pkg.dev/policy-police-96af6/api/api:$(git rev-parse --short HEAD)
docker build -f apps/api/Dockerfile -t $IMAGE .
docker push $IMAGE

gcloud run deploy api --image $IMAGE --region asia-southeast2 \
  --timeout 600 --memory 1Gi --concurrency 4 --min-instances 0 --max-instances 5 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLOUD_PROJECT=policy-police-96af6,STORAGE_BUCKET=policy-police-96af6.firebasestorage.app,ALLOWED_ORIGIN=https://policy-police-96af6.web.app \
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

In a private browser window, open `https://policy-police-96af6.web.app/`. Expected:
redirect to `/sign-in?redirect=%2F`, and after Google sign-in, the dashboard. Reload: no
visit to `/sign-in`. Sign out from the profile menu: back at `/sign-in`.

## 5. Roll back

- API: `gcloud run services update-traffic api --region asia-southeast2 --to-revisions <previous>=100`
- Dashboard: Firebase console → Hosting → release history → Roll back.
- Rules: Firebase console → Firestore (or Storage) → Rules → history.
