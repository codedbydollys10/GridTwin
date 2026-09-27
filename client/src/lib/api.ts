export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

export type Violation = {
  component: string;
  id: string;
  timestamp: string;
  type: string;
  value: number;
  limit: number;
  severity: "warning" | "critical";
};
export type ElectricalResults = {
  buses: { id: string; voltage_pu: number; angle_deg: number }[];
  lines: {
    id: string;
    loading_percent: number;
    p_from_mw: number;
    p_to_mw: number;
    loss_kw: number;
  }[];
  transformers: {
    id: string;
    loading_percent: number;
    p_hv_mw: number;
    p_lv_mw: number;
    loss_kw: number;
  }[];
  generators: { id: string; power_kw: number }[];
  storage: { id: string; power_kw: number; soc_percent: number }[];
  loads: { id: string; power_kw: number }[];
};
export type WeatherResponse = {
  status: string;
  timestamp: string;
  temperature_c: number | null;
  cloud_cover_percent: number | null;
  solar_irradiance_w_m2: number | null;
  humidity_percent: number | null;
  wind_speed_m_s: number | null;
  solar_input_label: string;
  error?: string;
};
export type SimulationStep = {
  index: number;
  timestamp: string;
  solar_kw: number;
  load_kw: number;
  converged: boolean;
  error: string | null;
  results?: ElectricalResults;
  violations?: Violation[];
  summary?: {
    max_voltage_pu: number;
    min_voltage_pu: number;
    max_line_loading_percent: number;
    transformer_loading_percent: number;
    net_flow_kw: number;
    direction: "import" | "export";
    battery_soc_percent: number;
  };
  losses?: TimestepLosses;
};
export type LossLine = {
  id: string;
  loss_kw: number;
  energy_loss_kwh: number;
  total_energy_loss_kwh: number;
  loading_percent: number;
  power_flow_kw: number;
  status: "NORMAL" | "WARNING" | "CRITICAL";
};
export type LossAnalytics = {
  total_loss_kw: number | null;
  total_energy_loss_kwh: number | null;
  lines: LossLine[];
  history: LossAnalyticsPoint[];
};
export type LossAnalyticsPoint = {
  timestamp: string;
  total_loss_kw: number;
  energy_loss_kwh: number;
  lines: Record<string, LossLine>;
};
export type TimestepLosses = {
  total_loss_kw: number;
  timestep_energy_loss_kwh: number;
  total_energy_loss_kwh: number;
  lines: LossLine[];
};
export type VoltageProfilePoint = {
  timestamp: string;
  bus_voltages: Record<string, number>;
  min_voltage_pu: number;
  min_voltage_bus: string;
  max_voltage_pu: number;
  max_voltage_bus: string;
  average_voltage_pu: number;
};
export type ViolationHistoryPoint = {
  timestamp: string;
  low_voltage_count: number;
  high_voltage_count: number;
  line_overload_count: number;
  transformer_overload_count: number;
  total_violations: number;
  affected_buses: string[];
  affected_lines: string[];
  affected_transformers: string[];
};
export type BatteryAnalyticsPoint = {
  timestamp: string;
  battery_power_kw: number;
  battery_mode: "CHARGING" | "DISCHARGING" | "IDLE";
  battery_soc_percent: number;
  battery_energy_kwh: number;
};
export type ComparisonMetrics = {
  minimum_voltage_pu: number | null;
  maximum_voltage_pu: number | null;
  voltage_violation_count: number;
  maximum_line_loading_percent: number;
  transformer_loading_percent: number;
  total_active_power_loss_kw: number | null;
  total_active_power_loss_kwh: number;
  grid_import_energy_kwh: number;
  grid_export_energy_kwh: number;
  converged_timesteps: number;
};
export type BaselineComparison = {
  baseline: ComparisonMetrics;
  der: ComparisonMetrics;
  change: Partial<Record<keyof ComparisonMetrics, number>>;
};
export type WhatIfResult = {
  feasible: boolean;
  action: { type: string; power_kw: number };
  baseline: {
    converged: boolean;
    error: string | null;
    results: ElectricalResults | null;
    violations: Violation[];
    summary?: {
      max_voltage_pu: number;
      min_voltage_pu: number;
      max_line_loading_percent: number;
      transformer_loading_percent: number;
      net_flow_kw: number;
    };
  };
  scenario: {
    converged: boolean;
    error: string | null;
    results: ElectricalResults | null;
    violations: Violation[];
    summary?: {
      max_voltage_pu: number;
      min_voltage_pu: number;
      max_line_loading_percent: number;
      transformer_loading_percent: number;
      net_flow_kw: number;
    };
  } | null;
  changes: Record<string, number> | null;
  reason: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      body.detail ?? body.error ?? `API request failed (${response.status})`
    );
  return body as T;
}
export const api = {
  upload: (type: "solar" | "load", file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{
      status: string;
      data_type: "solar" | "load";
      filename: string;
      rows: number;
      timestamps: string[];
      aligned: boolean;
    }>(`/data/${type}`, { method: "POST", body: form });
  },
  dataStatus: () =>
    request<{
      solar_uploaded: boolean;
      load_uploaded: boolean;
      aligned: boolean;
      timesteps: number;
    }>("/data/status"),
  grid: () => request("/grid"),
  start: () =>
    request<SimulationStep>("/simulation/start", {
      method: "POST",
    }),
  loadDemoScenario: () =>
    request<{ status: string; timesteps: number; timestamps: string[] }>(
      "/simulation/demo",
      { method: "POST" }
    ),
  step: () => request<SimulationStep>("/simulation/step", { method: "POST" }),
  complete: () => request<{ history: SimulationStep[] }>("/simulation/complete", { method: "POST" }),
  select: (index: number) => request<SimulationStep>(`/simulation/select/${index}`, { method: "POST" }),
  reset: () => request("/simulation/reset", { method: "POST" }),
  state: () =>
    request<{
      running: boolean;
      index: number;
      calculated_index: number;
      timesteps: number;
      timestamps: string[];
      state: SimulationStep | null;
    }>("/simulation/state"),
  history: () => request<{ history: SimulationStep[] }>("/simulation/history"),
  losses: () => request<LossAnalytics>("/analytics/losses"),
  voltageProfile: () => request<{ history: VoltageProfilePoint[] }>("/analytics/voltage-profile"),
  violationHistory: () => request<{ history: ViolationHistoryPoint[] }>("/analytics/violations"),
  battery: () => request<{ history: BatteryAnalyticsPoint[] }>("/analytics/battery"),
  baselineComparison: () => request<BaselineComparison>("/analytics/baseline-comparison"),
  violations: () => request<{ violations: Violation[] }>("/violations"),
  weather: () => request<WeatherResponse>("/weather"),
  whatIf: (action: string, power_kw: number) =>
    request<WhatIfResult>("/simulation/what-if", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, power_kw }),
    }),
};
