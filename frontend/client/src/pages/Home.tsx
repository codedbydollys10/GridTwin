import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  BatteryCharging,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  CloudSun,
  Cpu,
  Database,
  Download,
  FileText,
  Gauge,
  GitBranch,
  Info,
  Leaf,
  LineChart,
  List,
  Map,
  Pause,
  Play,
  Power,
  Radio,
  RotateCcw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Upload,
  Waves,
  X,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import {
  api,
  type ElectricalResults,
  type LossAnalytics,
  type LossLine,
  type LossAnalyticsPoint,
  type VoltageProfilePoint,
  type ViolationHistoryPoint,
  type BatteryAnalyticsPoint,
  type BaselineComparison,
  type TimestepLosses,
  type SimulationStep,
  type Violation,
  type WeatherResponse,
  type WhatIfResult,
} from "@/lib/api";
import { DigitalTwin, SelectedComponentPreview } from "@/components/digital-twin/DigitalTwin";

type View =
  | "landing"
  | "setup"
  | "twin"
  | "whatif"
  | "compare"
  | "history"
  | "network";
type Scenario =
  | "Normal day"
  | "High solar"
  | "Evening peak"
  | "Infeasible correction";
type Intervention = { type: "none" | "battery" | "curtailment"; value: number };

type SimState = {
  solar: number;
  load: number;
  soc: number;
  maxVoltage: number;
  minVoltage: number;
  lineLoading: number;
  transformerLoading: number;
  netFlow: number;
  direction: "import" | "export";
  busVoltages: number[];
  lineLoadings: number[];
  results?: ElectricalResults;
  losses?: TimestepLosses;
  violations: {
    label: string;
    component: string;
    value: string;
    severity: "warning" | "critical";
  }[];
};

const TIMES = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
];
const SCENARIOS: {
  name: Scenario;
  eyebrow: string;
  description: string;
  icon: typeof Sun;
  tint: string;
}[] = [
  {
    name: "Normal day",
    eyebrow: "Baseline",
    description: "Moderate solar and typical feeder demand.",
    icon: Activity,
    tint: "mint",
  },
  {
    name: "High solar",
    eyebrow: "Stress test",
    description: "Midday export pushes the far end of the feeder.",
    icon: Sun,
    tint: "amber",
  },
  {
    name: "Evening peak",
    eyebrow: "Stress test",
    description: "Solar fades as residential demand ramps.",
    icon: Waves,
    tint: "violet",
  },
  {
    name: "Infeasible correction",
    eyebrow: "Constraint test",
    description: "A battery action exceeds available power.",
    icon: BatteryCharging,
    tint: "red",
  },
];

const emptyState: SimState = {
  solar: 0,
  load: 0,
  soc: 0,
  maxVoltage: 0,
  minVoltage: 0,
  lineLoading: 0,
  transformerLoading: 0,
  netFlow: 0,
  direction: "import",
  busVoltages: [0, 0, 0, 0, 0, 0],
  lineLoadings: [0, 0, 0, 0, 0, 0],
  violations: [],
};
function toState(step?: SimulationStep): SimState {
  if (!step?.converged || !step.summary) return emptyState;
  const violation = (v: Violation) => ({
    label: v.type.replaceAll("_", " "),
    component: v.id,
    value: `${v.value.toFixed(3)}${v.component === "bus" ? " pu" : "%"}`,
    severity: v.severity,
  });
  return {
    solar: step.solar_kw,
    load: step.load_kw,
    soc: step.summary.battery_soc_percent,
    maxVoltage: step.summary.max_voltage_pu,
    minVoltage: step.summary.min_voltage_pu,
    lineLoading: step.summary.max_line_loading_percent,
    transformerLoading: step.summary.transformer_loading_percent,
    netFlow: step.summary.net_flow_kw,
    direction: step.summary.direction,
    results: step.results,
    losses: step.losses,
    busVoltages:
      step.results?.buses
        .filter(bus => bus.id !== "grid_hv_bus")
        .map(bus => bus.voltage_pu) ?? emptyState.busVoltages,
    lineLoadings: [
      ...(step.results?.lines.map(line => line.loading_percent) ?? []),
      0,
    ],
    violations: (step.violations ?? []).map(violation),
  };
}

/** One canonical, index-addressable copy of backend records. Later arrivals replace stale duplicates. */
function normalizeSimulationHistory(records: SimulationStep[]) {
  return Array.from(new globalThis.Map(records.map(record => [record.index, record])).values())
    .sort((left, right) => left.index - right.index);
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}
function statusFrom(state: SimState) {
  return state.violations.length === 0
    ? "NORMAL"
    : state.violations.some(v => v.severity === "critical")
      ? "CRITICAL"
      : "WARNING";
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <div className="brand-mark">
        <span />
        <span />
        <span />
      </div>
      <div>
        <div className="brand-name">
          Grid<span>Twin</span>
        </div>
        {!compact && (
          <div className="brand-sub">RENEWABLE DISTRIBUTION DIGITAL TWIN</div>
        )}
      </div>
    </div>
  );
}

function TinyPill({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "green" | "amber" | "red" | "blue";
}) {
  return <span className={`tiny-pill ${tone}`}>{children}</span>;
}

function MetricCard({
  label,
  value,
  unit,
  icon: Icon,
  accent = "cyan",
  note,
}: {
  label: string;
  value: string;
  unit?: string;
  icon: typeof Activity;
  accent?: string;
  note?: string;
}) {
  return (
    <div className="metric-card">
      <div className={`metric-icon ${accent}`}>
        <Icon size={16} />
      </div>
      <div className="metric-copy">
        <div className="eyebrow">{label}</div>
        <div className="metric-value">
          {value}
          <small>{unit}</small>
        </div>
        {note && <div className="metric-note">{note}</div>}
      </div>
    </div>
  );
}

function Landing({
  onEnter,
  onLoadDemo,
}: {
  onEnter: (view: View) => void;
  onLoadDemo: () => Promise<void> | void;
}) {
  return (
    <div className="landing-shell">
      <div className="landing-noise" />
      <header className="landing-nav">
        <Brand />
        <div className="landing-nav-right">
          <TinyPill tone="green">
            <span className="live-dot" /> DEMO SYSTEM ONLINE
          </TinyPill>
          <button className="ghost-icon">
            <CircleHelp size={17} />
          </button>
        </div>
      </header>
      <main className="landing-main">
        <section className="hero-copy">
          <div className="hero-kicker">
            <span className="kicker-line" /> VIRTUAL FEEDER / 06 BUS TEST
            NETWORK
          </div>
          <h1>
            See the grid
            <br />
            <em>before</em> you change it.
          </h1>
          <p className="hero-lede">
            Explore how renewable generation and changing electricity demand
            reshape a virtual distribution network through deterministic
            power-flow simulation.
          </p>
          <div className="hero-actions">
            <Button className="button-primary" onClick={() => onEnter("setup")}>
              <span>ENTER DIGITAL TWIN</span>
              <ArrowRight size={17} />
            </Button>
            <Button
              variant="outline"
              className="button-ghost"
              onClick={() => void onLoadDemo()}
            >
              <Play size={14} /> LOAD DEMO SCENARIO
            </Button>
          </div>
          <div className="hero-disclaimer">
            <Info size={14} />
            <span>
              Configured test feeder. Results are simulated estimates, not
              measurements from a real utility network.
            </span>
          </div>
        </section>
        <section className="hero-visual">
          <div className="visual-label top">
            <span>SCHEMATIC / LIVE STATE</span>
            <span>12:00:00 · UTC+05:30</span>
          </div>
          <MiniFeeder />
          <div className="visual-label bottom">
            <span>
              <span className="legend-dot green" /> NOMINAL
            </span>
            <span>
              <span className="legend-dot amber" /> EXCURSION
            </span>
            <span>
              <span className="legend-dot cyan" /> POWER FLOW
            </span>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <div>
          <Database size={14} /> MODEL-DRIVEN SIMULATION
        </div>
        <div>
          <Cpu size={14} /> DETERMINISTIC OUTPUTS
        </div>
        <div>
          <ShieldCheck size={14} /> ENGINEERING CONSTRAINTS FIRST
        </div>
        <span className="footer-version">GRIDTWIN / PROTOTYPE v0.9.2</span>
      </footer>
    </div>
  );
}

function MiniFeeder() {
  const nodes = [
    { x: 65, y: 168, label: "GRID", sub: "grid_01" },
    { x: 190, y: 168, label: "TRAFO", sub: "trafo_01" },
    { x: 320, y: 128, label: "BUS 01", sub: "bus_01" },
    { x: 440, y: 128, label: "BUS 02", sub: "bus_02" },
    { x: 560, y: 128, label: "BUS 03", sub: "bus_03" },
    { x: 680, y: 128, label: "BUS 04", sub: "bus_04" },
    { x: 800, y: 128, label: "BUS 05", sub: "bus_05" },
    { x: 920, y: 128, label: "BUS 06", sub: "bus_06" },
  ];
  return (
    <div className="mini-feeder-wrap">
      <svg
        viewBox="0 0 1000 330"
        className="mini-feeder"
        role="img"
        aria-label="Miniature radial distribution feeder schematic"
      >
        <defs>
          <linearGradient id="sky" x1="0" x2="1">
            <stop offset="0" stopColor="#102a3a" />
            <stop offset="1" stopColor="#172641" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="1000" height="330" rx="18" fill="url(#sky)" />
        <path
          d="M0 240 C180 190 300 270 460 222 S760 196 1000 235 V330 H0Z"
          fill="#142737"
          opacity=".8"
        />
        <path
          d="M0 254 C180 204 300 284 460 236 S760 210 1000 249"
          fill="none"
          stroke="#274356"
          strokeWidth="48"
          opacity=".45"
        />
        <path
          d="M0 254 C180 204 300 284 460 236 S760 210 1000 249"
          fill="none"
          stroke="#415a64"
          strokeWidth="3"
          strokeDasharray="3 13"
        />
        {[180, 320, 460, 600, 740, 880].map(x => (
          <path
            key={x}
            d={`M${x} 245 l28 0 l-24 -18 l-28 0 z`}
            fill="#435964"
            opacity=".65"
          />
        ))}
        <path
          d="M65 168 L190 168 L320 128 L440 128 L560 128 L680 128 L800 128 L920 128"
          fill="none"
          stroke="#8fa7af"
          strokeWidth="4"
        />
        <path
          d="M65 168 L190 168 L320 128 L440 128 L560 128 L680 128 L800 128 L920 128"
          fill="none"
          stroke="#3ad6c1"
          strokeWidth="2"
          strokeDasharray="10 18"
          className="flow-line"
        />
        {nodes.map((node, i) => (
          <g key={node.label} className="mini-node">
            <circle
              cx={node.x}
              cy={node.y}
              r={i === 0 || i === 1 ? 22 : 13}
              fill={i === 1 ? "#d68b49" : "#183f4b"}
              stroke="#3ad6c1"
              strokeWidth="2"
              filter="url(#glow)"
            />
            <circle cx={node.x} cy={node.y} r="4" fill="#ecfff9" />
            <text
              x={node.x}
              y={node.y + 42}
              textAnchor="middle"
              className="node-label"
            >
              {node.label}
            </text>
            <text
              x={node.x}
              y={node.y + 56}
              textAnchor="middle"
              className="node-sub"
            >
              {node.sub}
            </text>
          </g>
        ))}
        <g className="house" transform="translate(426 182)">
          <path
            d="M0 22 L26 0 L52 22 V55 H0Z"
            fill="#718a91"
            stroke="#c1d5d4"
          />
          <path d="M14 23 H38 V48 H14Z" fill="#2f4856" />
          <path d="M19 29 H33 V39 H19Z" fill="#e4be64" opacity=".85" />
        </g>
        <g className="house" transform="translate(700 185)">
          <path
            d="M0 22 L26 0 L52 22 V55 H0Z"
            fill="#718a91"
            stroke="#c1d5d4"
          />
          <path d="M14 23 H38 V48 H14Z" fill="#2f4856" />
          <path d="M19 29 H33 V39 H19Z" fill="#e4be64" opacity=".85" />
        </g>
        <g transform="translate(550 208)">
          <rect width="60" height="27" rx="3" fill="#294d55" stroke="#59c7b2" />
          <rect x="9" y="8" width="14" height="8" fill="#93e5d2" />
          <rect x="27" y="8" width="14" height="8" fill="#93e5d2" />
          <text x="30" y="45" textAnchor="middle" className="node-sub">
            BESS / 100 kWh
          </text>
        </g>
        <text x="32" y="35" className="svg-caption">
          SUBSTATION FEEDER / RADIAL TOPOLOGY
        </text>
      </svg>
    </div>
  );
}

function AppHeader({
  active,
  onNavigate,
  onBack,
}: {
  active: View;
  onNavigate: (view: View) => void;
  onBack?: () => void;
}) {
  const nav = [
    { id: "twin" as View, label: "Digital twin", icon: Map },
    {
      id: "whatif" as View,
      label: "What-if analysis",
      icon: SlidersHorizontal,
    },
    { id: "history" as View, label: "Historical analysis", icon: LineChart },
    { id: "network" as View, label: "Network details", icon: GitBranch },
  ];
  return (
    <header className="app-header">
      <div className="app-header-left">
        <button className="mini-brand-button" onClick={onBack}>
          <Brand compact />
        </button>
        <span className="header-separator" />
        {nav.map(item => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`header-nav ${active === item.id || (active === "compare" && item.id === "whatif") ? "active" : ""}`}
          >
            <item.icon size={15} />
            {item.label}
          </button>
        ))}
      </div>
      <div className="app-header-right">
        <TinyPill tone="green">
          <span className="live-dot" /> SIMULATION ACTIVE
        </TinyPill>
        <button className="header-icon">
          <BellDot />
        </button>
        <div className="operator">
          <div className="operator-avatar">AM</div>
          <div>
            <div className="operator-name">A. Mehta</div>
            <div className="operator-role">GRID ANALYST</div>
          </div>
          <ChevronDown size={14} />
        </div>
      </div>
    </header>
  );
}
function BellDot() {
  return (
    <div className="bell-dot">
      <Radio size={16} />
    </div>
  );
}

function Setup({
  scenario,
  setScenario,
  onStart,
  onBack,
}: {
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
  onStart: () => void;
  onBack: () => void;
}) {
  const [solarFile, setSolarFile] = useState("No file selected");
  const [loadFile, setLoadFile] = useState("No file selected");
  const [dataStatus, setDataStatus] = useState<{
    solar_uploaded: boolean;
    load_uploaded: boolean;
    aligned: boolean;
    timesteps: number;
  } | null>(null);
  const refreshStatus = () =>
    api
      .dataStatus()
      .then(setDataStatus)
      .catch(error =>
        toast.error(
          error instanceof Error ? error.message : "Dataset status unavailable"
        )
      );
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  useEffect(() => {
    api
      .weather()
      .then(setWeather)
      .catch(error =>
        setWeatherError(
          error instanceof Error ? error.message : "Weather service unavailable"
        )
      );
    refreshStatus();
  }, []);
  useEffect(() => {
    const panel = document.querySelector<HTMLElement>(".weather-panel");
    if (!panel) return;
    const heading = panel.querySelector("h3");
    const pill = panel.querySelector(".tiny-pill");
    const value = panel.querySelector(".weather-preview strong");
    const detail = panel.querySelector(".weather-preview span");
    const button = panel.querySelector("button");
    if (weatherError) {
      if (heading) heading.textContent = "Weather unavailable";
      if (pill) pill.textContent = "API ERROR";
      if (value) value.textContent = "N/A";
      if (detail) detail.textContent = weatherError;
      return;
    }
    if (!weather) {
      if (heading) heading.textContent = "Loading weather…";
      if (pill) pill.textContent = "LOADING";
      if (value) value.textContent = "N/A";
      if (detail) detail.textContent = "Fetching FastAPI weather context";
      return;
    }
    if (heading) heading.textContent = weather.status;
    if (pill) pill.textContent = weather.status;
    if (value)
      value.textContent =
        weather.temperature_c === null ? "N/A" : `${weather.temperature_c}°C`;
    if (detail)
      detail.textContent = `Cloud ${weather.cloud_cover_percent ?? "N/A"}% · Irradiance ${weather.solar_irradiance_w_m2 ?? "N/A"} W/m² · Humidity ${weather.humidity_percent ?? "N/A"}% · Wind ${weather.wind_speed_m_s ?? "N/A"} m/s · ${weather.solar_input_label}`;
    if (button) button.textContent = weather.solar_input_label;
  }, [weather, weatherError]);
  return (
    <div className="app-shell setup-shell">
      <AppHeader active="setup" onNavigate={() => undefined} onBack={onBack} />
      <main className="setup-main">
        <div className="setup-heading">
          <div>
            <div className="hero-kicker">
              <span className="kicker-line" /> SIMULATION SETUP / STEP 01
            </div>
            <h2>
              Configure the feeder
              <br />
              <em>before</em> you run it.
            </h2>
            <p>
              Choose deterministic inputs, verify operating constraints, then
              start the virtual network. No values are hidden or inferred.
            </p>
          </div>
          <div className="setup-progress">
            <span>01</span>
            <div className="progress-track">
              <i />
            </div>
            <span className="muted">02 / 02</span>
          </div>
        </div>
        <div className="setup-grid">
          <section className="setup-panel dataset-panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">INPUT DATASETS</div>
                <h3>Operating profiles</h3>
              </div>
              <TinyPill tone={dataStatus?.aligned ? "green" : "amber"}>
                <Check size={12} /> {dataStatus?.aligned ? "ALIGNED" : "UPLOAD REQUIRED"}
              </TinyPill>
            </div>
            <UploadCard
              label="SOLAR GENERATION"
              filename={solarFile}
              icon={Sun}
              color="amber"
              onChange={setSolarFile}
              onUploaded={refreshStatus}
              stats={["12 timesteps", "08:00 — 19:00", "4 — 226 kW"]}
            />
            <UploadCard
              label="FEEDER DEMAND"
              filename={loadFile}
              icon={Power}
              color="blue"
              onChange={setLoadFile}
              onUploaded={refreshStatus}
              stats={["12 timesteps", "08:00 — 19:00", "84 — 196 kW"]}
            />
            <div className="data-note">
              <Info size={14} />
              <span>
                Timestamp alignment verified. Primary simulation input is the
                uploaded solar profile; weather context never overwrites it.
              </span>
            </div>
          </section>
          <section className="setup-panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">VIRTUAL GRID</div>
                <h3>Choose a scenario</h3>
              </div>
              <TinyPill tone="blue">
                <Database size={12} /> 6-BUS TEST FEEDER
              </TinyPill>
            </div>
            <div className="scenario-stack">
              {SCENARIOS.map(item => (
                <button
                  key={item.name}
                  onClick={() => setScenario(item.name)}
                  className={`scenario-card ${scenario === item.name ? "selected" : ""}`}
                >
                  <div className={`scenario-icon ${item.tint}`}>
                    <item.icon size={17} />
                  </div>
                  <div className="scenario-info">
                    <div className="scenario-eyebrow">{item.eyebrow}</div>
                    <strong>{item.name}</strong>
                    <span>{item.description}</span>
                  </div>
                  <div
                    className={`scenario-radio ${scenario === item.name ? "on" : ""}`}
                  >
                    {scenario === item.name && <span />}
                  </div>
                </button>
              ))}
            </div>
          </section>
          <section className="setup-panel constraints-panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">ENGINEERING LIMITS</div>
                <h3>Operating constraints</h3>
              </div>
              <Settings2 size={16} className="muted" />
            </div>
            <div className="constraint-row">
              <span>Voltage band</span>
              <strong>
                0.95 — 1.05 <small>pu</small>
              </strong>
            </div>
            <div className="constraint-row">
              <span>Line loading</span>
              <strong>
                100 <small>%</small>
              </strong>
            </div>
            <div className="constraint-row">
              <span>Transformer</span>
              <strong>
                100 <small>%</small>
              </strong>
            </div>
            <div className="constraint-row">
              <span>Battery envelope</span>
              <strong>
                ± 50 <small>kW / 100 kWh</small>
              </strong>
            </div>
            <div className="constraint-note">
              <BatteryCharging size={14} />
              <span>
                Initial SOC <b>60%</b> · min 10% · max 100%
              </span>
            </div>
          </section>
          <section className="setup-panel weather-panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">WEATHER CONTEXT</div>
                <h3>Demo mode</h3>
              </div>
              <TinyPill tone="amber">
                <CloudSun size={12} /> NOT CONNECTED
              </TinyPill>
            </div>
            <div className="weather-preview">
              <div className="weather-sun">
                <CloudSun size={32} />
              </div>
              <div>
                <strong>28° / partly cloudy</strong>
                <span>Solar irradiance context only</span>
              </div>
            </div>
            <Button
              variant="outline"
              className="full-button"
              onClick={() =>
                toast.info("Demo weather context is already active.")
              }
            >
              <CloudSun size={15} /> USE DEMO WEATHER
            </Button>
          </section>
        </div>
        <div className="setup-footer">
          <button className="text-button" onClick={onBack}>
            <ArrowDownRight size={14} className="rotate-left" /> Back to
            overview
          </button>
          <div className="setup-footer-right">
            <span>
              <ShieldCheck size={14} /> Configured test network
            </span>
            <Button className="button-primary start-button" onClick={onStart} disabled={!dataStatus?.aligned}>
              START SIMULATION <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

function UploadCard({
  label,
  filename,
  icon: Icon,
  color,
  stats,
  onChange,
  onUploaded,
}: {
  label: string;
  filename: string;
  icon: typeof Sun;
  color: string;
  stats: string[];
  onChange: (value: string) => void;
  onUploaded?: (result: {
    rows: number;
    timestamps: string[];
    aligned: boolean;
  }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = async (file?: File) => {
    if (!file) return;
    try {
      const kind = label.includes("SOLAR") ? "solar" : "load";
      const result = await api.upload(kind, file);
      onChange(result.filename);
      onUploaded?.(result);
      toast.success(
        `${result.rows} ${kind} profile rows validated${result.aligned ? " and aligned" : "; upload the matching profile to align"}.`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "CSV upload failed");
    }
  };
  return (
    <div className="upload-card">
      <div className={`upload-icon ${color}`}>
        <Icon size={18} />
      </div>
      <div className="upload-content">
        <div className="eyebrow">{label}</div>
        <div className="file-row">
          <strong>{filename}</strong>
          <button onClick={() => inputRef.current?.click()}>
            <Upload size={13} /> replace
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            hidden
            onChange={e => upload(e.target.files?.[0])}
          />
        </div>
        <div className="upload-stats">
          {stats.map((stat, i) => (
            <span
              key={stat}
              className={i === stats.length - 1 ? "accent-stat" : ""}
            >
              {i > 0 && <i />} {stat}
            </span>
          ))}
        </div>
      </div>
      <Check size={17} className="upload-check" />
    </div>
  );
}

function BuildingTwinLoading() {
  return (
    <div className="app-shell loading-shell">
      <div className="loading-panel">
        <div className="loading-brand">
          <Brand compact />
        </div>
        <div className="loading-kicker">
          <span className="kicker-line" /> SIMULATION ENGINE / FEEDER 01
        </div>
        <h2>BUILDING DIGITAL TWIN...</h2>
        <div className="loading-visual" aria-live="polite" aria-label="Simulation loading">
          <div className="loading-track loading-track-grid" />
          <div className="loading-track loading-track-transformer" />
          <div className="loading-track loading-track-bus" />
          <div className="loading-track loading-track-bus secondary" />
          <div className="loading-track loading-track-bus tertiary" />
          <span className="energy-particle particle-one" />
          <span className="energy-particle particle-two" />
          <span className="energy-particle particle-three" />
          <span className="energy-particle particle-four" />
          <span className="loading-node node-grid">GRID</span>
          <span className="loading-node node-transformer">TRAFO</span>
          <span className="loading-node node-bus one">BUS 01</span>
          <span className="loading-node node-bus two">BUS 02</span>
          <span className="loading-node node-bus three">BUS 03</span>
        </div>
      </div>
    </div>
  );
}

function TwinView({
  scenario,
  step,
  setStep,
  playing,
  setPlaying,
  speed,
  setSpeed,
  timestamp,
  timesteps,
  availableTimesteps,
  timestamps,
  violationSteps,
  onSelectTimestep,
  selectedComponent,
  setSelectedComponent,
  state,
  onNavigate,
}: {
  scenario: Scenario;
  step: number;
  setStep: (s: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  speed: number;
  setSpeed: (s: number) => void;
  timestamp?: string;
  timesteps: number;
  availableTimesteps: number;
  timestamps: string[];
  violationSteps: Set<number>;
  onSelectTimestep: (index: number) => void;
  selectedComponent: string;
  setSelectedComponent: (s: string) => void;
  state: SimState;
  onNavigate: (view: View) => void;
}) {
  const [cameraReset, setCameraReset] = useState(0);
  const totalTimesteps = Math.max(timesteps, availableTimesteps, 1);
  useEffect(() => {
    if (!playing) return;
    if (step >= totalTimesteps - 1) { setPlaying(false); return; }
    // Playback speed affects UI cadence only; every increment remains one CSV minute.
    const timer = window.setInterval(() => onSelectTimestep(step + 1), 1000 / speed);
    return () => window.clearInterval(timer);
  }, [playing, step, speed, onSelectTimestep, setPlaying, totalTimesteps]);
  const hasViolations = state.violations.length > 0;
  return (
    <div className="app-shell twin-shell">
      <AppHeader active="twin" onNavigate={onNavigate} />
      <div className="twin-main">
        <div className="twin-toolbar">
          <div>
            <div className="eyebrow">DIGITAL TWIN / FEEDER 01</div>
            <h2>Virtual distribution network</h2>
          </div>
          <div className="twin-toolbar-actions">
            <TinyPill tone={statusFrom(state) === "NORMAL" ? "green" : "amber"}>
              <span className="live-dot" /> {statusFrom(state)} OPERATION
            </TinyPill>
            <button
              className="toolbar-button"
              onClick={() => onNavigate("network")}
            >
              <GitBranch size={14} /> TOPOLOGY VIEW
            </button>
            <button
              className="toolbar-button"
              onClick={() => {
                setSelectedComponent("");
                setCameraReset(value => value + 1);
                toast.success("View reset to full feeder framing.");
              }}
            >
              <RotateCcw size={14} /> RESET VIEW
            </button>
          </div>
        </div>
        <div className="hud-grid">
          <aside className="left-hud">
            <div className="hud-block">
              <div className="eyebrow">CURRENT OPERATING POINT</div>
              <div className="time-readout">
                {timestamp ?? "--:--"} <span>LOCAL</span>
              </div>
              <div className="timeline-caption">
                {scenario.toUpperCase()} / TIMESTEP {step + 1} OF {totalTimesteps}
              </div>
            </div>
            <div className="hud-block">
              <div className="eyebrow">REAL-TIME TELEMETRY</div>
              <MetricCard
                label="Solar generation"
                value={String(Math.round(state.solar))}
                unit="kW"
                icon={Sun}
                accent="amber"
                note="uploaded profile"
              />
              <MetricCard
                label="Feeder demand"
                value={String(Math.round(state.load))}
                unit="kW"
                icon={Power}
                accent="blue"
                note="aligned timeline"
              />
              <MetricCard
                label="Battery SOC"
                value={String(Math.round(state.soc))}
                unit="%"
                icon={BatteryCharging}
                accent="mint"
                note="within envelope"
              />
            </div>
            <div className="hud-block">
              <div className="eyebrow">GRID QUALITY</div>
              <div className="quality-row">
                <span>Max voltage</span>
                <b className={state.maxVoltage > 1.05 ? "warning-text" : ""}>
                  {state.maxVoltage.toFixed(3)} <small>pu</small>
                </b>
              </div>
              <div className="quality-row">
                <span>Min voltage</span>
                <b>
                  {state.minVoltage.toFixed(3)} <small>pu</small>
                </b>
              </div>
              <div className="quality-row">
                <span>Line loading</span>
                <b className={state.lineLoading > 100 ? "critical-text" : ""}>
                  {formatPercent(state.lineLoading)}
                </b>
              </div>
              <div className="quality-row">
                <span>Transformer</span>
                <b>{formatPercent(state.transformerLoading)}</b>
              </div>
            </div>
            <button
              className="weather-strip"
              onClick={() =>
                toast.info(
                  "Weather is contextual only in the uploaded-profile mode."
                )
              }
            >
              <CloudSun size={16} />
              <div>
                <b>28°C / partly cloudy</b>
                <span>DEMO WEATHER MODE</span>
              </div>
              <ArrowRight size={14} />
            </button>
          </aside>
          <section className="scene-panel">
            <div className="scene-overlay scene-top">
              <span className="scene-chip">
                <span className="legend-dot cyan" /> CALCULATED FLOW
              </span>
              <span className="scene-chip">
                {state.direction === "export"
                  ? "EXPORT TO GRID"
                  : "IMPORT FROM GRID"}{" "}
                <ArrowRight
                  size={12}
                  className={state.direction === "export" ? "flip-x" : ""}
                />
              </span>
            </div>
            <DigitalTwin
              results={state.results}
              violations={state.violations}
              direction={state.direction}
              selectedComponent={selectedComponent}
              onSelectComponent={setSelectedComponent}
              resetSignal={cameraReset}
            />
            <div className="scene-overlay scene-bottom">
              <div className="scene-legend">
                <span>
                  <span className="legend-dot green" /> in limits
                </span>
                <span>
                  <span className="legend-dot amber" /> warning
                </span>
                <span>
                  <span className="legend-dot red" /> violation
                </span>
              </div>
              <span className="scene-camera">
                FREE CAMERA · orbit / pan / zoom
              </span>
            </div>
            {selectedComponent && (
              <ComponentInspector
                id={selectedComponent}
                state={state}
                onClose={() => setSelectedComponent("")}
                onAnalyze={() => onNavigate("whatif")}
              />
            )}
          </section>
          <aside className="right-hud">
            <div className="hud-block violation-block">
              <div className="block-title">
                <div>
                  <div className="eyebrow">VIOLATIONS</div>
                  <h3>
                    {state.violations.length
                      ? `${state.violations.length} detected`
                      : "No active violations"}
                  </h3>
                </div>
                <div
                  className={`violation-count ${hasViolations ? "alert" : "ok"}`}
                >
                  {hasViolations ? (
                    <AlertTriangle size={18} />
                  ) : (
                    <Check size={18} />
                  )}
                </div>
              </div>
              {state.violations.length ? (
                state.violations.map(v => (
                  <button
                    key={v.component + v.label}
                    onClick={() => setSelectedComponent(v.component)}
                    className="violation-item"
                  >
                    <div className={`severity-bar ${v.severity}`} />
                    <div>
                      <strong>{v.label}</strong>
                      <span>
                        {v.component} · {v.value}
                      </span>
                    </div>
                    <ArrowRight size={14} />
                  </button>
                ))
              ) : (
                <div className="all-clear">
                  <ShieldCheck size={17} />
                  <span>
                    All monitored elements are within configured operating
                    limits.
                  </span>
                </div>
              )}
              <Button
                className="analyze-button"
                onClick={() => onNavigate("whatif")}
              >
                <SlidersHorizontal size={14} /> ANALYZE CORRECTIVE ACTIONS
              </Button>
            </div>
            <div className="hud-block output-block">
              <div className="eyebrow">CALCULATED NETWORK OUTPUT</div>
              <div className="flow-summary">
                <div>
                  <span>Net feeder flow</span>
                  <strong>
                    {Math.round(state.netFlow)} <small>kW</small>
                  </strong>
                </div>
                <div
                  className={state.direction === "export" ? "export" : "import"}
                >
                  {state.direction === "export" ? "↑ export" : "↓ import"}
                </div>
              </div>
              <div className="flow-line-mini">
                <i
                  style={{ width: `${Math.min(100, state.netFlow / 1.6)}%` }}
                />
              </div>
              <div className="output-foot">
                <span>
                  <Check size={12} /> CONVERGED
                </span>
                <span>PF-ENGINE / STEP {step + 1}</span>
              </div>
            </div>
            <div className="hud-block small-detail">
              <div className="eyebrow">ACTIVE MODEL</div>
              <div className="model-row">
                <span>Topology</span>
                <strong>Radial / 6 bus</strong>
              </div>
              <div className="model-row">
                <span>Transformer</span>
                <strong>11 / 0.415 kV</strong>
              </div>
              <div className="model-row">
                <span>Battery</span>
                <strong>100 kWh BESS</strong>
              </div>
            </div>
          </aside>
        </div>
        <Timeline
          step={step}
          setStep={setStep}
          playing={playing}
          setPlaying={setPlaying}
          speed={speed}
          setSpeed={setSpeed}
          state={state}
          timestamp={timestamp}
          timesteps={timesteps}
          availableTimesteps={totalTimesteps}
          timestamps={timestamps}
          violationSteps={violationSteps}
          onSelectTimestep={onSelectTimestep}
        />
        <button
          type="button"
          className="statistics-button"
          onClick={() => onNavigate("history")}
        >
          <span className="statistics-icon"><LineChart size={14} /></span>
          <span>SEE THE STATISTICS</span>
          <ArrowRight size={15} className="statistics-arrow" />
        </button>
      </div>
    </div>
  );
}

function FeederScene({
  state,
  selectedComponent,
  setSelectedComponent,
}: {
  state: SimState;
  selectedComponent: string;
  setSelectedComponent: (id: string) => void;
}) {
  const busY = 216;
  const busXs = [168, 300, 432, 564, 696, 828];
  const busVoltage = state.busVoltages;
  const lineLoadings = state.lineLoadings;
  return (
    <div className="feeder-scene">
      <svg
        viewBox="0 0 1000 520"
        className="feeder-svg"
        role="img"
        aria-label="Interactive digital twin of a radial distribution feeder"
      >
        <defs>
          <linearGradient id="terrain" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#122736" />
            <stop offset="1" stopColor="#0b1723" />
          </linearGradient>
          <linearGradient id="road" x1="0" x2="1">
            <stop offset="0" stopColor="#243b49" />
            <stop offset="1" stopColor="#182f3d" />
          </linearGradient>
          <filter id="nodeGlow">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern
            id="gridPattern"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M40 0H0V40"
              fill="none"
              stroke="#203b4a"
              strokeWidth="1"
              opacity=".42"
            />
          </pattern>
        </defs>
        <rect width="1000" height="520" fill="url(#terrain)" />
        <rect width="1000" height="520" fill="url(#gridPattern)" opacity=".5" />
        <path
          d="M-20 445 C170 318 292 402 450 320 S770 290 1020 405"
          fill="none"
          stroke="url(#road)"
          strokeWidth="120"
          opacity=".72"
        />
        <path
          d="M-20 445 C170 318 292 402 450 320 S770 290 1020 405"
          fill="none"
          stroke="#3b5661"
          strokeWidth="2"
          strokeDasharray="6 14"
          opacity=".7"
        />
        <text x="30" y="44" className="svg-caption">
          FEEDER 01 / RADIAL TOPOLOGY
        </text>
        <text x="850" y="44" className="svg-caption">
          NORTH ↑
        </text>
        {[90, 242, 394, 546, 698, 850].map((x, i) => (
          <g key={x} className="pole">
            <path d={`M${x} 250 L${x} 140`} stroke="#78909a" strokeWidth="5" />
            <path
              d={`M${x - 25} 155 H${x + 25}`}
              stroke="#78909a"
              strokeWidth="4"
            />
            <circle cx={x - 18} cy="154" r="4" fill="#a8c3c7" />
            <circle cx={x} cy="154" r="4" fill="#a8c3c7" />
            <circle cx={x + 18} cy="154" r="4" fill="#a8c3c7" />
          </g>
        ))}
        <path
          d={`M90 154 L${busXs[0]} ${busY} L${busXs[1]} ${busY} L${busXs[2]} ${busY} L${busXs[3]} ${busY} L${busXs[4]} ${busY} L${busXs[5]} ${busY}`}
          fill="none"
          stroke="#597887"
          strokeWidth="6"
          opacity=".8"
        />
        <path
          d={`M90 154 L${busXs[0]} ${busY} L${busXs[1]} ${busY} L${busXs[2]} ${busY} L${busXs[3]} ${busY} L${busXs[4]} ${busY} L${busXs[5]} ${busY}`}
          fill="none"
          stroke={state.direction === "export" ? "#f2bf72" : "#42d7c0"}
          strokeWidth="2"
          strokeDasharray="12 18"
          className="flow-line"
          style={{
            animationDuration: `${Math.max(0.45, 1.5 - state.netFlow / 300)}s`,
            animationDirection:
              state.direction === "export" ? "reverse" : "normal",
          }}
        />
        <g
          className="scene-clickable"
          onClick={() => setSelectedComponent("grid_01")}
        >
          <rect
            x="30"
            y="113"
            width="120"
            height="82"
            rx="8"
            fill="#1d3b4a"
            stroke="#527b84"
          />
          <path
            d="M54 170 V139 L90 119 L126 139 V170"
            fill="none"
            stroke="#9fbfc0"
            strokeWidth="4"
          />
          <path d="M70 170 V148 H110 V170" fill="#d49950" opacity=".9" />
          <text x="90" y="219" textAnchor="middle" className="scene-label">
            GRID CONNECTION
          </text>
          <text x="90" y="234" textAnchor="middle" className="scene-sub">
            11 kV / grid_01
          </text>
        </g>
        <g
          className="scene-clickable"
          onClick={() => setSelectedComponent("trafo_01")}
        >
          <rect
            x="122"
            y="238"
            width="92"
            height="72"
            rx="5"
            fill="#714a31"
            stroke="#e1a55d"
            strokeWidth="2"
          />
          <rect x="136" y="253" width="64" height="42" rx="3" fill="#a96838" />
          <path
            d="M150 260 q10 12 0 25 M166 260 q10 12 0 25 M182 260 q10 12 0 25"
            fill="none"
            stroke="#ffd89b"
            strokeWidth="3"
          />
          <text x="168" y="340" textAnchor="middle" className="scene-label">
            TRAFO 01
          </text>
          <text x="168" y="356" textAnchor="middle" className="scene-sub">
            {Math.round(state.transformerLoading)}% loading
          </text>
        </g>
        {busXs.map((x, i) => {
          const isWarning = busVoltage[i] > 1.05 || busVoltage[i] < 0.95;
          const id = `bus_0${i + 1}`;
          return (
            <g
              key={id}
              className={`scene-clickable ${isWarning ? "node-alert" : ""}`}
              onClick={() => setSelectedComponent(id)}
            >
              <circle
                cx={x}
                cy={busY}
                r="20"
                fill={isWarning ? "#5b3e3d" : "#173f49"}
                stroke={isWarning ? "#f08b76" : "#4bd8bf"}
                strokeWidth="2"
                filter="url(#nodeGlow)"
              />
              <circle
                cx={x}
                cy={busY}
                r="6"
                fill={isWarning ? "#ffd0a1" : "#c8fff4"}
              />
              <text
                x={x}
                y={busY + 43}
                textAnchor="middle"
                className="scene-label"
              >
                BUS {String(i + 1).padStart(2, "0")}
              </text>
              <text
                x={x}
                y={busY + 59}
                textAnchor="middle"
                className={`scene-sub ${isWarning ? "warning-text" : ""}`}
              >
                {busVoltage[i].toFixed(3)} pu
              </text>
            </g>
          );
        })}
        {busXs.map((x, i) => (
          <g
            key={`line-${i}`}
            className={`scene-clickable ${lineLoadings[i] > 100 ? "node-alert" : ""}`}
            onClick={() => setSelectedComponent(`line_0${i + 1}`)}
          >
            <rect
              x={x + 42}
              y={busY - 9}
              width="48"
              height="18"
              rx="9"
              fill={lineLoadings[i] > 100 ? "#633b3c" : "#1e3e4a"}
              stroke={lineLoadings[i] > 100 ? "#ec8a78" : "#47737d"}
            />
            <text
              x={x + 66}
              y={busY + 4}
              textAnchor="middle"
              className="line-label"
            >
              {Math.round(lineLoadings[i])}%
            </text>
          </g>
        ))}
        <g
          className="scene-clickable"
          onClick={() => setSelectedComponent("solar_01")}
        >
          <path
            d="M342 322 h94 l-11 60 h-94z"
            fill="#244d5b"
            stroke="#4bcebf"
            strokeWidth="2"
            transform="skewX(-10)"
          />
          <path
            d="M354 330 h66 M349 345 h68 M346 360 h64 M375 322 l-10 60 M398 322 l-10 60"
            stroke="#8eddd1"
            strokeWidth="1"
            opacity=".8"
          />
          <path
            d="M375 382 v32 M400 382 v32"
            stroke="#91a7aa"
            strokeWidth="4"
          />
          <text x="388" y="435" textAnchor="middle" className="scene-label">
            SOLAR 01
          </text>
          <text x="388" y="451" textAnchor="middle" className="scene-sub">
            {Math.round(state.solar * 0.56)} kW · 100 kW
          </text>
        </g>
        <g
          className="scene-clickable"
          onClick={() => setSelectedComponent("solar_02")}
        >
          <path
            d="M650 322 h94 l-11 60 h-94z"
            fill="#244d5b"
            stroke="#4bcebf"
            strokeWidth="2"
            transform="skewX(-10)"
          />
          <path
            d="M662 330 h66 M657 345 h68 M654 360 h64 M683 322 l-10 60 M706 322 l-10 60"
            stroke="#8eddd1"
            strokeWidth="1"
            opacity=".8"
          />
          <path
            d="M683 382 v32 M708 382 v32"
            stroke="#91a7aa"
            strokeWidth="4"
          />
          <text x="696" y="435" textAnchor="middle" className="scene-label">
            SOLAR 02
          </text>
          <text x="696" y="451" textAnchor="middle" className="scene-sub">
            {Math.round(state.solar * 0.44)} kW · 100 kW
          </text>
        </g>
        <g
          className="scene-clickable"
          onClick={() => setSelectedComponent("battery_01")}
        >
          <rect
            x="477"
            y="376"
            width="104"
            height="54"
            rx="6"
            fill="#284f55"
            stroke="#65c9b4"
            strokeWidth="2"
          />
          <rect x="488" y="389" width="72" height="17" rx="3" fill="#17343d" />
          <rect
            x="491"
            y="392"
            width={`${Math.max(3, (66 * state.soc) / 100)}`}
            height="11"
            rx="2"
            fill="#50d1b6"
          />
          <rect x="581" y="391" width="8" height="14" rx="2" fill="#65c9b4" />
          <text x="529" y="452" textAnchor="middle" className="scene-label">
            BESS / BATTERY 01
          </text>
          <text x="529" y="468" textAnchor="middle" className="scene-sub">
            {Math.round(state.soc)}% SOC · 100 kWh
          </text>
        </g>
        {[270, 780].map((x, i) => (
          <g key={`house-${i}`} className="house-scene">
            <path
              d={`M${x} 371 L${x + 35} 340 L${x + 70} 371 V424 H${x}Z`}
              fill="#586f76"
              stroke="#9cb7b7"
            />
            <path
              d={`M${x + 15} 374 H${x + 55} V405 H${x + 15}Z`}
              fill="#203944"
            />
            <path
              d={`M${x + 25} 383 H${x + 45} V397 H${x + 25}Z`}
              fill="#e3bd65"
              opacity=".85"
            />
            <text x={x + 35} y="447" textAnchor="middle" className="scene-sub">
              LOAD 0{i + 1}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function ComponentInspector({
  id,
  state,
  onClose,
  onAnalyze,
}: {
  id: string;
  state: SimState;
  onClose: () => void;
  onAnalyze: () => void;
}) {
  const isBus = id.startsWith("bus");
  const isLine = id.startsWith("line");
  const isTrafo = id.startsWith("trafo");
  const title = isBus
    ? id.replace("bus_", "BUS ").toUpperCase()
    : isLine
      ? id.replace("line_", "LINE ").toUpperCase()
      : isTrafo
        ? "DISTRIBUTION TRANSFORMER"
        : id.replace("_01", "").toUpperCase();
  const na = "N/A";
  const bus = state.results?.buses.find(component => component.id === id);
  const line = state.results?.lines.find(component => component.id === id);
  const transformer = state.results?.transformers.find(
    component => component.id === id
  );
  const generator = state.results?.generators.find(component => component.id === id);
  const load = state.results?.loads.find(component => component.id === id);
  const storage = state.results?.storage.find(component => component.id === id);
  const lineLoss = state.losses?.lines.find(item => item.id === id);
  const connectionBus: Record<string, string> = {
    solar_01: "bus_03", solar_02: "bus_05", load_01: "bus_02",
    load_02: "bus_04", load_03: "bus_06", battery_01: "bus_04",
  };
  const componentType = isBus ? "Bus" : isLine ? "Feeder line" : isTrafo ? "Transformer" : id === "grid_01" ? "Grid connection" : id.startsWith("solar") ? "Solar generation" : id.startsWith("load") ? "Customer load" : "Battery storage";
  const metrics = isBus
    ? [
        ["Voltage", bus ? bus.voltage_pu.toFixed(3) : na, "pu"],
        ["Angle", bus ? bus.angle_deg.toFixed(2) : na, "deg"],
      ]
    : isLine
      ? [
          ["Power flow", line ? (line.p_from_mw * 1000).toFixed(2) : na, "kW"],
          ["Loading", line ? line.loading_percent.toFixed(1) : na, "%"],
          ["Power loss", line ? line.loss_kw.toFixed(3) : na, "kW"],
          [
            "Energy lost",
            lineLoss ? lineLoss.total_energy_loss_kwh.toFixed(3) : na,
            "kWh",
          ],
        ]
      : isTrafo
        ? [
            [
              "Loading",
              transformer ? transformer.loading_percent.toFixed(1) : na,
              "%",
            ],
            [
              "HV power",
              transformer ? (transformer.p_hv_mw * 1000).toFixed(2) : na,
              "kW",
            ],
            [
              "LV power",
              transformer ? (transformer.p_lv_mw * 1000).toFixed(2) : na,
              "kW",
            ],
            [
              "Power loss",
              transformer ? transformer.loss_kw.toFixed(3) : na,
              "kW",
            ],
          ]
        : id === "battery_01"
          ? [
              [
                "State of charge",
                storage ? storage.soc_percent.toFixed(1) : na,
                "%",
              ],
              ["Power", storage ? storage.power_kw.toFixed(2) : na, "kW"],
              ["Connected bus", connectionBus[id] ?? na, ""],
            ]
          : id === "grid_01"
            ? [["Direction", state.results ? state.direction.toUpperCase() : na, ""], ["Net feeder flow", state.results ? state.netFlow.toFixed(2) : na, "kW"]]
            : id.startsWith("solar")
              ? [["Output", generator ? generator.power_kw.toFixed(2) : na, "kW"], ["Connected bus", connectionBus[id] ?? na, ""]]
              : [["Demand", load ? load.power_kw.toFixed(2) : na, "kW"], ["Connected bus", connectionBus[id] ?? na, ""]];
  const exactViolation = state.violations.find(item => item.component === id);
  const statusLabel = exactViolation
    ? exactViolation.severity.toUpperCase()
    : state.results
      ? "NORMAL"
      : "AWAITING BACKEND RESULT";
  return (
    <div className="component-inspector">
      <div className="inspector-head">
        <div>
          <div className="eyebrow">COMPONENT INSPECTOR</div>
          <h3>{title}</h3>
          <span className="inspector-id">{componentType} · {id}</span>
        </div>
        <button onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      <SelectedComponentPreview id={id} />
      {metrics.map(([label, value, unit]) => (
        <InspectorMetric key={label} label={label} value={value} unit={unit} />
      ))}
      {exactViolation ? (
        <div className="inspector-status critical">
          <AlertTriangle size={14} />
          <div>
            <strong>{exactViolation.label}</strong>
            <span>{exactViolation.value} · limit exceeded</span>
          </div>
        </div>
      ) : (
        <div className="inspector-status nominal">
          <Check size={14} />
          <div>
            <strong>{statusLabel}</strong>
            <span>
              {state.results ? "Backend result has no active violation for this component." : "Live component values are not available yet."}
            </span>
          </div>
        </div>
      )}
      {exactViolation && (
        <Button className="inspector-action" onClick={onAnalyze}>
          <SlidersHorizontal size={13} /> ANALYZE CORRECTION
        </Button>
      )}
    </div>
  );
}
function InspectorMetric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="inspector-metric">
      <span>{label}</span>
      <strong>
        {value} <small>{unit}</small>
      </strong>
    </div>
  );
}

function Timeline({
  step,
  setStep,
  playing,
  setPlaying,
  speed,
  setSpeed,
  state,
  timestamp,
  timesteps,
  availableTimesteps,
  timestamps,
  violationSteps,
  onSelectTimestep,
}: {
  step: number;
  setStep: (s: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  speed: number;
  setSpeed: (s: number) => void;
  state: SimState;
  timestamp?: string;
  timesteps: number;
  availableTimesteps: number;
  timestamps: string[];
  violationSteps: Set<number>;
  onSelectTimestep: (index: number) => void;
}) {
  const totalSteps = Math.max(1, timesteps || availableTimesteps || 1);
  const maxIndex = Math.max(0, totalSteps - 1);
  const safeStep = Math.max(0, Math.min(step, maxIndex));
  const progress = maxIndex ? (safeStep / maxIndex) * 100 : 0;
  const lastTimestamp = timestamps[Math.min(maxIndex, timestamps.length - 1)];

  const handleManualStep = (next: number) => {
    setPlaying(false);
    onSelectTimestep(next);
  };

  return (
    <div className="timeline-shell">
      <div className="timeline-controls">
        <button
          className="square-control"
          onClick={() => handleManualStep(Math.max(0, safeStep - 1))}
          disabled={safeStep <= 0}
        >
          <ArrowRight size={14} className="flip-180" />
        </button>
        <button
          className="play-control"
          onClick={() => {
            if (safeStep >= maxIndex) {
              setPlaying(false);
              return;
            }
            setPlaying(!playing);
          }}
          disabled={totalSteps === 0}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button
          className="square-control"
          onClick={() => handleManualStep(Math.min(maxIndex, safeStep + 1))}
          disabled={safeStep >= maxIndex}
        >
          <ArrowRight size={14} />
        </button>
      </div>
      <div className="timeline-center">
        <div className="timeline-topline">
          <span className="eyebrow">SIMULATION TIME · {timestamp ?? "--:--"} · STEP {safeStep + 1} / {totalSteps}</span>
          <span className="timeline-state">
            <span className="legend-dot cyan" />{" "}
            {state.direction === "export" ? "EXPORTING" : "IMPORTING"} ·{" "}
            {Math.round(state.netFlow)} kW
          </span>
        </div>
        <div className="timeline-track">
          {Array.from(violationSteps).filter(index => index <= maxIndex).map(index => <i key={index} className="timeline-violation-marker" style={{ left: `${maxIndex ? (index / maxIndex) * 100 : 0}%` }} title={`Violation at step ${index + 1}`} />)}
          <input
            className="timeline-range"
            type="range"
            min={0}
            max={maxIndex}
            step={1}
            value={safeStep}
            onChange={event => handleManualStep(Number(event.target.value))}
            aria-label="Simulation timestep"
          />
          <div className="timeline-endpoints"><span>{timestamps[0] ?? "--:--"}</span><strong>{timestamp ?? "--:--"}</strong><span>{lastTimestamp ?? "--:--"}</span></div>
        </div>
      </div>
      <div className="speed-controls">
        <span>SPEED</span>
        {[0.5, 1, 2].map(value => (
          <button
            key={value}
            onClick={() => setSpeed(value)}
            className={speed === value ? "active" : ""}
          >
            {value}×
          </button>
        ))}
      </div>
    </div>
  );
}

function WhatIf({
  scenario,
  step,
  state,
  intervention,
  setIntervention,
  result,
  onResult,
  onCompare,
  onNavigate,
}: {
  scenario: Scenario;
  step: number;
  state: SimState;
  intervention: Intervention;
  setIntervention: (i: Intervention) => void;
  result?: WhatIfResult;
  onResult: (result: WhatIfResult) => void;
  onCompare: () => void;
  onNavigate: (v: View) => void;
}) {
  const [action, setAction] = useState<"battery" | "curtailment">("battery");
  const summary = result?.scenario?.summary;
  const draft = summary
    ? {
        ...state,
        maxVoltage: summary.max_voltage_pu,
        minVoltage: summary.min_voltage_pu,
        lineLoading: summary.max_line_loading_percent,
        transformerLoading: summary.transformer_loading_percent,
        netFlow: summary.net_flow_kw,
      }
    : state;
  const feasible = result?.feasible;
  const resolved = Boolean(
    result?.scenario &&
      result.scenario.violations.length < result.baseline.violations.length
  );
  const run = async () => {
    try {
      const response = await api.whatIf(
        action === "battery" ? "battery_charge" : "solar_curtailment",
        intervention.value
      );
      onResult(response);
      if (!response.scenario) {
        toast.error(response.reason ?? "Scenario could not run");
        return;
      }
      toast[response.feasible ? "success" : "warning"](
        response.feasible
          ? "Temporary scenario is feasible."
          : (response.reason ?? "Scenario has remaining violations.")
      );
      onCompare();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "What-If analysis failed"
      );
    }
  };
  return (
    <div className="app-shell">
      <AppHeader active="whatif" onNavigate={onNavigate} />
      <main className="analysis-main">
        <div className="analysis-heading">
          <div>
            <div className="hero-kicker">
              <span className="kicker-line" /> WHAT-IF ANALYSIS / STEP{" "}
              {step + 1}
            </div>
            <h2>
              Analyze corrective
              <br />
              <em>actions</em>.
            </h2>
            <p>
              Run temporary interventions against a copy of the network.
              Baseline values remain unchanged.
            </p>
          </div>
          <div className="baseline-stamp">
            <span className="stamp-dot" /> BASELINE LOCKED
            <div>
              {TIMES[step]} · {scenario.toUpperCase()}
            </div>
          </div>
        </div>
        <div className="analysis-grid">
          <section className="analysis-control-panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">INTERVENTION TYPE</div>
                <h3>Test a correction</h3>
              </div>
              <TinyPill tone="blue">
                <Cpu size={12} /> RE-RUN POWER FLOW
              </TinyPill>
            </div>
            <div className="action-tabs">
              <button
                onClick={() => {
                  setAction("battery");
                  setIntervention({ type: "battery", value: 40 });
                }}
                className={action === "battery" ? "active" : ""}
              >
                <BatteryCharging size={17} />
                <span>Battery dispatch</span>
                <small>shift net flow</small>
              </button>
              <button
                onClick={() => {
                  setAction("curtailment");
                  setIntervention({ type: "curtailment", value: 30 });
                }}
                className={action === "curtailment" ? "active" : ""}
              >
                <Sun size={17} />
                <span>Solar curtailment</span>
                <small>reduce export</small>
              </button>
            </div>
            <div className="intervention-slider">
              <div className="slider-label">
                <span>
                  {action === "battery" ? "BATTERY CHARGE" : "SOLAR REDUCTION"}
                </span>
                <strong>
                  {intervention.value} <small>kW</small>
                </strong>
              </div>
              <Slider
                value={[intervention.value]}
                min={0}
                max={
                  action === "battery" ? 50 : Math.max(0, Math.round(state.solar))
                }
                step={5}
                onValueChange={([value]) =>
                  setIntervention({ type: action, value })
                }
              />
              <div className="slider-bounds">
                <span>0 kW</span>
                <span>
                  {action === "battery"
                    ? "50 kW rated limit"
                    : `${Math.round(state.solar)} kW available`}
                </span>
              </div>
            </div>
            <div className="constraint-check">
              <div className={`constraint-icon ${feasible === false ? "fail" : "pass"}`}>
                {feasible === false ? <X size={15} /> : <Check size={15} />}
              </div>
              <div>
                <strong>
                  {feasible === undefined ? "Run the backend scenario" : feasible ? "Backend confirms feasibility" : "Backend rejected or constrained this action"}
                </strong>
                <span>
                  {result?.reason ?? "No scenario is calculated until RUN COMPARISON is selected."}
                </span>
              </div>
            </div>
            <Button
              className="button-primary run-button"
              onClick={() => void run()}
            >
              <Zap size={15} /> RUN COMPARISON <ArrowRight size={16} />
            </Button>
          </section>
          <section className="analysis-result-panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">CALCULATED PREVIEW</div>
                <h3>Baseline → intervention</h3>
              </div>
              <span className="rerun-stamp">
                <Activity size={13} /> PF RERUN
              </span>
            </div>
            <div className="compare-stat-grid">
              <CompareStat
                label="Max voltage"
                before={state.maxVoltage.toFixed(3)}
                after={draft.maxVoltage.toFixed(3)}
                unit="pu"
                good={draft.maxVoltage <= 1.05}
              />
              <CompareStat
                label="Line loading"
                before={formatPercent(state.lineLoading)}
                after={formatPercent(draft.lineLoading)}
                good={draft.lineLoading <= 100}
              />
              <CompareStat
                label="Net flow"
                before={`${Math.round(state.netFlow)} kW`}
                after={`${Math.round(draft.netFlow)} kW`}
                good={draft.netFlow < state.netFlow}
              />
            </div>
            <div
              className={`result-banner ${resolved && feasible ? "success" : "warning"}`}
            >
              {resolved && feasible ? (
                <Check size={18} />
              ) : (
                <AlertTriangle size={18} />
              )}
              <div>
                <strong>
                  {resolved && feasible
                    ? "FEASIBLE · VIOLATION RESOLVED"
                    : feasible
                      ? "FEASIBLE · PARTIAL CORRECTION"
                      : "INFEASIBLE CORRECTION"}
                </strong>
                <span>
                  {resolved && feasible
                    ? "The temporary network copy returns to the configured operating band."
                    : feasible
                      ? "The intervention reduces stress but another constraint remains active."
                      : "Insufficient available battery power. No baseline values were modified."}
                </span>
              </div>
            </div>
            <div className="whatif-footnote">
              <Info size={14} /> All outputs are calculated from the selected
              test-feeder state at {TIMES[step]}. Curtailed energy is not
              treated as free.
            </div>
          </section>
        </div>
        <div className="analysis-bottom">
          <button className="text-button" onClick={() => onNavigate("twin")}>
            <ArrowDownRight size={14} className="rotate-left" /> Return to
            digital twin
          </button>
          <span className="analysis-disclaimer">
            <ShieldCheck size={14} /> Scenario copy · baseline immutable
          </span>
        </div>
      </main>
    </div>
  );
}
function CompareStat({
  label,
  before,
  after,
  unit,
  good,
}: {
  label: string;
  before: string;
  after: string;
  unit?: string;
  good: boolean;
}) {
  return (
    <div className="compare-stat">
      <span>{label}</span>
      <div>
        <strong>{before}</strong>
        <ArrowRight size={13} />
        <strong className={good ? "good-text" : ""}>{after}</strong>
        {unit && <small>{unit}</small>}
      </div>
      <span className={good ? "delta good-text" : "delta"}>
        {good ? "improved" : "review required"}
      </span>
    </div>
  );
}

function CompareView({
  scenario,
  step,
  state,
  intervention,
  result,
  onNavigate,
}: {
  scenario: Scenario;
  step: number;
  state: SimState;
  intervention: Intervention;
  result?: WhatIfResult;
  onNavigate: (v: View) => void;
}) {
  const summary = result?.scenario?.summary;
  const after = summary
    ? {
        ...state,
        maxVoltage: summary.max_voltage_pu,
        lineLoading: summary.max_line_loading_percent,
        transformerLoading: summary.transformer_loading_percent,
      }
    : state;
  const resolved = Boolean(
    result?.scenario &&
      result.scenario.violations.length < result.baseline.violations.length
  );
  return (
    <div className="app-shell">
      <AppHeader active="compare" onNavigate={onNavigate} />
      <main className="analysis-main comparison-main">
        <div className="analysis-heading">
          <div>
            <div className="hero-kicker">
              <span className="kicker-line" /> BEFORE / AFTER / RESULT
            </div>
            <h2>
              Correction <em>verified</em>.
            </h2>
            <p>
              Side-by-side evidence from the baseline network and the calculated
              intervention copy.
            </p>
          </div>
          <TinyPill tone={resolved ? "green" : "amber"}>
            <Check size={12} />{" "}
            {resolved ? "VIOLATION RESOLVED" : "REVIEW RESULT"}
          </TinyPill>
        </div>
        <div className="before-after-grid">
          <section className="ba-card baseline">
            <div className="ba-head">
              <div>
                <div className="eyebrow">BASELINE NETWORK</div>
                <h3>{TIMES[step]} / before</h3>
              </div>
              <TinyPill tone="red">
                {state.violations.length} violation
                {state.violations.length === 1 ? "" : "s"}
              </TinyPill>
            </div>
            <div className="ba-hero-value">
              {state.maxVoltage.toFixed(3)} <small>pu</small>
            </div>
            <div className="ba-label">Maximum bus voltage</div>
            <div className="ba-bars">
              <Bar label="Line loading" value={state.lineLoading} color="red" />
              <Bar
                label="Transformer loading"
                value={state.transformerLoading}
                color="amber"
              />
              <Bar
                label="Net feeder flow"
                value={Math.min(100, state.netFlow / 1.6)}
                color="blue"
              />
            </div>
            <div className="violation-chip">
              <AlertTriangle size={14} />{" "}
              {state.violations[0]?.label || "No active violations"}{" "}
              <span>{state.violations[0]?.value || "—"}</span>
            </div>
          </section>
          <div className="ba-arrow">
            <ArrowRight size={20} />
            <span>
              {intervention.type === "battery"
                ? `+${intervention.value} kW battery`
                : `−${intervention.value} kW solar`}
            </span>
          </div>
          <section className="ba-card intervention">
            <div className="ba-head">
              <div>
                <div className="eyebrow">INTERVENTION COPY</div>
                <h3>{TIMES[step]} / after</h3>
              </div>
              <TinyPill tone={resolved ? "green" : "amber"}>
                {resolved ? "feasible" : "partial"}
              </TinyPill>
            </div>
            <div className={`ba-hero-value ${resolved ? "green-value" : ""}`}>
              {after.maxVoltage.toFixed(3)} <small>pu</small>
            </div>
            <div className="ba-label">Maximum bus voltage</div>
            <div className="ba-bars">
              <Bar
                label="Line loading"
                value={after.lineLoading}
                color="green"
              />
              <Bar
                label="Transformer loading"
                value={after.transformerLoading}
                color="amber"
              />
              <Bar
                label="Net feeder flow"
                value={Math.min(100, after.netFlow / 1.6)}
                color="blue"
              />
            </div>
            <div className={`resolved-chip ${resolved ? "" : "partial"}`}>
              {resolved ? <Check size={14} /> : <AlertTriangle size={14} />}{" "}
              {resolved ? "VIOLATION RESOLVED" : "ACTION APPLIED"}{" "}
              <span>
                {resolved ? "all constraints pass" : "monitor remaining limits"}
              </span>
            </div>
          </section>
        </div>
        <div className="comparison-summary">
          <div>
            <ShieldCheck size={17} />
            <div>
              <strong>Engineering conclusion</strong>
              <span>
                {resolved
                  ? "The selected intervention returns the virtual feeder to the configured voltage and thermal limits."
                  : "The selected intervention reduces the excursion but does not fully clear every constraint."}
              </span>
            </div>
          </div>
          <Button className="button-primary" onClick={() => onNavigate("twin")}>
            VIEW UPDATED TWIN <ArrowRight size={15} />
          </Button>
        </div>
      </main>
    </div>
  );
}
function Bar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bar-row">
      <span>{label}</span>
      <div className="bar-track">
        <i className={color} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <strong>{Math.round(value)}%</strong>
    </div>
  );
}

const LOSS_LINE_IDS = ["line_01", "line_02", "line_03", "line_04", "line_05"];
const LOSS_LINE_COLORS: Record<string, string> = {
  line_01: "#74b7b0", line_02: "#789dcc", line_03: "#c2a46d",
  line_04: "#ad8ebf", line_05: "#c78078",
};

function lossSeriesPath(history: LossAnalyticsPoint[], id: string, maximum: number) {
  const denominator = Math.max(history.length - 1, 1);
  let started = false;
  return history.map((point, index) => {
    const loss = point.lines[id]?.loss_kw;
    if (loss === undefined) return "";
    const x = (index / denominator) * 760;
    const y = 160 - (loss / maximum) * 150;
    const command = started ? "L" : "M";
    started = true;
    return `${command}${x} ${y}`;
  }).join(" ");
}

function PowerLossAnalytics({ selectedIndex, onSelectTimestep }: { selectedIndex: number; onSelectTimestep: (index: number) => void }) {
  const [analytics, setAnalytics] = useState<LossAnalytics | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [hovered, setHovered] = useState<{ timestamp: string; line: LossLine } | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  useEffect(() => {
    api.losses().then(setAnalytics).catch(() => setUnavailable(true));
  }, []);
  const history = analytics?.history ?? [];
  const selectedPoint = history[selectedIndex];
  const maximum = Math.max(
    ...history.flatMap(item => LOSS_LINE_IDS.map(id => item.lines[id]?.loss_kw ?? 0)),
    1
  );
  if (!analytics?.history.length) {
    return (
      <section className="power-loss-analytics">
        <div className="eyebrow">POWER LOSS ANALYTICS</div>
        <p>{unavailable ? "Power-loss analytics unavailable" : "No simulation data"}</p>
      </section>
    );
  }
  return (
    <section className="power-loss-analytics">
      <div className="panel-heading">
        <div><div className="eyebrow">POWER LOSS ANALYTICS</div><h3>Calculated active losses</h3></div>
        <div className="loss-energy"><strong>{selectedPoint?.total_loss_kw.toFixed(3) ?? "--"} kW</strong><span>selected total loss</span></div>
        <div className="loss-energy"><strong>{analytics.total_energy_loss_kwh?.toFixed(3)} kWh</strong><span>total energy lost</span></div>
      </div>
      <div className="loss-legend">{LOSS_LINE_IDS.map(id => <span key={id}><i style={{ background: LOSS_LINE_COLORS[id] }} />{id.toUpperCase()}</span>)}</div>
      <div className="line-chart loss-chart multi-loss-chart">
        <svg viewBox="0 0 760 180" preserveAspectRatio="none" onClick={event => { const bounds = event.currentTarget.getBoundingClientRect(); const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)); onSelectTimestep(Math.round(ratio * Math.max(history.length - 1, 1))); setSelectedLineId(null); }}>
          {selectedPoint && <line className="selected-time-line" x1={(selectedIndex / Math.max(history.length - 1, 1)) * 760} x2={(selectedIndex / Math.max(history.length - 1, 1)) * 760} y1="0" y2="180" />}
          {LOSS_LINE_IDS.map(id => <path key={id} d={lossSeriesPath(history, id, maximum)} fill="none" stroke={LOSS_LINE_COLORS[id]} strokeWidth={selectedLineId === id ? "3.4" : "2.1"} opacity={selectedLineId && selectedLineId !== id ? "0.28" : "1"} />)}
          {history.flatMap((point, index) => LOSS_LINE_IDS.map(id => {
            const line = point.lines[id];
            if (!line || (index % Math.ceil(history.length / 48) !== 0 && index !== selectedIndex)) return null;
            const x = (index / Math.max(history.length - 1, 1)) * 760;
            const y = 160 - (line.loss_kw / maximum) * 150;
            return <circle key={`loss-${id}-${index}`} cx={x} cy={y} r={index === selectedIndex ? "4.5" : "2.2"} fill={LOSS_LINE_COLORS[id]} stroke="#0b1822" strokeWidth="1.5" onMouseEnter={() => setHovered({ timestamp: point.timestamp, line })} onMouseLeave={() => setHovered(null)} onClick={event => { event.stopPropagation(); setSelectedLineId(id); onSelectTimestep(index); }} />;
          }))}
        </svg>
        {hovered && <div className="loss-hover-tooltip"><b>{hovered.line.id.toUpperCase()}</b><span>{hovered.timestamp} · {hovered.line.loss_kw.toFixed(3)} kW</span></div>}
        <div className="chart-x"><span>{history[0]?.timestamp}</span><span>{history[Math.floor(history.length / 2)]?.timestamp}</span><span>{history.at(-1)?.timestamp}</span></div>
      </div>
      <div className="line-loss-list">{LOSS_LINE_IDS.map(id => { const line = selectedPoint?.lines[id]; return line ? <span key={`selected-loss-${id}`}><b>{id}</b> {line.loss_kw.toFixed(3)} kW</span> : null; })}</div>
      {selectedLineId && selectedPoint?.lines[selectedLineId] && <div className="loss-reading"><b>{selectedLineId.toUpperCase()} / {selectedPoint.timestamp}</b><span>Power Loss <strong>{selectedPoint.lines[selectedLineId].loss_kw.toFixed(3)} kW</strong></span><span>Energy Loss <strong>{selectedPoint.lines[selectedLineId].energy_loss_kwh.toFixed(3)} kWh</strong></span><span>Loading <strong>{selectedPoint.lines[selectedLineId].loading_percent.toFixed(2)}%</strong></span><span>Power Flow <strong>{selectedPoint.lines[selectedLineId].power_flow_kw.toFixed(2)} kW</strong></span><span>Status <strong>{selectedPoint.lines[selectedLineId].status}</strong></span></div>}
    </section>
  );
}

const VOLTAGE_BUS_IDS = ["bus_01", "bus_02", "bus_03", "bus_04", "bus_05", "bus_06"];
const VOLTAGE_BUS_COLORS: Record<string, string> = {
  bus_01: "#74b7b0", bus_02: "#789dcc", bus_03: "#c2a46d",
  bus_04: "#ad8ebf", bus_05: "#c78078", bus_06: "#95a96f",
};

function voltageSeriesPath(history: VoltageProfilePoint[], id: string, minimum: number, range: number) {
  const denominator = Math.max(history.length - 1, 1);
  let started = false;
  return history.map((point, index) => {
    const voltage = point.bus_voltages[id];
    if (voltage === undefined) {
      started = false;
      return "";
    }
    const x = (index / denominator) * 760;
    const y = 160 - ((voltage - minimum) / range) * 150;
    const command = started ? "L" : "M";
    started = true;
    return `${command}${x} ${y}`;
  }).join(" ");
}

function VoltageProfileAnalytics({ selectedIndex, onSelectTimestep }: { selectedIndex: number; onSelectTimestep: (index: number) => void }) {
  const [history, setHistory] = useState<VoltageProfilePoint[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    api.voltageProfile().then(response => setHistory(response.history)).catch(() => setUnavailable(true));
  }, []);
  if (!history.length) {
    return <section className="voltage-profile-analytics"><div className="eyebrow">VOLTAGE PROFILE</div><p>{unavailable ? "Voltage-profile analytics unavailable" : "No simulation data"}</p></section>;
  }
  return (
    <section className="voltage-profile-analytics">
      <div className="panel-heading"><div><div className="eyebrow">VOLTAGE PROFILE</div><h3>Six-bus voltage profile</h3></div><div className="voltage-legend">{VOLTAGE_BUS_IDS.map(id => <span key={id}><i style={{ background: VOLTAGE_BUS_COLORS[id] }} />{id.toUpperCase()}</span>)}</div></div>
      <div className="voltage-heatmap" style={{ gridTemplateColumns: `66px repeat(${history.length}, minmax(0, 1fr))` }}>
        <span className="heatmap-corner">BUS / TIME</span>{history.map((point, index) => <span key={`heatmap-time-${index}`} className={`heatmap-time ${index === selectedIndex ? "selected" : ""}`} title={point.timestamp} />)}
        {VOLTAGE_BUS_IDS.map(id => <Fragment key={id}><b>{id.toUpperCase()}</b>{history.map((point, index) => { const voltage = point.bus_voltages[id]; const critical = voltage !== undefined && (voltage < 0.95 || voltage > 1.05); return <button key={`heatmap-${id}-${index}`} className={`heatmap-cell ${critical ? "critical" : "normal"} ${index === selectedIndex ? "selected" : ""}`} style={{ opacity: voltage === undefined ? 0.1 : Math.max(0.28, Math.min(1, 0.42 + Math.abs(voltage - 1) * 36)) }} title={`${id.toUpperCase()} · ${point.timestamp} · ${voltage?.toFixed(4) ?? "unavailable"} pu`} onClick={() => onSelectTimestep(index)} />; })}</Fragment>)}
      </div>
      <div className="heatmap-scale"><span>0.95 pu lower limit</span><span>1.00 pu nominal</span><span>1.05 pu upper limit</span></div>
    </section>
  );
}

function ViolationHistoryAnalytics({ history, selectedIndex, onSelectTimestep }: { history: SimulationStep[]; selectedIndex: number; onSelectTimestep: (index: number) => void }) {
  const points = history.map((item, index) => ({
    index,
    timestamp: item.timestamp,
    total_violations: item.violations?.length ?? 0,
    violations: item.violations ?? [],
  }));

  if (!points.length) {
    return <section className="violation-history-analytics"><div className="eyebrow">VIOLATION HISTORY</div><p>No simulation data</p></section>;
  }

  const maximum = Math.max(1, ...points.map(point => point.total_violations));
  const selectedPoint = points[Math.max(0, Math.min(selectedIndex, points.length - 1))];
  const allClear = points.every(point => point.total_violations === 0);

  if (allClear) {
    return (
      <section className="violation-history-analytics">
        <div className="panel-heading"><div><div className="eyebrow">VIOLATION HISTORY</div><h3>Detected constraint events</h3></div><span className="violation-history-note">cached timeline · no extra API call</span></div>
        <div className="violation-chart-empty">NO CONSTRAINT EVENTS IN THIS SIMULATION</div>
        <div className={`violation-reading normal`}><b>{selectedPoint.timestamp} / NO VIOLATIONS</b><span>NO CONSTRAINT EVENTS IN THIS SIMULATION</span></div>
      </section>
    );
  }

  const chartWidth = 760;
  const chartHeight = 180;
  const chartPadding = { left: 18, right: 14, top: 10, bottom: 24 };
  const xForIndex = (index: number) => {
    if (points.length <= 1) return chartPadding.left + (chartWidth - chartPadding.left - chartPadding.right) / 2;
    const range = chartWidth - chartPadding.left - chartPadding.right;
    return chartPadding.left + (index / (points.length - 1)) * range;
  };
  const yForCount = (count: number) => {
    const range = chartHeight - chartPadding.top - chartPadding.bottom;
    return chartHeight - chartPadding.bottom - (count / maximum) * range;
  };
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${xForIndex(index)} ${yForCount(point.total_violations)}`).join(" ");

  return (
    <section className="violation-history-analytics">
      <div className="panel-heading"><div><div className="eyebrow">VIOLATION HISTORY</div><h3>Detected constraint events</h3></div><span className="violation-history-note">cached timeline · no extra API call</span></div>
      <div className="violation-chart-wrap">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" className="violation-chart-svg" role="img" aria-label="Violation history chart">
          <g>
            {[0, 0.25, 0.5, 0.75, 1].map(fraction => {
              const y = chartPadding.top + fraction * (chartHeight - chartPadding.top - chartPadding.bottom);
              return <line key={`grid-${fraction}`} x1={chartPadding.left} x2={chartWidth - chartPadding.right} y1={y} y2={y} stroke="rgba(135,183,184,0.12)" strokeDasharray="4 6" />;
            })}
            <line x1={chartPadding.left} x2={chartWidth - chartPadding.right} y1={chartHeight - chartPadding.bottom} y2={chartHeight - chartPadding.bottom} stroke="rgba(135,183,184,0.18)" />
            <path d={path} fill="none" stroke="#74b7b0" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
            {points.map((point, index) => {
              const x = xForIndex(index);
              const y = yForCount(point.total_violations);
              const isSelected = index === selectedIndex;
              const hasViolations = point.total_violations > 0;
              return (
                <g key={`${point.timestamp}-${index}`}>
                  {isSelected && <line className="selected-time-line" x1={x} x2={x} y1={chartPadding.top} y2={chartHeight - chartPadding.bottom} />}
                  <rect
                    x={x - 6}
                    y={y}
                    width={12}
                    height={Math.max(chartHeight - chartPadding.bottom - y, 2)}
                    rx={3}
                    fill={hasViolations ? "#ef8b77" : "rgba(75,216,191,0.5)"}
                    opacity={hasViolations ? 0.95 : 0.78}
                    className={isSelected ? "violation-bar selected" : "violation-bar"}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectTimestep(index)}
                    onKeyDown={event => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectTimestep(index);
                      }
                    }}
                  >
                    <title>{`${point.timestamp} · ${point.total_violations} violation${point.total_violations === 1 ? "" : "s"}\n${point.violations.length ? point.violations.map(v => `${v.type.replaceAll("_", " ")} · ${v.component}`).join("\n") : "No violations"}`}</title>
                  </rect>
                  {isSelected && <circle cx={x} cy={y} r={6} fill="#74b7b0" stroke="#08161d" strokeWidth="2" />}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="chart-x"><span>{points[0]?.timestamp}</span><span>{points[Math.floor(points.length / 2)]?.timestamp}</span><span>{points.at(-1)?.timestamp}</span></div>
      {selectedPoint && <div className={`violation-reading ${selectedPoint.total_violations ? "actual" : "normal"}`}><b>{selectedPoint.timestamp} / {selectedPoint.total_violations ? `${selectedPoint.total_violations} ACTUAL VIOLATION${selectedPoint.total_violations === 1 ? "" : "S"}` : "NO VIOLATIONS"}</b>{selectedPoint.violations.length ? selectedPoint.violations.map((violation, index) => <span key={`${selectedPoint.timestamp}-${violation.component}-${index}`}>{violation.type.replaceAll("_", " ")} · {violation.component}</span>) : <span>NO VIOLATIONS</span>}</div>}
    </section>
  );
}

function BatteryAnalytics({ selectedIndex, onSelectTimestep }: { selectedIndex: number; onSelectTimestep: (index: number) => void }) {
  const [history, setHistory] = useState<BatteryAnalyticsPoint[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    api.battery().then(response => setHistory(response.history)).catch(() => setUnavailable(true));
  }, []);
  if (!history.length) {
    return <section className="battery-analytics"><div className="eyebrow">BATTERY ANALYTICS</div><p>{unavailable ? "Battery analytics unavailable" : "No simulation data"}</p></section>;
  }
  // The prominent battery readout follows the shared application timestep.
  const selectedPoint = history[selectedIndex];
  return (
    <section className="battery-analytics">
      <div className="panel-heading"><div><div className="eyebrow">BATTERY ANALYTICS</div><h3>SOC and automatic dispatch</h3></div><div className="battery-current"><strong>{selectedPoint?.battery_soc_percent.toFixed(1) ?? "--"}%</strong><span>{selectedPoint?.battery_mode ?? "No data"} · {selectedPoint?.battery_power_kw.toFixed(2) ?? "--"} kW · {selectedPoint?.timestamp ?? "--:--"}</span></div></div>
      <div className="line-chart battery-chart"><svg viewBox="0 0 760 180" preserveAspectRatio="none" onClick={event => { const bounds = event.currentTarget.getBoundingClientRect(); const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)); onSelectTimestep(Math.round(ratio * Math.max(history.length - 1, 1))); }}>{history[selectedIndex] && <line className="selected-time-line" x1={(selectedIndex / Math.max(history.length - 1, 1)) * 760} x2={(selectedIndex / Math.max(history.length - 1, 1)) * 760} y1="0" y2="180" />}<path d={`${linePath(history.map(point => point.battery_soc_percent), 760, 160, 100)} L760 160 L0 160 Z`} fill="rgba(116,183,176,.18)" /><path d={linePath(history.map(point => point.battery_soc_percent), 760, 160, 100)} fill="none" stroke="#74b7b0" strokeWidth="2.5" />{history.map((point, index) => index === selectedIndex && <circle key={`battery-point-${index}`} cx={(index / Math.max(history.length - 1, 1)) * 760} cy={160 - point.battery_soc_percent * 1.6} r="5" className="battery-point charging" />)}</svg><div className="chart-x"><span>{history[0]?.timestamp}</span><span>{history[Math.floor(history.length / 2)]?.timestamp}</span><span>{history.at(-1)?.timestamp}</span></div></div>
      <div className="battery-periods">{history.map((point, index) => <button key={`battery-mode-${index}`} className={point.battery_mode.toLowerCase()} title={`${point.timestamp} · ${point.battery_mode} · ${point.battery_power_kw.toFixed(2)} kW`} onClick={() => onSelectTimestep(index)} />)}</div>
    </section>
  );
}

function BaselineComparisonAnalytics({ refreshKey = 0 }: { refreshKey?: number | string }) {
  const [comparison, setComparison] = useState<BaselineComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setComparison(null);
    setError(null);

    const loadComparison = async () => {
      try {
        const response = await api.baselineComparison();
        if (!active) return;
        setComparison(response);
        setError(null);
      } catch (caughtError) {
        if (!active) return;
        setComparison(null);
        setError(caughtError instanceof Error ? caughtError.message : "Unknown comparison error");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadComparison();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const formatMetric = (value: number | null | undefined, unit: string, signed = false) => {
    if (value === null || value === undefined) return "Unavailable";
    const prefix = signed && value > 0 ? "+" : "";
    const decimals = unit === "pu" ? 3 : 2;
    return `${prefix}${value.toFixed(decimals)} ${unit}`;
  };

  if (loading) {
    return (
      <section className="baseline-comparison">
        <div className="eyebrow">BASELINE vs DER</div>
        <p>Loading comparison…</p>
      </section>
    );
  }

  if (!comparison || !comparison.baseline || !comparison.der) {
    return (
      <section className="baseline-comparison">
        <div className="eyebrow">BASELINE vs DER</div>
        <p>{error ? `COMPARISON UNAVAILABLE — ${error}` : "COMPARISON UNAVAILABLE"}</p>
      </section>
    );
  }

  const rows: { label: string; key: keyof BaselineComparison["baseline"]; unit: string }[] = [
    { label: "Minimum Voltage", key: "minimum_voltage_pu", unit: "pu" },
    { label: "Voltage Violations", key: "voltage_violation_count", unit: "count" },
    { label: "Maximum Line Loading", key: "maximum_line_loading_percent", unit: "%" },
    { label: "Transformer Loading", key: "transformer_loading_percent", unit: "%" },
    { label: "Total Power Loss", key: "total_active_power_loss_kw", unit: "kW" },
    { label: "Grid Import Energy", key: "grid_import_energy_kwh", unit: "kWh" },
    { label: "Grid Export Energy", key: "grid_export_energy_kwh", unit: "kWh" },
  ];

  return (
    <section className="baseline-comparison">
      <div className="panel-heading"><div><div className="eyebrow">BASELINE vs DER</div><h3>Pandapower engineering comparison</h3></div><span className="comparison-note">same uploaded profile · isolated runs</span></div>
      <div className="comparison-grid">
        {rows.map(row => {
          const baseline = comparison.baseline[row.key];
          const der = comparison.der[row.key];
          const delta = comparison.change[row.key];

          return (
            <div className="comparison-card" key={row.key}>
              <div className="comparison-card-label">{row.label}</div>
              <div className="comparison-card-values">
                <div className="comparison-side baseline"><span>BASELINE</span><strong>{formatMetric(baseline as number | null, row.unit)}</strong></div>
                <div className="comparison-side der"><span>SOLAR + BATTERY</span><strong>{formatMetric(der as number | null, row.unit)}</strong></div>
                <div className="comparison-side change"><span>CHANGE</span><strong>{delta === undefined ? "Unavailable" : formatMetric(delta as number | null, row.unit, true)}</strong></div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HistoryView({
  scenario,
  onNavigate,
}: {
  scenario: Scenario;
  onNavigate: (v: View) => void;
}) {
  const [history, setHistory] = useState<{ time: string; state: SimState }[]>(
    []
  );
  const [analytics, setAnalytics] = useState<LossAnalytics | null>(null);
  useEffect(() => {
    api
      .history()
      .then(({ history: records }) =>
        setHistory(
          records
            .filter(record => record.converged)
            .map(record => ({ time: record.timestamp, state: toState(record) }))
        )
      )
      .catch(error =>
        toast.error(
          error instanceof Error ? error.message : "Could not load history"
        )
      );
    api
      .losses()
      .then(setAnalytics)
      .catch(error =>
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not load power-loss analytics"
        )
      );
  }, []);
  const losses = analytics?.history ?? [];
  const latestLoss = analytics;
  const lossChartMaximum = Math.max(
    ...losses.map(loss => loss.total_loss_kw),
    1
  );
  return (
    <div className="app-shell">
      <AppHeader active="history" onNavigate={onNavigate} />
      <main className="history-main">
        <div className="page-heading">
          <div>
            <div className="hero-kicker">
              <span className="kicker-line" /> HISTORICAL ANALYSIS / 12
              OPERATING POINTS
            </div>
            <h2>
              Read the day
              <br />
              <em>as a system</em>.
            </h2>
            <p>
              Trace calculated voltage, demand, generation, and violations
              across the full operating timeline.
            </p>
          </div>
          <Button
            variant="outline"
            className="toolbar-button"
            onClick={() =>
              toast.success("CSV export prepared for the selected scenario.")
            }
          >
            <Download size={14} /> EXPORT CSV
          </Button>
        </div>
        <div className="history-kpis">
          <MetricCard
            label="Peak generation"
            value={String(Math.max(...history.map(x => x.state.solar)))}
            unit="kW"
            icon={Sun}
            accent="amber"
            note="at 13:00"
          />
          <MetricCard
            label="Peak demand"
            value={String(Math.max(...history.map(x => x.state.load)))}
            unit="kW"
            icon={Power}
            accent="blue"
            note="at 18:00"
          />
          <MetricCard
            label="Max voltage"
            value={Math.max(...history.map(x => x.state.maxVoltage)).toFixed(3)}
            unit="pu"
            icon={Gauge}
            accent="red"
            note="bus_05"
          />
          <MetricCard
            label="Violation hours"
            value={String(
              history.filter(x => x.state.violations.length).length
            )}
            unit="steps"
            icon={AlertTriangle}
            accent="violet"
            note="of 12 total"
          />
        </div>
        <div className="history-grid">
          <section className="history-chart-card">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">OPERATING PROFILE</div>
                <h3>Generation vs. demand</h3>
              </div>
              <div className="chart-legend">
                <span>
                  <i className="dot amber" /> solar
                </span>
                <span>
                  <i className="dot blue" /> load
                </span>
              </div>
            </div>
            <div className="line-chart">
              <div className="chart-y">
                <span>240</span>
                <span>180</span>
                <span>120</span>
                <span>60</span>
                <span>0</span>
              </div>
              <svg viewBox="0 0 760 260" preserveAspectRatio="none">
                <path
                  d={linePath(
                    history.map(x => x.state.solar),
                    760,
                    230,
                    240
                  )}
                  fill="none"
                  stroke="#e3b46c"
                  strokeWidth="3"
                />
                <path
                  d={linePath(
                    history.map(x => x.state.load),
                    760,
                    230,
                    240
                  )}
                  fill="none"
                  stroke="#6db5d1"
                  strokeWidth="3"
                />
                <path
                  d={linePath(
                    history.map(x => x.state.solar),
                    760,
                    230,
                    240
                  )}
                  fill="url(#solarArea)"
                  opacity=".12"
                />
                <defs>
                  <linearGradient id="solarArea" x1="0" x2="0" y1="0" y2="1">
                    <stop stopColor="#e3b46c" />
                    <stop offset="1" stopColor="#e3b46c" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {history.map((x, i) => (
                  <circle
                    key={x.time}
                    cx={(i / (history.length - 1)) * 760}
                    cy={230 - (x.state.solar / 240) * 230}
                    r="4"
                    fill="#e3b46c"
                  />
                ))}
              </svg>
              <div className="chart-x">
                {history.map(x => (
                  <span key={x.time}>{x.time}</span>
                ))}
              </div>
            </div>
          </section>
          <section className="history-table-card">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">TIMESTEP LOG</div>
                <h3>Constraint events</h3>
              </div>
              <List size={16} className="muted" />
            </div>
            <div className="history-table">
              <div className="table-head">
                <span>TIME</span>
                <span>VOLTAGE</span>
                <span>LINE</span>
                <span>STATUS</span>
              </div>
              {history.map((item, i) => (
                <button
                  key={item.time}
                  className={`table-row ${item.state.violations.length ? "has-event" : ""}`}
                  onClick={() => onNavigate("twin")}
                >
                  <span>{item.time}</span>
                  <span>{item.state.maxVoltage.toFixed(3)} pu</span>
                  <span>{Math.round(item.state.lineLoading)}%</span>
                  <span>
                    {item.state.violations.length ? (
                      <TinyPill
                        tone={
                          item.state.violations.some(
                            v => v.severity === "critical"
                          )
                            ? "red"
                            : "amber"
                        }
                      >
                        {item.state.violations.length} event
                        {item.state.violations.length > 1 ? "s" : ""}
                      </TinyPill>
                    ) : (
                      <TinyPill tone="green">nominal</TinyPill>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section className="history-chart-card loss-analytics-card">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">POWER LOSS</div>
                <h3>Active line loss</h3>
              </div>
              <div className="loss-energy">
                <strong>
                  {latestLoss?.total_energy_loss_kwh?.toFixed(3) ?? "UNAVAILABLE"} kWh
                </strong>
                <span>total energy loss</span>
              </div>
            </div>
            <div className="line-chart loss-chart">
              <svg viewBox="0 0 760 180" preserveAspectRatio="none">
                <path
                  d={linePath(
                    losses.map(loss => loss.total_loss_kw),
                    760,
                    160,
                    lossChartMaximum
                  )}
                  fill="none"
                  stroke="#ef8b77"
                  strokeWidth="3"
                />
              </svg>
              <div className="chart-x">
                {losses.map(loss => (
                  <span key={loss.timestamp}>{loss.timestamp}</span>
                ))}
              </div>
            </div>
            <div className="line-loss-list">
              {(latestLoss?.lines ?? []).map(
                line => (
                  <span key={line.id}>
                    <b>{line.id}</b> {line.loss_kw.toFixed(3)} kW
                  </span>
                )
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function StatisticsView({ history, selectedIndex, onSelectTimestep, onNavigate }: { history: SimulationStep[]; selectedIndex: number; onSelectTimestep: (index: number) => void; onNavigate: (v: View) => void }) {
  const comparisonRefreshKey = history.length;

  return (
    <div className="app-shell">
      <AppHeader active="history" onNavigate={onNavigate} />
      <main className="history-main statistics-main">
        <div className="page-heading">
          <div>
            <div className="hero-kicker"><span className="kicker-line" /> HISTORICAL ANALYSIS / SHARED TIMELINE</div>
            <h2>Read the day<br /><em>as a system</em>.</h2>
            <p>Every chart follows the selected operating point from the digital twin.</p>
          </div>
          <Button variant="outline" className="toolbar-button" onClick={() => onNavigate("twin")}><Map size={14} /> RETURN TO DIGITAL TWIN</Button>
        </div>
        <div className="analytics-workspace">
          <ViolationHistoryAnalytics history={history} selectedIndex={selectedIndex} onSelectTimestep={onSelectTimestep} />
          <BatteryAnalytics selectedIndex={selectedIndex} onSelectTimestep={onSelectTimestep} />
          <PowerLossAnalytics selectedIndex={selectedIndex} onSelectTimestep={onSelectTimestep} />
          <VoltageProfileAnalytics selectedIndex={selectedIndex} onSelectTimestep={onSelectTimestep} />
        </div>
        <BaselineComparisonAnalytics refreshKey={comparisonRefreshKey} />
      </main>
    </div>
  );
}
function linePath(
  values: number[],
  width: number,
  height: number,
  max: number
) {
  return values
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"}${(i / (values.length - 1)) * width} ${height - (v / max) * height}`
    )
    .join(" ");
}

function NetworkView({ onNavigate }: { onNavigate: (v: View) => void }) {
  const components = [
    {
      id: "grid_01",
      label: "Grid connection",
      type: "External grid",
      value: "11 kV",
    },
    {
      id: "trafo_01",
      label: "Distribution transformer",
      type: "Transformer",
      value: "250 kVA / 11–0.415 kV",
    },
    {
      id: "bus_01",
      label: "Bus 01 to Bus 06",
      type: "Radial buses",
      value: "6 buses / 5 lines",
    },
    {
      id: "solar_01",
      label: "Solar generation",
      type: "Distributed PV",
      value: "2 PV plants",
    },
    {
      id: "battery_01",
      label: "Battery storage",
      type: "BESS",
      value: "100 kWh / ±50 kW",
    },
  ];
  return (
    <div className="app-shell">
      <AppHeader active="network" onNavigate={onNavigate} />
      <main className="network-main">
        <div className="page-heading">
          <div>
            <div className="hero-kicker">
              <span className="kicker-line" /> NETWORK DETAILS / MODEL METADATA
            </div>
            <h2>
              One topology.
              <br />
              <em>Stable IDs.</em>
            </h2>
            <p>
              Every visible component maps to a stable identifier in the virtual
              electrical network.
            </p>
          </div>
          <TinyPill tone="blue">
            <Database size={12} /> TEST FEEDER / READ ONLY
          </TinyPill>
        </div>
        <div className="network-grid">
          <section className="network-map-card">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">TOPOLOGY MAP</div>
                <h3>Grid → transformer → buses</h3>
              </div>
              <TinyPill tone="green">
                <Check size={12} /> SYNCHRONIZED
              </TinyPill>
            </div>
            <div className="network-map">
              <MiniFeeder />
            </div>
            <div className="network-caption">
              <Info size={14} /> This is a simulated/test feeder and does not
              represent an actual utility network.
            </div>
          </section>
          <section className="component-list-card">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">COMPONENT REGISTRY</div>
                <h3>Engineering metadata</h3>
              </div>
              <FileText size={16} className="muted" />
            </div>
            <div className="component-list">
              {components.map(c => (
                <button
                  key={c.id}
                  className="registry-row"
                  onClick={() =>
                    toast.info(
                      `${c.id} is linked to the digital-twin component.`
                    )
                  }
                >
                  <div className="registry-icon">
                    <Zap size={15} />
                  </div>
                  <div className="registry-copy">
                    <strong>{c.label}</strong>
                    <span>{c.type}</span>
                  </div>
                  <div className="registry-value">
                    <b>{c.value}</b>
                    <span>{c.id}</span>
                  </div>
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
          </section>
        </div>
        <div className="network-disclaimer">
          <ShieldCheck size={16} />
          <div>
            <strong>Model integrity note</strong>
            <span>
              The simulation screen visualizes calculated state only. Electrical
              outputs are not measurements from a live feeder.
            </span>
          </div>
          <Button
            variant="outline"
            className="toolbar-button"
            onClick={() => onNavigate("twin")}
          >
            OPEN TWIN <ArrowRight size={14} />
          </Button>
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("landing");
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<Scenario>("High solar");
  const [step, setStep] = useState(0);
  const [currentStep, setCurrentStep] = useState<SimulationStep | undefined>();
  const [timesteps, setTimesteps] = useState(0);
  const [timestamps, setTimestamps] = useState<string[]>([]);
  const [history, setHistory] = useState<SimulationStep[]>([]);
  const advancingRef = useRef(false);
  const startingRef = useRef(false);
  const selectedStep = useMemo(
    () => history[Math.max(0, Math.min(step, Math.max(history.length - 1, 0)))] ?? currentStep ?? history.at(-1),
    [currentStep, history, step]
  );
  const [whatIfResult, setWhatIfResult] = useState<WhatIfResult | undefined>();
  useEffect(() => {
    api
      .weather()
      .then(setWeather)
      .catch(error =>
        setWeatherError(
          error instanceof Error ? error.message : "Weather service unavailable"
        )
      );
  }, []);
  useEffect(() => {
    const strip = document.querySelector<HTMLElement>(".weather-strip");
    if (!strip) return;
    const value = strip.querySelector("b");
    const label = strip.querySelector("span");
    if (weatherError) {
      if (value) value.textContent = "Weather unavailable";
      if (label) label.textContent = "API ERROR";
      return;
    }
    if (!weather) {
      if (value) value.textContent = "Loading weather…";
      if (label) label.textContent = "LOADING";
      return;
    }
    if (value)
      value.textContent =
        weather.temperature_c === null
          ? "N/A"
          : `${weather.temperature_c}°C · cloud ${weather.cloud_cover_percent ?? "N/A"}%`;
    if (label)
      label.textContent = `${weather.status} · ${weather.solar_irradiance_w_m2 ?? "N/A"} W/m² · ${weather.solar_input_label}`;
  }, [weather, weatherError, view]);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [bootstrappingSimulation, setBootstrappingSimulation] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState("");
  const [intervention, setIntervention] = useState<Intervention>({
    type: "battery",
    value: 40,
  });
  const state = useMemo(() => toState(selectedStep), [selectedStep]);
  const loadDemoScenario = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setBootstrappingSimulation(true);
    try {
      await api.loadDemoScenario();
      const [first, stored, simulation] = await Promise.all([
        api.start(),
        api.history(),
        api.state(),
      ]);
      setWhatIfResult(undefined);
      const normalized = normalizeSimulationHistory(
        stored.history.length ? stored.history : [first]
      );
      const initialStep = normalized[0] ?? first;
      setCurrentStep(initialStep);
      setStep(0);
      setHistory(normalized);
      setTimesteps(simulation.timesteps);
      setTimestamps(simulation.timestamps);
      setView("twin");
      toast.success("Demo scenario loaded and simulation started.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Demo scenario could not load"
      );
    } finally {
      startingRef.current = false;
      setBootstrappingSimulation(false);
    }
  };
  const startSimulation = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setBootstrappingSimulation(true);
    try {
      const [first, stored, simulation] = await Promise.all([
        api.start(),
        api.history(),
        api.state(),
      ]);
      setWhatIfResult(undefined);
      const normalized = normalizeSimulationHistory(
        stored.history.length ? stored.history : [first]
      );
      const initialStep = normalized[0] ?? first;
      setCurrentStep(initialStep);
      setStep(0);
      setHistory(normalized);
      setTimesteps(simulation.timesteps);
      setTimestamps(simulation.timestamps);
      setView("twin");
      toast.success("Simulation started from uploaded, validated profiles.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Simulation could not start"
      );
    } finally {
      startingRef.current = false;
      setBootstrappingSimulation(false);
    }
  };
  const chooseStep = (requested: number) => {
    if (!Number.isFinite(requested)) return;
    const maxIndex = Math.max(0, Math.max(timesteps, history.length, 1) - 1);
    const safeRequested = Math.max(0, Math.min(requested, maxIndex));
    setPlaying(false);

    if (safeRequested === step && history[safeRequested]) {
      setCurrentStep(history[safeRequested]);
      return;
    }

    const cached = history[safeRequested];
    if (cached) {
      setCurrentStep(cached);
      setStep(safeRequested);
      if (!cached.converged)
        toast.error(
          cached.error ?? "Power flow did not converge; no values are displayed."
        );
      return;
    }

    if (safeRequested !== history.length || advancingRef.current) return;
    advancingRef.current = true;
    void api
      .step()
      .then(result => {
        setHistory(previous => normalizeSimulationHistory([...previous, result]));
        setCurrentStep(result);
        setStep(result.index);
        if (!result.converged)
          toast.error(
            result.error ?? "Power flow did not converge; no values are displayed."
          );
      })
      .catch(error => {
        setPlaying(false);
        toast.error(
          error instanceof Error ? error.message : "Unable to calculate the next timestep"
        );
      })
      .finally(() => {
        advancingRef.current = false;
      });
  };
  const appNavigate = (target: View) => {
    setSelectedComponent("");
    setView(target);
  };
  useEffect(() => {
    if (view === "landing") setPlaying(false);
  }, [view]);
  if (bootstrappingSimulation) return <BuildingTwinLoading />;
  if (view === "landing") return <Landing onEnter={setView} onLoadDemo={loadDemoScenario} />;
  if (view === "setup")
    return (
      <Setup
        scenario={scenario}
        setScenario={setScenario}
        onStart={() => void startSimulation()}
        onBack={() => setView("landing")}
      />
    );
  if (view === "whatif")
    return (
      <WhatIf
        scenario={scenario}
        step={step}
        state={state}
        intervention={intervention}
        setIntervention={setIntervention}
        result={whatIfResult}
        onResult={setWhatIfResult}
        onCompare={() =>
          void (async () => {
            try {
              const response = await api.whatIf(
                intervention.type === "battery"
                  ? "battery_charge"
                  : "solar_curtailment",
                intervention.value
              );
              setWhatIfResult(response);
              if (!response.scenario) {
                toast.error(response.reason ?? "Scenario could not run");
                return;
              }
              setView("compare");
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "What-If analysis failed"
              );
            }
          })()
        }
        onNavigate={appNavigate}
      />
    );
  if (view === "compare")
    return (
      <CompareView
        scenario={scenario}
        step={step}
        state={state}
        intervention={intervention}
        result={whatIfResult}
        onNavigate={appNavigate}
      />
    );
  if (view === "history")
    return (
      <StatisticsView
        history={history}
        selectedIndex={step}
        onSelectTimestep={chooseStep}
        onNavigate={appNavigate}
      />
    );
  if (view === "network") return <NetworkView onNavigate={appNavigate} />;
  return (
    <TwinView
      scenario={scenario}
      step={step}
      setStep={setStep}
      playing={playing}
      setPlaying={setPlaying}
      speed={speed}
      setSpeed={setSpeed}
      timestamp={currentStep?.timestamp}
      timesteps={timesteps}
      availableTimesteps={Math.max(history.length, timesteps, 1)}
      timestamps={timestamps}
      violationSteps={new Set(history.filter(item => (item.violations?.length ?? 0) > 0).map(item => item.index))}
      onSelectTimestep={chooseStep}
      selectedComponent={selectedComponent}
      setSelectedComponent={setSelectedComponent}
      state={state}
      onNavigate={appNavigate}
    />
  );
}
