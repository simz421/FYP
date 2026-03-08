export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: string };

export type ForecastResult = {
  device_id: string;
  parameter: string;
  predicted_value: number;
  confidence: number;
  prediction_horizon: string;
  timestamp: string;
  rationale: string;
};

export type NetworkRiskResult = {
  device_id: string;
  node_name?: string;
  risk_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  analysis_period_days: number;
  alerts_in_period: number;
  last_seen?: string | null;
  current_status?: string | null;
  signal_strength?: number | null;
  prediction_horizon?: string;
  confidence?: number;
  recommendations?: string[];
  timestamp?: string;
};
export type FleetBreachScanItem = {
  device_id: string;
  node_id: number;
  node_name?: string;
  current_value: number | null;
  slope_per_hour: number | null;
  threshold: any | null;
  breach: {
    will_breach: boolean;
    direction: "high" | "low" | null;
    eta_hours: number | null;
    breach_at: string | null;
    breach_value: number | null;
  };
  risk: {
    risk_score: number;
    risk_level: "low" | "medium" | "high" | "critical";
  };
  timestamp?: string;
};

export type FleetBreachScanResult = {
  parameter: string;
  hours_ahead: number;
  generated_at: string;
  total_devices: number;
  returned: number;
  items: FleetBreachScanItem[];
};

export function getFleetBreachScan(args: {
  parameter: string;
  hours_ahead?: number;
  limit?: number;
  only_registered?: number | 0 | 1;
}) {
  // NOTE: if your predictive endpoints are under /api/predictive/predictive/... keep that base.
  return getJson<FleetBreachScanResult>(
    `/api/predictive/predictive/fleet_breach_scan?${qs(args as any)}`,
  );
}

export type BreachRiskResult = {
  device_id: string;
  parameter: string;
  effective_threshold: null | {
    id: number;
    device_id: string | null;
    node_id: number | null;
    parameter: string;
    min_value: number | null;
    max_value: number | null;
    is_enabled: boolean;
    updated_at: string;
  };
  forecast_points: Array<{ ts: string; value: number }>;
  breach: {
    will_breach: boolean;
    direction: "high" | "low" | null;
    time_to_breach_hours: number | null;
    breach_at: string | null;
    breach_value: number | null;
    rationale?: string;
    reason?: string;
  };
  risk: {
    risk_score: number;
    risk_level: "low" | "medium" | "high" | "critical";
  };
  timestamp: string;
};

export function getBreachRisk(args: {
  device_id: string;
  parameter: string;
  hours_ahead?: number;
}) {
  return getJson<BreachRiskResult>(`/api/predictive/breach_risk?${qs(args)}`);
}

export type PatternsResult = any;

async function getJson<T>(url: string): Promise<ApiOk<T> | ApiErr> {
  const res = await fetch(url);
  const j = await res.json().catch(() => null);

  if (!res.ok || !j) {
    return { ok: false, error: j?.error || `HTTP ${res.status}` };
  }
  return j as ApiOk<T>;
}

function qs(params: Record<string, any>) {
  const u = new URLSearchParams();
  Object.keys(params).forEach((k) => {
    const v = params[k];
    if (v === undefined || v === null || v === "") return;
    u.set(k, String(v));
  });
  return u.toString();
}

export function getForecast(args: {
  device_id: string;
  parameter: string;
  hours_ahead?: number;
}) {
  return getJson<ForecastResult>(`/api/predictive/forecast?${qs(args)}`);
}

export function getNetworkRisk(args: {
  device_id: string;
  lookback_days?: number;
}) {
  return getJson<NetworkRiskResult>(`/api/predictive/network_risk?${qs(args)}`);
}

export function getPatterns(args: {
  device_id: string;
  parameter: string;
  days?: number;
}) {
  return getJson<PatternsResult>(`/api/predictive/patterns?${qs(args)}`);
}

export function getMaintenancePlan() {
  return getJson<any>(`/api/predictive/maintenance`);
}
