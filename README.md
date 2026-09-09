# PAWS (Predictive Animal Welfare System)

Tagline: Every dog deserves to be seen.

## Overview
Simple scaffold for the PAWS project designed for Google Patchamomma 2026.

- Backend: FastAPI + Vertex AI (Gemini 1.5 Flash) for vision triage.
- Persistence: Firestore + Cloud Storage (Firebase Admin SDK).
- Frontend: Single page responsive web app with local image compression and geolocation.
- Maps: Google Maps JavaScript API with a 15-second active-incident refresh for reporters and NGO users.

## Quickstart (local development)

1. Create a Python 3.11 virtual environment and install requirements:

```bash
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r backend/requirements.txt
```

2. Set up Google credentials and environment variables:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
export FIRESTORE_COLLECTION=incidents
export STORAGE_BUCKET=your-bucket-name
export GOOGLE_API_KEY=YOUR_VERTEX_API_KEY
export GOOGLE_MAPS_API_KEY=YOUR_BROWSER_RESTRICTED_MAPS_KEY

# Firebase client config for the frontend login screen
export VITE_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY
export VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
export VITE_FIREBASE_PROJECT_ID=your-project-id
export VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
export VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
export VITE_FIREBASE_APP_ID=YOUR_FIREBASE_APP_ID
```

All API keys stay in `backend/.env` or deployment secrets. The frontend requests the browser-restricted Maps key from the backend at runtime; because the Maps JavaScript API runs in the browser, that restricted key is necessarily visible in the browser network/runtime, but it is not stored in frontend source. Restrict it in Google Cloud by HTTP referrer and enable only the Maps JavaScript API. The backend map endpoint returns active incidents within 25 km of the user's location; it does not expose stored image references.

3. Run the FastAPI server (development):

```bash
cd backend
uvicorn backend.main:app --reload --port 8080
```

4. Open `frontend/index.html` in a browser (or serve the `frontend` folder via a static server).

## Deployment
- Build and push the Docker image in `backend/Dockerfile` to Google Container Registry and deploy to Cloud Run.
- Ensure the Cloud Run service has access to the service account with Firestore and Storage permissions.

## Notes
- The triage and image-compare functions include safe fallbacks when Vertex API keys are not configured.
- Review and adapt `backend/services/triage_service.py` to the exact Vertex AI SDK and response shape you choose.

---

# paws-app
PAWS (Predictive Animal Welfare System) is a modern PWA for real-time stray animal emergency reporting, multimodal Gemini AI injury triage, 1km spatial deduplication, community dog registry management (3km radius), and interactive NGO rescue dispatching. Built with React (Vite/Tailwind), FastAPI, Google Maps API, and Cloud Firestore.

