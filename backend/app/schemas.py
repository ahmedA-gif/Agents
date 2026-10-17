"""Pydantic models shared by the FastAPI API layer and the simulation engine.

The backend is the single source of truth for agent behaviour; the React
frontend only *visualises* the structured decisions and reasoning traces
produced here.
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

TrafficLevel = Literal["light", "moderate", "heavy"]
WeatherKind = Literal["clear", "rain"]
PriorityKind = Literal["normal", "urgent"]


class Route(BaseModel):
    """One delivery route as observed by the environment in this scenario."""

    id: str = Field(..., min_length=1, max_length=3, description="Short id, e.g. 'A'")
    name: str = Field(..., min_length=1, max_length=60)
    distance_km: float = Field(..., gt=0, le=100)
    travel_time_min: float = Field(..., gt=0, le=240, description="Effective time already including traffic")
    traffic_level: TrafficLevel = "light"
    cost: float = Field(0, ge=0, le=10000, description="Delivery toll/cost in Rs.")
    available: bool = True


class Scenario(BaseModel):
    """A delivery scenario: environment conditions plus candidate routes."""

    id: str
    name: str
    description: str = ""
    weather: WeatherKind = "clear"
    priority: PriorityKind = "normal"
    deadline_min: float = Field(..., gt=0, le=600)
    order_value: float = Field(500.0, ge=0)
    routes: List[Route] = Field(..., min_length=1, max_length=5)
    custom: bool = False


class TraceStep(BaseModel):
    """One reasoning event. `node_id` maps to the agent architecture graph,
    which is what drives the animated SVG diagram in the frontend."""

    index: int
    node_id: str
    phase: Literal["perceive", "reason", "decide", "plan", "act", "learn", "outcome"]
    label: str
    detail: str
    data: Dict[str, Any] = Field(default_factory=dict)


class AgentDecision(BaseModel):
    """Full structured result of one agent run on one scenario."""

    agent_id: str
    agent_name: str
    scenario_id: str
    scenario_name: str
    action: str
    selected_route_id: Optional[str] = None
    eta_min: Optional[float] = None
    cost: Optional[float] = None
    deadline_min: float
    on_time: Optional[bool] = None
    summary: str
    plain_explanation: str = ""
    reasoning: List[TraceStep]
    data: Dict[str, Any] = Field(default_factory=dict)

    @property
    def status_text(self) -> str:
        if self.on_time is None:
            return "no delivery"
        return "on time" if self.on_time else "late"


class ArchNode(BaseModel):
    id: str
    label: str
    type: Literal[
        "environment", "percept", "sensor", "rule", "state", "memory",
        "model", "goal", "plan", "utility", "task", "context",
        "decision", "action", "feedback",
    ]
    x: float
    y: float
    w: float = 180
    h: float = 58
    detail: str = ""


class ArchEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str = ""
    dashed: bool = False


class Architecture(BaseModel):
    """Node/edge definition of one agent's architecture diagram.

    The frontend renders this as an SVG diagram and animates the reasoning
    trace over these exact node ids."""
    agent_id: str
    title: str
    summary: str
    strengths: List[str] = Field(default_factory=list)
    weaknesses: List[str] = Field(default_factory=list)
    nodes: List[ArchNode]
    edges: List[ArchEdge]


class AgentInfo(BaseModel):
    id: str
    name: str
    tagline: str
    description: str
    color: str
    strengths: List[str]
    weaknesses: List[str]


class ValidateResult(BaseModel):
    valid: bool
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class DiagnosticCheck(BaseModel):
    name: str
    group: str
    passed: bool
    detail: str
    duration_ms: float


class DiagnosticReport(BaseModel):
    total: int
    passed: int
    failed: int
    duration_ms: float
    checks: List[DiagnosticCheck]


class LearningRecord(BaseModel):
    route_id: str
    traffic: str
    weather: str
    eta_min: float
    actual_min: float
    on_time: bool
    seq: int


class LearningMemoryState(BaseModel):
    deliveries: List[LearningRecord]
    route_stats: Dict[str, Dict[str, Any]]
    source: str
