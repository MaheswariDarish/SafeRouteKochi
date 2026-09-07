"""
Contributor identity for SafeRoute.

Contributions are **anonymous by default** — no sign-in is required and an
unauthenticated write is never rejected; it's simply attributed to "Anonymous"
(or an `X-Contributor-Name` header, if the client sends one).

Signing in is still *optional*: when Firebase is configured and the client
sends a valid `Authorization: Bearer <idToken>`, the real Google identity is
attached to the contribution instead. Flip this back to enforced later by
raising a 401 when `firebase_ready()` and no valid token is present.
"""

import re
from typing import Optional

from fastapi import Header

from data.data_access import is_using_firestore


def firebase_ready() -> bool:
    """True when the Firebase Admin SDK is available (Firestore configured)."""
    return is_using_firestore()


# Kept for backwards compatibility with older imports; auth is not enforced.
def is_auth_enforced() -> bool:
    return False


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (name or "").strip().lower()).strip("-")


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    x_contributor_name: Optional[str] = Header(default=None),
) -> dict:
    """FastAPI dependency. Returns {uid, name, email, picture, admin, mode}.
    Never raises — an unauthenticated caller is "Anonymous"."""
    if firebase_ready() and authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        try:
            from firebase_admin import auth as fb_auth

            decoded = fb_auth.verify_id_token(token)
            return {
                "uid": decoded["uid"],
                "name": decoded.get("name") or decoded.get("email") or "SafeRoute user",
                "email": decoded.get("email"),
                "picture": decoded.get("picture"),
                "admin": bool(decoded.get("admin", False)),
                "mode": "firebase",
            }
        except Exception as e:  # noqa: BLE001
            print("[auth] token verification failed — treating as anonymous:", e)

    name = (x_contributor_name or "").strip()
    if name and name.lower() != "anonymous":
        return {
            "uid": f"anon:{_slug(name) or 'x'}",
            "name": name,
            "email": None,
            "picture": None,
            "admin": False,
            "mode": "named-anon",
        }
    return {
        "uid": "anon",
        "name": "Anonymous",
        "email": None,
        "picture": None,
        "admin": False,
        "mode": "anonymous",
    }
