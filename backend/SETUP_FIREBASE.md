# Firestore + Firebase Auth setup

SafeRoute runs fine **without** this — it uses a local JSON store and a
"dev name" identity. Do this when you want real persistence and non-anonymous
sign-in.

## 1. Create the project

1. <https://console.firebase.google.com> → **Add project** (or pick an existing GCP project).
2. **Build → Firestore Database → Create database** → *production mode* → pick a region (e.g. `asia-south1`).
3. **Build → Authentication → Get started → Sign-in method → Google → Enable**, set a support email, save.
4. **Authentication → Settings → Authorized domains** → add `localhost` (already there) and your deploy domain.

## 2. Backend credentials (Admin SDK)

1. **Project settings (gear) → Service accounts → Generate new private key** → download the JSON.
2. Put it somewhere outside git, e.g. `backend/secrets/serviceAccount.json`.
3. In `backend/.env`:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccount.json
   ```
   That's the switch: the backend now reads/writes Firestore and **requires a
   Firebase ID token** on every contribution endpoint.

## 3. Frontend web config

**Project settings → General → Your apps →** add a **Web app** if there isn't one,
then copy the `firebaseConfig` values into `backend/.env`:

```
FIREBASE_API_KEY=AIza...
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
FIREBASE_APP_ID=1:1234567890:web:abc123
FIREBASE_MESSAGING_SENDER_ID=1234567890
FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
```

`GET /api/config` serves these to the frontend, which then shows **Sign in with
Google** and attaches the token to contributions.

## 4. Security rules

`backend/firestore.rules` locks down direct client access — the browser may read
verified public map data, everything else (surveys, contributors, **safety
ratings**, **live reports**) is backend-only. All writes go through the FastAPI
backend via the Admin SDK, which bypasses these rules. `firebase.json` at the
repo root points the CLI at the rules + `backend/firestore.indexes.json` (no
composite indexes are needed yet). Deploy from the repo root:

```
npm i -g firebase-tools
firebase login
firebase use --add                  # pick your project, alias it "default"
firebase deploy --only firestore:rules
```

## 5. Seed data

```
cd backend && python seed.py        # pushes the curated Kochi segments + police stations to Firestore
```

## 6. (Optional) Require sign-in

By default sign-in is *available but optional* even with Firebase on — anonymous
/ dev-name contributions still work. To make every contribution require a valid
Google token, set in `backend/.env`:

```
AUTH_ENFORCED=true
```

Write endpoints then return `401` without a token. `GET /api/config` `auth_enforced`
and `GET /api/status` `auth` reflect the current mode.

## Verify it took

```
curl -s localhost:8000/api/status | python -m json.tool
```

Expect `"database": "Firestore"`, `"firestore_connected": true`, and an `auth`
line matching your `AUTH_ENFORCED` choice. `GET /api/config` should return a
`firebase` object (not `null`) and the frontend header should show
**Sign in with Google**.

## Behaviour summary

| | No Firebase (default) | Firebase, `AUTH_ENFORCED` unset | Firebase + `AUTH_ENFORCED=true` |
|---|---|---|---|
| Storage | `data/_local_emulation_store.json` | Firestore | Firestore |
| Identity | local "dev name", never blocks | Google sign-in optional | Google sign-in required |
| `GET /api/config` `firebase` | `null` | web config object | web config object |
| Write without token | attributed "Local dev" | attributed "Anonymous" | `401` |
