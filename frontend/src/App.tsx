import { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  Brain,
  Check,
  ChevronDown,
  Clock3,
  CloudRain,
  Compass,
  Database,
  Eye,
  FastForward,
  Gauge,
  GitBranch,
  HelpCircle,
  Layers,
  Layers3,
  MapPin,
  Pause,
  Play,
  RotateCcw,
  Route as RouteIcon,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Truck,
  Zap,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AgentBrain3D } from './components/AgentBrain3D';
import { BehaviorMatrix } from './components/BehaviorMatrix';
import { CityScene3D } from './components/CityScene3D';
import { CustomDataEditor } from './components/CustomDataEditor';
import { AGENT_PERSONAS, ExplainableJourney } from './components/ExplainableJourney';
import { api } from './services/api';
import type {
  AgentDecision,
  AgentInfo,
  Architecture,
  BatchResult,
  DiagnosticReport,
  LearningMemoryState,
  Scenario,
  TraceStep,
} from './types';

type View = 'overview' | 'input' | 'architectures' | 'behavior' | 'comparison' | 'diagnostics';

const fallbackAgents: AgentInfo[] = [
  ['simple_reflex', 'Simple Reflex', 'Responds to current percepts with fixed IF-THEN rules', '#f97316'],
  ['model_based', 'Model Based', 'Maintains an internal world state and congestion history', '#a78bfa'],
  ['goal_based', 'Goal Based', 'Rejects late routes and plans toward the delivery deadline', '#10b981'],
  ['utility_based', 'Utility Based', 'Balances travel time, cost, and route reliability', '#38bdf8'],
  ['learning', 'Learning Agent', 'Improves travel time estimates from simulated past outcomes', '#f472b6'],
  ['hierarchical', 'Hierarchical', 'Decomposes delivery into six structured operational tasks', '#fbbf24'],
  ['contextual', 'Contextual', 'Adapts dynamically to rain friction, surges, and urgency', '#22d3ee'],
].map(([id, name, tagline, color]) => ({
  id,
  name,
  tagline,
  description: tagline,
  color,
  strengths: [],
  weaknesses: [],
}));

function App() {
  const [view, setView] = useState<View>('overview');
  const [agents, setAgents] = useState<AgentInfo[]>(fallbackAgents);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [agentId, setAgentId] = useState('utility_based');
  const [scenarioId, setScenarioId] = useState('s1-normal');
  const [architecture, setArchitecture] = useState<Architecture | null>(null);
  const [decision, setDecision] = useState<AgentDecision | null>(null);
  const [batch, setBatch] = useState<BatchResult | null>(null);
  const [currentScenarioDecisions, setCurrentScenarioDecisions] = useState<AgentDecision[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticReport | null>(null);
  const [memory, setMemory] = useState<LearningMemoryState | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [draft, setDraft] = useState<Scenario | null>(null);
  const [compareScope, setCompareScope] = useState<'current' | 'suite'>('current');

  // Real-time animation triggers & controls
  const [autoPlayTrigger, setAutoPlayTrigger] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playTimerRef = useRef<number | null>(null);

  const activeAgent = agents.find((a) => a.id === agentId) ?? fallbackAgents[3];
  const activeScenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0] ?? null;
  const liveTrace = decision?.reasoning ?? [];
  const currentStep = liveTrace[Math.min(step, Math.max(0, liveTrace.length - 1))];

  const chartData = useMemo(
    () =>
      batch?.records.map((r, i) => ({
        label: `${r.agent_name.split(' ')[0]} · ${r.scenario_name.match(/Scenario (\d)/)?.[1] ?? i}`,
        eta: r.eta_min ?? 0,
        deadline: r.deadline_min,
        agent: r.agent_name,
        route: r.selected_route_id,
      })) ?? [],
    [batch]
  );

  // Initial Load
  useEffect(() => {
    api
      .health()
      .then(() => setConnected(true))
      .catch(() => setConnected(false));

    api
      .agents()
      .then(setAgents)
      .catch(() => {});

    api
      .scenarios()
      .then((items) => {
        setScenarios(items);
        if (items[0]) {
          setScenarioId(items[0].id);
          setDraft(structuredClone(items[0]));
        }
      })
      .catch((e) => setError(`Backend unavailable: ${e.message}`));

    api
      .learningMemory()
      .then(setMemory)
      .catch(() => {});
  }, []);

  // Fetch Architecture when Agent changes
  useEffect(() => {
    api
      .architecture(agentId)
      .then(setArchitecture)
      .catch(() => setArchitecture(null));
    setStep(0);
    setIsPlaying(false);
  }, [agentId]);

  // Initial simulation run on load
  useEffect(() => {
    if (activeScenario && !decision && connected) {
      runOne();
    }
  }, [activeScenario?.id, connected]);

  // Automated step-by-step playback timer
  useEffect(() => {
    if (isPlaying) {
      const intervalMs = Math.round(1000 / playbackSpeed);
      playTimerRef.current = window.setInterval(() => {
        setStep((prev) => {
          if (prev >= liveTrace.length - 1) {
            setIsPlaying(false);
            if (decision?.on_time) {
              try {
                confetti({ particleCount: 40, spread: 65, origin: { y: 0.7 } });
              } catch (_) {}
            }
            return prev;
          }
          return prev + 1;
        });
      }, intervalMs);
    } else {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
    }

    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, liveTrace.length, playbackSpeed, decision]);

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (step >= liveTrace.length - 1) {
        setStep(0);
      }
      setIsPlaying(true);
    }
  };

  // Run single agent simulation (Faster approach with instant real-time execution)
  async function runOne() {
    setBusy(true);
    setError('');
    setIsPlaying(false);
    try {
      const r = await api.simulateAgent(agentId, scenarioId);
      setDecision(r);
      setStep(0);
      setAutoPlayTrigger((prev) => prev + 1); // trigger live 3D animation immediately!
      setIsPlaying(true); // start live step-by-step trace traversal in sync!

      api
        .learningMemory()
        .then(setMemory)
        .catch(() => {});

      // Prefetch all agents on this scenario for behavior matrix
      api
        .simulateAll(scenarioId)
        .then((all) => setCurrentScenarioDecisions(all.results))
        .catch(() => {});
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runBatch() {
    setBusy(true);
    setError('');
    try {
      const r = await api.simulateBatch();
      setBatch(r);
      setCompareScope('suite');
      setView('comparison');
      api
        .learningMemory()
        .then(setMemory)
        .catch(() => {});
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function compareCurrent() {
    if (!activeScenario) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.simulateAll(scenarioId);
      setCurrentScenarioDecisions(r.results);
      setBatch({
        count: r.results.length,
        records: r.results,
        scenarios: [r.scenario],
        summary: { per_scenario: {}, per_agent: {} },
      });
      setCompareScope('current');
      setView('comparison');
      api
        .learningMemory()
        .then(setMemory)
        .catch(() => {});
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runDiagnostics() {
    setBusy(true);
    try {
      setDiagnostics(await api.runDiagnostics());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function validateDraft(): Promise<boolean> {
    if (!draft) return false;
    const result = await api.validateScenario(draft);
    if (!result.valid) {
      setError(result.errors.join(' · '));
      return false;
    }
    return true;
  }

  async function validateAndSaveDraft() {
    if (!draft) return;
    setError('');
    try {
      const checked = await api.validateScenario(draft);
      if (!checked.valid) {
        setError(checked.errors.join(' · '));
        return;
      }
      await api.createScenario({ ...draft, id: undefined, custom: true });
      const list = await api.scenarios();
      setScenarios(list);
      const added = [...list].reverse().find((s) => s.custom && s.name === draft.name);
      if (added) {
        setScenarioId(added.id);
        setDraft(added);
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function runDraftAgent() {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      if (!(await validateDraft())) return;
      const result = await api.simulateAgent(agentId, undefined, {
        ...draft,
        id: draft.id || 'custom-test',
      });
      setDecision(result);
      setStep(0);
      setAutoPlayTrigger((prev) => prev + 1);
      setView('overview');
      api
        .learningMemory()
        .then(setMemory)
        .catch(() => {});
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function compareDraft() {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      if (!(await validateDraft())) return;
      const result = await api.simulateAll(undefined, {
        ...draft,
        id: draft.id || 'custom-test',
      });
      setCurrentScenarioDecisions(result.results);
      setBatch({
        count: result.results.length,
        records: result.results,
        scenarios: [result.scenario],
        summary: { per_scenario: {}, per_agent: {} },
      });
      setCompareScope('current');
      setView('comparison');
      api
        .learningMemory()
        .then(setMemory)
        .catch(() => {});
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Truck size={22} />
          </div>
          <div>
            <b>
              dispatch<span>lab</span>
            </b>
            <small>SMART DELIVERY 3D</small>
          </div>
        </div>

        <div className="workspace">
          <div className="workspace-icon">3D</div>
          <div>
            <b>Autonomous Agent Sim</b>
            <small>Explainable AI Simulator</small>
          </div>
        </div>

        <div className="nav-label">MAIN WORKSPACE</div>
        <nav>
          {(
            [
              ['overview', '3D Simulation Studio', Gauge],
              ['input', 'Enter Test Data', SlidersHorizontal],
              ['behavior', 'Agent Behaviors', Layers],
              ['architectures', 'Neural Architectures', GitBranch],
              ['comparison', 'Compare Agents', Layers3],
              ['diagnostics', 'Diagnostics Check', ShieldCheck],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              className={`nav-item ${view === id ? 'selected' : ''}`}
              onClick={() => {
                if (id === 'input' && !draft && activeScenario) {
                  setDraft(structuredClone(activeScenario));
                }
                setView(id);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === 'comparison' && batch && <i>{batch.count}</i>}
            </button>
          ))}
        </nav>

        <div className="nav-label agents-label">
          THE SEVEN AGENTS{' '}
          <button title="View Agent Architectures" onClick={() => setView('architectures')}>
            <ArrowRight size={14} />
          </button>
        </div>
        <div className="agent-menu">
          {agents.map((a) => (
            <button
              className={a.id === agentId ? 'active' : ''}
              onClick={() => {
                setAgentId(a.id);
                setDecision(null);
                runOne();
              }}
              key={a.id}
            >
              <span className="agent-dot" style={{ background: a.color }} />
              <span>{a.name}</span>
              {a.id === agentId && <span className="tiny-arrow">●</span>}
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="memory-card">
            <div className="memory-top">
              <span>
                <Database size={14} /> LEARNING MEMORY
              </span>
              <span className="live-dot" />
            </div>
            <b>
              {memory?.deliveries.length ?? 0} <small>past deliveries</small>
            </b>
            <div className="memory-meter">
              <i style={{ width: `${Math.min(100, (memory?.deliveries.length ?? 0) * 8)}%` }} />
            </div>
            <button
              onClick={async () => {
                const m = await api.resetLearning('empty');
                setMemory(m);
                setDecision(null);
              }}
            >
              <RotateCcw size={12} /> Clear experience
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-area">
        {/* Topbar */}
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace <span>/</span>{' '}
            {view === 'overview'
              ? '3D Simulation Studio'
              : view === 'input'
              ? 'Enter Test Data Separately'
              : view === 'behavior'
              ? 'Agent Behaviors'
              : view === 'architectures'
              ? 'Agent Architectures'
              : view === 'comparison'
              ? 'Performance Comparison'
              : 'Diagnostics'}
          </div>
          <div className="top-actions">
            <div className={`connection ${connected ? 'ok' : ''}`}>
              <span /> {connected ? 'Python Simulation Engine Connected' : 'Connecting to Python API…'}
            </div>
          </div>
        </header>

        <div className="content">
          {/* Header Banner */}
          <div className="welcome-row">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" /> EXPLAINABLE AI DISPATCH STUDIO
              </div>
              <h1>
                {view === 'overview'
                  ? '3D Autonomous Delivery Simulation'
                  : view === 'input'
                  ? 'Enter Delivery Test Data Separately'
                  : view === 'behavior'
                  ? 'How Each Agent Behaves & Reasons'
                  : view === 'architectures'
                  ? 'Interactive Neural Architecture Lab'
                  : view === 'comparison'
                  ? 'Agent Performance Comparison'
                  : 'System Engine Self-Checks'}
                <span className="heading-period">.</span>
              </h1>
              <p>
                {view === 'overview'
                  ? 'Watch autonomous agents navigate real-time 3D delivery routes, compare logic step-by-step, and inspect decision reasoning.'
                  : view === 'input'
                  ? 'Enter custom test conditions separately (weather, traffic, deadlines, costs) and instantly simulate any agent.'
                  : view === 'behavior'
                  ? 'Understand the distinct mindset and internal philosophy of all seven autonomous agents.'
                  : view === 'architectures'
                  ? 'Inspect the 3D neural node graph and structural reasoning pathways behind each delivery model.'
                  : view === 'comparison'
                  ? compareScope === 'suite'
                    ? 'Comparing all 7 agents across the 3 standard assignment test scenarios.'
                    : 'Comparing all 7 agents on your entered delivery input.'
                  : 'Run comprehensive automated tests against the FastAPI Python simulation engine.'}
              </p>
            </div>
            <div className="header-badge-chip">
              <span className="date-dot" /> 3D CITY & ARCHITECTURE LIVE
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="error-banner">
              <span>{error}</span>
              <button onClick={() => setError('')}>Dismiss</button>
            </div>
          )}

          {/* 3 PRESET TEST SITUATIONS - Prominent Quick Selection Strip */}
          <section className="test-templates-bar">
            <div className="bar-title">
              <Layers3 size={15} className="text-emerald-400" />
              <span>THREE ASSIGNMENT TEST SCENARIOS:</span>
            </div>
            <div className="scenario-pill-list">
              {[
                {
                  id: 's1-normal',
                  num: '01',
                  name: 'Normal Delivery',
                  desc: 'Clear weather · Light traffic · 40m deadline',
                  tag: 'Clear & Fast',
                },
                {
                  id: 's2-traffic',
                  num: '02',
                  name: 'Traffic Congestion',
                  desc: 'Heavy traffic on Route A (30m) · Route B clear (20m)',
                  tag: 'Traffic Jam',
                },
                {
                  id: 's3-urgent-rain',
                  num: '03',
                  name: 'Urgent + Rain Storm',
                  desc: 'Rain · Urgent VIP order · Tight 25m deadline',
                  tag: 'Rain & Rush',
                },
              ].map((t) => (
                <button
                  key={t.id}
                  className={`scenario-quick-pill ${scenarioId === t.id ? 'active' : ''}`}
                  onClick={() => {
                    setScenarioId(t.id);
                    setDecision(null);
                    const found = scenarios.find((s) => s.id === t.id);
                    if (found) setDraft(structuredClone(found));
                    // Run simulation on selection immediately
                    runOne();
                  }}
                >
                  <span className="pill-number">{t.num}</span>
                  <div className="pill-text">
                    <b>{t.name}</b>
                    <small>{t.desc}</small>
                  </div>
                  <span className="pill-tag">{t.tag}</span>
                </button>
              ))}

              <button
                className="scenario-quick-pill enter-custom-pill"
                onClick={() => {
                  if (!draft && activeScenario) setDraft(structuredClone(activeScenario));
                  setView('input');
                }}
              >
                <SlidersHorizontal size={15} />
                <div className="pill-text">
                  <b>+ Enter Test Data</b>
                  <small>Custom weather, routes & deadlines</small>
                </div>
              </button>
            </div>
          </section>

          {/* VIEW: OVERVIEW (3D Simulation & Step-by-Step Reasoner) */}
          {view === 'overview' && (
            <>
              {/* Agent & Scenario Controller Strip */}
              <section className="simulation-control-card">
                <div className="sim-control-left">
                  <div className="sim-selector-group">
                    <label>
                      <span>SELECT AGENT ARCHITECTURE</span>
                      <div className="select-wrap">
                        <span className="select-dot" style={{ background: activeAgent.color }} />
                        <select
                          value={agentId}
                          onChange={(e) => {
                            setAgentId(e.target.value);
                            setDecision(null);
                          }}
                        >
                          {agents.map((a) => (
                            <option value={a.id} key={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={16} />
                      </div>
                    </label>

                    <label>
                      <span>TEST SCENARIO</span>
                      <div className="select-wrap">
                        <MapPin size={16} className="select-icon" />
                        <select
                          value={scenarioId}
                          onChange={(e) => {
                            setScenarioId(e.target.value);
                            setDecision(null);
                            const found = scenarios.find((s) => s.id === e.target.value);
                            if (found) setDraft(structuredClone(found));
                          }}
                        >
                          {scenarios.map((s) => (
                            <option value={s.id} key={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={16} />
                      </div>
                    </label>
                  </div>

                  {/* Conditions Chips */}
                  <div className="conditions-mini-strip">
                    <div className="mini-condition">
                      {activeScenario?.weather === 'rain' ? <CloudRain size={16} /> : <Sun size={16} />}
                      <span>{activeScenario?.weather === 'rain' ? 'Rain (+20% delay)' : 'Clear Sky'}</span>
                    </div>
                    <div className="mini-condition">
                      <Zap size={15} />
                      <span>{activeScenario?.priority === 'urgent' ? '🚨 Urgent VIP' : 'Normal Priority'}</span>
                    </div>
                    <div className="mini-condition">
                      <Clock3 size={15} />
                      <span>Deadline: <b>{activeScenario?.deadline_min ?? '—'}m</b></span>
                    </div>
                  </div>
                </div>

                <div className="sim-control-actions">
                  <button className="primary-action-btn" disabled={busy || !activeScenario} onClick={runOne}>
                    <Play size={16} fill="currentColor" />
                    <span>{busy ? 'Simulating…' : `Simulate ${activeAgent.name.split(' ')[0]}`}</span>
                  </button>
                  <button className="secondary-action-btn" disabled={busy || !activeScenario} onClick={compareCurrent}>
                    <Layers3 size={15} />
                    <span>Compare All 7 Agents</span>
                  </button>
                  <button
                    className="tertiary-action-btn"
                    onClick={() => {
                      if (!draft && activeScenario) setDraft(structuredClone(activeScenario));
                      setView('input');
                    }}
                  >
                    <SlidersHorizontal size={15} />
                    <span>Enter Custom Data</span>
                  </button>
                </div>
              </section>

              {/* 3D Visualizer & Live Outcome Showcase */}
              <section className="visualizer-showcase-grid">
                {/* 3D Visualizer Stage */}
                <div className="visualizer-stage-card">
                  <div className="stage-header">
                    <div className="stage-title-wrap">
                      <Sparkles size={16} style={{ color: activeAgent.color }} />
                      <h3>3D Real-Time Animated Delivery Simulation</h3>
                    </div>
                    <span className="stage-agent-indicator" style={{ color: activeAgent.color }}>
                      Architecture: <b>{activeAgent.name}</b>
                    </span>
                  </div>

                  {/* Canvas Render Area */}
                  <div className="stage-viewport">
                    <CityScene3D
                      scenario={activeScenario}
                      selectedRouteId={decision?.selected_route_id ?? null}
                      agentId={agentId}
                      agentColor={activeAgent.color}
                      agentName={activeAgent.name}
                      currentStepIndex={step}
                      totalSteps={liveTrace.length}
                      onStepChange={setStep}
                      etaMin={decision?.eta_min}
                      deadlineMin={decision?.deadline_min ?? activeScenario?.deadline_min}
                      onTime={decision?.on_time}
                      autoPlayTrigger={autoPlayTrigger}
                    />
                  </div>
                </div>

                {/* Live Outcome Summary Panel */}
                <div className="live-outcome-card">
                  <div className="outcome-head">
                    <div className="outcome-kicker">
                      <Activity size={14} />
                      <span>DECISION RESULT</span>
                    </div>
                    {decision && (
                      <span className={`status-badge ${decision.on_time ? 'on-time' : 'late'}`}>
                        {decision.on_time ? '✓ ON TIME' : '⚠ LATE RISK'}
                      </span>
                    )}
                  </div>

                  {decision ? (
                    <div className="outcome-body">
                      <div className="selected-route-highlight" style={{ borderColor: activeAgent.color }}>
                        <div className="route-icon-box" style={{ background: `${activeAgent.color}25`, color: activeAgent.color }}>
                          <RouteIcon size={24} />
                        </div>
                        <div className="route-title-text">
                          <small>SELECTED ROUTE</small>
                          <h4>Route {decision.selected_route_id || 'None'}</h4>
                        </div>
                        <span className="route-arrow">
                          <ArrowDownRight size={20} />
                        </span>
                      </div>

                      <div className="stats-metric-strip">
                        <div className="stat-box">
                          <small>EST. ARRIVAL</small>
                          <b>{decision.eta_min ?? '—'} <span className="unit">min</span></b>
                        </div>
                        <div className="stat-box">
                          <small>TARGET DEADLINE</small>
                          <b>{decision.deadline_min} <span className="unit">min</span></b>
                        </div>
                        <div className="stat-box">
                          <small>DELIVERY COST</small>
                          <b>Rs. {decision.cost ?? '—'}</b>
                        </div>
                      </div>

                      {/* Plain-English Explanation */}
                      <div className="plain-english-summary">
                        <b>Why this choice?</b>
                        <p>{decision.plain_explanation || decision.summary}</p>
                      </div>

                      {/* Persona Mindset Snippet */}
                      <div className="persona-note-snippet">
                        <Sparkles size={14} style={{ color: activeAgent.color }} />
                        <span>
                          <b>{activeAgent.name}:</b> {AGENT_PERSONAS[activeAgent.id]?.tagline}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="outcome-placeholder">
                      <div className="placeholder-pulse">
                        <Truck size={28} />
                      </div>
                      <b>Awaiting Simulation Run</b>
                      <span>Click "Simulate Agent" above to calculate and visualize decisions in 3D.</span>
                      <button className="primary-action-btn compact" onClick={runOne} disabled={busy}>
                        <Play size={14} fill="currentColor" />
                        <span>Run Simulation</span>
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {/* LIVE AGENT ARCHITECTURE DIAGRAM SECTION (Prominently Restored & Synced) */}
              <section className="card architecture-overview-card">
                <div className="card-title-row">
                  <div>
                    <div className="section-kicker">
                      <GitBranch size={15} />
                      <span>LIVE AGENT ARCHITECTURE DIAGRAM</span>
                    </div>
                    <h2>{architecture?.title ?? activeAgent.name} Cognitive Structure</h2>
                  </div>
                  <div className="diagram-top-badges">
                    <span className="diagram-step-pill" style={{ background: `${activeAgent.color}25`, color: activeAgent.color }}>
                      {currentStep ? `Active Node: ${currentStep.label}` : 'Ready'}
                    </span>
                    <button className="subtle-btn" onClick={() => setView('architectures')}>
                      Expand Details <ArrowRight size={14} />
                    </button>
                  </div>
                </div>

                <p className="architecture-summary">{architecture?.summary ?? activeAgent.description}</p>

                {/* The 2D Architecture SVG with active node glow and step progression */}
                <div className="architecture-diagram-container">
                  <ArchitectureDiagram
                    architecture={architecture}
                    currentStep={currentStep}
                    trace={liveTrace}
                    agentColor={activeAgent.color}
                    large
                  />
                </div>

                {/* Progress Bar & Step-forward controls */}
                <div className="trace-footer">
                  <div className="trace-progress">
                    <span>{liveTrace.length ? String(Math.min(step + 1, liveTrace.length)).padStart(2, '0') : '00'}</span>
                    <i>
                      <b
                        style={{
                          width: liveTrace.length
                            ? `${(Math.min(step + 1, liveTrace.length) / liveTrace.length) * 100}%`
                            : '0%',
                          background: activeAgent.color,
                        }}
                      />
                    </i>
                    <span>{String(liveTrace.length).padStart(2, '0')} REASONING NODES</span>
                  </div>

                  <div className="trace-step-actions">
                    <button
                      className="step-btn"
                      disabled={!liveTrace.length}
                      onClick={() => (step < liveTrace.length - 1 ? setStep(step + 1) : togglePlay())}
                    >
                      <Play size={12} fill="currentColor" />
                      <span>{step < liveTrace.length - 1 ? 'Step Next Node' : 'Replay Trace'}</span>
                    </button>
                  </div>
                </div>

                {currentStep && (
                  <div className="active-event">
                    <span style={{ background: activeAgent.color }} />
                    <b>{currentStep.label}:</b>
                    <span>{currentStep.detail}</span>
                  </div>
                )}
              </section>

              {/* Explainable Journey: Step-by-Step Reasoner & Route Elimination */}
              <section className="explainable-journey-wrapper">
                <ExplainableJourney
                  decision={decision}
                  agent={activeAgent}
                  scenario={activeScenario}
                  currentStepIndex={step}
                  onStepChange={setStep}
                  isPlaying={isPlaying}
                  onTogglePlay={togglePlay}
                  playbackSpeed={playbackSpeed}
                  onSpeedChange={setPlaybackSpeed}
                />
              </section>

              {/* All 7 Agents Behavior Matrix */}
              <section className="behavior-matrix-section">
                <BehaviorMatrix
                  agents={agents}
                  decisions={currentScenarioDecisions}
                  scenario={activeScenario}
                  selectedAgentId={agentId}
                  onSelectAgent={(aid) => {
                    setAgentId(aid);
                    setDecision(null);
                    window.scrollTo({ top: 120, behavior: 'smooth' });
                  }}
                  onRunSimulation={compareCurrent}
                  isBusy={busy}
                />
              </section>
            </>
          )}

          {/* VIEW: INPUT (Enter Test Data Separately) */}
          {view === 'input' && draft && (
            <section className="custom-input-view">
              <div className="input-page-header">
                <button className="back-btn" onClick={() => setView('overview')}>
                  <ArrowRight size={14} style={{ transform: 'rotate(180deg)' }} />
                  <span>Back to 3D Simulation</span>
                </button>
              </div>

              <CustomDataEditor
                scenario={draft}
                onChange={setDraft}
                onSave={validateAndSaveDraft}
                onRunAgent={runDraftAgent}
                onCompareAll={compareDraft}
                onReset={() => {
                  if (activeScenario) setDraft(structuredClone(activeScenario));
                }}
                isBusy={busy}
                activeAgentName={activeAgent.name}
                activeAgentColor={activeAgent.color}
              />
            </section>
          )}

          {/* VIEW: BEHAVIOR MATRIX */}
          {view === 'behavior' && (
            <section className="behavior-view-page">
              <BehaviorMatrix
                agents={agents}
                decisions={currentScenarioDecisions}
                scenario={activeScenario}
                selectedAgentId={agentId}
                onSelectAgent={(aid) => {
                  setAgentId(aid);
                  setView('overview');
                }}
                onRunSimulation={compareCurrent}
                isBusy={busy}
              />
            </section>
          )}

          {/* VIEW: ARCHITECTURES */}
          {view === 'architectures' && (
            <section className="card full-architecture-page">
              <div className="card-title-row">
                <div>
                  <div className="section-kicker">
                    <GitBranch size={15} />
                    <span>AGENT ARCHITECTURE LAB</span>
                  </div>
                  <h2>{architecture?.title ?? activeAgent.name}</h2>
                </div>
                <select
                  className="agent-select"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                >
                  {agents.map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <p className="architecture-summary">{architecture?.summary}</p>

              <div className="architecture-3d-dual">
                <div className="dual-column">
                  <div className="dual-header">
                    <Brain size={16} />
                    <b>3D Neural Node Graph</b>
                  </div>
                  <AgentBrain3D
                    architecture={architecture}
                    currentStep={currentStep}
                    trace={liveTrace}
                    agentColor={activeAgent.color}
                    agentName={activeAgent.name}
                  />
                </div>

                <div className="dual-column">
                  <div className="dual-header">
                    <GitBranch size={16} />
                    <b>2D Flow Architecture Diagram</b>
                  </div>
                  <ArchitectureDiagram
                    architecture={architecture}
                    currentStep={currentStep}
                    trace={liveTrace}
                    agentColor={activeAgent.color}
                    large
                  />
                </div>
              </div>

              <div className="architecture-bottom-analysis">
                <div className="strengths-box">
                  <h4>Core Strengths</h4>
                  <div className="pill-wrap">
                    {architecture?.strengths.map((x) => (
                      <span className="quality-pill" key={x}>
                        <Check size={13} /> {x}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="weaknesses-box">
                  <h4>Trade-Offs & Limitations</h4>
                  <div className="pill-wrap">
                    {architecture?.weaknesses.map((x) => (
                      <span className="quality-pill weakness" key={x}>
                        <AlertTriangle size={13} /> {x}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* VIEW: COMPARISON */}
          {view === 'comparison' && (
            <>
              <div className="metric-grid">
                <Metric
                  icon={<Layers3 size={18} />}
                  label="DECISIONS RUN"
                  value={batch?.count ?? '—'}
                  detail={compareScope === 'suite' ? '3 scenarios × 7 agents = 21 runs' : 'Current input × 7 agents'}
                />
                <Metric
                  icon={<Check size={18} />}
                  label="ON-TIME RATE"
                  value={
                    batch
                      ? `${Math.round(
                          (batch.records.filter((r) => r.on_time).length / Math.max(1, batch.count)) * 100
                        )}%`
                      : '—'
                  }
                  detail="Across the tested scenarios"
                />
                <Metric
                  icon={<Clock3 size={18} />}
                  label="FASTEST ARRIVAL"
                  value={
                    batch
                      ? `${Math.min(
                          ...batch.records.filter((r) => r.eta_min !== null).map((r) => r.eta_min!)
                        )} min`
                      : '—'
                  }
                  detail="Best delivery time recorded"
                />
                <Metric
                  icon={<Activity size={18} />}
                  label="AGENT MODELS"
                  value="07"
                  detail="Distinct decision architectures"
                />
              </div>

              <div className="card chart-card">
                <div className="card-title-row">
                  <div>
                    <div className="section-kicker">
                      <Activity size={14} />
                      <span>{compareScope === 'suite' ? 'THREE-SITUATION RESULTS' : 'CURRENT INPUT RESULTS'}</span>
                    </div>
                    <h2>Estimated Arrival Time by Agent</h2>
                  </div>
                  <div className="comparison-actions">
                    <button
                      className="text-btn"
                      onClick={compareScope === 'suite' ? compareCurrent : runBatch}
                      disabled={busy}
                    >
                      {compareScope === 'suite' ? 'Compare Current Input Only' : 'Run 3-Situation Suite'}
                    </button>
                    <button
                      className="primary-btn compact"
                      onClick={compareScope === 'suite' ? runBatch : compareCurrent}
                      disabled={busy}
                    >
                      <Play size={13} fill="currentColor" />
                      <span>{batch ? 'Rerun Comparison' : 'Run Comparison'}</span>
                    </button>
                  </div>
                </div>

                {batch ? (
                  <>
                    <div className="chart-wrap">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="etaFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#4ade80" stopOpacity={0.25} />
                              <stop offset="100%" stopColor="#4ade80" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="#1e2c24" vertical={false} />
                          <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 13 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: '#94a3b8', fontSize: 13 }} axisLine={false} tickLine={false} unit="m" />
                          <Tooltip
                            contentStyle={{
                              background: '#09110e',
                              border: '1px solid #28382f',
                              borderRadius: 10,
                              color: '#f8fafc',
                              fontSize: 13,
                            }}
                          />
                          <Area type="monotone" dataKey="eta" stroke="#4ade80" strokeWidth={2.5} fill="url(#etaFill)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>SCENARIO</th>
                            <th>AGENT</th>
                            <th>ACTION & ROUTE</th>
                            <th>EST. ARRIVAL</th>
                            <th>DEADLINE</th>
                            <th>STATUS</th>
                            <th>WHY THIS CHOICE?</th>
                          </tr>
                        </thead>
                        <tbody>
                          {batch.records.map((r, i) => (
                            <tr key={`${r.scenario_id}-${r.agent_id}-${i}`}>
                              <td>
                                <b>{r.scenario_name}</b>
                              </td>
                              <td>
                                <span
                                  className="agent-dot"
                                  style={{
                                    background: agents.find((a) => a.id === r.agent_id)?.color,
                                  }}
                                />
                                <b>{r.agent_name}</b>
                              </td>
                              <td>{actionLabel(r)}</td>
                              <td>
                                <b>{r.eta_min ?? '—'} min</b>
                              </td>
                              <td>{r.deadline_min} min</td>
                              <td>
                                <span className={`table-status ${r.on_time ? 'good' : 'bad'}`}>
                                  {r.on_time ? 'ON TIME' : 'LATE'}
                                </span>
                              </td>
                              <td>
                                <p className="plain-explanation table-explanation">
                                  {r.plain_explanation || r.summary}
                                </p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="empty-comparison">
                    <div className="pulse-orbit">
                      <Layers3 size={24} />
                    </div>
                    <b>Ready to Compare All Autonomous Agents</b>
                    <span>Click below to run and compare decisions across all architectures.</span>
                    <button className="primary-btn" onClick={runBatch} disabled={busy}>
                      <Play size={14} fill="currentColor" /> Run 3-Scenario Comparison Suite
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* VIEW: DIAGNOSTICS */}
          {view === 'diagnostics' && (
            <div className="card diagnostics-card">
              <div className="card-title-row">
                <div>
                  <div className="section-kicker">
                    <ShieldCheck size={15} />
                    <span>APPLICATION VERIFICATION</span>
                  </div>
                  <h2>Simulation Testing Center</h2>
                </div>
                <div className="comparison-actions">
                  <button
                    className="text-btn"
                    onClick={() => {
                      if (!draft && activeScenario) setDraft(structuredClone(activeScenario));
                      setView('input');
                    }}
                  >
                    <SlidersHorizontal size={14} /> Enter Test Data
                  </button>
                  <button className="primary-btn compact" onClick={runDiagnostics} disabled={busy}>
                    <Activity size={14} />
                    <span>{busy ? 'Running Checks…' : 'Run Diagnostics'}</span>
                  </button>
                </div>
              </div>

              <p className="architecture-summary">
                Tests the core simulation engine across all 7 agents, scenario validation guards, learning memory stores,
                and performance latency.
              </p>

              {diagnostics ? (
                <>
                  <div className="diagnostic-summary">
                    <b>
                      {diagnostics.passed}
                      <small> / {diagnostics.total} checks passed</small>
                    </b>
                    <span>Total Latency: {diagnostics.duration_ms} ms</span>
                  </div>
                  <div className="diagnostic-list">
                    {diagnostics.checks.map((c) => (
                      <div className="diagnostic-row" key={c.name}>
                        <span className={`diagnostic-mark ${c.passed ? 'pass' : 'fail'}`}>
                          {c.passed ? <Check size={14} /> : <span>!</span>}
                        </span>
                        <div>
                          <b>{c.name}</b>
                          <small>{c.detail}</small>
                        </div>
                        <span className="diag-group">{c.group}</span>
                        <time>{c.duration_ms} ms</time>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="empty-comparison">
                  <div className="pulse-orbit">
                    <ShieldCheck size={24} />
                  </div>
                  <b>Verify System Integrity</b>
                  <span>Runs 60+ automated checks directly against the Python engine.</span>
                  <button className="primary-btn" onClick={runDiagnostics}>
                    <Play size={14} fill="currentColor" /> Run Engine Checks
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <footer>
            <span>
              DISPATCH LAB <i>·</i> EXPLAINABLE AGENT SIMULATION WITH 3D WEBGL
            </span>
            <span>
              <span className={`footer-dot ${connected ? '' : 'offline'}`} />
              {connected ? 'Python FastAPI Engine Active' : 'Connecting to Python API'} <i>·</i> 7 Autonomous Agents
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function ArchitectureDiagram({
  architecture,
  currentStep,
  trace,
  agentColor,
  large = false,
}: {
  architecture: Architecture | null;
  currentStep: TraceStep | undefined;
  trace: TraceStep[];
  agentColor: string;
  large?: boolean;
}) {
  if (!architecture) return <div className="diagram-placeholder">Loading architecture…</div>;
  const width = Math.max(architecture.nodes.reduce((m, n) => Math.max(m, n.x + n.w), 0) + 35, 800);
  const height = Math.max(
    architecture.nodes.reduce((m, n) => Math.max(m, n.y + n.h), 0) + 30,
    large ? 340 : 180
  );
  const activeIds = new Set(
    trace.slice(0, trace.findIndex((t) => t === currentStep) + 1).map((t) => t.node_id)
  );

  return (
    <div className={`diagram-scroll ${large ? 'large' : ''}`}>
      <svg
        className="architecture-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${architecture.title} architecture diagram`}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#53665d" />
          </marker>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {architecture.edges.map((edge) => {
          const a = architecture.nodes.find((n) => n.id === edge.source);
          const b = architecture.nodes.find((n) => n.id === edge.target);
          if (!a || !b) return null;
          let x1 = a.x + a.w,
            y1 = a.y + a.h / 2,
            x2 = b.x,
            y2 = b.y + b.h / 2;
          if (b.x <= a.x) {
            x1 = a.x + a.w / 2;
            y1 = a.y + a.h;
            x2 = b.x + b.w / 2;
            y2 = b.y;
          }
          const isEdgeActive = activeIds.has(edge.source) && activeIds.has(edge.target);
          return (
            <g key={edge.id}>
              <path
                d={`M${x1} ${y1} C${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={isEdgeActive ? agentColor : '#45564f'}
                strokeWidth={isEdgeActive ? 2.2 : 1.4}
                strokeDasharray={edge.dashed ? '4 4' : undefined}
                markerEnd="url(#arrow)"
                opacity={isEdgeActive ? 1 : 0.75}
              />
              {edge.label && (
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 5} textAnchor="middle" className="edge-label">
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}
        {architecture.nodes.map((n) => {
          const active = currentStep?.node_id === n.id;
          const visited = activeIds.has(n.id);
          return (
            <g
              key={n.id}
              className={`diagram-node ${active ? 'node-current' : ''} ${visited ? 'node-visited' : ''}`}
            >
              <rect
                x={n.x}
                y={n.y}
                width={n.w}
                height={n.h}
                rx="10"
                fill={active ? `${agentColor}35` : visited ? `${agentColor}18` : '#111d19'}
                stroke={active ? agentColor : visited ? `${agentColor}80` : '#34453d'}
                strokeWidth={active ? 2.5 : 1}
                filter={active ? 'url(#glow)' : undefined}
              />
              <circle
                cx={n.x + 17}
                cy={n.y + n.h / 2}
                r="4.5"
                fill={active ? agentColor : visited ? `${agentColor}b0` : '#607168'}
              />
              <text x={n.x + 30} y={n.y + n.h / 2 - 2} className="node-title">
                {n.label}
              </text>
              {n.detail && (
                <text x={n.x + 30} y={n.y + n.h / 2 + 14} className="node-detail">
                  {n.detail.length > 25 ? n.detail.slice(0, 25) + '…' : n.detail}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="card metric">
      <div className="metric-top">
        <span>{icon}</span>
        <small>{label}</small>
      </div>
      <b>{value}</b>
      <span>{detail}</span>
    </div>
  );
}

function actionLabel(result: AgentDecision) {
  if (!result.selected_route_id) return 'No feasible route';
  return `Deliver via Route ${result.selected_route_id}${result.action.endsWith('_late') ? ' (delay risk)' : ''}`;
}

export default App;
