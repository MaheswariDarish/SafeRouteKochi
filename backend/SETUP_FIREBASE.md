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

## 4. (Optional) Security rules

`firestore.rules` locks down direct client access (all writes go through the
backend). Deploy with the Firebase CLI:

```
npm i -g firebase-tools
firebase login
firebase deploy --only firestore:rules --project your-project-id
```

## 5. Seed data

```
cd backend && python seed.py        # pushes the curated Kochi segments + a few police stations
```

## Behaviour summary

| | No Firebase (default) | Firebase configured |
|---|---|---|
| Storage | `data/_local_emulation_store.json` | Firestore |
| Identity | local "dev name" prompt, never blocks | Google Sign-In required to contribute |
| `GET /api/config` `firebase` | `null` | web config object |
| Write without token | attributed "Local dev" | `401` |
