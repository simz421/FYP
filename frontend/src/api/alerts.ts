import { http } from "./http";

// Defensive type so we don’t depend on ../types/api being perfect
export type AlertEvent = {
  id: number;
  device_id?: string | null;
  parameter?: string | null;
  sensor_type?: string | null;
  message?: string | null;

  // common variants
  level?: "INFO" | "WARNING" | "CRITICAL" | string;
  severity?:
    | "BELOW_MIN"
    | "ABOVE_MAX"
    | "info"
    | "warning"
    | "critical"
    | string;
  status?: "active" | "acked" | "resolved" | string;

  value?: number | null;
  min_value?: number | null;
  max_value?: number | null;

  created_at?: string | null;
  acked_at?: string | null;
  ack_note?: string | null;
  resolved_at?: string | null;

  [k: string]: any;
};

export type AlertTrendBucket = {
  ts: string;
  count: number;
  [k: string]: any;
};

export type AlertsQuery = {
  limit?: number;
  offset?: number;

  q?: string;
  device_id?: string;

  // status lifecycle filter
  status?: "active" | "acked" | "resolved" | string;

  // level filter (CRITICAL/WARNING)
  level?: "WARNING" | "CRITICAL" | string;

  // direction or severity filter (BELOW_MIN/ABOVE_MAX) OR older severity strings
  severity?: string;

  // optional convenience boolean
  active_only?: boolean;
};

type AlertsResponse = {
  ok?: boolean;
  count?: number;
  total?: number;

  // most common
  data?: AlertEvent[];

  // alternates
  items?: AlertEvent[];
  alerts?: AlertEvent[];
  message?: string;
  error?: string;

  // sometimes returned as { data: { items: [...] } }
  [k: string]: any;
};

function normalizeAlertsResponse(payloadIn: any) {
  // IMPORTANT:
  // Our http.get() returns the parsed JSON payload directly (not { data: ... } wrapper).
  const payload = payloadIn ?? {};

  const data: AlertEvent[] =
    (Array.isArray(payload?.data) ? payload.data : null) ??
    (Array.isArray(payload?.items) ? payload.items : null) ??
    (Array.isArray(payload?.alerts) ? payload.alerts : null) ??
    (Array.isArray(payload?.data?.items) ? payload.data.items : null) ??
    [];

  const count: number =
    typeof payload?.count === "number"
      ? payload.count
      : typeof payload?.total === "number"
        ? payload.total
        : data.length;

  const ok: boolean =
    typeof payload?.ok === "boolean"
      ? payload.ok
      : // if it looks like a normal list payload, treat as ok
        Array.isArray(data) || typeof payload?.count === "number";

  const error =
    payload?.error ||
    payload?.message ||
    (ok ? undefined : "Request failed (bad payload shape)");

  return { ok, count, data, error: error ? String(error) : undefined };
}

// GET /api/alerts?limit=50&offset=0&status=active&level=CRITICAL&severity=ABOVE_MAX&device_id=...&q=...
export async function fetchAlerts(query: AlertsQuery = {}) {
  const params = new URLSearchParams();

  params.set("limit", String(query.limit ?? 50));
  if (typeof query.offset === "number")
    params.set("offset", String(query.offset));

  const q = query.q?.trim();
  if (q) params.set("q", q);

  const device = query.device_id?.trim();
  if (device) params.set("device_id", device);

  if (query.active_only) params.set("active_only", "1");
  if (query.status) params.set("status", String(query.status));
  if (query.level) params.set("level", String(query.level));
  if (query.severity) params.set("severity", String(query.severity));

  const path = `/api/alerts?${params.toString()}`;

  try {
    const payload = await http.get<AlertsResponse>(path);
    const norm = normalizeAlertsResponse(payload);
    return {
      ok: norm.ok,
      data: norm.data,
      count: norm.count,
      error: norm.error,
      usedPath: path,
    };
  } catch (e: any) {
    return {
      ok: false,
      data: [],
      count: 0,
      error: e?.message || "Failed to load alerts",
      usedPath: path,
    };
  }
}

export async function fetchAlertTrends(
  query: { hours?: number; bucket_min?: number } = {},
) {
  const params = new URLSearchParams();
  if (query.hours != null) params.set("hours", String(query.hours));
  if (query.bucket_min != null)
    params.set("bucket_min", String(query.bucket_min));
  const path = `/api/alerts/trends?${params.toString()}`;

  try {
    const payload = await http.get<{
      ok?: boolean;
      data?: AlertTrendBucket[];
      items?: AlertTrendBucket[];
      error?: string;
      message?: string;
      [k: string]: any;
    }>(path);

    const data = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray((payload as any)?.items)
        ? (payload as any).items
        : Array.isArray((payload as any)?.data?.items)
          ? (payload as any).data.items
          : [];

    const ok =
      typeof payload?.ok === "boolean"
        ? payload.ok
        : Array.isArray(data) || data.length >= 0;

    return {
      ok,
      data,
      error:
        payload?.error || payload?.message
          ? String(payload.error || payload.message)
          : undefined,
      usedPath: path,
    };
  } catch (e: any) {
    return {
      ok: false,
      data: [],
      error: e?.message || "Failed to load alert trends",
      usedPath: path,
    };
  }
}

// Acknowledge
export async function ackAlert(id: number, note?: string) {
  const body = note ? { ack_note: note } : {};
  try {
    const payload = await http.post<{ ok?: boolean; data?: AlertEvent }>(
      `/api/alerts/${id}/ack`,
      body,
    );
    return ((payload as any)?.data ?? payload) as any;
  } catch {
    const payload = await http.put<{ ok?: boolean; data?: AlertEvent }>(
      `/api/alerts/${id}/ack`,
      body,
    );
    return ((payload as any)?.data ?? payload) as any;
  }
}

// Resolve
export async function resolveAlert(id: number) {
  try {
    const payload = await http.post<{ ok?: boolean; data?: AlertEvent }>(
      `/api/alerts/${id}/resolve`,
      {},
    );
    return ((payload as any)?.data ?? payload) as any;
  } catch {
    const payload = await http.put<{ ok?: boolean; data?: AlertEvent }>(
      `/api/alerts/${id}/resolve`,
      {},
    );
    return ((payload as any)?.data ?? payload) as any;
  }
}
