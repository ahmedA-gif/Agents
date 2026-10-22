"""FastAPI application for the Smart Food Delivery Agent Simulator."""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agents import AgentRegistry
from app.api import agents as agents_api
from app.api import diagnostics_router, scenarios as scenarios_api
from app.api import simulations as simulations_api
from app.simulation.engine import SimulationEngine
from app.simulation.scenarios import ScenarioStore


class AppState:
    """Process-wide singletons shared by the API routers."""

    registry: AgentRegistry
    scenario_store: ScenarioStore
    engine: SimulationEngine

    def __init__(self) -> None:
        self.registry = AgentRegistry()
        self.scenario_store = ScenarioStore()
        self.engine = SimulationEngine(self.registry)


STATE = AppState()

app = FastAPI(
    title="Smart Food Delivery Agent Simulator",
    description=(
        "Python simulation engine implementing seven agent architectures for a food "
        "delivery domain. The React frontend visualises the structured decisions, "
        "reasoning traces and results produced here."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip()],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?|https://.*\.vercel\.app",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents_api.router)
app.include_router(scenarios_api.router)
app.include_router(simulations_api.router)
app.include_router(diagnostics_router.router)


@app.get("/")
def root() -> dict:
    return {
        "service": "Smart Food Delivery Agent Simulator",
        "docs": "/docs",
        "api": "/api/health",
        "agents": 7,
        "default_scenarios": 3,
    }
