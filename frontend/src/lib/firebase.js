// Firebase Auth wrapper. Initialised lazily from /api/config's `firebase` block.
// When Firebase isn't configured yet, every export is a safe no-op and the app
// falls back to a local "dev name" identity (see lib/api.js).

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';

let _auth = null;
export let firebaseConfigured = false;

export function initFirebase(config) {
  if (_auth || !config?.apiKey || !config?.projectId) return _auth;
  const app = initializeApp(config);
  _auth = getAuth(app);
  firebaseConfigured = true;
  return _auth;
}

export function onAuthChange(cb) {
  if (!_auth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(_auth, (u) => {
    cb(
      u
        ? { uid: u.uid, name: u.displayName || u.email, email: u.email, photo: u.photoURL }
        : null
    );
  });
}

export async function signInWithGoogle() {
  if (!_auth) throw new Error('Sign-in is not configured yet.');
  const provider = new GoogleAuthProvider();
  const res = await signInWithPopup(_auth, provider);
  return res.user;
}

export async function signOutUser() {
  if (_auth) await signOut(_auth);
}

export async function getIdToken() {
  if (!_auth?.currentUser) return null;
  return _auth.currentUser.getIdToken();
}
