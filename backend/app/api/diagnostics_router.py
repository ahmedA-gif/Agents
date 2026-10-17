"""Diagnostics + learning-memory endpoints."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.api.diagnostics import run_diagnostics
from app.schemas import DiagnosticReport, LearningMemoryState

router = APIRouter(prefix="/api", tags=["diagnostics"])


@router.post("/diagnostics/run", response_model=DiagnosticReport)
def diagnostics() -> DiagnosticReport:
    return DiagnosticReport(**run_diagnostics())


class ResetRequest(BaseModel):
    mode: Optional[str] = "empty"  # Experience is only created by simulated deliveries.


@router.post("/learning/reset", response_model=LearningMemoryState)
def learning_reset(body: ResetRequest) -> LearningMemoryState:
    from app.main import STATE
    mode = "empty"
    STATE.registry.reset_learning(mode)
    return STATE.registry.learning_store.state()


@router.get("/learning/memory", response_model=LearningMemoryState)
def learning_memory() -> LearningMemoryState:
    from app.main import STATE
    return STATE.registry.learning_store.state()
