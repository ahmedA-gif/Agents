"""Architecture graph definitions for all seven agents.

Each graph is a set of typed nodes (with SVG coordinates on a 960x520 canvas)
plus directed edges. Trace steps produced by the agents reference these node
ids, so the frontend animation always mirrors what the Python engine
actually computed.
"""
from __future__ import annotations

from typing import Dict, List

from app.schemas import ArchEdge, ArchNode, Architecture


def _n(id: str, label: str, type: str, x: float, y: float, w: float = 180,
       h: float = 58, detail: str = "") -> ArchNode:
    return ArchNode(id=id, label=label, type=type, x=x, y=y, w=w, h=h, detail=detail)


def _e(id: str, source: str, target: str, label: str = "", dashed: bool = False) -> ArchEdge:
    return ArchEdge(id=id, source=source, target=target, label=label, dashed=dashed)


def _simple_reflex() -> Architecture:
    nodes = [
        _n("env", "Delivery World", "environment", 40, 150, 190, 62,
           "Emits percepts: weather, priority, deadline, routes."),
        _n("percept", "Percept Reader", "percept", 290, 150, 190, 62,
           "Reads ONLY the current percept. No memory, no state."),
        _n("r1", "R1  urgent → fastest", "rule", 540, 40, 230, 54,
           "IF priority == urgent THEN choose fastest available route."),
        _n("r2", "R2  rain → avoid congestion", "rule", 540, 122, 230, 54,
           "IF weather == rain THEN choose lightest-traffic route, tie-break by time."),
        _n("r3", "R3  default → fastest", "rule", 540, 204, 230, 54,
           "IF any route available THEN choose fastest available route."),
        _n("action", "Action Emitter", "action", 800, 122, 140, 62,
           "Emits the delivery action for the first rule that fired."),
        _n("outcome", "Delivery Outcome", "environment", 800, 240, 140, 56,
           "Feedback: world moves on; the agent stores nothing."),
    ]
    edges = [
        _e("e1", "env", "percept", "percept"),
        _e("e2", "percept", "r1", "test R1"),
        _e("e3", "r1", "r2", "else"),
        _e("e4", "r2", "r3", "else"),
        _e("e5", "r1", "action", "on fire"),
        _e("e6", "r2", "action", "on fire"),
        _e("e7", "r3", "action", "on fire"),
        _e("e8", "action", "outcome", ""),
        _e("e9", "outcome", "env", "next percept", dashed=True),
    ]
    return Architecture(
        agent_id="simple_reflex",
        title="Simple Reflex Agent",
        summary="Condition–action rules evaluated against the CURRENT percept only. "
                "No internal state, no memory of the past, no lookahead.",
        strengths=["Extremely fast and simple", "Fully explainable rule list", "Predictable behaviour"],
        weaknesses=["Ignores deadline feasibility", "Cannot remember or learn", "Rule order silently changes behaviour"],
        nodes=nodes, edges=edges,
    )


def _model_based() -> Architecture:
    nodes = [
        _n("env", "Delivery World", "environment", 40, 160, 180, 62),
        _n("percept", "Percept Reader", "percept", 250, 160, 180, 62),
        _n("memory", "Internal State", "memory", 490, 160, 210, 62,
           "Remembers last weather, route congestion history, past runs."),
        _n("update", "State Update", "state", 740, 160, 190, 62,
           "Folds the new percept into the previous state."),
        _n("model", "World Model", "model", 490, 280, 210, 62,
           "Inference: chronic congestion, trends, risk."),
        _n("rules", "Model Rules", "rule", 740, 280, 190, 62,
           "Condition–action rules over the UPDATED state."),
        _n("action", "Action Emitter", "action", 250, 280, 180, 62),
    ]
    edges = [
        _e("e1", "env", "percept", "percept"),
        _e("e2", "percept", "memory", "read"),
        _e("e3", "memory", "update", "prior state"),
        _e("e4", "update", "model", "belief update"),
        _e("e5", "model", "rules", "informed rules"),
        _e("e6", "rules", "action", "select action"),
        _e("e7", "action", "env", "act in world", dashed=True),
    ]
    return Architecture(
        agent_id="model_based",
        title="Model-Based Reflex Agent",
        summary="Keeps an internal state that persists between percepts, updates it with "
                "each observation, and applies rules over the updated state / world model.",
        strengths=["Remembers past conditions", "Detects chronic congestion trends", "State is inspectable"],
        weaknesses=["Rules still hand-crafted", "No goal or utility reasoning", "Bounded state horizon"],
        nodes=nodes, edges=edges,
    )


def _goal_based() -> Architecture:
    nodes = [
        _n("env", "Delivery World", "environment", 40, 40, 180, 62),
        _n("goal", "Goal: Deliver ≤ Deadline", "goal", 270, 40, 220, 62,
           "Success condition: food delivered within deadline_min."),
        _n("candidates", "Candidate Routes", "plan", 530, 40, 210, 62,
           "Enumerate AVAILABLE routes (unavailable ones filtered out)."),
        _n("checks", "Feasibility Checker", "rule", 760, 40, 180, 62,
           "Test each route: travel_time_min ≤ deadline_min?"),
        _n("decision", "Goal Decision", "decision", 530, 200, 210, 64,
           "Pick fastest FEASIBLE route; else declare infeasible."),
        _n("fallback", "Fallback Planner", "model", 760, 200, 180, 60,
           "Documented fallback when the goal is unreachable."),
        _n("action", "Action Emitter", "action", 270, 200, 220, 64),
    ]
    edges = [
        _e("e1", "env", "goal", "situation"),
        _e("e2", "goal", "candidates", "sets target"),
        _e("e3", "candidates", "checks", "test each"),
        _e("e4", "checks", "decision", "feasible set"),
        _e("e5", "decision", "action", "commit"),
        _e("e6", "decision", "fallback", "if infeasible", dashed=True),
        _e("e7", "fallback", "action", "fallback action", dashed=True),
    ]
    return Architecture(
        agent_id="goal_based",
        title="Goal-Based Agent",
        summary="Reasons about an explicit goal — deliver before the deadline — by testing "
                "every available route for feasibility, then choosing the fastest feasible one. "
                "If no route can meet the deadline it honestly reports infeasibility.",
        strengths=["Deadline-aware", "Never falsely claims success", "Explicit feasibility evidence"],
        weaknesses=["Binary feasible/not view", "Ignores cost & comfort", "Fixed fallback policy"],
        nodes=nodes, edges=edges,
    )


def _utility_based() -> Architecture:
    nodes = [
        _n("env", "Delivery World", "environment", 40, 40, 180, 58),
        _n("percept", "Percept Reader", "percept", 270, 40, 180, 58),
        _n("factors", "Factor Extractor", "utility", 500, 40, 200, 58,
           "Time, cost, traffic comfort for each available route."),
        _n("normalize", "Normalizer (min-max)", "utility", 740, 40, 190, 58,
           "Scales each factor to 0–1 among available routes."),
        _n("scorer", "Weighted Scorer", "utility", 500, 190, 200, 62,
           "U = 0.50·time + 0.30·cost + 0.20·comfort"),
        _n("compare", "Comparator", "decision", 740, 190, 190, 62,
           "Argmax utility; ties broken by lower time."),
        _n("action", "Action Emitter", "action", 740, 330, 190, 60),
    ]
    edges = [
        _e("e1", "env", "percept", "percept"),
        _e("e2", "percept", "factors", "raw factors"),
        _e("e3", "factors", "normalize", "scale 0–1"),
        _e("e4", "normalize", "scorer", "apply weights"),
        _e("e5", "scorer", "compare", "rank"),
        _e("e6", "compare", "action", "best route"),
    ]
    return Architecture(
        agent_id="utility_based",
        title="Utility-Based Agent",
        summary="Scores every available route with a documented weighted formula "
                "U = 0.50·time + 0.30·cost + 0.20·comfort (min-max normalised) and picks the highest utility.",
        strengths=["Explicit, tunable scoring", "Handles trade-offs", "Every factor visible"],
        weaknesses=["Weights are fixed guesses", "No context adaptation", "No feasibility hard-check"],
        nodes=nodes, edges=edges,
    )


def _learning() -> Architecture:
    nodes = [
        _n("env", "Delivery World", "environment", 40, 40, 180, 58),
        _n("percept", "Percept Reader", "percept", 270, 40, 180, 58),
        _n("memory", "Experience Memory", "memory", 500, 30, 230, 66,
           "Per-route delivery history: counts, mean delay, on-time rate."),
        _n("predict", "Prediction Adjuster", "model", 740, 40, 190, 58,
           "Adds observed mean delay (similar context) to raw ETA."),
        _n("scorer", "Experience-Weighted Scorer", "utility", 740, 190, 190, 62,
           "U = 0.5·speed + 0.3·cost + 0.2·reliability"),
        _n("action", "Action Emitter", "action", 500, 190, 210, 66),
        _n("outcome", "Outcome Recorder", "feedback", 500, 330, 210, 62,
           "Observed actual arrival is written back to memory."),
    ]
    edges = [
        _e("e1", "env", "percept", "percept"),
        _e("e2", "percept", "memory", "lookup"),
        _e("e3", "memory", "predict", "history"),
        _e("e4", "predict", "scorer", "adjusted ETAs"),
        _e("e5", "scorer", "action", "argmax"),
        _e("e6", "action", "outcome", "observe"),
        _e("e7", "outcome", "memory", "update experience", dashed=True),
    ]
    return Architecture(
        agent_id="learning",
        title="Learning Agent",
        summary="Maintains a persistent experience memory of simulated deliveries. Past delays "
                "raise future time predictions and reliability shapes scoring — so experience "
                "genuinely changes subsequent decisions. Each run appends a new observed outcome.",
        strengths=["Improves with experience", "Persistent memory (JSON file)", "Learning loop is visible"],
        weaknesses=["Cold-start uses neutral priors", "Needs repeated runs to shine", "Simple statistics only"],
        nodes=nodes, edges=edges,
    )


def _hierarchical() -> Architecture:
    nodes = [
        _n("job", "Order Intake", "percept", 40, 40, 190, 58),
        _n("planner", "Task Planner", "state", 280, 40, 220, 62,
           "Decomposes delivery into the 6 required subtasks."),
        _n("t1", "1 Accept Order", "task", 40, 180, 190, 56),
        _n("t2", "2 Evaluate Conditions", "task", 280, 180, 220, 56),
        _n("t3", "3 Select Route", "task", 560, 180, 190, 56),
        _n("t4", "4 Pick Up Food", "task", 560, 300, 190, 56),
        _n("t5", "5 Deliver Food", "task", 280, 300, 220, 56),
        _n("t6", "6 Confirm Delivery", "task", 40, 300, 190, 56),
        _n("abort", "Abort (no route)", "model", 40, 420, 190, 56,
           "Only used if every route is unavailable."),
    ]
    edges = [
        _e("e1", "job", "planner", "build plan"),
        _e("e2", "planner", "t1", "start"),
        _e("e3", "t1", "t2", ""),
        _e("e4", "t2", "t3", ""),
        _e("e5", "t3", "t4", "route chosen"),
        _e("e6", "t4", "t5", ""),
        _e("e7", "t5", "t6", ""),
        _e("e8", "t3", "abort", "if unavailable", dashed=True),
    ]
    return Architecture(
        agent_id="hierarchical",
        title="Hierarchical Agent",
        summary="Executes the six assignment subtasks in strict sequence — accept order, "
                "evaluate conditions, select route, pick up food, deliver food, confirm delivery — "
                "tracking task progression step by step.",
        strengths=["Clear task decomposition", "Progress is observable", "Robust abort path"],
        weaknesses=["Sequential (slow by design)", "Route policy is simplistic", "No learning between tasks"],
        nodes=nodes, edges=edges,
    )


def _contextual() -> Architecture:
    nodes = [
        _n("env", "Delivery World", "environment", 40, 40, 180, 58),
        _n("percept", "Percept Reader", "percept", 270, 40, 180, 58),
        _n("ctxw", "Weather Context", "context", 270, 190, 180, 56,
           "Rain shifts weight to short-distance exposure."),
        _n("ctxp", "Priority Context", "context", 500, 190, 180, 56,
           "Urgency shifts weight toward speed."),
        _n("ctxt", "Traffic Context", "context", 730, 190, 180, 56,
           "Congestion lowers a route's comfort score."),
        _n("combiner", "Context Combiner", "decision", 500, 320, 200, 60,
           "Merges context into adapted weights."),
        _n("scorer", "Contextual Scorer", "utility", 730, 320, 180, 60,
           "Score routes with context-adapted weights."),
        _n("action", "Action Emitter", "action", 270, 320, 190, 60),
    ]
    edges = [
        _e("e1", "env", "percept", "percept"),
        _e("e2", "percept", "ctxw", ""),
        _e("e3", "percept", "ctxp", ""),
        _e("e4", "percept", "ctxt", ""),
        _e("e5", "ctxw", "combiner", ""),
        _e("e6", "ctxp", "combiner", ""),
        _e("e7", "ctxt", "combiner", ""),
        _e("e8", "combiner", "scorer", ""),
        _e("e9", "scorer", "action", "context-best route"),
    ]
    return Architecture(
        agent_id="contextual",
        title="Contextual Agent",
        summary="Fuses weather, priority and traffic context into adapted scoring weights, then "
                "chooses the best route for THIS situation — so changing context changes the decision.",
        strengths=["Situation-aware trade-offs", "Decision adapts to inputs", "Explains which context mattered"],
        weaknesses=["Weight blending hand-designed", "More complex to verify", "No memory or learning"],
        nodes=nodes, edges=edges,
    )


BUILDERS = {
    "simple_reflex": _simple_reflex,
    "model_based": _model_based,
    "goal_based": _goal_based,
    "utility_based": _utility_based,
    "learning": _learning,
    "hierarchical": _hierarchical,
    "contextual": _contextual,
}

_CACHE: Dict[str, Architecture] = {}


def get_architecture(agent_id: str) -> Architecture | None:
    if agent_id not in BUILDERS:
        return None
    if agent_id not in _CACHE:
        _CACHE[agent_id] = BUILDERS[agent_id]()
    return _CACHE[agent_id]


def all_architectures() -> List[Architecture]:
    return [get_architecture(a) for a in AGENT_ORDER if get_architecture(a) is not None]  # type: ignore[misc]


AGENT_ORDER = [
    "simple_reflex", "model_based", "goal_based", "utility_based",
    "learning", "hierarchical", "contextual",
]
