export type DeviceLike = {
  id?: number;
  device_id: string;
  name?: string | null;
  node_type?: string | null;
  status?: string | null;
  last_seen?: string | null;
  heartbeat_interval_sec?: number | null;
  last_rssi?: number | null;

  // Optional fields (only if your backend exposes them)
  uptime_seconds?: number | null;
  packets_received?: number | null;
  packets_missed?: number | null;
};

export function isOnline(status?: string | null) {
  return String(status || "").toLowerCase() === "online";
}

export function safeNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function deliveryRatePct(d: DeviceLike): number | null {
  const received = safeNumber(d.packets_received);
  const missed = safeNumber(d.packets_missed);
  if (received === null || missed === null) return null;
  const total = received + missed;
  if (total <= 0) return null;
  return (received / total) * 100;
}

export function lastSeenAgeSeconds(lastSeenIso?: string | null): number | null {
  if (!lastSeenIso) return null;
  const t = new Date(lastSeenIso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
}

export function formatAge(ageSec: number | null): string {
  if (ageSec === null) return "—";
  if (ageSec < 60) return `${ageSec}s`;
  const mins = Math.floor(ageSec / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export function formatUptime(uptimeSec: number | null | undefined): string {
  if (uptimeSec === null || uptimeSec === undefined) return "—";
  const s = Math.max(0, Math.floor(uptimeSec));
  const days = Math.floor(s / 86400);
  const hrs = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

export function computeNetworkSummary(devices: DeviceLike[]) {
  const total = devices.length;
  const online = devices.filter((d) => isOnline(d.status)).length;
  const offline = total - online;

  // Average delivery rate across devices (only those with data)
  const rates = devices
    .map(deliveryRatePct)
    .filter((r): r is number => typeof r === "number" && Number.isFinite(r));

  const avgDeliveryRate = rates.length
    ? rates.reduce((a, b) => a + b, 0) / rates.length
    : null;

  // Average uptime across devices (only those with data)
  const uptimes = devices
    .map((d) => safeNumber(d.uptime_seconds))
    .filter((u): u is number => typeof u === "number" && Number.isFinite(u));

  const avgUptimeSec = uptimes.length
    ? uptimes.reduce((a, b) => a + b, 0) / uptimes.length
    : null;

  return {
    total,
    online,
    offline,
    avgDeliveryRate,
    avgUptimeSec,
    hasDelivery: rates.length > 0,
    hasUptime: uptimes.length > 0,
  };
}
