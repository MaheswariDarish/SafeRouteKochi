// Authenticated fetch. Attaches the Firebase ID token when signed in, otherwise
// an X-Contributor-Name header (a remembered local name) so dev/testing works
// before Firebase is set up. Use this for every contribution / confirm / resolve
// / report / brochure call.

import { getIdToken, firebaseConfigured } from './firebase';

const DEV_NAME_KEY = 'saferoute.devName';

export function getDevName() {
  try {
    return localStorage.getItem(DEV_NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function setDevName(name) {
  try {
    localStorage.setItem(DEV_NAME_KEY, name);
  } catch {
    /* storage blocked — ignore */
  }
}

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const token = await getIdToken().catch(() => null);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  } else if (!firebaseConfigured) {
    const dev = getDevName();
    if (dev) headers.set('X-Contributor-Name', dev);
  }

  return fetch(path, { ...options, headers });
}
