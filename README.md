# SafeRoute — Community-Powered Safe Navigation for Kochi

SafeRoute is a Google-Maps-style web application for Kochi that ranks routes and places by **how safe they are**, not just how fast. It fuses a transparent, explainable scoring model with live, location-tagged input from the people who actually use the streets.

## Features

- **Safe-corridor routing**: Ranks route alternatives by a 0–100 safety score computed from lighting, foot traffic, police proximity, incident history, road condition, and time of day.
- **Community map contributions**: Users can drop points for broken streetlights, potholes, dark areas, etc. Features an append-only lifecycle log, severity, recurrence count, and an anonymity toggle.
- **Safety ratings & "safety spots"**: A subjective 1-5 rating system with tags and comments. Nearby ratings cluster into spots and subtly influence the computed safety score.
- **Live "happening now" layer**: Short-lived, geo-tagged reports (alerts like flooding, accidents; vibes like street food, live music). Supports photos, voting, and auto-expires.
- **Police jurisdiction**: Shows the nearest police station and the station whose jurisdiction covers the point, with a Directions link.
- **Municipality report**: A dedicated dashboard for local bodies to identify chronic issues, prioritizing recurring problems like persistent potholes.

## Architecture

- **Frontend**: React 19 + Vite, Firebase JS SDK (Google Sign-In), Google Maps JS API. Deployed to Firebase Hosting.
- **Backend**: FastAPI (Python). Deployed to Google Cloud Run.
- **Database / Storage**: Firebase Firestore & Cloud Storage.
- **External Services**: Google Maps API (Directions & Geocoding), Gemini API (optional, for event discovery and natural-language route explanations).

*(See [DOCUMENTATION.md](DOCUMENTATION.md) for full architectural details and diagrams.)*

## Getting Started (Local Development)

### Prerequisites
- Node.js
- Python (3.10+)

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/MaheswariDarish/SafeRouteKochi.git
   cd saferoute
   ```

2. **Backend Setup:**
   ```bash
   cd backend
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   
   # Copy the environment file and configure your API keys
   cp .env.example .env
   # Add your GOOGLE_MAPS_API_KEY to .env
   
   # Start the FastAPI server
   uvicorn main:app --reload
   ```

3. **Frontend Setup:**
   ```bash
   cd frontend
   npm install
   
   # Start the Vite dev server
   npm run dev
   ```

*Note: SafeRoute is designed to gracefully degrade. If no Firebase credentials are provided, it automatically falls back to a local JSON store for data and skips authentication, making local development seamless!*

## Deployment

SafeRoute is deployed using Google Cloud Run for the backend and Firebase Hosting for the frontend. For detailed deployment instructions, see [DEPLOY.md](DEPLOY.md).
