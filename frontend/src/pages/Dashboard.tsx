import { useEffect, useMemo, useState } from "react";

import Card from "../ui/Card";
import Button from "../ui/Button";
import Badge from "../ui/Badge";

import SystemMonitorCards from "../components/system/SystemMonitorCards";
import HealthTrendChart, {
  type HealthTrendPoint,
} from "../components/data/Charts/HealthTrendChart";

import { fetchHealth } from "../api/health";
import { fetchDevices } from "../api/devices";
import { fetchAlerts } from "../api/alerts";
import { fetchLatestReadings } from "../api/readings";

import {
  getSystemMonitorStats,
  type SystemMonitorStats,
} from "../api/system_monitor";

import {
  getEnhancedTopology,
  getNetworkEvents,
  getNetworkHealth,
  getNetworkMetrics,
  getRouteTimeline,
  type EnhancedTopology,
  type NetworkEvent,
  type NetworkHealthSummary,
  type NetworkMetrics,
  type RouteEvent,
} from "../api/network";

import type { HealthResponse } from "../api/health";
import type { Device, AlertEvent, SensorReading } from "../types/api";

interface IncidentItem {
  kind: string;
  ts: string | null;
  title: string;
  detail: string;
  device_id: string;
  t?: number;
}

function toMs(iso?: string | null) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function fmt(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function asNumber(x: unknown): number | null {
  if (x == null) return null;
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const m = x.match(/-?[\d.]+/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pctFromDelivery(x: unknown): number | null {
  // Accept: "95.0%" OR 0.95 OR 95
  if (x == null) return null;

  if (typeof x === "string") {
    const m = x.match(/([\d.]+)/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? Math.round(n) : null;
  }

  if (typeof x === "number") {
    if (!Number.isFinite(x)) return null;
    if (x <= 1) return Math.round(x * 100);
    return Math.round(x);
  }

  return null;
}

function safeParseTrend(raw: unknown): HealthTrendPoint[] {
  // Supports many possible backend shapes; your code already uses toTrendPoints,
  // but in case trend comes directly:
  const arr = Array.isArray(raw)
    ? raw
    : (raw as Record<string, unknown>)?.trend ||
      (raw as Record<string, unknown>)?.hourly ||
      (raw as Record<string, unknown>)?.buckets;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((p: unknown) => {
      const rec = p as Record<string, unknown>;
      const ts = (rec.ts || rec.time || rec.bucket || rec.at) as string | null;
      const rawValue =
        typeof rec.value === "number"
          ? rec.value
          : typeof rec.score === "number"
            ? rec.score
            : typeof rec.health === "number"
              ? rec.health
              : null;
      return {
        ts: ts || new Date().toISOString(),
        label: ts
          ? new Date(ts).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—",
        health_score: rawValue ?? 50,
      } as HealthTrendPoint;
    })
    .filter(
      (p: HealthTrendPoint) => p.ts && typeof p.health_score === "number",
    );
}

// If your previous Dashboard had these helpers, keep them compatible:
function toTrendPoints(
  hAny: unknown,
  fallbackScore: number | null,
): HealthTrendPoint[] {
  const parsed = safeParseTrend(hAny);
  if (parsed.length) return parsed;

  // Fallback: create a minimal 24h series with same score so chart renders
  if (fallbackScore == null) return [];
  const now = Date.now();
  const pts: HealthTrendPoint[] = [];
  for (let i = 23; i >= 0; i--) {
    const t = new Date(now - i * 3600_000);
    const ts = t.toISOString();
    const label = `${String(t.getHours()).padStart(2, "0")}:00`;
    pts.push({ ts, label, health_score: fallbackScore });
  }
  return pts;
}

function sysFlags(stats: SystemMonitorStats | null): {
  level: "ok" | "warning" | "critical" | "unknown";
  cpu: number | null;
  mem: number | null;
  disk: number | null;
  items: string[];
} {
  if (!stats) {
    return {
      level: "unknown",
      cpu: null,
      mem: null,
      disk: null,
      items: [],
    };
  }

  const cpu = asNumber((stats as Record<string, unknown>).cpu_percent);
  const mem = asNumber((stats as Record<string, unknown>).memory_percent);
  const disk = asNumber((stats as Record<string, unknown>).disk_percent);

  const items: string[] = [];
  let level: "ok" | "warning" | "critical" | "unknown" = "ok";

  function bump(newLevel: "warning" | "critical") {
    if (newLevel === "critical") level = "critical";
    if (newLevel === "warning" && level === "ok") level = "warning";
  }

  if (cpu != null) {
    if (cpu >= 90) {
      bump("critical");
      items.push("High CPU");
    } else if (cpu >= 75) {
      bump("warning");
      items.push("Elevated CPU");
    }
  }

  if (mem != null) {
    if (mem >= 90) {
      bump("critical");
      items.push("High RAM");
    } else if (mem >= 75) {
      bump("warning");
      items.push("Elevated RAM");
    }
  }

  if (disk != null) {
    if (disk >= 95) {
      bump("critical");
      items.push("Low Disk");
    } else if (disk >= 85) {
      bump("warning");
      items.push("Disk Warning");
    }
  }

  return { level, cpu, mem, disk, items };
}

export default function Dashboard() {
  const [loading, setLoading] = useState(false);

  // Existing API snapshots
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [readings, setReadings] = useState<SensorReading[]>([]);

  const [healthErr, setHealthErr] = useState<string | null>(null);
  const [devicesErr, setDevicesErr] = useState<string | null>(null);
  const [alertsErr, setAlertsErr] = useState<string | null>(null);
  const [readingsErr, setReadingsErr] = useState<string | null>(null);

  const [healthPath, setHealthPath] = useState<string | null>(null);
  const [devicesPath, setDevicesPath] = useState<string | null>(null);
  const [alertsPath, setAlertsPath] = useState<string | null>(null);
  const [readingsPath, setReadingsPath] = useState<string | null>(null);

  // Step E: system monitor stats (already in your project)
  const [systemStats, setSystemStats] = useState<SystemMonitorStats | null>(
    null,
  );
  const [systemStatsAt, setSystemStatsAt] = useState<string | null>(null);
  const [systemStatsErr, setSystemStatsErr] = useState<string | null>(null);

  // Step C: NOC endpoints
  const [netMetrics, setNetMetrics] = useState<NetworkMetrics | null>(null);
  const [netHealth, setNetHealth] = useState<NetworkHealthSummary | null>(null);
  const [topology, setTopology] = useState<EnhancedTopology | null>(null);
  const [routeEvents, setRouteEvents] = useState<RouteEvent[]>([]);
  const [netEvents, setNetEvents] = useState<NetworkEvent[]>([]);
  const [nocErr, setNocErr] = useState<string | null>(null);

  // Health trend
  const [healthTrend, setHealthTrend] = useState<HealthTrendPoint[]>([]);
  const [healthTrendAt, setHealthTrendAt] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setHealthErr(null);
    setDevicesErr(null);
    setAlertsErr(null);
    setReadingsErr(null);
    setSystemStatsErr(null);
    setNocErr(null);

    try {
      const h = await fetchHealth();
      setHealth(h || null);
      setHealthPath("/api/health");
    } catch (e: unknown) {
      const err = e as { message?: string };
      setHealthErr(err?.message || "Failed to load health");
    }

    try {
      const d = await fetchDevices();
      setDevices(
        Array.isArray(d) ? (d as Device[]) : ((d?.data as Device[]) ?? []),
      );
      setDevicesPath("/api/devices");
    } catch (e: unknown) {
      const err = e as { message?: string };
      setDevicesErr(err?.message || "Failed to load devices");
      setDevices([]);
    }

    try {
      const a = await fetchAlerts({ limit: 20 });
      const arr = Array.isArray(a)
        ? (a as AlertEvent[])
        : ((a?.data as AlertEvent[]) ?? []);
      setAlerts(arr);
      setAlertsPath("/api/alerts");
    } catch (e: unknown) {
      const err = e as { message?: string };
      setAlertsErr(err?.message || "Failed to load alerts");
      setAlerts([]);
    }

    try {
      const r = await fetchLatestReadings(20);
      const arr = Array.isArray(r)
        ? (r as SensorReading[])
        : ((r?.data as SensorReading[]) ?? []);
      setReadings(arr);
      setReadingsPath("/api/sensors/readings");
    } catch (e: unknown) {
      const err = e as { message?: string };
      setReadingsErr(err?.message || "Failed to load readings");
      setReadings([]);
    }

    // System monitor stats (Step E)
    try {
      const s = await getSystemMonitorStats();
      setSystemStats((s as Record<string, unknown>)?.data ?? s);
      setSystemStatsAt(new Date().toISOString());
    } catch (e: unknown) {
      const err = e as { message?: string };
      setSystemStatsErr(err?.message || "System monitor offline");
    }

    // NOC bundle (Step C)
    try {
      const [m, h2, t, rt, ne] = await Promise.allSettled([
        getNetworkMetrics(),
        getNetworkHealth(24),
        getEnhancedTopology(),
        getRouteTimeline(),
        getNetworkEvents(24, 50),
      ]);

      if (m.status === "fulfilled") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = (m.value as any)?.data ?? m.value;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setNetMetrics((raw as any)?.data ?? (raw as NetworkMetrics | null));
      } else setNetMetrics(null);

      if (h2.status === "fulfilled") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = (h2.value as any)?.data ?? h2.value;
        setNetHealth(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (raw as any)?.data ?? (raw as NetworkHealthSummary | null),
        );
      } else setNetHealth(null);

      if (t.status === "fulfilled") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = (t.value as any)?.data ?? t.value;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setTopology((raw as any)?.data ?? (raw as EnhancedTopology | null));
      } else setTopology(null);

      if (rt.status === "fulfilled") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = (rt.value as any)?.data ?? rt.value;
        const data = Array.isArray(raw)
          ? raw
          : Array.isArray(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (raw as any)?.data,
              )
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (raw as any).data
            : [];
        setRouteEvents(data as RouteEvent[]);
      } else setRouteEvents([]);

      if (ne.status === "fulfilled") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = (ne.value as any)?.data ?? ne.value;
        const data = Array.isArray(raw)
          ? raw
          : Array.isArray(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (raw as any)?.data,
              )
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (raw as any).data
            : [];
        setNetEvents(data as NetworkEvent[]);
      } else setNetEvents([]);

      // Trend build
      const netHealthRaw =
        h2.status === "fulfilled"
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((h2.value as any)?.data?.data ?? (h2.value as any)?.data ?? null)
          : null;

      const fallbackScore =
        pctFromDelivery(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((netHealthRaw as any)?.summary as Record<string, unknown>)
            ?.network_delivery_percent,
        ) ??
        pctFromDelivery(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((netHealth as any)?.summary as Record<string, unknown>)
            ?.network_delivery_percent,
        ) ??
        pctFromDelivery(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (netMetrics as any)?.network_health,
        ) ??
        null;

      const points = toTrendPoints(netHealthRaw ?? netHealth, fallbackScore);
      if (points.length) {
        setHealthTrend(points);
        setHealthTrendAt(new Date().toISOString());
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      setNocErr(err?.message || "Failed to load NOC overview");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => {});
    const id = window.setInterval(() => load().catch(() => {}), 15000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onlineCount = devices.filter(
    (d) => (d.status || "").toLowerCase() === "online",
  ).length;
  const offlineCount = devices.filter(
    (d) => (d.status || "").toLowerCase() === "offline",
  ).length;
  const activeAlertsCount = alerts.filter(
    (a: AlertEvent) => a.is_active === true,
  ).length;
  const latest = readings[0];

  const nocKpis = useMemo(() => {
    const nm = netMetrics as Record<string, unknown>;
    const nh = netHealth as Record<string, unknown>;
    const nhSummary = nh?.summary as Record<string, unknown>;
    const topoSummary = (topology as Record<string, unknown>)
      ?.summary as Record<string, unknown>;

    const totalNodes =
      (nm?.total_nodes as number) ??
      (nhSummary?.total_nodes as number) ??
      devices.length;

    const onlineNodes =
      (nm?.online_nodes as number) ??
      (nhSummary?.online_nodes as number) ??
      onlineCount;

    const offlineNodes =
      (nhSummary?.offline_nodes as number) ??
      Math.max(0, totalNodes - onlineNodes);

    const avgRssi =
      (nm?.avg_signal_strength as number) ??
      (nhSummary?.average_rssi as number) ??
      null;

    const deliveryPct =
      pctFromDelivery(nhSummary?.network_delivery_percent) ??
      pctFromDelivery(nm?.network_health) ??
      null;

    const problemNodes =
      (nm?.problem_nodes as number) ??
      (nhSummary?.problem_nodes_count as number) ??
      0;

    return {
      totalNodes,
      onlineNodes,
      offlineNodes,
      avgRssi,
      deliveryPct,
      problemNodes,
      activeAlerts: activeAlertsCount,
      lastUpdated:
        (nm?.updated_at as string) ??
        (nh?.calculated_at as string) ??
        (topoSummary?.last_updated as string) ??
        null,
    };
  }, [
    netMetrics,
    netHealth,
    topology,
    devices.length,
    onlineCount,
    activeAlertsCount,
  ]);

  const worstNodes = useMemo(() => {
    const topoRec = topology as Record<string, unknown>;
    const nodes = (topoRec?.nodes as Array<unknown>) ?? [];
    const links = (topoRec?.links as Array<Record<string, unknown>>) ?? [];

    function avgLatencyForNode(nodeId: number) {
      const adj = links.filter((l) => l.from === nodeId || l.to === nodeId);
      const vals = adj
        .map((l) => asNumber((l as Record<string, unknown>).latency))
        .filter((x) => x != null) as number[];
      if (!vals.length) return null;
      return Math.round(
        vals.reduce((a: number, b: number) => a + b, 0) / vals.length,
      );
    }

    function deliveryAsPct(n: Record<string, unknown>) {
      const health = n?.health as Record<string, unknown>;
      const v = health?.delivery_rate;
      const p = pctFromDelivery(v);
      return p == null ? 100 : p;
    }

    const ranked = [...nodes]
      .filter((n) => {
        const nRec = n as Record<string, unknown>;
        const typeStr = ((nRec.type as string | undefined) || "")
          .toString()
          .toLowerCase();
        return typeStr !== "gateway";
      })
      .map((n) => {
        const nRec = n as Record<string, unknown>;
        const latency = avgLatencyForNode(nRec.id as number);
        const delivery = deliveryAsPct(nRec);
        const health = nRec.health as Record<string, unknown>;
        const rssi = asNumber(health?.rssi ?? nRec?.rssi);
        return {
          id: nRec.id,
          device_id: (nRec.device_id || "—") as string,
          name: (nRec.name || "") as string,
          status: (nRec.status || health?.status || "—") as string,
          delivery,
          rssi,
          latency,
          score:
            (nRec.status || "").toString().toLowerCase() === "offline"
              ? 100000
              : (100 - delivery) * 4 +
                (rssi == null ? 0 : Math.max(0, -rssi)) +
                (latency ?? 0) / 5,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    return ranked;
  }, [topology]);

  const incidents = useMemo(() => {
    const items: IncidentItem[] = [];

    // alerts
    (alerts || []).slice(0, 20).forEach((a) => {
      const aRec = a as Record<string, unknown>;
      items.push({
        kind: "alert",
        ts:
          (aRec.created_at as string | null) ||
          (aRec.ts as string | null) ||
          null,
        title: (aRec.title as string) || (aRec.parameter as string) || "Alert",
        detail: (aRec.message as string) || (aRec.detail as string) || "",
        device_id: (aRec.device_id as string) || "",
      });
    });

    // routing events
    (routeEvents || []).slice(0, 20).forEach((e) => {
      const eRec = e as Record<string, unknown>;
      items.push({
        kind: "route",
        ts:
          (eRec.ts as string | null) ||
          (eRec.created_at as string | null) ||
          null,
        title: (eRec.event as string) || "Route event",
        detail: (eRec.detail as string) || "",
        device_id: (eRec.device_id as string) || "",
      });
    });

    // network events
    (netEvents || []).slice(0, 20).forEach((e) => {
      const eRec = e as Record<string, unknown>;
      items.push({
        kind: "network",
        ts:
          (eRec.ts as string | null) ||
          (eRec.created_at as string | null) ||
          null,
        title: (eRec.type as string) || "Network event",
        detail: (eRec.message as string) || (eRec.detail as string) || "",
        device_id: (eRec.device_id as string) || "",
      });
    });

    return items
      .map((it) => ({ ...it, t: toMs(it.ts as string) ?? 0 }))
      .sort((a, b) => (b.t as number) - (a.t as number))
      .slice(0, 25);
  }, [alerts, routeEvents, netEvents]);

  const sys = sysFlags(systemStats);

  return (
    <div>
      {/* Header */}
      <div className="nms-toolbar">
        <div>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <h2 className="nms-title" style={{ margin: 0 }}>
              Dashboard
            </h2>
            <Badge tone={loading ? "info" : "neutral"}>
              {loading ? "REFRESHING" : "LIVE"}
            </Badge>
          </div>
          <div className="nms-subtitle">
            NOC overview (24h) • offline-first polling with backend fallbacks
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={() => load()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {/* STEP C: NOC OVERVIEW */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <Card
          title="NOC KPIs (24h)"
          subtitle="Network posture summary"
          accent="blue"
        >
          {nocErr ? (
            <div style={{ color: "#9f1239", fontWeight: 900 }}>
              Error: {nocErr}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 900 }}>Nodes Online</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Badge tone="good">
                    {nocKpis.onlineNodes}/{nocKpis.totalNodes}
                  </Badge>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    offline {nocKpis.offlineNodes}
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 900 }}>Active Alerts</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Badge tone={nocKpis.activeAlerts > 0 ? "bad" : "good"}>
                    {nocKpis.activeAlerts}
                  </Badge>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    problem nodes {nocKpis.problemNodes}
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 900 }}>Network Delivery</div>
                <Badge
                  tone={
                    nocKpis.deliveryPct != null && nocKpis.deliveryPct >= 90
                      ? "good"
                      : "warn"
                  }
                >
                  {nocKpis.deliveryPct != null
                    ? `${nocKpis.deliveryPct}%`
                    : "—"}
                </Badge>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 900 }}>Avg RSSI</div>
                <Badge tone="info">
                  {nocKpis.avgRssi != null
                    ? `${Math.round(nocKpis.avgRssi)} dBm`
                    : "—"}
                </Badge>
              </div>

              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Last updated:{" "}
                <b style={{ color: "var(--text)" }}>
                  {fmt(nocKpis.lastUpdated)}
                </b>
              </div>
            </div>
          )}
        </Card>

        <Card
          title="Health Trend (24h)"
          subtitle="Delivery/health score over time"
          accent="slate"
        >
          <div
            style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}
          >
            Last update:{" "}
            <b style={{ color: "var(--text)" }}>
              {healthTrendAt ? new Date(healthTrendAt).toLocaleString() : "—"}
            </b>
          </div>
          <HealthTrendChart data={healthTrend} height={220} />
        </Card>

        <Card
          title="Worst Nodes Watchlist"
          subtitle="Ranked by offline / delivery / RSSI / latency"
          accent="amber"
        >
          {!worstNodes.length ? (
            <div style={{ color: "var(--muted)" }}>No topology data yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr style={{ color: "var(--muted)" }}>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>
                      Device
                    </th>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>
                      Status
                    </th>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>
                      Delivery
                    </th>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>
                      RSSI
                    </th>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>
                      Latency
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {worstNodes.map((n) => (
                    <tr
                      key={n.device_id}
                      style={{ borderTop: "1px solid var(--border)" }}
                    >
                      <td style={{ padding: "10px 0", fontWeight: 950 }}>
                        {n.device_id}
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--muted)",
                            marginTop: 2,
                          }}
                        >
                          {n.name}
                        </div>
                      </td>
                      <td style={{ padding: "10px 0" }}>
                        <Badge
                          tone={
                            String(n.status).toLowerCase() === "offline"
                              ? "bad"
                              : "neutral"
                          }
                        >
                          {n.status || "—"}
                        </Badge>
                      </td>
                      <td style={{ padding: "10px 0" }}>
                        {n.delivery != null ? `${n.delivery}%` : "—"}
                      </td>
                      <td style={{ padding: "10px 0" }}>
                        {n.rssi != null ? `${n.rssi}` : "—"}
                      </td>
                      <td style={{ padding: "10px 0" }}>
                        {n.latency != null ? `${n.latency}ms` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title="Recent Incidents"
          subtitle="Alerts + routing + network events (latest first)"
          accent="red"
        >
          {!incidents.length ? (
            <div style={{ color: "var(--muted)" }}>
              No recent incidents in window.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 10,
                maxHeight: 320,
                overflowY: "auto",
              }}
            >
              {(incidents as Array<IncidentItem & { t: number }>).map(
                (it, idx) => (
                  <div
                    key={idx}
                    style={{
                      paddingBottom: 10,
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      {fmt(it.ts as string)}
                    </div>
                    <div style={{ fontWeight: 950, marginTop: 2 }}>
                      <span style={{ marginRight: 6 }}>
                        <Badge
                          tone={
                            it.kind === "alert"
                              ? "bad"
                              : it.kind === "route"
                                ? "info"
                                : "neutral"
                          }
                        >
                          {String(it.kind).toUpperCase()}
                        </Badge>
                      </span>
                      {it.title}
                    </div>
                    {it.detail ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--muted)",
                          marginTop: 4,
                        }}
                      >
                        {it.detail}
                      </div>
                    ) : null}
                    {it.device_id ? (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--muted)",
                          marginTop: 4,
                        }}
                      >
                        device:{" "}
                        <b style={{ color: "var(--text)" }}>
                          {it.device_id as string}
                        </b>
                      </div>
                    ) : null}
                  </div>
                ),
              )}
            </div>
          )}
        </Card>
      </div>

      {/* STEP E: Server health signals */}
      {(() => {
        const stale = systemStatsAt
          ? Date.now() - new Date(systemStatsAt).getTime()
          : null;
        const isStale = stale != null && stale > 2 * 60 * 1000;

        if (systemStatsErr && !systemStats) {
          return (
            <Card
              title="System Monitor Offline"
              subtitle="Backend-only module not reachable"
              accent="red"
              style={{ marginBottom: 14 }}
            >
              <div style={{ fontSize: 13, fontWeight: 900, color: "#9f1239" }}>
                {systemStatsErr}
              </div>
            </Card>
          );
        }

        const levelTone: "bad" | "warn" | "good" =
          sys.level === "critical"
            ? "bad"
            : sys.level === "warning"
              ? "warn"
              : "good";

        return (
          <Card
            title="Server Health Signals"
            subtitle={
              systemStatsAt
                ? `Last update: ${new Date(systemStatsAt).toLocaleString()}${isStale ? " • STALE" : ""}`
                : "Last update: —"
            }
            accent="slate"
            style={{ marginBottom: 14 }}
            right={<Badge tone={levelTone}>{sys.level.toUpperCase()}</Badge>}
          >
            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                CPU:{" "}
                <b style={{ color: "var(--text)" }}>
                  {sys.cpu != null ? Math.round(sys.cpu) + "%" : "—"}
                </b>
              </span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                RAM:{" "}
                <b style={{ color: "var(--text)" }}>
                  {sys.mem != null ? Math.round(sys.mem) + "%" : "—"}
                </b>
              </span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                Disk:{" "}
                <b style={{ color: "var(--text)" }}>
                  {sys.disk != null ? Math.round(sys.disk) + "%" : "—"}
                </b>
              </span>

              {sys.items.length > 0 ? (
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  • {sys.items.join(" • ")}
                </span>
              ) : (
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  • No warnings
                </span>
              )}

              {systemStatsErr ? (
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  • offline (using last known values)
                </span>
              ) : null}
            </div>
          </Card>
        );
      })()}

      <SystemMonitorCards pollMs={10000} />

      {/* Snapshot cards (existing endpoints) */}
      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
          gap: 14,
        }}
      >
        <Card
          title="Backend Connection"
          subtitle="Raw /api/health payload"
          accent="green"
        >
          {healthErr ? (
            <div style={{ color: "#9f1239", fontWeight: 900 }}>
              Error: {healthErr}
            </div>
          ) : health ? (
            <div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Badge tone="good">CONNECTED</Badge>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  Endpoint:{" "}
                  <b style={{ color: "var(--text)" }}>{healthPath || "—"}</b>
                </span>
              </div>
              <pre
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 14,
                  background: "var(--card2)",
                  border: "1px solid var(--border)",
                  overflowX: "auto",
                  fontSize: 12,
                }}
              >
                {JSON.stringify(health, null, 2)}
              </pre>
            </div>
          ) : (
            <div>—</div>
          )}
        </Card>

        <Card title="Devices" subtitle="Fleet snapshot" accent="blue">
          {devicesErr ? (
            <div>
              <div style={{ color: "#9f1239", fontWeight: 900 }}>
                Failed to load devices
              </div>
              <div
                style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}
              >
                {devicesErr}
              </div>
            </div>
          ) : (
            <div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <Badge tone="good">Online: {onlineCount}</Badge>
                <Badge tone={offlineCount > 0 ? "warn" : "neutral"}>
                  Offline: {offlineCount}
                </Badge>
              </div>

              <div
                style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}
              >
                Endpoint:{" "}
                <b style={{ color: "var(--text)" }}>{devicesPath || "—"}</b>
              </div>

              <pre
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 14,
                  background: "var(--card2)",
                  border: "1px solid var(--border)",
                  overflowX: "auto",
                  fontSize: 12,
                }}
              >
                {JSON.stringify(devices.slice(0, 10), null, 2)}
              </pre>
            </div>
          )}
        </Card>

        <Card title="Alerts" subtitle="Incident inbox snapshot" accent="red">
          {alertsErr ? (
            <div>
              <div style={{ color: "#9f1239", fontWeight: 900 }}>
                Failed to load alerts
              </div>
              <div
                style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}
              >
                {alertsErr}
              </div>
            </div>
          ) : (
            <div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <Badge tone={activeAlertsCount > 0 ? "bad" : "good"}>
                  Active alerts: {activeAlertsCount}
                </Badge>
              </div>

              <div
                style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}
              >
                Endpoint:{" "}
                <b style={{ color: "var(--text)" }}>{alertsPath || "—"}</b>
              </div>

              <pre
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 14,
                  background: "var(--card2)",
                  border: "1px solid var(--border)",
                  overflowX: "auto",
                  fontSize: 12,
                }}
              >
                {JSON.stringify(alerts.slice(0, 10), null, 2)}
              </pre>
            </div>
          )}
        </Card>

        <Card
          title="Latest Sensor Readings"
          subtitle="Telemetry snapshot"
          accent="amber"
        >
          {readingsErr ? (
            <div>
              <div style={{ color: "#9f1239", fontWeight: 900 }}>
                Failed to load readings
              </div>
              <div
                style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}
              >
                {readingsErr}
              </div>
            </div>
          ) : (
            <div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <Badge tone="info">
                  Latest:{" "}
                  {latest
                    ? `${(latest as Record<string, unknown>).device_id} ${(latest as Record<string, unknown>).parameter} = ${(latest as Record<string, unknown>).value}`
                    : "—"}
                </Badge>
              </div>

              <div
                style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}
              >
                Endpoint:{" "}
                <b style={{ color: "var(--text)" }}>{readingsPath || "—"}</b>
              </div>

              <pre
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 14,
                  background: "var(--card2)",
                  border: "1px solid var(--border)",
                  overflowX: "auto",
                  fontSize: 12,
                }}
              >
                {JSON.stringify(readings.slice(0, 10), null, 2)}
              </pre>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
