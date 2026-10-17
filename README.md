# Dispatch Lab — Smart Food Delivery Agent Simulator

A Python simulation engine with a React interface for exploring seven explainable delivery-agent architectures. Python owns scenario validation, agent decisions, reasoning traces, learning updates, diagnostics, and batch results. The frontend renders the data returned by FastAPI, including the SVG architecture traces.

## Requirements

- Python 3.12 (the development environment used Python 3.12.10)
- Node.js 20+

## Start the backend

```sh
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The API documentation is at <http://localhost:8000/docs>.

## Start the frontend

In a second terminal:

```sh
cd frontend
npm install
npm run dev
```

The Vite app uses `http://localhost:8000` by default. Set `VITE_API_URL` to use another API origin.

## Verify

```sh
cd backend
source .venv/bin/activate
python -m pytest -q
cd ../frontend
npm run build
```

The Testing Center runs the application diagnostics through the API. Those checks complement the pytest development suite.

## Deploy frontend and backend separately on Vercel

Deploy this GitHub repository as two Vercel projects. In both projects, select the same repository and set the **Root Directory** shown below.

### Backend project

- Root Directory: `backend`
- Framework preset: **Other** (Vercel detects the Python ASGI app from `main.py`)
- Python version: `3.12` (matches `backend/.python-version`)
- Environment variable: `CORS_ORIGINS` = the frontend production origin, for example `https://your-frontend.vercel.app` (comma-separated origins are supported)
- After deployment, verify `https://your-backend.vercel.app/api/health` and `https://your-backend.vercel.app/docs`.

### Frontend project

- Root Directory: `frontend`
- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `VITE_API_URL` = the backend origin, for example `https://your-backend.vercel.app` (no trailing path)

Set the frontend environment variable before building, then redeploy the frontend. If you use Vercel preview deployments, add their exact origins to the backend's `CORS_ORIGINS` value as well.

### Persistence on Vercel

The simulator's local JSON learning store is intended for development. Vercel functions use temporary, non-persistent storage, so learning history or custom data written by a deployed function may not survive a cold start or be shared between instances. Use a persistent database or external storage before relying on saved data in production.
