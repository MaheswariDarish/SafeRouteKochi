import os
import json
from pathlib import Path
from google import genai

_client = None

DEFAULT_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")


def _truthy(v: str) -> bool:
    return (v or "").strip().lower() in ("1", "true", "yes", "on")


def use_vertex() -> bool:
    """Vertex AI mode is on if explicitly requested, or implied by having a
    GCP project configured."""
    return _truthy(os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "")) or bool(
        os.environ.get("GOOGLE_CLOUD_PROJECT")
    )


def _adc_available() -> bool:
    """Best-effort check for Application Default Credentials, purely for a
    friendlier startup warning — Vertex AI mode is still attempted either
    way, since it may be running on GCP with an attached service identity."""
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if creds_path and os.path.exists(creds_path):
        return True
    return (Path.home() / ".config" / "gcloud" / "application_default_credentials.json").exists()


def is_gemini_configured() -> bool:
    """Cheap, no-network check of whether the environment looks set up for
    either auth mode. Used by /api/status — does not guarantee the
    credentials actually work, just that something is present."""
    if use_vertex():
        return bool(os.environ.get("GOOGLE_CLOUD_PROJECT"))
    return bool(os.environ.get("GEMINI_API_KEY"))


def get_client() -> genai.Client:
    global _client
    if _client is not None:
        return _client

    if use_vertex():
        project = os.environ.get("GOOGLE_CLOUD_PROJECT")
        location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
        if not project:
            raise RuntimeError(
                "GOOGLE_GENAI_USE_VERTEXAI is set but GOOGLE_CLOUD_PROJECT is not. "
                "Set GOOGLE_CLOUD_PROJECT to your GCP project id in backend/.env."
            )
        if not _adc_available():
            print(
                "[gemini_client] Warning: no Application Default Credentials found "
                "(GOOGLE_APPLICATION_CREDENTIALS unset and no gcloud ADC file). "
                "Vertex AI calls will fail unless this is running on GCP with an "
                "attached service account. Fix: set GOOGLE_APPLICATION_CREDENTIALS "
                "to a service account key JSON (needs the 'Vertex AI User' role), "
                "or run `gcloud auth application-default login`."
            )
        _client = genai.Client(vertexai=True, project=project, location=location)
        print(f"[gemini_client] Using Vertex AI (project={project}, location={location})")
    else:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError(
                "Neither GEMINI_API_KEY nor GOOGLE_GENAI_USE_VERTEXAI/GOOGLE_CLOUD_PROJECT "
                "is set. Get a key from https://aistudio.google.com/apikey (Developer API), "
                "or set GOOGLE_GENAI_USE_VERTEXAI=true + GOOGLE_CLOUD_PROJECT for Vertex AI."
            )
        _client = genai.Client(api_key=api_key)

    return _client


def generate_json(prompt: str, model: str = DEFAULT_MODEL) -> dict:
    """Calls Gemini and parses the response as JSON, stripping markdown
    fences if the model wraps its output in them."""
    client = get_client()
    response = client.models.generate_content(model=model, contents=prompt)
    text = response.text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


def generate_text(prompt: str, model: str = DEFAULT_MODEL) -> str:
    client = get_client()
    response = client.models.generate_content(model=model, contents=prompt)
    return response.text.strip()


def generate_grounded(prompt: str, model: str = DEFAULT_MODEL) -> dict:
    """Calls Gemini with the Google Search grounding tool enabled, so it can
    look up real, current information (news, temple/event announcements,
    whatever's publicly indexed) instead of relying on training data alone.
    Returns {"text": <raw model text>, "sources": [{"title","url"}, ...]}
    from the grounding citations, so callers can show where a claim came
    from. Works the same way in either Developer API or Vertex AI mode."""
    from google.genai import types

    client = get_client()
    config = types.GenerateContentConfig(tools=[types.Tool(google_search=types.GoogleSearch())])
    response = client.models.generate_content(model=model, contents=prompt, config=config)

    sources = []
    try:
        candidate = response.candidates[0]
        gm = getattr(candidate, "grounding_metadata", None)
        for chunk in (getattr(gm, "grounding_chunks", None) or []):
            web = getattr(chunk, "web", None)
            if web and getattr(web, "uri", None):
                sources.append({"title": getattr(web, "title", "") or web.uri, "url": web.uri})
    except Exception as e:  # noqa: BLE001
        print("[gemini_client] could not read grounding metadata:", e)

    return {"text": (response.text or "").strip(), "sources": sources}
