// frontend/src/api/system_monitor.ts
import { http } from "./http";

export type SystemMonitorStats = {
  ok?: boolean;
  ts?: string;

  cpu_percent?: number;
  mem_percent?: number;
  disk_percent?: number;

  uptime_seconds?: number;

  load_1?: number;
  load_5?: number;
  load_15?: number;

  [k: string]: any;
};

function asNumber(v: any): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeStats(payload: any): SystemMonitorStats {
  // backend may return {ok, data} OR direct stats
  const raw = payload?.data ?? payload ?? {};
  return {
    ok: payload?.ok ?? raw?.ok ?? true,
    ts: raw?.ts ?? raw?.timestamp ?? raw?.created_at,

    cpu_percent: asNumber(raw?.cpu_percent ?? raw?.cpu),
    mem_percent: asNumber(
      raw?.mem_percent ?? raw?.ram_percent ?? raw?.memory_percent,
    ),
    disk_percent: asNumber(raw?.disk_percent ?? raw?.storage_percent),

    uptime_seconds: asNumber(raw?.uptime_seconds ?? raw?.uptime),

    load_1: asNumber(raw?.load_1 ?? raw?.load1),
    load_5: asNumber(raw?.load_5 ?? raw?.load5),
    load_15: asNumber(raw?.load_15 ?? raw?.load15),

    ...raw,
  };
}

export async function getSystemMonitorStats(): Promise<SystemMonitorStats> {
  const res = await http.get("/api/system/health");
  return normalizeStats(res);
}
