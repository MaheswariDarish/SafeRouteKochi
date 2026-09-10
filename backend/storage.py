"""
Firebase Storage for user uploads (event posters, live-report photos).

Thin wrapper over the Admin SDK's Storage client. When Storage isn't reachable
(no Firebase creds, or the bucket doesn't exist yet) every call reports failure
so the caller falls back to the local `data/uploads/` disk path — day-to-day
dev keeps working with no bucket.

Files uploaded before Storage was switched on stay on disk; the GET endpoints
check disk first, then Storage, so nothing needs migrating.
"""

import os
import threading
from datetime import timedelta
from typing import Optional, Tuple

_bucket = None
_enabled: Optional[bool] = None
_lock = threading.Lock()


def _bucket_name() -> str:
    b = os.environ.get("FIREBASE_STORAGE_BUCKET")
    if b:
        return b
    pid = os.environ.get("FIREBASE_PROJECT_ID") or os.environ.get("GOOGLE_CLOUD_PROJECT")
    return f"{pid}.firebasestorage.app" if pid else ""


def enabled() -> bool:
    global _bucket, _enabled
    if _enabled is not None:
        return _enabled

    with _lock:
        if _enabled is not None:
            return _enabled

        from data.data_access import firebase_app_ready

        name = _bucket_name()
        if not firebase_app_ready() or not name:
            _enabled = False
            return False
        try:
            from firebase_admin import storage as fb_storage

            b = fb_storage.bucket(name)
            if not b.exists():
                print(f"[storage] bucket '{name}' not found — uploads stay on local disk.")
                _enabled = False
                return False
            _bucket = b
            _enabled = True
            print(f"[storage] Firebase Storage ready ({name}).")
        except Exception as e:  # noqa: BLE001
            print(f"[storage] init failed ({e}) — uploads stay on local disk.")
            _enabled = False
        return _enabled


def upload(object_path: str, data: bytes, content_type: str) -> bool:
    if not enabled():
        return False
    try:
        blob = _bucket.blob(object_path)
        blob.upload_from_string(data, content_type=content_type)
        return True
    except Exception as e:  # noqa: BLE001
        print(f"[storage] upload {object_path} failed: {e}")
        return False


def signed_url(object_path: str, minutes: int = 120) -> Optional[str]:
    if not enabled():
        return None
    try:
        blob = _bucket.blob(object_path)
        if not blob.exists():
            return None
        return blob.generate_signed_url(expiration=timedelta(minutes=minutes), version="v4")
    except Exception as e:  # noqa: BLE001
        print(f"[storage] sign {object_path} failed: {e}")
        return None


def fetch(object_path: str) -> Optional[Tuple[bytes, str]]:
    """Fallback when a signed URL can't be minted — stream the bytes ourselves."""
    if not enabled():
        return None
    try:
        blob = _bucket.blob(object_path)
        if not blob.exists():
            return None
        return blob.download_as_bytes(), blob.content_type or "application/octet-stream"
    except Exception as e:  # noqa: BLE001
        print(f"[storage] fetch {object_path} failed: {e}")
        return None


def delete(object_path: str) -> None:
    if not enabled():
        return
    try:
        _bucket.blob(object_path).delete()
    except Exception:  # noqa: BLE001
        pass
