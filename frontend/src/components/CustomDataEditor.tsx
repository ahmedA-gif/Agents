import React from 'react';
import {
  AlertCircle,
  Check,
  Clock,
  CloudRain,
  DollarSign,
  Layers3,
  MapPin,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  Trash2,
  Truck,
  Zap,
} from 'lucide-react';
import type { Route, Scenario, TrafficLevel } from '../types';

interface CustomDataEditorProps {
  scenario: Scenario;
  onChange: (scenario: Scenario) => void;
  onSave: () => void;
  onRunAgent: () => void;
  onCompareAll: () => void;
  onReset: () => void;
  isBusy: boolean;
  activeAgentName: string;
  activeAgentColor: string;
}

export const CustomDataEditor: React.FC<CustomDataEditorProps> = ({
  scenario,
  onChange,
  onSave,
  onRunAgent,
  onCompareAll,
  onReset,
  isBusy,
  activeAgentName,
  activeAgentColor,
}) => {
  const updateRoute = (index: number, patch: Partial<Route>) => {
    const updated = scenario.routes.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange({ ...scenario, routes: updated });
  };

  const addRoute = () => {
    const possibleIds = ['A', 'B', 'C', 'D', 'E'];
    const nextId = possibleIds.find((id) => !scenario.routes.some((r) => r.id === id));
    if (!nextId) return;

    const newRoute: Route = {
      id: nextId,
      name: `Route ${nextId}`,
      distance_km: 4,
      travel_time_min: 18,
      traffic_level: 'light',
      cost: 110,
      available: true,
    };
    onChange({ ...scenario, routes: [...scenario.routes, newRoute] });
  };

  const removeRoute = (index: number) => {
    if (scenario.routes.length <= 1) return;
    onChange({ ...scenario, routes: scenario.routes.filter((_, i) => i !== index) });
  };

  return (
    <div className="custom-data-editor-card">
      <div className="editor-card-header">
        <div className="editor-header-title">
          <div className="editor-kicker">
            <SlidersHorizontal size={15} />
            <span>CUSTOM TEST DATA PLAYGROUND</span>
          </div>
          <h3>Enter Delivery Test Conditions Separately</h3>
          <p className="editor-intro">
            Change weather, road traffic, deadlines, and route costs. Then run the Python simulation to see exactly how agents adapt.
          </p>
        </div>

        <div className="editor-header-buttons">
          <button className="subtle-btn-reset" onClick={onReset} title="Reset to defaults">
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      {/* Global Scenario Conditions */}
      <div className="editor-conditions-grid">
        {/* Scenario Name */}
        <div className="form-field full-width">
          <label>Scenario / Test Name</label>
          <input
            type="text"
            value={scenario.name}
            onChange={(e) => onChange({ ...scenario, name: e.target.value })}
            placeholder="e.g. Rainy Rush Hour Test"
            className="input-text"
          />
        </div>

        {/* Deadline Slider & Number */}
        <div className="form-field">
          <div className="field-label-row">
            <label>Customer Deadline</label>
            <span className="field-value-badge">{scenario.deadline_min} mins</span>
          </div>
          <div className="slider-row">
            <input
              type="range"
              min="10"
              max="60"
              step="1"
              value={scenario.deadline_min}
              onChange={(e) => onChange({ ...scenario, deadline_min: Number(e.target.value) })}
              className="range-slider"
            />
            <input
              type="number"
              min="5"
              max="180"
              value={scenario.deadline_min}
              onChange={(e) => onChange({ ...scenario, deadline_min: Number(e.target.value) })}
              className="number-input compact"
            />
          </div>
          <span className="field-hint">Routes taking longer than this will risk late delivery.</span>
        </div>

        {/* Order Value */}
        <div className="form-field">
          <div className="field-label-row">
            <label>Food Order Value (Rs.)</label>
            <span className="field-value-badge">Rs. {scenario.order_value ?? 500}</span>
          </div>
          <input
            type="number"
            min="100"
            step="50"
            value={scenario.order_value ?? 500}
            onChange={(e) => onChange({ ...scenario, order_value: Number(e.target.value) })}
            className="number-input"
          />
          <span className="field-hint">Used by Utility and Contextual agents to assess stakes.</span>
        </div>

        {/* Weather 1-Click Toggles */}
        <div className="form-field">
          <label>Weather Condition</label>
          <div className="toggle-pill-group">
            <button
              type="button"
              className={`toggle-pill ${scenario.weather === 'clear' ? 'active clear' : ''}`}
              onClick={() => onChange({ ...scenario, weather: 'clear' })}
            >
              <Sun size={15} />
              <span>Clear Sky (Normal)</span>
            </button>
            <button
              type="button"
              className={`toggle-pill ${scenario.weather === 'rain' ? 'active rain' : ''}`}
              onClick={() => onChange({ ...scenario, weather: 'rain' })}
            >
              <CloudRain size={15} />
              <span>Rain Storm (+20% delay)</span>
            </button>
          </div>
        </div>

        {/* Order Priority 1-Click Toggles */}
        <div className="form-field">
          <label>Order Priority</label>
          <div className="toggle-pill-group">
            <button
              type="button"
              className={`toggle-pill ${scenario.priority === 'normal' ? 'active normal' : ''}`}
              onClick={() => onChange({ ...scenario, priority: 'normal' })}
            >
              <Zap size={14} />
              <span>Normal Standard</span>
            </button>
            <button
              type="button"
              className={`toggle-pill ${scenario.priority === 'urgent' ? 'active urgent' : ''}`}
              onClick={() => onChange({ ...scenario, priority: 'urgent' })}
            >
              <Zap size={14} />
              <span>🚨 Urgent VIP Order</span>
            </button>
          </div>
        </div>
      </div>

      {/* Routes Editor Section */}
      <div className="editor-routes-section">
        <div className="routes-section-header">
          <div>
            <h4>Configured Delivery Routes ({scenario.routes.length})</h4>
            <p>Customize distance, travel time, traffic congestion, and road availability for each route.</p>
          </div>
          <button
            type="button"
            className="add-route-btn"
            disabled={scenario.routes.length >= 5}
            onClick={addRoute}
          >
            <Plus size={15} />
            <span>Add Route</span>
          </button>
        </div>

        <div className="route-editor-list">
          {scenario.routes.map((route, idx) => (
            <div key={route.id} className="route-editor-card">
              <div className="route-header-bar">
                <div className="route-badge-id">
                  <span>Route {route.id}</span>
                </div>
                <input
                  type="text"
                  value={route.name}
                  onChange={(e) => updateRoute(idx, { name: e.target.value })}
                  placeholder="Route name"
                  className="route-name-input"
                />

                <label className="route-open-toggle">
                  <input
                    type="checkbox"
                    checked={route.available}
                    onChange={(e) => updateRoute(idx, { available: e.target.checked })}
                  />
                  <span>{route.available ? 'Road Open' : 'Road Blocked / Closed'}</span>
                </label>

                <button
                  type="button"
                  className="route-delete-btn"
                  disabled={scenario.routes.length <= 1}
                  onClick={() => removeRoute(idx)}
                  title="Remove route"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="route-inputs-grid">
                {/* Distance */}
                <div className="mini-input-group">
                  <label>Distance</label>
                  <div className="unit-input-wrap">
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="50"
                      value={route.distance_km}
                      onChange={(e) => updateRoute(idx, { distance_km: Number(e.target.value) })}
                    />
                    <span>km</span>
                  </div>
                </div>

                {/* Travel Time */}
                <div className="mini-input-group">
                  <label>Travel Time (ETA)</label>
                  <div className="unit-input-wrap">
                    <input
                      type="number"
                      step="1"
                      min="1"
                      max="120"
                      value={route.travel_time_min}
                      onChange={(e) => updateRoute(idx, { travel_time_min: Number(e.target.value) })}
                    />
                    <span>min</span>
                  </div>
                </div>

                {/* Cost */}
                <div className="mini-input-group">
                  <label>Delivery Cost / Toll</label>
                  <div className="unit-input-wrap">
                    <input
                      type="number"
                      step="10"
                      min="0"
                      max="1000"
                      value={route.cost}
                      onChange={(e) => updateRoute(idx, { cost: Number(e.target.value) })}
                    />
                    <span>Rs.</span>
                  </div>
                </div>

                {/* Traffic Level */}
                <div className="mini-input-group traffic-selector">
                  <label>Traffic Level</label>
                  <div className="traffic-buttons">
                    {(['light', 'moderate', 'heavy'] as TrafficLevel[]).map((level) => (
                      <button
                        key={level}
                        type="button"
                        className={`traffic-btn ${level} ${route.traffic_level === level ? 'active' : ''}`}
                        onClick={() => updateRoute(idx, { traffic_level: level })}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="editor-bottom-bar">
        <div className="agent-target-notice">
          <Truck size={16} style={{ color: activeAgentColor }} />
          <span>Active Agent for Single Run: <b>{activeAgentName}</b></span>
        </div>

        <div className="editor-cta-row">
          <button type="button" className="editor-action-btn secondary" onClick={onSave} disabled={isBusy}>
            <Check size={15} />
            <span>Save to Scenarios</span>
          </button>

          <button
            type="button"
            className="editor-action-btn primary"
            onClick={onRunAgent}
            disabled={isBusy}
            style={{ background: activeAgentColor, color: '#09110e' }}
          >
            <Play size={15} fill="currentColor" />
            <span>{isBusy ? 'Simulating…' : `Simulate ${activeAgentName.split(' ')[0]}`}</span>
          </button>

          <button type="button" className="editor-action-btn compare" onClick={onCompareAll} disabled={isBusy}>
            <Layers3 size={15} />
            <span>Compare All 7 Agents</span>
          </button>
        </div>
      </div>
    </div>
  );
};
