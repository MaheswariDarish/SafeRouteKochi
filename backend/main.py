import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Load .env file from current directory or backend directory
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

from routes import router as saferoute_router
from agent.gemini_client import is_gemini_configured
from auth import is_auth_enforced, firebase_ready
from data.data_access import is_using_firestore


def _firebase_web_config():
    """Firebase JS SDK config for the frontend, assembled from env vars.
    Returns None until the project is set up (see backend/SETUP_FIREBASE.md)."""
    api_key = os.environ.get("FIREBASE_API_KEY")
    project_id = os.environ.get("FIREBASE_PROJECT_ID")
    if not api_key or not project_id:
        return None
    return {
        "apiKey": api_key,
        "authDomain": os.environ.get("FIREBASE_AUTH_DOMAIN", f"{project_id}.firebaseapp.com"),
        "projectId": project_id,
        "appId": os.environ.get("FIREBASE_APP_ID", ""),
        "messagingSenderId": os.environ.get("FIREBASE_MESSAGING_SENDER_ID", ""),
        "storageBucket": os.environ.get("FIREBASE_STORAGE_BUCKET", f"{project_id}.appspot.com"),
    }

app = FastAPI(
    title="SafeRoute API",
    description="AI-Integrated Safe Route Navigator with Google Gemini, Google Maps, and Firestore",
    version="1.0.0",
)

# Enable CORS for local web development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(saferoute_router)


@app.get("/api/config")
def get_client_config():
    """Provides public client keys (e.g. Google Maps JS API key) securely."""
    return {
        "google_maps_api_key": os.environ.get("GOOGLE_MAPS_API_KEY", ""),
        "has_gemini": is_gemini_configured(),
        "has_firestore": is_using_firestore(),   # datastore actually on Firestore
        "has_auth": firebase_ready(),            # Admin SDK up — ID tokens verified
        "firebase": _firebase_web_config(),      # web SDK config for the frontend
        "auth_enforced": is_auth_enforced(),
    }


# Serve frontend static assets if frontend directory exists
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_react_app(full_path: str):
        file_target = FRONTEND_DIST / full_path
        if file_target.is_file():
            return FileResponse(file_target)
        return FileResponse(FRONTEND_DIST / "index.html")

