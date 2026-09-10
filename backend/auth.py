"""
Contributor identity for SafeRoute.

Default: **anonymous-friendly**. No sign-in is required and an unauthenticated
write is never rejected — it's attributed to "Anonymous" (or an
`X-Contributor-Name` header, if the client sends one). When Firebase is
configured and the client sends a valid `Authorization: Bearer <idToken>`, the
real Google identity is attached instead.

Set `AUTH_ENFORCED=true` (only meaningful once Firebase is configured) to flip
to sign-in-required: contribution endpoints then 401 without a valid token.
"""

import os
import re
from typing import Optional

from fastapi import Header, HTTPException

from data.data_access import firebase_app_ready


def firebase_ready() -> bool:
    """True when the Firebase Admin SDK is initialised — i.e. ID tokens can be
    verified. This is independent of whether Firestore is the datastore, so
    sign-in works even before the Firestore database is created."""
    return firebase_app_ready()


def _enforce_flag() -> bool:
    return os.environ.get("AUTH_ENFORCED", "").strip().lower() in ("1", "true", "yes", "on")


def is_auth_enforced() -> bool:
    """Sign-in required? Only when Firebase is up AND AUTH_ENFORCED is set."""
    return firebase_ready() and _enforce_flag()


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (name or "").strip().lower()).strip("-")


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    x_contributor_name: Optional[str] = Header(default=None),
) -> dict:
    """FastAPI dependency. Returns {uid, name, email, picture, admin, mode}.
    Raises 401 only when AUTH_ENFORCED is set and no valid token is present;
    otherwise an unauthenticated caller is "Anonymous"."""
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
            print("[auth] token verification failed:", e)
            if is_auth_enforced():
                raise HTTPException(status_code=401, detail="Invalid or expired sign-in token")

    if is_auth_enforced():
        raise HTTPException(status_code=401, detail="Sign in to contribute")

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
