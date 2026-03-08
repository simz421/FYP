import { http } from "./http";
import type { SensorReading } from "../types/api";

export type TelemetryQuery = {
  deviceId?: string;
  sensorType?: string;
  limit?: number; // client-side limit
  rangeDays?: number; // 1, 7, 30, or undefined for all
};

function parseTime(r: SensorReading) {
  const ts = (r as any).created_at || (r as any).timestamp;
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}

function normalizeKey(v: any) {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function extractRows(payload: any): SensorReading[] {
  // backend might return:
  // 1) [ ... ]
  // 2) { ok: true, data: [ ... ] }
  // 3) { data: [ ... ] }
  // 4) { ok: true, data: { items: [ ... ] } }
  // 5) { items: [ ... ] }
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

export async function fetchTelemetry(query: TelemetryQuery = {}) {
  const res = await http.get<any>("/api/sensors/readings");

  // IMPORTANT: some wrappers return the real payload in res.data,
  // others return it in res (already unwrapped).
  const payload = res?.data ?? res;

  let rows = extractRows(payload);

  if (query.deviceId) {
    rows = rows.filter((r: any) => r.device_id === query.deviceId);
  }

  if (query.sensorType) {
    const want = normalizeKey(query.sensorType);
    rows = rows.filter((r: any) => {
      // support both fields, because your model has both
      const st = normalizeKey(r.sensor_type);
      const p = normalizeKey(r.parameter);
      return st === want || p === want;
    });
  }

  if (query.rangeDays && query.rangeDays > 0) {
    const now = Date.now();
    const since = now - query.rangeDays * 24 * 60 * 60 * 1000;
    rows = rows.filter((r) => {
      const t = parseTime(r);
      return t !== null && t >= since;
    });
  }

  // newest first
  rows = rows.slice().sort((a, b) => {
    const ta = parseTime(a) ?? 0;
    const tb = parseTime(b) ?? 0;
    return tb - ta;
  });

  if (query.limit && query.limit > 0) {
    rows = rows.slice(0, query.limit);
  }

  return {
    usedPath: "/api/sensors/readings",
    data: rows,
  };
}
