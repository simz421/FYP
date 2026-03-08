import { http, okResult, errResult } from "./http";
import type { ApiResult } from "./http";
export type DeviceRow = {
  id: number;
  device_id: string;
  name: string;
  node_type: string;
  status: string;
  ip_address?: string | null;
  last_seen?: string | null;
  heartbeat_interval_sec?: number | null;
  is_registered?: boolean | null;
  last_rssi?: number | null;
};

function normalizeDevices(res: any): DeviceRow[] {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.data?.data)) return res.data.data;
  return [];
}

export async function fetchDevices(): Promise<ApiResult<DeviceRow[]>> {
  const path = "/api/devices";

  try {
    const res = await http.get<any>(path);
    const data = normalizeDevices(res);

    return okResult(data, {
      count: data.length,
      usedPath: path,
    });
  } catch (e: any) {
    return errResult(e?.message || "Failed to load devices", [], {
      usedPath: path,
    });
  }
}

export async function registerDevice(payload: {
  device_id: string;
  name?: string;
  node_type?: string;
  ip_address?: string;
  heartbeat_interval_sec?: number;
  last_rssi?: number;
}) {
  return http.post("/api/devices/register", payload);
}

export function computeOnlineState(
  d: DeviceRow,
): "online" | "stale" | "offline" {
  if (!d.last_seen) return "offline";

  const hb = Math.max(Number(d.heartbeat_interval_sec ?? 30), 1);
  const onlineSec = Math.max(hb * 2, 60);
  const staleSec = Math.max(hb * 6, 180);

  const ageSec = (Date.now() - new Date(d.last_seen).getTime()) / 1000;
  if (!Number.isFinite(ageSec)) return "offline";
  if (ageSec <= onlineSec) return "online";
  if (ageSec <= staleSec) return "stale";
  return "offline";
}
