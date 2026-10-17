"""Agent + architecture endpoints."""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException

from app.agents import AgentRegistry
from app.agents.architectures import AGENT_ORDER, all_architectures, get_architecture
from app.schemas import AgentInfo, Architecture

router = APIRouter(prefix="/api", tags=["agents"])


def _registry(app_state) -> AgentRegistry:  # app.main sets app_state.registry
    return app_state.registry


@router.get("/health")
def health() -> dict:
    from app.main import STATE
    return {
        "status": "ok",
        "service": "smart-food-delivery-simulator",
        "version": "1.0.0",
        "agents": len(AGENT_ORDER),
        "python_engine": "deterministic-simulation",
    }


@router.get("/agents", response_model=List[AgentInfo])
def agents() -> List[AgentInfo]:
    from app.main import STATE
    return STATE.registry.info()


@router.get("/architecture", response_model=List[Architecture])
def architectures() -> List[Architecture]:
    return all_architectures()


@router.get("/architecture/{agent_id}", response_model=Architecture)
def architecture(agent_id: str) -> Architecture:
    arch = get_architecture(agent_id)
    if arch is None:
        raise HTTPException(status_code=404, detail=f"Unknown agent '{agent_id}'")
    return arch
