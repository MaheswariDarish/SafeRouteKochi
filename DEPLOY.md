# Deploying SafeRoute

**Backend** → Cloud Run (project `saferoute-507309`, region `asia-south1`)
**Frontend** → Firebase Hosting, with `/api/**` rewritten to the Cloud Run service
**Firestore / Auth / Storage** → already live; only the security rules still need pushing.

Prereqs (one-time):

```bash
npm i -g firebase-tools
# install the gcloud SDK: https://cloud.google.com/sdk/docs/install
gcloud auth login
gcloud config set project saferoute-507309
firebase login
```

---

## 1. Backend → Cloud Run

No service-account key travels with the deploy: the Cloud Run service runs **as
its own service account** and the code falls back to Application Default
Credentials (`_ensure_firebase_app()` handles both).

### 1a. Give the runtime service account the roles it needs

```bash
PROJECT=saferoute-507309
SA="$(gcloud iam service-accounts list --format='value(email)' --filter='displayName:Compute Engine default' )"
# or make a dedicated one:  gcloud iam service-accounts create saferoute-run

for ROLE in roles/datastore.user roles/firebaseauth.admin roles/storage.objectAdmin; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:$SA" --role="$ROLE"
done
# lets the SA sign Storage URLs itself (for the photo/brochure redirects)
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --member="serviceAccount:$SA" --role=roles/iam.serviceAccountTokenCreator
```

### 1b. Deploy from source (Cloud Build builds the Dockerfile)

```bash
gcloud run deploy saferoute-api \
  --source backend \
  --region asia-south1 \
  --service-account "$SA" \
  --allow-unauthenticated \
  --set-env-vars "FIREBASE_PROJECT_ID=saferoute-507309,\
FIREBASE_API_KEY=AIzaSyCJPQtKhD8V7_UWz8tAWJzayr_hHVwd7DE,\
FIREBASE_AUTH_DOMAIN=saferoute-507309.firebaseapp.com,\
FIREBASE_APP_ID=1:309358126784:web:5112761e0e881a5c8f6f25,\
FIREBASE_MESSAGING_SENDER_ID=309358126784,\
FIREBASE_STORAGE_BUCKET=saferoute-507309.firebasestorage.app,\
GOOGLE_MAPS_API_KEY=YOUR_MAPS_KEY,\
GEMINI_API_KEY=YOUR_REAL_GEMINI_KEY,\
AUTO_VERIFY_CONTRIBUTIONS=true,\
AUTH_ENFORCED="
```

Prefer Secret Manager for the two API keys:

```bash
printf 'YOUR_MAPS_KEY'   | gcloud secrets create maps-key   --data-file=-
printf 'YOUR_GEMINI_KEY' | gcloud secrets create gemini-key --data-file=-
gcloud run services update saferoute-api --region asia-south1 \
  --set-secrets "GOOGLE_MAPS_API_KEY=maps-key:latest,GEMINI_API_KEY=gemini-key:latest"
```

Sanity check:

```bash
curl -s "$(gcloud run services describe saferoute-api --region asia-south1 --format='value(status.url)')/api/status" | python3 -m json.tool
# expect: "database": "Firestore", "storage": "Firebase Storage"
```

---

## 2. Frontend → Firebase Hosting

`firebase.json` already has the hosting block (public `frontend/dist`, `/api/**`
→ Cloud Run service `saferoute-api` in `asia-south1`, SPA fallback).

```bash
cd frontend && npm ci && npm run build && cd ..
firebase deploy --only hosting,firestore:rules,storage
```

The frontend calls `/api/...` relatively, so the Hosting rewrite makes it
same-origin — no CORS, no API base URL to configure.

---

## 3. Post-deploy checklist

- **Auth authorized domains** — `saferoute-507309.web.app` and
  `.firebaseapp.com` are trusted automatically. Add any custom domain in
  Firebase console → Authentication → Settings → Authorized domains.
- **Restrict the Maps key** — Cloud Console → APIs & Services → Credentials →
  `GOOGLE_MAPS_API_KEY` → Application restrictions → HTTP referrers →
  `https://saferoute-507309.web.app/*` (+ custom domain). Enabled APIs: Maps
  JavaScript, Directions, Geocoding, Places.
- **`GEMINI_API_KEY`** — the current value is not a valid key
  (`AQ.Ab8…`, not `AIzaSy…`). Get one from https://aistudio.google.com/apikey or
  event discovery / route explanations stay off.
- **`AUTH_ENFORCED`** — leave blank for the open trusted-group phase; set to
  `true` (redeploy env var) to require Google sign-in on every contribution.
- **Redeploys**: backend `gcloud run deploy saferoute-api --source backend
  --region asia-south1`; frontend `npm run build && firebase deploy --only hosting`.

---

## Notes

- Cloud Run's filesystem is ephemeral — uploads must go to Firebase Storage
  (they do, when the bucket is reachable). The local-disk fallback in
  `data/uploads/` is dev-only and won't persist on Cloud Run.
- `backend/data/_local_emulation_store.json` is unused once Firestore connects;
  it's excluded from the image via `.dockerignore`.
- Scale-to-zero means the first request after idle is a cold start (~2–4 s incl.
  the lazy Firebase init). Set `--min-instances 1` if that matters.
