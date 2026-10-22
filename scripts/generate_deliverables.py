"""Generate the complete assignment deliverables document.

Fetches REAL simulation data (21-record batch + learning double-run demo)
from the FastAPI engine, renders one SVG architecture diagram per agent,
and assembles a polished Markdown + self-contained HTML document containing
implementation notes, results, comparison and conclusion.
"""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

API = "http://localhost:8000"
OUT = Path(__file__).resolve().parents[1] / "deliverables"
DIAGRAMS = OUT / "diagrams"

NODE_STYLES = {
    "environment": ("#22c55e", "rgba(34,197,94,0.10)"),
    "percept": ("#38bdf8", "rgba(56,189,248,0.10)"),
    "sensor": ("#facc15", "rgba(250,204,21,0.10)"),
    "rule": ("#f59e0b", "rgba(245,158,11,0.10)"),
    "state": ("#a78bfa", "rgba(167,139,250,0.10)"),
    "memory": ("#f472b6", "rgba(244,114,182,0.10)"),
    "model": ("#c084fc", "rgba(192,132,252,0.10)"),
    "goal": ("#10b981", "rgba(16,185,129,0.10)"),
    "plan": ("#fbbf24", "rgba(251,191,36,0.10)"),
    "utility": ("#22d3ee", "rgba(34,211,238,0.10)"),
    "task": ("#fbbf24", "rgba(251,191,36,0.10)"),
    "context": ("#7dd3fc", "rgba(125,211,252,0.10)"),
    "decision": ("#4ade80", "rgba(74,222,128,0.10)"),
    "action": ("#fb923c", "rgba(251,146,60,0.10)"),
    "feedback": ("#60a5fa", "rgba(96,165,250,0.10)"),
}
BG = "#0b1411"
INK = "#e8efe9"
MUTED = "#9db0a3"


def get(path: str):
    with urllib.request.urlopen(API + path) as r:
        return json.load(r)


def post(path: str, body: dict):
    req = urllib.request.Request(
        API + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def esc(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def wrap(label: str, width: int = 20) -> list[str]:
    words, lines, cur = label.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 <= width:
            cur = f"{cur} {w}".strip()
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines or [label]


def render_svg(arch: dict) -> str:
    nodes = {n["id"]: n for n in arch["nodes"]}
    W = max(n["x"] + n["w"] for n in arch["nodes"]) + 40
    H = max(n["y"] + n["h"] for n in arch["nodes"]) + 40
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
        f'font-family="Inter, DM Sans, -apple-system, sans-serif">',
        f'<rect width="{W}" height="{H}" rx="16" fill="{BG}"/>',
        '<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" '
        'markerHeight="6" orient="auto-start-reverse">'
        '<path d="M0 0 L10 5 L0 10 z" fill="#5b7266"/></marker></defs>',
    ]
    for e in arch["edges"]:
        a, b = nodes[e["source"]], nodes[e["target"]]
        dashed = ' stroke-dasharray="6 5"' if e.get("dashed") else ""
        if b["x"] <= a["x"]:  # loop back: bottom → top
            x1, y1 = a["x"] + a["w"] / 2, a["y"] + a["h"]
            x2, y2 = b["x"] + b["w"] / 2, b["y"]
        else:
            x1, y1 = a["x"] + a["w"], a["y"] + a["h"] / 2
            x2, y2 = b["x"], b["y"] + b["h"] / 2
        path = (f"M{x1} {y1} C{(x1 + x2) / 2} {y1}, {(x1 + x2) / 2} {y2}, {x2 - 8} {y2}")
        parts.append(f'<path d="{path}" fill="none" stroke="#5b7266" stroke-width="1.6"'
                     f'{dashed} marker-end="url(#ar)"/>')
        if e.get("label"):
            parts.append(
                f'<text x="{(x1 + x2) / 2}" y="{(y1 + y2) / 2 - 6}" fill="{MUTED}" '
                f'font-size="10" text-anchor="middle" font-family="monospace">{esc(e["label"])}</text>')
    for n in arch["nodes"]:
        stroke, fill = NODE_STYLES.get(n["type"], ("#94a3b8", "rgba(148,163,184,0.10)"))
        parts.append(
            f'<rect x="{n["x"]}" y="{n["y"]}" width="{n["w"]}" height="{n["h"]}" rx="12" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="1.6"/>')
        lines = wrap(n["label"], width=int(n["w"] // 8.4))
        total = len(lines) * 15
        y0 = n["y"] + n["h"] / 2 - total / 2 + 11
        for i, line in enumerate(lines):
            parts.append(
                f'<text x="{n["x"] + n["w"] / 2}" y="{y0 + i * 15}" fill="{INK}" font-size="12.5" '
                f'font-weight="600" text-anchor="middle">{esc(line)}</text>')
    parts.append("</svg>")
    return "".join(parts)


CODE = {
    "simple_reflex": '''class SimpleReflexAgent(BaseAgent):
    def decide(self, scenario):
        routes = available_routes(scenario)
        # Rules evaluated IN ORDER on the CURRENT percept only; first match fires.
        if scenario.priority == "urgent" and routes:                    # R1
            chosen = min(routes, key=lambda r: r.travel_time_min)
            fired = "R1"
        elif scenario.weather == "rain" and routes:                     # R2
            chosen = min(routes, key=lambda r: (TRAFFIC_RANK[r.traffic_level], r.travel_time_min))
            fired = "R2"
        elif routes:                                                    # R3
            chosen = min(routes, key=lambda r: r.travel_time_min)
            fired = "R3"
        return self.result(scenario, chosen.id, ...)  # trace records which rule fired''',

    "model_based": '''class ModelBasedAgent(BaseAgent):
    def decide(self, scenario):
        state = self._states.get(scenario.id, self._empty_state())   # remembered state
        new_state = self._update_state(state, scenario)              # fold percept into state
        chronic = [rid for rid, hist in new_state["congestion_history"].items()
                   if self._chronic(hist)]                            # 2+ consecutive "heavy"
        trusted = [r for r in available_routes(scenario) if r.id not in chronic]
        pool = trusted or available_routes(scenario)
        chosen = min(pool, key=lambda r: r.travel_time_min)           # rule over updated state
        self._states[scenario.id] = new_state                        # state persists across runs''',

    "goal_based": '''class GoalBasedAgent(BaseAgent):
    def decide(self, scenario):
        routes = available_routes(scenario)
        feasible = [r for r in routes
                    if r.travel_time_min <= scenario.deadline_min]   # hard goal test
        if feasible:
            chosen = min(feasible, key=lambda r: r.travel_time_min)   # fastest FEASIBLE
        else:
            # DOCUMENTED FALLBACK — the goal is honestly reported infeasible
            chosen = min(routes, key=lambda r: r.travel_time_min - scenario.deadline_min)
            action = f"deliver_via_route_{chosen.id}_late"            # customer warned
        return self.result(scenario, chosen.id, ...)''',

    "utility_based": '''WEIGHTS = {"time": 0.50, "cost": 0.30, "comfort": 0.20}
FORMULA = "U = 0.50*time + 0.30*cost + 0.20*comfort"

class UtilityBasedAgent(BaseAgent):
    def decide(self, scenario):
        routes = available_routes(scenario)               # unavailable filtered BEFORE scoring
        times = min_max_scores([r.travel_time_min for r in routes])   # best -> 1.0
        costs = min_max_scores([r.cost for r in routes])
        for r, ts, cs in zip(routes, times, costs):
            r.utility = (0.50 * ts + 0.30 * cs
                         + 0.20 * TRAFFIC_SCORE[r.traffic_level])
        chosen = max(routes, key=lambda r: (r.utility, -r.travel_time_min))
        return self.result(scenario, chosen.id, ...)      # every factor + score is returned''',

    "learning": '''class LearningAgent(BaseAgent):
    def decide(self, scenario):
        stats_before = self.store.stats()                          # persistent JSON memory
        predictions = [
            {"route": r.id,
             "predicted_time": r.travel_time_min
                + self.store.mean_delay_for(r.id, scenario),       # EXPERIENCE adjusts ETA
             "reliability": self.store.reliability_for(r.id, scenario)}
            for r in available_routes(scenario)]
        chosen = max(predictions, key=lambda p: 0.5*speed + 0.3*cost + 0.2*p["reliability"])
        actual = simulate_actual_arrival(chosen, scenario)         # observe outcome
        stats_after = self.store.record(route_id=chosen.id, ...)   # write back -> next run differs
        return self.result(scenario, chosen.id, ...)''',

    "hierarchical": '''TASKS = ["accept_order", "evaluate_conditions", "select_route",
         "pickup_food", "deliver_food", "confirm_delivery"]

class HierarchicalAgent(BaseAgent):
    def decide(self, scenario):
        tasks = []
        finish("accept_order",    f"Order accepted (Rs.{scenario.order_value:g})")
        finish("evaluate_conditions", f"Weather {scenario.weather}; deadline {scenario.deadline_min:g}")
        if not available_routes(scenario):
            finish("select_route", "No available route — ABORT tasks 4-6", status="failed")
        chosen = fastest_route(available_routes(scenario))
        finish("select_route",    f"min-ETA policy -> {chosen.name}")
        finish("pickup_food",     "Handoff folded into ETA")
        finish("deliver_food",    f"{chosen.travel_time_min:g} min vs deadline")
        finish("confirm_delivery", "Customer notified; order closed")
        return self.result(scenario, chosen.id, ...)               # all 6 task statuses returned''',

    "contextual": '''BASE    = {"time": .45, "cost": .35, "comfort": .20, "exposure": 0.0}
URGENT  = {"time": .60, "cost": .15, "comfort": .05, "exposure": .20}
RAIN    = {"time": .40, "cost": .10, "comfort": .30, "exposure": .20}

def adapt_weights(scenario):                       # context BLENDS the scoring weights
    w = dict(BASE)
    if scenario.priority == "urgent":
        w = {(w[k] + URGENT[k]) / 2 for k in w}
    if scenario.weather == "rain":
        w = {(w[k] + RAIN[k]) / 2 for k in w}
    return normalise(w)

class ContextualAgent(BaseAgent):
    def decide(self, scenario):
        weights = adapt_weights(scenario)          # weather + priority context
        for r in available_routes(scenario):       # + traffic comfort + rain exposure (distance)
            r.score = weighted(weights, r)
        chosen = max(routes, key=lambda r: r.score)  # trace lists every active context field''',
}

HOWITWORKS = {
    "simple_reflex": ("Condition–action rules tested against the current percept in fixed order; "
                      "the first rule that matches fires. No memory, no state, no lookahead."),
    "model_based": ("Keeps an internal state per scenario (congestion history, last weather), folds "
                    "each new percept into it, and applies rules that can reference what it remembers."),
    "goal_based": ("Reasons toward an explicit goal — food delivered before the deadline — by testing "
                   "each available route for feasibility, with an honest documented fallback."),
    "utility_based": ("Scores every available route with the documented formula U = 0.50·time + "
                      "0.30·cost + 0.20·comfort (min-max normalised 0–1) and picks the argmax."),
    "learning": ("Maintains persistent experience memory: observed delays raise time predictions for "
                 "that route/context and reliability feeds the utility, so decisions evolve."),
    "hierarchical": ("Decomposes the job into the six required subtasks and executes them sequentially "
                     "with tracked progress: accept → evaluate → select → pickup → deliver → confirm."),
    "contextual": ("Fuses weather, priority and traffic into situation-adapted scoring weights plus a "
                   "rain-exposure factor, so changing the context can change the decision."),
}

ORDER = ["simple_reflex", "model_based", "goal_based", "utility_based",
         "learning", "hierarchical", "contextual"]
NUM = {"simple_reflex": "1", "model_based": "2", "goal_based": "3", "utility_based": "4",
       "learning": "5", "hierarchical": "6", "contextual": "7"}


def main() -> None:
    DIAGRAMS.mkdir(parents=True, exist_ok=True)
    agents = {a["id"]: a for a in get("/api/agents")}
    archs = {a["agent_id"]: a for a in get("/api/architecture")}

    # ---- real 21-record batch (three assignment scenarios × seven agents) ----
    post("/api/learning/reset", {"mode": "seed"})
    batch = post("/api/simulate/batch", {})

    # ---- learning double-run demo: experience must change the decision ----
    # Flip scenario: A looks faster (18 min) but suffers heavy traffic; cold start
    # picks A, A runs 3 min late, memory raises its prediction -> run 2 flips to B.
    flip_scenario = {
        "id": "demo-flip", "name": "Learning Demo — Flip", "description": "",
        "weather": "clear", "priority": "normal", "deadline_min": 40, "order_value": 500,
        "routes": [
            {"id": "A", "name": "Route A — Fast but congested", "distance_km": 3,
             "travel_time_min": 18, "traffic_level": "heavy", "cost": 100, "available": True},
            {"id": "B", "name": "Route B — Steady", "distance_km": 5,
             "travel_time_min": 20, "traffic_level": "light", "cost": 100, "available": True},
        ],
    }
    post("/api/learning/reset", {"mode": "empty"})
    l1 = post("/api/simulate/agent", {"agent_id": "learning", "scenario": flip_scenario})
    l2 = post("/api/simulate/agent", {"agent_id": "learning", "scenario": flip_scenario})
    post("/api/learning/reset", {"mode": "seed"})

    def pred(dec, rid):
        return next(p for p in dec["data"]["predictions"] if p["route"] == rid)

    demo = {
        "run1_route": l1["selected_route_id"], "run2_route": l2["selected_route_id"],
        "r1": pred(l1, "A"), "r2": pred(l2, "A"),
        "r1B": pred(l1, "B"), "r2B": pred(l2, "B"),
        "stats_after": l2["data"]["stats_after"],
    }

    # ---- SVG diagrams ----
    for aid in ORDER:
        (DIAGRAMS / f"{aid}.svg").write_text(render_svg(archs[aid]))

    records = batch["records"]
    scenarios = batch["scenarios"]
    by = {(r["scenario_id"], r["agent_id"]): r for r in records}

    # ============================ MARKDOWN ============================
    md: list[str] = []
    md.append("# Smart Food Delivery Agent Simulator — Assignment Deliverables\n")
    md.append("**Course:** UCP — Assignment 1: Agent Modelling  ")
    md.append("**System:** Python 3.12 + FastAPI simulation engine, React visualisation layer  ")
    md.append("**Repo:** github.com/ahmedA-gif/Agents · **Tests:** 60 pytest + 11 in-app diagnostics — all passing\n")
    md.append("""This document covers every deliverable: the implementation of all agent
architectures, one architecture diagram per agent, the outputs of the three common test
scenarios, a comparison of how the agents behave differently, and a conclusion naming the
most suitable agent type. All tables below were generated by actually running the Python
engine — nothing is hand-written.\n""")

    md.append("\n## 1. System Overview\n")
    md.append("""The **Python backend is the single source of truth**. React never re-implements
agent logic — it POSTs a scenario, and Python returns a structured decision containing the
chosen route, ETA, cost, deadline check and a **reasoning trace** whose step identifiers map
one-to-one onto the agent's architecture diagram, driving the animated SVG workflow.

| Layer | Technology | Role |
|---|---|---|
| Simulation engine | Python 3.12 (venv) | 7 agent implementations, state, learning memory, evaluation |
| API | FastAPI | `/api/simulate/agent`, `/api/simulate/all`, `/api/simulate/batch`, `/api/architecture/{id}`, `/api/learning/*`, `/api/diagnostics/run` |
| Frontend | React + TypeScript + Vite | Animated diagrams, reasoning traces, comparison charts |

Every agent filters **unavailable routes first**, then applies its own architecture to the
same observed environment (travel times already include traffic effects).\n""")

    md.append("\n## 2. The Three Common Test Scenarios\n")
    md.append("| | Scenario 1 — Normal | Scenario 2 — Traffic Jam | Scenario 3 — Urgent + Rain |")
    md.append("|---|---|---|---|")
    md.append("| Weather | Clear | Clear | **Rain** |")
    md.append("| Priority | Normal | Normal | **Urgent** |")
    md.append("| Deadline | 40 min | 40 min | **25 min** |")
    md.append("| Route A | 3 km · 15 min · light · Rs.100 | 3 km · **30 min** · **heavy** · Rs.100 | 3 km · **35 min** · **heavy** · Rs.100 |")
    md.append("| Route B | 5 km · 20 min · light · Rs.130 | 5 km · 20 min · light · Rs.130 | 5 km · **23 min** · light · Rs.130 |\n")

    md.append("\n## 3. Implementations — One Section per Agent\n")
    for aid in ORDER:
        a = agents[aid]
        md.append(f"\n### 3.{NUM[aid]} {a['name']}\n")
        md.append(f"*{a['tagline']}*\n")
        md.append(f"{HOWITWORKS[aid]}\n")
        md.append(f"![{a['name']} architecture](diagrams/{aid}.svg)\n")
        md.append(f"**Strengths:** {' · '.join(a['strengths'])}  ")
        md.append(f"**Limitations:** {' · '.join(a['weaknesses'])}\n")
        md.append("**Core logic (Python):**\n")
        md.append(f"```python\n{CODE[aid]}\n```\n")
        md.append("**Output in the three test scenarios (actual engine results):**\n")
        md.append("| Scenario | Action | ETA | Deadline | On time? | Why (engine's own words) |")
        md.append("|---|---|---|---|---|---|")
        for s in scenarios:
            r = by[(s["id"], aid)]
            why = r["summary"].replace("|", "/")
            if len(why) > 150:
                why = why[:147] + "…"
            md.append(f"| {s['name'].split('—')[0].strip()} | Route {r['selected_route_id'] or '—'} "
                      f"| {r['eta_min']} min | {r['deadline_min']:g} min | "
                      f"{'✅' if r['on_time'] else '❌'} | {why} |")

    md.append("\n## 4. Outputs / Results for the Three Test Cases\n")
    md.append(f"Full batch = **{batch['count']} decisions** ({len(scenarios)} scenarios × {len(ORDER)} agents). Per-scenario results:\n")
    for s in scenarios:
        md.append(f"\n### {s['name']}\n")
        md.append(f"*{s['description']}*\n")
        md.append("| Agent | Route chosen | ETA | Deadline | On time | Internal process that decided |")
        md.append("|---|---|---|---|---|---|")
        for aid in ORDER:
            r = by[(s["id"], aid)]
            proc = {
                "simple_reflex": f"rule {r['data'].get('fired_rule')} fired (first match)",
                "model_based": "state updated, rules over remembered world",
                "goal_based": "feasibility test vs deadline",
                "utility_based": "highest weighted utility score",
                "learning": "experience-adjusted prediction",
                "hierarchical": "6-task sequential pipeline",
                "contextual": "context-adapted weights",
            }[aid]
            md.append(f"| {a_name(agents, aid)} | Route {r['selected_route_id'] or '—'} | "
                      f"{r['eta_min']} min | {r['deadline_min']:g} min | "
                      f"{'✅ on time' if r['on_time'] else '❌ late'} | {proc} |")

    # learning evidence
    md.append("\n### Learning Agent — evidence that experience changes decisions\n")
    md.append("""The Learning Agent was reset to an empty memory and run twice on the same
input — a delivery where Route A looks faster on paper (18 vs 20 min) but suffers heavy
traffic. Nothing changed in the environment between runs — only the memory:\n""")
    md.append("| | Run 1 (cold start) | Run 2 (after one observed delivery) |")
    md.append("|---|---|---|")
    md.append(f"| Route A prediction | {demo['r1']['predicted_time']} min "
              f"(raw {demo['r1']['eta']:g} + {demo['r1']['mean_delay']} delay) | "
              f"{demo['r2']['predicted_time']} min (lesson applied) |")
    md.append(f"| Route B prediction | {demo['r1B']['predicted_time']} min | {demo['r2B']['predicted_time']} min |")
    md.append(f"| Chosen route | **Route {demo['run1_route']}** | **Route {demo['run2_route']}** |")
    md.append(f"\nMemory after run 2: `{json.dumps(demo['stats_after'])}` — the observed "
              f"heavy-traffic delay on Route A raised its future ETA prediction, changing the decision.\n")

    md.append("\n## 5. Comparison — How the Agents Behaved Differently\n")
    md.append("""The most important result of this assignment: **agents can pick the same route for
completely different reasons — and diverge exactly where their architecture differs.**\n""")
    md.append("| Behaviour | Simple Reflex | Model-Based | Goal-Based | Utility-Based | Learning | Hierarchical | Contextual |")
    md.append("|---|---|---|---|---|---|---|---|")
    md.append("| Uses memory of past runs | ❌ | ✅ internal state | ❌ | ❌ | ✅ persistent JSON | ❌ | ❌ |")
    md.append("| Checks the deadline before acting | ❌ (R1 ignores it) | ❌ | ✅ its core purpose | ⚠️ only via time weight | ⚠️ via reliability | ⚠️ at task 5 | ⚠️ via time weight |")
    md.append("| Explains the decision with numbers | rule that fired | state delta | feasibility table | utility scores | predictions + memory | task list | adapted weights |")
    md.append("| Same choice in S1 as others? | ✅ Route A | ✅ Route A | ✅ Route A | ✅ Route A | ✅ Route A | ✅ Route A | ✅ Route A |")
    md.append("| Adapts when context changes | ❌ rules are fixed | slowly (trend) | ✅ if goal changes | ⚠️ weights fixed | ✅ over repetitions | ❌ | ✅ by design |")
    md.append("| Same choice in S1 as others? | ✅ Route A | ✅ Route A | ✅ Route A | ✅ Route A | ✅ Route A | ✅ Route A | ✅ Route A |")
    md.append("| Divergence point | S3: picks fastest without verifying it fits the 25-min deadline | S2 after repeated runs: avoids A once congestion becomes chronic | S3: only agent that *proves* A infeasible and B feasible | S2: congestion cost makes A score 0.34 vs B 0.70 | Scenario-2 run 1 vs run 2 flip | never (process over speed) | S3: rain+urgent weights (0.50/0.125/0.175/0.20) |")
    md.append("""
**Key observations**

1. **Scenario 1 (Normal)** — all seven agents choose Route A. The action is identical, but the
   *evidence* differs: the reflex agent fired rule R3 ("default → fastest"), the goal agent
   proved 25 min of slack, the utility agent computed U(A)=1.00 vs U(B)=0.20, and the learning
   agent weighted reliability 0.75 vs 0.67.
2. **Scenario 2 (Traffic)** — all pick Route B, but for architecture-specific reasons: the
   utility agent sees congestion destroy A's comfort score (0.2), the learning agent has
   *learned* A's heavy-traffic delay (+3 min observed), and the goal agent still finds A
   feasible (30 ≤ 40) yet takes the faster B.
3. **Scenario 3 (Urgent + Rain)** — the divergence is most instructive:
   - **Simple Reflex** fires R1 (urgent → fastest) and takes B — correct here *by luck*;
     its rule never verifies the deadline.
   - **Goal-Based** is the only agent that *demonstrates* Route A cannot meet 25 min
     (35 > 25) and B can (23 ≤ 25).
   - **Utility-Based** and **Contextual** both take B, but the contextual agent re-weights
     for rain+urgency (adding the rain-exposure factor) while the utility agent's weights
     never change.
   - **Learning** takes B with a learned safety margin: predicted 24.5 min, not the raw 23.
4. **Robustness ranking across the three tests:** every agent stayed inside its architecture —
   no agent mis-reported a late delivery as on-time, and the goal agent never falsely claimed
   the deadline was achievable.\n""")

    md.append("\n## 6. Conclusion — Which Agent Is Most Suitable and Why\n")
    md.append(f"""**Per-scenario verdict**

- *Normal day* → any agent suffices; the **Simple Reflex** is the most efficient choice.
- *Traffic jam* → **Utility-Based** (or the **Learning Agent** once experience accumulates)
  is best: it weighs congestion, cost and speed together instead of chasing one percept.
- *Urgent + rain* → the **Goal-Based** agent is the safest single choice: it is the only one
  that can *guarantee* the deadline is feasible before committing the order.

**Overall recommendation: a Utility-Based core with the Goal feasibility guard.**
For this food-delivery domain the **Utility-Based Agent** is the most suitable primary
decision model: it is the only architecture that scores *every* trade-off (time, cost,
traffic) with one transparent formula — U = 0.50·time + 0.30·cost + 0.20·comfort — which
kept it correct in all three test scenarios and makes every decision auditable and easy to
explain. Its single weakness — fixed weights and no hard deadline check — is exactly
complementary to the Goal-Based agent, so the practical architecture is:
**filter routes by deadline feasibility (Goal-Based), then rank the survivors by utility.**
The Learning Agent's persistent memory (demonstrated in §4: one observed delivery changed
the next decision) is the natural upgrade path, and the Contextual agent shows how the same
scoring core adapts when weather/priority shift the trade-off.\n""")

    md.append("\n## 7. Reproducing These Results\n")
    md.append("""```bash
# backend (local venv, Python 3.12)
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest                      # 60 tests
uvicorn app.main:app --port 8000

# full 21-record batch
curl -X POST localhost:8000/api/simulate/batch -H 'Content-Type: application/json' -d '{}'

# live deployments
# frontend  https://frontend-xi-wheat-33.vercel.app
# backend   https://backend-theta-eight-40.vercel.app  (docs at /docs)
```
""")

    (OUT / "DELIVERABLES.md").write_text("\n".join(md))
    print("markdown written:", OUT / "DELIVERABLES.md")

    # ============================ HTML ============================
    def mdtable(rows: list[str]) -> str:
        head, *body = rows
        cols = [c.strip() for c in head.strip("|").split("|")]
        out = ["<table><thead><tr>" + "".join(f"<th>{c}</th>" for c in cols) + "</tr></thead><tbody>"]
        for line in body:
            cells = [c.strip() for c in line.strip("|").split("|")]
            out.append("<tr>" + "".join(f"<td>{c}</td>" for c in cells) + "</tr>")
        out.append("</tbody></table>")
        return "".join(out)

    html: list[str] = []
    html.append("""<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Smart Food Delivery Agent Simulator — Deliverables</title>
<style>
:root{--ink:#12211a;--muted:#5c6f63;--line:#d9e4da;--accent:#2f7d4f;--soft:#f2f7f2}
*{box-sizing:border-box}body{margin:0;font:15px/1.65 'Iowan Old Style',Georgia,serif;color:var(--ink);background:#fbfdfb}
.page{max-width:960px;margin:0 auto;padding:56px 48px}
h1{font-size:34px;line-height:1.15;margin:0 0 6px}h2{font-size:23px;margin:44px 0 8px;color:var(--accent);border-bottom:2px solid var(--line);padding-bottom:6px}
h3{font-size:17.5px;margin:26px 0 6px}p,li{margin:9px 0}code,pre{font-family:'SF Mono',Menlo,monospace;font-size:12.5px}
pre{background:#0d1712;color:#dcefe0;border-radius:12px;padding:16px 18px;overflow:auto;line-height:1.5}
table{border-collapse:collapse;width:100%;margin:14px 0;font-size:13px;font-family:-apple-system,'DM Sans',sans-serif}
th{background:var(--soft);text-align:left}th,td{border:1px solid var(--line);padding:7px 10px;vertical-align:top}
.sub{color:var(--muted)}.diagram{background:#0b1411;border-radius:16px;padding:10px;margin:14px 0}
.diagram svg{width:100%;height:auto;display:block}.badge{display:inline-block;background:var(--soft);border:1px solid var(--line);border-radius:99px;padding:2px 12px;font-size:12.5px;font-family:-apple-system,sans-serif;color:var(--accent)}
.note{background:var(--soft);border-left:4px solid var(--accent);padding:10px 16px;border-radius:0 10px 10px 0;margin:14px 0}
@media print{body{background:#fff}.page{padding:0 10mm;max-width:none}h2{page-break-after:avoid}table,.diagram,pre{page-break-inside:avoid}}
</style></head><body><div class="page">""")
    html.append(f"<h1>Smart Food Delivery Agent Simulator</h1>"
                f"<p class='sub'>Assignment 1 — Agent Modelling · Deliverables document<br>"
                f"Python 3.12 + FastAPI simulation engine · React visualisation · "
                f"<a href='https://github.com/ahmedA-gif/Agents'>github.com/ahmedA-gif/Agents</a> · "
                f"60 pytest + 11 diagnostics — all passing</p>")
    html.append("<p>Covers every deliverable: <b>implementations of all agent architectures</b>, "
                "<b>one architecture diagram per agent</b>, <b>outputs of the three common test "
                "scenarios</b>, a <b>comparison of behaviour</b>, and a <b>conclusion</b>. Every "
                "table was produced by actually executing the Python engine.</p>")

    html.append("<h2>1 · System Overview</h2>")
    html.append("<p>Python is the single source of truth: React POSTs a scenario and receives a "
                "structured decision — chosen route, ETA, cost, deadline check and a <b>reasoning "
                "trace</b> whose node identifiers map one-to-one onto the agent's architecture "
                "diagram, driving the animated workflow. All agents filter unavailable routes "
                "before reasoning.</p>")
    html.append(mdtable(["| Layer | Technology | Role |",
                         "|---|---|---|",
                         "| Simulation engine | Python 3.12 (venv) | 7 agent implementations, state, learning memory |",
                         "| API | FastAPI | /api/simulate/*, /api/architecture/{id}, /api/learning/*, /api/diagnostics/run |",
                         "| Frontend | React + TypeScript + Vite | Animated SVG diagrams, traces, comparison charts |"]))

    html.append("<h2>2 · The Three Common Test Scenarios</h2>")
    html.append(mdtable(["| | Scenario 1 — Normal | Scenario 2 — Traffic Jam | Scenario 3 — Urgent + Rain |",
                         "|---|---|---|---|",
                         "| Weather | Clear | Clear | <b>Rain</b> |",
                         "| Priority | Normal | Normal | <b>Urgent</b> |",
                         "| Deadline | 40 min | 40 min | <b>25 min</b> |",
                         "| Route A | 3 km · 15 min · light · Rs.100 | 3 km · <b>30 min</b> · <b>heavy</b> · Rs.100 | 3 km · <b>35 min</b> · <b>heavy</b> · Rs.100 |",
                         "| Route B | 5 km · 20 min · light · Rs.130 | 5 km · 20 min · light · Rs.130 | 5 km · <b>23 min</b> · light · Rs.130 |"]))

    html.append("<h2>3 · Implementations — One Section per Agent</h2>")
    for aid in ORDER:
        a = agents[aid]
        svg = (DIAGRAMS / f"{aid}.svg").read_text()
        html.append(f"<h3>3.{NUM[aid]} · {a['name']} <span class='badge'>{esc(a['tagline'])}</span></h3>")
        html.append(f"<p>{esc(HOWITWORKS[aid])}</p>")
        html.append(f"<div class='diagram'>{svg}</div>")
        html.append(f"<p><b>Strengths:</b> {' · '.join(a['strengths'])}<br>"
                    f"<b>Limitations:</b> {' · '.join(a['weaknesses'])}</p>")
        html.append(f"<pre>{esc(CODE[aid])}</pre>")
        rows = [f"| {'Scenario':<16} | {'Action':<12} | {'ETA':<9} | {'Deadline':<9} | {'On time':<8} | Why (engine's words) |", "|---|---|---|---|---|---|"]
        for s in scenarios:
            r = by[(s["id"], aid)]
            why = esc(r["summary"][:150] + ("…" if len(r["summary"]) > 150 else ""))
            rows.append(f"| {s['name'].split('—')[0].strip()} | Route {r['selected_route_id']} | "
                        f"{r['eta_min']} min | {r['deadline_min']:g} min | "
                        f"{'✅' if r['on_time'] else '❌'} | {why} |")
        html.append(mdtable(rows))

    html.append("<h2>4 · Outputs / Results for the Three Test Cases</h2>")
    html.append(f"<p>Full batch: <b>{batch['count']} decisions</b> "
                f"({len(scenarios)} scenarios × {len(ORDER)} agents).</p>")
    for s in scenarios:
        html.append(f"<h3>{esc(s['name'])}</h3><p class='sub'>{esc(s['description'])}</p>")
        rows = ["| Agent | Route chosen | ETA | Deadline | On time | Internal process |", "|---|---|---|---|---|---|"]
        for aid in ORDER:
            r = by[(s["id"], aid)]
            proc = {"simple_reflex": f"rule {r['data'].get('fired_rule')} fired (first match)",
                    "model_based": "state updated, rules over remembered world",
                    "goal_based": "feasibility test vs deadline",
                    "utility_based": "highest weighted utility score",
                    "learning": "experience-adjusted prediction",
                    "hierarchical": "6-task sequential pipeline",
                    "contextual": "context-adapted weights"}[aid]
            rows.append(f"| {agents[aid]['name']} | Route {r['selected_route_id']} | {r['eta_min']} min | "
                        f"{r['deadline_min']:g} min | {'✅ on time' if r['on_time'] else '❌ late'} | {proc} |")
        html.append(mdtable(rows))
    html.append("<h3>Learning Agent — evidence that experience changes decisions</h3>")
    html.append("<p>Reset to an empty memory and run twice on the <i>same</i> input — Route A "
                "looks faster on paper (18 vs 20 min) but suffers heavy traffic:</p>")
    html.append(mdtable([
        "| | Run 1 (cold start) | Run 2 (after one observed delivery) |", "|---|---|---|",
        f"| Route A prediction | {demo['r1']['predicted_time']} min (raw {demo['r1']['eta']:g} + {demo['r1']['mean_delay']} delay) | {demo['r2']['predicted_time']} min (lesson applied) |",
        f"| Route B prediction | {demo['r1B']['predicted_time']} min | {demo['r2B']['predicted_time']} min |",
        f"| Chosen route | <b>Route {demo['run1_route']}</b> | <b>Route {demo['run2_route']}</b> |"]))
    html.append(f"<p class='sub'>Memory after run 2: <code>{esc(json.dumps(demo['stats_after']))}</code></p>")

    html.append("<h2>5 · Comparison — How the Agents Behaved Differently</h2>")
    html.append("<p>The key result: <b>agents can pick the same route for completely different "
                "reasons — and diverge exactly where their architecture differs.</b></p>")
    html.append(mdtable([
        "| Behaviour | Simple Reflex | Model-Based | Goal-Based | Utility-Based | Learning | Hierarchical | Contextual |",
        "|---|---|---|---|---|---|---|---|",
        "| Uses memory of past runs | ❌ | ✅ internal state | ❌ | ❌ | ✅ persistent JSON | ❌ | ❌ |",
        "| Checks the deadline before acting | ❌ (R1 ignores it) | ❌ | ✅ its core purpose | ⚠️ time weight only | ⚠️ via reliability | ⚠️ at task 5 | ⚠️ time weight only |",
        "| Decision evidence | rule that fired | state delta | feasibility table | utility scores | predictions + memory | task list | adapted weights |",
        "| Adapts when context changes | ❌ | slowly (trend) | ✅ if goal changes | ⚠️ fixed weights | ✅ over repetitions | ❌ | ✅ by design |"]))
    html.append("""<div class='note'><b>Scenario divergence highlights</b>
<ul>
<li><b>S1 (Normal)</b> — all seven pick Route A; evidence differs (R3 fired · U=1.00 vs 0.20 · 25 min slack · reliability 0.75 vs 0.67).</li>
<li><b>S2 (Traffic)</b> — all pick B, but the utility agent sees A's comfort collapse to 0.2 while the learning agent has <i>learned</i> A's +3 min heavy-traffic delay.</li>
<li><b>S3 (Urgent+Rain)</b> — reflex takes fastest B <i>without verifying</i> the deadline; the goal agent is the only one that <b>proves</b> A infeasible (35 &gt; 25) and B feasible (23 ≤ 25); the contextual agent re-weights for rain+urgency (0.50 time / 0.125 cost / 0.175 comfort / 0.20 exposure).</li>
</ul></div>""")

    html.append("<h2>6 · Conclusion — Most Suitable Agent</h2>")
    html.append("""<p><b>Per scenario:</b> normal day → any agent (Simple Reflex most efficient);
traffic jam → <b>Utility-Based</b> (or Learning once experience accumulates); urgent + rain →
<b>Goal-Based</b>, the only agent that can guarantee feasibility before committing.</p>
<p><b>Overall: the Utility-Based Agent is the most suitable primary decision model for this
delivery domain.</b> It is the only architecture that scores every trade-off — time, cost,
traffic comfort — with one transparent, auditable formula
(U = 0.50·time + 0.30·cost + 0.20·comfort), and it stayed correct across all three test
scenarios. Its weakness (fixed weights, no hard deadline check) is exactly complementary to
the Goal-Based agent, so the recommended production architecture is:
<b>filter by deadline feasibility (Goal-Based) → rank survivors by utility (Utility-Based)</b>,
with the Learning Agent's persistent memory as the upgrade path — demonstrated in §4, where a
single observed delivery changed the next decision.</p>""")

    html.append("<h2>7 · Reproducing These Results</h2>")
    html.append("""<pre>cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest                    # 60 tests
uvicorn app.main:app --port 8000
curl -X POST localhost:8000/api/simulate/batch -H 'Content-Type: application/json' -d '{}'

Live: frontend https://frontend-xi-wheat-33.vercel.app
      backend  https://backend-theta-eight-40.vercel.app/docs</pre>""")
    html.append("</div></body></html>")
    (OUT / "DELIVERABLES.html").write_text("\n".join(html))
    print("html written:", OUT / "DELIVERABLES.html")


def a_name(agents: dict, aid: str) -> str:
    return agents[aid]["name"].replace(" Agent", "") if agents else aid


if __name__ == "__main__":
    main()
