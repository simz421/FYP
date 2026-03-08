// src/pages/Topology.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import TopologyGraph from "../components/network/TopologyGraph";
import { useNocSocket } from "../realtime/useNocSocket";

import Card from "../ui/Card";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Input from "../ui/Input";
import Select from "../ui/Select";

import {
  bandwidthTest,
  getEnhancedTopology,
  getNetworkMetrics,
  getRoute,
  getRouteTimeline,
  pingDevice,
  tracerouteDevice,
  type EnhancedLink,
  type EnhancedNode,
  type EnhancedTopology,
  type NetworkMetrics,
  type RouteEvent,
  type RouteResult,
} from "../api/network";

import { fetchAlerts, type AlertEvent } from "../api/alerts";
import {
  getSystemMonitorStats,
  type SystemMonitorStats,
} from "../api/system_monitor";

type Tab = "overview" | "topology" | "routing";
type TypeFilter = "all" | "sensor" | "gateway" | "server";
type StatusFilter = "all" | "online" | "offline" | "degraded";

const LS_KEYS = {
  metrics: "nms_cache_metrics_v1",
  topology: "nms_cache_topology_v1",
  routeTimeline: "nms_cache_route_timeline_v1",
  cachedAt: "nms_cache_at_v1",

  alertsCounts: "nms_cache_alert_counts_v1",
  alertsAt: "nms_cache_alert_counts_at_v1",

  // D.4: per-device active alerts cache
  deviceAlerts: "nms_cache_device_alerts_v1", // { [device_id]: { at, alerts } }

  // Step E: system monitor cache
  systemStats: "nms_cache_system_stats_v1",
  systemStatsAt: "nms_cache_system_stats_at_v1",
};

const SERVER_NODE_ID = -9999;
const SERVER_LINK_ID = -9998;
const SERVER_DEVICE_ID = "NMS_SERVER";

// ---------- UI helpers ----------
function ToggleChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 10px",
        borderRadius: 999,
        border: `1px solid ${active ? "rgba(15,23,42,0.28)" : "var(--border)"}`,
        background: active
          ? "linear-gradient(180deg, var(--primary), var(--primary2))"
          : "rgba(15,23,42,0.04)",
        color: active ? "#fff" : "var(--text)",
        cursor: "pointer",
        fontWeight: 950,
        fontSize: 12,
        boxShadow: active ? "var(--shadow-md)" : "var(--shadow-sm)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function Banner({
  tone,
  title,
  children,
}: {
  tone: "warn" | "bad" | "info";
  title: string;
  children: React.ReactNode;
}) {
  const bg =
    tone === "bad" ? "#fff1f2" : tone === "warn" ? "#fffbeb" : "#eff6ff";
  const border =
    tone === "bad" ? "#fecaca" : tone === "warn" ? "#fde68a" : "#bfdbfe";
  const color =
    tone === "bad" ? "#9f1239" : tone === "warn" ? "#92400e" : "#1d4ed8";

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 14,
        background: bg,
        border: `1px solid ${border}`,
        color,
        fontSize: 13,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <b>{title}:</b> {children}
    </div>
  );
}

// ---------- data helpers ----------
function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function pctFromAny(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number")
    return v <= 1 ? Math.round(v * 100) : Math.round(v);
  if (typeof v === "string") {
    const m = v.match(/([\d.]+)/);
    if (!m) return null;
    return Math.round(Number(m[1]));
  }
  return null;
}

function deliveryPct(n: EnhancedNode): number | null {
  const v: any =
    (n as any)?.health?.delivery_rate ??
    (n as any)?.health?.delivery_rate_percent;
  return pctFromAny(v);
}

function isOffline(n: EnhancedNode) {
  return (n.status || "").toLowerCase() === "offline";
}

function isDegraded(n: EnhancedNode) {
  const s = (n.status || "").toLowerCase();
  if (s === "degraded") return true;
  const pct = deliveryPct(n);
  return pct != null && pct < 80;
}

function isProblem(n: EnhancedNode) {
  return isOffline(n) || isDegraded(n);
}

function isServerNode(n: EnhancedNode | null | undefined) {
  if (!n) return false;
  const t = String((n as any).type || "").toLowerCase();
  return t === "server" || String(n.device_id || "") === SERVER_DEVICE_ID;
}

function buildAlertCountsByDevice(
  alerts: AlertEvent[],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const a of alerts || []) {
    const id = String((a as any).device_id || "").trim();
    if (!id) continue;
    map[id] = (map[id] || 0) + 1;
  }
  return map;
}

// --------- D.4: severity helpers (very defensive) ----------
type Sev = "critical" | "high" | "medium" | "low" | "unknown";

function normSev(a: any): Sev {
  const s = String(a?.severity ?? a?.level ?? a?.priority ?? "")
    .toLowerCase()
    .trim();

  if (s.includes("crit")) return "critical";
  if (s.includes("high")) return "high";
  if (s.includes("med")) return "medium";
  if (s.includes("low")) return "low";

  const n = Number(s);
  if (!Number.isNaN(n)) {
    if (n >= 4) return "critical";
    if (n === 3) return "high";
    if (n === 2) return "medium";
    if (n === 1) return "low";
  }

  if (s.includes("error")) return "high";
  if (s.includes("warn")) return "medium";

  return "unknown";
}

function sevStyle(sev: Sev): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 950,
    padding: "3px 10px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "rgba(15,23,42,0.04)",
    color: "var(--text)",
  };

  if (sev === "critical")
    return {
      ...base,
      background: "#111827",
      color: "#fff",
      borderColor: "#111827",
    };
  if (sev === "high")
    return {
      ...base,
      background: "#fef2f2",
      color: "#b91c1c",
      borderColor: "#fecaca",
    };
  if (sev === "medium")
    return {
      ...base,
      background: "#fffbeb",
      color: "#92400e",
      borderColor: "#fde68a",
    };
  if (sev === "low")
    return {
      ...base,
      background: "#eff6ff",
      color: "#1d4ed8",
      borderColor: "#bfdbfe",
    };
  return {
    ...base,
    background: "#f3f4f6",
    color: "#374151",
    borderColor: "#e5e7eb",
  };
}

function alertTitle(a: any): string {
  return (
    a?.title ||
    a?.message ||
    a?.reason ||
    a?.rule_name ||
    a?.parameter ||
    "Alert"
  );
}

function alertWhen(a: any): string | null {
  const t = a?.created_at || a?.timestamp || a?.time || a?.raised_at;
  if (!t) return null;
  try {
    return new Date(t).toLocaleString();
  } catch {
    return String(t);
  }
}

function alertMeta(a: any): string {
  const parts: string[] = [];
  const param = a?.parameter || a?.metric || a?.sensor_type;
  const value = a?.value ?? a?.current_value;
  const threshold = a?.threshold ?? a?.limit;
  const status = a?.status || a?.state;

  if (param) parts.push(String(param));
  if (value != null) parts.push(`value=${value}`);
  if (threshold != null) parts.push(`limit=${threshold}`);
  if (status) parts.push(String(status));

  return parts.join(" • ");
}

function fmtPct(v?: number) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return `${Math.round(v)}%`;
}

function fmtUptimeSeconds(s?: number) {
  if (typeof s !== "number" || !Number.isFinite(s) || s < 0) return "—";
  const days = Math.floor(s / 86400);
  s -= days * 86400;
  const hrs = Math.floor(s / 3600);
  s -= hrs * 3600;
  const mins = Math.floor(s / 60);

  if (days > 0) return `${days}d ${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function serverHealthFlags(stats: SystemMonitorStats | null) {
  const cpu =
    typeof (stats as any)?.cpu_percent === "number"
      ? (stats as any)!.cpu_percent
      : null;
  const disk =
    typeof (stats as any)?.disk_percent === "number"
      ? (stats as any)!.disk_percent
      : null;
  const mem =
    typeof (stats as any)?.mem_percent === "number"
      ? (stats as any)!.mem_percent
      : null;

  const flags: { level: "ok" | "warning" | "critical"; items: string[] } = {
    level: "ok",
    items: [],
  };

  if (cpu != null && cpu >= 80) flags.items.push(`CPU ${Math.round(cpu)}%`);
  if (disk != null && disk >= 85) flags.items.push(`Disk ${Math.round(disk)}%`);
  if (mem != null && mem >= 80) flags.items.push(`RAM ${Math.round(mem)}%`);

  const isCritical =
    (cpu != null && cpu >= 90) ||
    (disk != null && disk >= 95) ||
    (mem != null && mem >= 90);
  const isWarning =
    (cpu != null && cpu >= 80) ||
    (disk != null && disk >= 85) ||
    (mem != null && mem >= 80);

  flags.level = isCritical ? "critical" : isWarning ? "warning" : "ok";
  return flags;
}

// Step E: inject server node into topology snapshot (defensive)
function withServerNode(
  t: EnhancedTopology | null,
  stats: SystemMonitorStats | null,
  statsAt: string | null,
  statsError: string | null,
): EnhancedTopology | null {
  if (!t) return t;

  const nodes = Array.isArray(t.nodes) ? [...t.nodes] : [];
  const links = Array.isArray(t.links) ? [...t.links] : [];

  const nodesNoServer = nodes.filter(
    (n) =>
      n.id !== SERVER_NODE_ID && String(n.device_id || "") !== SERVER_DEVICE_ID,
  );
  const linksNoServer = links.filter(
    (l) =>
      l.id !== SERVER_LINK_ID &&
      l.from !== SERVER_NODE_ID &&
      l.to !== SERVER_NODE_ID,
  );

  const gateway =
    nodesNoServer.find(
      (n) => String((n as any).type || "").toLowerCase() === "gateway",
    ) || null;

  const ok = !statsError && (((stats as any)?.ok ?? true) as boolean);

  const flags = serverHealthFlags(stats);
  const status: "online" | "offline" | "degraded" = !ok
    ? "offline"
    : flags.level === "ok"
      ? "online"
      : "degraded";

  const serverNode: EnhancedNode = {
    id: SERVER_NODE_ID,
    device_id: SERVER_DEVICE_ID,
    name: "NMS Host (Offline Server)",
    type: "server" as any,
    status: status as any,
    last_seen: ((stats as any)?.ts || statsAt || null) as any,
    health: {
      cpu_percent: (stats as any)?.cpu_percent,
      mem_percent: (stats as any)?.mem_percent,
      disk_percent: (stats as any)?.disk_percent,
      uptime_seconds: (stats as any)?.uptime_seconds,
      load_1: (stats as any)?.load_1,
      load_5: (stats as any)?.load_5,
      load_15: (stats as any)?.load_15,
      warning_level: flags.level,
      warnings: flags.items,
      error: statsError || null,
    } as any,
    signal: { quality: "host", rssi: null } as any,
    packets_received: 0 as any,
  };

  const nodesOut = [...nodesNoServer, serverNode];

  if (gateway) {
    const serverLink: EnhancedLink = {
      id: SERVER_LINK_ID,
      from: gateway.id,
      to: SERVER_NODE_ID,
      status: status === "offline" ? ("down" as any) : ("up" as any),
      rssi: null as any,
      latency: 0 as any,
      strength:
        status === "offline"
          ? ("offline" as any)
          : flags.level === "critical"
            ? ("critical" as any)
            : flags.level === "warning"
              ? ("warning" as any)
              : ("host" as any),
    } as any;

    linksNoServer.push(serverLink);
  }

  return {
    ...t,
    nodes: nodesOut,
    links: linksNoServer,
    summary: {
      ...(t as any).summary,
      last_updated:
        (t as any).summary?.last_updated || new Date().toISOString(),
    } as any,
  };
}

// ----------------------------------------------------------

export default function Topology() {
  const location = useLocation();
  const proMode = location.pathname.endsWith("/pro");
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>("overview");

  const [metrics, setMetrics] = useState<NetworkMetrics | null>(null);
  const [topology, setTopology] = useState<EnhancedTopology | null>(null);
  const [routeTimeline, setRouteTimeline] = useState<RouteEvent[]>([]);

  const [selectedNode, setSelectedNode] = useState<EnhancedNode | null>(null);

  // Pro mode: link inspector selection
  const [selectedLinkId, setSelectedLinkId] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [onlyProblems, setOnlyProblems] = useState(false);

  // Pro toggles
  const [showLinkLabels, setShowLinkLabels] = useState(true);
  const [showStatusBadges, setShowStatusBadges] = useState(true);
  const [showAlertBadges, setShowAlertBadges] = useState(true);

  // Routing actions
  const [routeDeviceId, setRouteDeviceId] = useState<string>("");
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);

  // Diagnostics
  const [diagLoading, setDiagLoading] = useState<
    null | "ping" | "trace" | "bandwidth"
  >(null);
  const [diagResult, setDiagResult] = useState<any>(null);

  // Offline snapshot info
  const [usingCache, setUsingCache] = useState(false);
  const [cacheAt, setCacheAt] = useState<string | null>(null);

  // Alert badges
  const [alertCountsByDevice, setAlertCountsByDevice] = useState<
    Record<string, number>
  >({});
  const [alertsCacheAt, setAlertsCacheAt] = useState<string | null>(null);

  // D.4: selected node alert list (active)
  const [nodeAlertsLoading, setNodeAlertsLoading] = useState(false);
  const [nodeAlertsError, setNodeAlertsError] = useState<string | null>(null);
  const [nodeActiveAlerts, setNodeActiveAlerts] = useState<AlertEvent[]>([]);
  const [nodeAlertsAt, setNodeAlertsAt] = useState<string | null>(null);

  // Step E: System monitor state
  const [systemStats, setSystemStats] = useState<SystemMonitorStats | null>(
    null,
  );
  const [systemStatsAt, setSystemStatsAt] = useState<string | null>(null);
  const [systemStatsError, setSystemStatsError] = useState<string | null>(null);

  const saveCache = useCallback((m: any, t: any, rt: any) => {
    try {
      localStorage.setItem(LS_KEYS.metrics, JSON.stringify(m));
      localStorage.setItem(LS_KEYS.topology, JSON.stringify(t));
      localStorage.setItem(LS_KEYS.routeTimeline, JSON.stringify(rt));
      const now = new Date().toISOString();
      localStorage.setItem(LS_KEYS.cachedAt, now);
      setCacheAt(now);
    } catch {
      // ignore
    }
  }, []);

  const loadCache = useCallback(() => {
    const m = safeJsonParse<NetworkMetrics>(
      localStorage.getItem(LS_KEYS.metrics),
    );
    const t = safeJsonParse<EnhancedTopology>(
      localStorage.getItem(LS_KEYS.topology),
    );
    const rt = safeJsonParse<RouteEvent[]>(
      localStorage.getItem(LS_KEYS.routeTimeline),
    );
    const at = localStorage.getItem(LS_KEYS.cachedAt);

    if (m) setMetrics(m);
    if (t) setTopology(t);
    if (Array.isArray(rt)) setRouteTimeline(rt);
    if (at) setCacheAt(at);

    return { m, t, rt, at };
  }, []);

  const saveSystemCache = useCallback((stats: SystemMonitorStats | null) => {
    try {
      localStorage.setItem(LS_KEYS.systemStats, JSON.stringify(stats || {}));
      const now = new Date().toISOString();
      localStorage.setItem(LS_KEYS.systemStatsAt, now);
      setSystemStatsAt(now);
    } catch {
      // ignore
    }
  }, []);

  const loadSystemCache = useCallback(() => {
    try {
      const s = safeJsonParse<SystemMonitorStats>(
        localStorage.getItem(LS_KEYS.systemStats),
      );
      const at = localStorage.getItem(LS_KEYS.systemStatsAt);
      if (s && typeof s === "object") setSystemStats(s);
      if (at) setSystemStatsAt(at);
      return { s, at };
    } catch {
      return { s: null, at: null };
    }
  }, []);

  const loadAlertCache = useCallback(() => {
    try {
      const counts = safeJsonParse<Record<string, number>>(
        localStorage.getItem(LS_KEYS.alertsCounts),
      );
      const at = localStorage.getItem(LS_KEYS.alertsAt);

      if (counts && typeof counts === "object") setAlertCountsByDevice(counts);
      if (at) setAlertsCacheAt(at);

      return { counts, at };
    } catch {
      return { counts: null, at: null };
    }
  }, []);

  const saveAlertCache = useCallback((counts: Record<string, number>) => {
    try {
      localStorage.setItem(LS_KEYS.alertsCounts, JSON.stringify(counts || {}));
      const now = new Date().toISOString();
      localStorage.setItem(LS_KEYS.alertsAt, now);
      setAlertsCacheAt(now);
    } catch {
      // ignore
    }
  }, []);

  // D.4: per-device alert cache (list)
  const loadDeviceAlertsCache = useCallback((deviceId: string) => {
    try {
      const blob = safeJsonParse<any>(
        localStorage.getItem(LS_KEYS.deviceAlerts),
      );
      const entry = blob?.[deviceId];
      if (entry?.alerts && Array.isArray(entry.alerts)) {
        setNodeActiveAlerts(entry.alerts);
        setNodeAlertsAt(entry.at || null);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, []);

  const saveDeviceAlertsCache = useCallback(
    (deviceId: string, alerts: AlertEvent[]) => {
      try {
        const blob =
          safeJsonParse<any>(localStorage.getItem(LS_KEYS.deviceAlerts)) || {};
        blob[deviceId] = { at: new Date().toISOString(), alerts: alerts || [] };
        localStorage.setItem(LS_KEYS.deviceAlerts, JSON.stringify(blob));
      } catch {
        // ignore
      }
    },
    [],
  );

  const loadActiveAlerts = useCallback(async () => {
    try {
      const res = await fetchAlerts({ active_only: true, limit: 1000 } as any);
      if (!res?.ok) return;

      const data = Array.isArray(res.data) ? res.data : [];
      const counts = buildAlertCountsByDevice(data);

      setAlertCountsByDevice(counts);
      saveAlertCache(counts);
    } catch {
      loadAlertCache();
    }
  }, [loadAlertCache, saveAlertCache]);

  const loadNodeActiveAlerts = useCallback(
    async (deviceId: string) => {
      if (!deviceId) return;

      setNodeAlertsError(null);
      setNodeAlertsLoading(true);

      try {
        const res = await fetchAlerts({
          active_only: true,
          device_id: deviceId,
          limit: 200,
        } as any);

        if (!res?.ok) {
          setNodeAlertsError("Failed to load node alerts");
          loadDeviceAlertsCache(deviceId);
          return;
        }

        const data = Array.isArray(res.data) ? res.data : [];
        setNodeActiveAlerts(data);
        const now = new Date().toISOString();
        setNodeAlertsAt(now);
        saveDeviceAlertsCache(deviceId, data);
      } catch (e: any) {
        setNodeAlertsError(e?.message || "Failed to load node alerts");
        loadDeviceAlertsCache(deviceId);
      } finally {
        setNodeAlertsLoading(false);
      }
    },
    [loadDeviceAlertsCache, saveDeviceAlertsCache],
  );

  const loadSystemStatsSafe = useCallback(async () => {
    setSystemStatsError(null);
    try {
      const s = await getSystemMonitorStats();
      setSystemStats(s);
      const now = new Date().toISOString();
      setSystemStatsAt(now);
      saveSystemCache(s);
      return { s, at: now, err: null as string | null };
    } catch (e: any) {
      const msg = e?.message || "System monitor unavailable";
      setSystemStatsError(msg);
      loadSystemCache();
      return {
        s: null as SystemMonitorStats | null,
        at: systemStatsAt,
        err: msg,
      };
    }
  }, [loadSystemCache, saveSystemCache, systemStatsAt]);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [m, t, rt] = await Promise.all([
        getNetworkMetrics(),
        getEnhancedTopology(),
        getRouteTimeline(),
      ]);

      if ((m as any)?.ok) setMetrics((m as any).data);

      const sys = await loadSystemStatsSafe();

      const tWithServer = withServerNode(
        (t as any) ?? null,
        sys.s ?? systemStats,
        sys.at ?? systemStatsAt,
        sys.err ?? systemStatsError,
      );

      setTopology(tWithServer);
      setRouteTimeline(Array.isArray(rt) ? rt : []);

      saveCache(
        (m as any)?.data ?? null,
        tWithServer ?? null,
        Array.isArray(rt) ? rt : [],
      );
      setUsingCache(false);

      if (selectedNode && tWithServer?.nodes) {
        const still = tWithServer.nodes.find((n) => n.id === selectedNode.id);
        if (!still) setSelectedNode(null);
      }

      if (!routeDeviceId && tWithServer?.nodes) {
        const first = tWithServer.nodes.find(
          (n) => (n as any).type === "sensor" && !!(n as any).device_id,
        );
        if (first) setRouteDeviceId(String((first as any).device_id));
      }

      loadActiveAlerts().catch(() => {});
    } catch (e: any) {
      setError(e?.message || "Failed to load topology snapshot");

      const cached = loadCache();
      if (cached.t || cached.m) setUsingCache(true);

      loadSystemCache();
      setTopology((prev) =>
        withServerNode(prev, systemStats, systemStatsAt, systemStatsError),
      );

      loadAlertCache();
    }
  }, [
    loadAlertCache,
    loadActiveAlerts,
    loadCache,
    loadSystemCache,
    loadSystemStatsSafe,
    routeDeviceId,
    saveCache,
    selectedNode,
    systemStats,
    systemStatsAt,
    systemStatsError,
  ]);

  useEffect(() => {
    loadAll().catch(() => {});
  }, [loadAll]);

  // D.4: when node changes (Pro mode), load its active alerts
  const selectedNodeDeviceId = String((selectedNode as any)?.device_id || "");
  useEffect(() => {
    if (!proMode) return;
    const deviceId = selectedNodeDeviceId;
    if (!deviceId) {
      setNodeActiveAlerts([]);
      setNodeAlertsError(null);
      setNodeAlertsAt(null);
      return;
    }
    if (isServerNode(selectedNode)) {
      setNodeActiveAlerts([]);
      setNodeAlertsError(null);
      setNodeAlertsAt(null);
      return;
    }

    loadDeviceAlertsCache(deviceId);
    loadNodeActiveAlerts(deviceId).catch(() => {});
  }, [
    proMode,
    selectedNodeDeviceId,
    selectedNode,
    loadNodeActiveAlerts,
    loadDeviceAlertsCache,
  ]);

  // Socket updates
  const socketState = useNocSocket((event, payload) => {
    if (event === "noc_snapshot") {
      if (payload?.metrics) setMetrics(payload.metrics);

      if (payload?.topology) {
        const tWithServer = withServerNode(
          payload.topology,
          systemStats,
          systemStatsAt,
          systemStatsError,
        );
        setTopology(tWithServer);
      }

      if (payload?.routeTimeline) setRouteTimeline(payload.routeTimeline);

      saveCache(
        payload?.metrics ?? null,
        withServerNode(
          payload?.topology ?? null,
          systemStats,
          systemStatsAt,
          systemStatsError,
        ) ?? null,
        payload?.routeTimeline ?? [],
      );
      setUsingCache(false);

      loadActiveAlerts().catch(() => {});

      if (
        proMode &&
        (selectedNode as any)?.device_id &&
        !isServerNode(selectedNode)
      ) {
        loadNodeActiveAlerts(String((selectedNode as any).device_id)).catch(
          () => {},
        );
      }
    }

    if (event === "noc_refresh") {
      if ((window as any).__nocRefreshTimer) {
        window.clearTimeout((window as any).__nocRefreshTimer);
      }
      (window as any).__nocRefreshTimer = window.setTimeout(() => {
        loadAll().catch(() => {});
      }, 400);
    }
  });

  // Polling fallback if socket disconnected
  useEffect(() => {
    if (socketState.connected) return;
    const id = setInterval(() => loadAll().catch(() => {}), 12000);
    return () => clearInterval(id);
  }, [socketState.connected, loadAll]);

  const allNodes = useMemo(
    () => (topology?.nodes || []) as EnhancedNode[],
    [topology],
  );
  const allLinks = useMemo(
    () => (topology?.links || []) as EnhancedLink[],
    [topology],
  );

  const filteredNodes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allNodes.filter((n) => {
      const t = String((n as any).type || "").toLowerCase();
      if (typeFilter !== "all" && t !== typeFilter) return false;

      const st = String((n as any).status || "").toLowerCase();
      if (statusFilter !== "all" && st !== statusFilter) return false;

      if (onlyProblems && !isProblem(n)) return false;

      if (q) {
        const did = String((n as any).device_id || "").toLowerCase();
        const nm = String((n as any).name || "").toLowerCase();
        if (!did.includes(q) && !nm.includes(q)) return false;
      }
      return true;
    });
  }, [allNodes, search, typeFilter, statusFilter, onlyProblems]);

  const worstNodes = useMemo(() => {
    const nodes = [...allNodes].filter(
      (n) => String((n as any).type || "").toLowerCase() !== "gateway",
    );
    const ranked = nodes
      .map((n) => {
        const pct = deliveryPct(n);
        const rssi = (n as any)?.signal?.rssi;
        const rssiNum = typeof rssi === "number" ? rssi : null;
        const score =
          (String((n as any).status || "").toLowerCase() === "offline"
            ? 100000
            : 0) +
          (pct == null ? 0 : (100 - pct) * 5) +
          (rssiNum == null ? 0 : Math.max(0, -rssiNum));

        return { ...n, _score: score };
      })
      .sort((a: any, b: any) => b._score - a._score)
      .slice(0, 8);
    return ranked as EnhancedNode[];
  }, [allNodes]);

  const totalActiveAlerts = useMemo(() => {
    return Object.values(alertCountsByDevice || {}).reduce(
      (a, b) => a + (b || 0),
      0,
    );
  }, [alertCountsByDevice]);

  const selectedLink = useMemo(() => {
    if (selectedLinkId == null) return null;
    return (allLinks || []).find((l: any) => l.id === selectedLinkId) || null;
  }, [allLinks, selectedLinkId]);

  const selectedServerStats = useMemo(() => {
    if (!isServerNode(selectedNode)) return null;
    const health: any = (selectedNode as any)?.health || {};
    return {
      cpu_percent: health.cpu_percent ?? (systemStats as any)?.cpu_percent,
      mem_percent: health.mem_percent ?? (systemStats as any)?.mem_percent,
      disk_percent: health.disk_percent ?? (systemStats as any)?.disk_percent,
      uptime_seconds:
        health.uptime_seconds ?? (systemStats as any)?.uptime_seconds,
      load_1: health.load_1 ?? (systemStats as any)?.load_1,
      load_5: health.load_5 ?? (systemStats as any)?.load_5,
      load_15: health.load_15 ?? (systemStats as any)?.load_15,
      error: health.error ?? systemStatsError,
      ts:
        (selectedNode as any)?.last_seen ??
        (systemStats as any)?.ts ??
        systemStatsAt,
    };
  }, [selectedNode, systemStats, systemStatsAt, systemStatsError]);

  // ---- Diagnostics handlers (your existing behavior)
  const handlePing = async (nodeId: string) => {
    setDiagLoading("ping");
    setDiagResult(null);
    try {
      const result = await pingDevice(nodeId);
      setDiagResult(result);
    } catch (e: any) {
      setError(e?.message || "Ping failed");
    } finally {
      setDiagLoading(null);
    }
  };

  const handleTraceroute = async (nodeId: string) => {
    setDiagLoading("trace");
    setDiagResult(null);
    try {
      const result = await tracerouteDevice(nodeId);
      setDiagResult(result);
    } catch (e: any) {
      setError(e?.message || "Traceroute failed");
    } finally {
      setDiagLoading(null);
    }
  };

  const handleBandwidth = async (nodeId: string) => {
    setDiagLoading("bandwidth");
    setDiagResult(null);
    try {
      const result = await bandwidthTest(nodeId);
      setDiagResult(result);
    } catch (e: any) {
      setError(e?.message || "Bandwidth test failed");
    } finally {
      setDiagLoading(null);
    }
  };

  const handleComputeRoute = async () => {
    setError(null);
    setRouteResult(null);
    if (!routeDeviceId) return;
    try {
      const r = await getRoute(routeDeviceId);
      setRouteResult(r);
    } catch (e: any) {
      setError(e?.message || "Failed to compute route");
    }
  };

  const liveTone = socketState.connected ? "info" : "warn";
  const liveText = socketState.connected ? "LIVE" : "OFFLINE (POLLING)";

  return (
    <div>
      {/* Header */}
      <div className="nms-toolbar">
        <div>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <h2 className="nms-title" style={{ margin: 0 }}>
              Network Console
            </h2>
            <Badge tone={proMode ? "info" : "neutral"}>
              {proMode ? "PRO" : "STANDARD"}
            </Badge>
            <Badge tone={liveTone as any}>{liveText}</Badge>
            {usingCache ? <Badge tone="warn">CACHED VIEW</Badge> : null}
          </div>
          <div className="nms-subtitle" style={{ marginTop: 6 }}>
            Topology • Routing • Diagnostics • Offline-first
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={() => loadAll().catch(() => {})}>
            Refresh
          </Button>
          {!proMode ? (
            <Button variant="primary" onClick={() => navigate("/topology/pro")}>
              Open Pro
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => navigate("/topology")}>
              Exit Pro
            </Button>
          )}
        </div>
      </div>

      {/* Banners */}
      <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
        {usingCache ? (
          <Banner tone="warn" title="Offline snapshot">
            Viewing cached topology. Cached at{" "}
            <b>{cacheAt ? new Date(cacheAt).toLocaleString() : "—"}</b>
          </Banner>
        ) : null}

        {systemStatsError ? (
          <Banner tone="bad" title="System Monitor Offline">
            {systemStatsError}. Showing last known values (if available).
          </Banner>
        ) : null}

        {proMode && alertsCacheAt ? (
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Alert badge counts refreshed at{" "}
            <b style={{ color: "var(--text)" }}>
              {new Date(alertsCacheAt).toLocaleString()}
            </b>
          </div>
        ) : null}

        {error ? (
          <Banner tone="bad" title="Error">
            {error}
          </Banner>
        ) : null}
      </div>

      {/* Tabs */}
      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}
      >
        <ToggleChip
          active={tab === "overview"}
          label="Overview"
          onClick={() => setTab("overview")}
        />
        <ToggleChip
          active={tab === "topology"}
          label="Topology"
          onClick={() => setTab("topology")}
        />
        <ToggleChip
          active={tab === "routing"}
          label="Routing"
          onClick={() => setTab("routing")}
        />
      </div>

      {/* OVERVIEW */}
      {tab === "overview" && (
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          }}
        >
          <Card
            title="Network KPIs"
            subtitle="Health + performance snapshot"
            accent="blue"
          >
            <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <span style={{ color: "var(--muted)" }}>Total nodes</span>
                <b>
                  {metrics?.total_nodes ??
                    (topology as any)?.summary?.total_nodes ??
                    "—"}
                </b>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <span style={{ color: "var(--muted)" }}>Online</span>
                <b>
                  {metrics?.online_nodes ??
                    (topology as any)?.summary?.online_nodes ??
                    "—"}
                </b>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <span style={{ color: "var(--muted)" }}>Avg RSSI</span>
                <b>{(metrics as any)?.avg_signal_strength ?? "—"}</b>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <span style={{ color: "var(--muted)" }}>Problem nodes</span>
                <b>{(metrics as any)?.problem_nodes ?? "—"}</b>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <span style={{ color: "var(--muted)" }}>Active alerts</span>
                <b>{totalActiveAlerts}</b>
              </div>

              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Updated:{" "}
                <b style={{ color: "var(--text)" }}>
                  {(metrics as any)?.updated_at
                    ? new Date((metrics as any).updated_at).toLocaleString()
                    : "—"}
                </b>
              </div>
            </div>
          </Card>

          <Card
            title="Worst Nodes"
            subtitle="Ranked by delivery / RSSI / offline"
            accent="amber"
          >
            <div style={{ display: "grid", gap: 10 }}>
              {worstNodes.map((n: any) => {
                const did = String(n.device_id || "");
                const ac = alertCountsByDevice[did] || 0;
                const pct = deliveryPct(n);
                const rssi = n?.signal?.rssi ?? "—";
                const st = String(n.status || "—");

                return (
                  <button
                    key={String(n.id)}
                    onClick={() => {
                      setSelectedNode(n);
                      setTab("topology");
                    }}
                    style={{
                      textAlign: "left",
                      padding: 12,
                      borderRadius: 16,
                      border: "1px solid var(--border)",
                      background: "rgba(255,255,255,0.75)",
                      boxShadow: "var(--shadow-sm)",
                      cursor: "pointer",
                      transition: "transform 120ms ease, box-shadow 120ms ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = "var(--shadow-md)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = "var(--shadow-sm)";
                      e.currentTarget.style.transform = "translateY(0px)";
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <div style={{ fontWeight: 950 }}>{did || "—"}</div>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        {ac > 0 ? (
                          <Badge tone="bad">{ac} alerts</Badge>
                        ) : (
                          <Badge tone="neutral">0 alerts</Badge>
                        )}
                        <Badge
                          tone={
                            st.toLowerCase() === "offline" ? "bad" : "neutral"
                          }
                        >
                          {st.toUpperCase()}
                        </Badge>
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--muted)",
                        marginTop: 6,
                      }}
                    >
                      {n.name || "—"} • delivery={pct != null ? `${pct}%` : "—"}{" "}
                      • rssi={String(rssi)}
                    </div>
                  </button>
                );
              })}

              {!worstNodes.length ? (
                <div style={{ color: "var(--muted)" }}>No nodes.</div>
              ) : null}
            </div>
          </Card>

          {proMode ? (
            <Card
              title="Operational Notes"
              subtitle="Pro mode enables incident drilldowns and link inspection."
              accent="slate"
            >
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                • Click a node to open the inspector <br />
                • View node-specific active alerts (D.4) <br />• Deep-link to
                alerts console (D.5)
              </div>
            </Card>
          ) : (
            <Card
              title="Pro Mode"
              subtitle="Enterprise topology triage workflow"
              accent="slate"
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{ fontSize: 13, color: "var(--muted)", maxWidth: 520 }}
                >
                  Pro mode adds node alert drilldowns, shareable deep links to
                  Alerts, and link inspection for operational triage.
                </div>
                <Button
                  variant="primary"
                  onClick={() => navigate("/topology/pro")}
                >
                  Enable Pro
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TOPOLOGY */}
      {tab === "topology" && (
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "minmax(520px, 1.6fr) minmax(320px, 0.9fr)",
          }}
        >
          <Card
            title="Interactive Topology"
            subtitle="Click nodes to inspect. Offline-safe. Server node injected (Step E)."
            accent="blue"
            right={
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Badge tone="neutral">
                  Nodes: <b>{filteredNodes.length}</b>
                </Badge>
                <Badge tone="neutral">
                  Links: <b>{allLinks.length}</b>
                </Badge>
              </div>
            }
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr 1fr 1fr",
                gap: 10,
                alignItems: "end",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "grid", gap: 6 }}>
                <div
                  style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}
                >
                  Search
                </div>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search device/name…"
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div
                  style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}
                >
                  Type
                </div>
                <Select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as any)}
                >
                  <option value="all">All</option>
                  <option value="sensor">Sensor</option>
                  <option value="gateway">Gateway</option>
                  <option value="server">Server</option>
                </Select>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div
                  style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}
                >
                  Status
                </div>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                >
                  <option value="all">All</option>
                  <option value="online">Online</option>
                  <option value="degraded">Degraded</option>
                  <option value="offline">Offline</option>
                </Select>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <ToggleChip
                  active={onlyProblems}
                  label={onlyProblems ? "Problems only" : "All nodes"}
                  onClick={() => setOnlyProblems((v) => !v)}
                />

                {proMode ? (
                  <>
                    <ToggleChip
                      active={showStatusBadges}
                      label={
                        showStatusBadges ? "Status badges" : "No status badges"
                      }
                      onClick={() => setShowStatusBadges((v) => !v)}
                    />
                    <ToggleChip
                      active={showAlertBadges}
                      label={
                        showAlertBadges ? "Alert badges" : "No alert badges"
                      }
                      onClick={() => setShowAlertBadges((v) => !v)}
                    />
                    <ToggleChip
                      active={showLinkLabels}
                      label={showLinkLabels ? "Link labels" : "No link labels"}
                      onClick={() => setShowLinkLabels((v) => !v)}
                    />
                  </>
                ) : null}
              </div>
            </div>

            <TopologyGraph
              topology={{
                ...(topology || ({} as any)),
                nodes: filteredNodes,
                links: allLinks,
              }}
              proMode={proMode}
              showLinkLabels={showLinkLabels}
              showStatusBadges={showStatusBadges}
              showAlertBadges={showAlertBadges}
              onSelectNode={(n: any) => {
                setSelectedNode(n);
                if (proMode) setSelectedLinkId(null);
              }}
              onSelectLink={(id: any) => setSelectedLinkId(id)}
              selectedNodeId={selectedNode?.id ?? null}
              selectedLinkId={selectedLinkId}
            />
          </Card>

          {/* Inspector */}
          <Card
            title="Inspector"
            subtitle={
              selectedNode
                ? `Selected: ${String((selectedNode as any).device_id || selectedNode.name || selectedNode.id)}`
                : "Select a node"
            }
            accent="slate"
            right={
              selectedNode && !isServerNode(selectedNode) ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    navigate(
                      `/alerts?device_id=${encodeURIComponent(
                        String((selectedNode as any).device_id || ""),
                      )}&active_only=1`,
                    )
                  }
                >
                  Open Alerts
                </Button>
              ) : null
            }
          >
            {!selectedNode ? (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                Click a node to see metadata, health, and (Pro mode) incidents.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                  <div>
                    <b>Device:</b>{" "}
                    {String((selectedNode as any).device_id || "—")}
                  </div>
                  <div>
                    <b>Name:</b> {String((selectedNode as any).name || "—")}
                  </div>
                  <div>
                    <b>Type:</b> {String((selectedNode as any).type || "—")}
                  </div>
                  <div>
                    <b>Status:</b>{" "}
                    <Badge
                      tone={
                        String(
                          (selectedNode as any).status || "",
                        ).toLowerCase() === "offline"
                          ? "bad"
                          : String(
                                (selectedNode as any).status || "",
                              ).toLowerCase() === "degraded"
                            ? "warn"
                            : "good"
                      }
                    >
                      {String(
                        (selectedNode as any).status || "—",
                      ).toUpperCase()}
                    </Badge>
                  </div>
                  <div>
                    <b>Last seen:</b>{" "}
                    {String((selectedNode as any).last_seen || "—")}
                  </div>
                </div>

                {/* Server node details */}
                {isServerNode(selectedNode) && selectedServerStats ? (
                  <div
                    style={{
                      border: "1px solid var(--border)",
                      background: "rgba(15,23,42,0.03)",
                      borderRadius: 16,
                      padding: 12,
                    }}
                  >
                    <div style={{ fontWeight: 950, marginBottom: 8 }}>
                      Server Health (Step E)
                    </div>
                    <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                      <div>
                        <b>CPU:</b> {fmtPct(selectedServerStats.cpu_percent)}
                      </div>
                      <div>
                        <b>RAM:</b> {fmtPct(selectedServerStats.mem_percent)}
                      </div>
                      <div>
                        <b>Disk:</b> {fmtPct(selectedServerStats.disk_percent)}
                      </div>
                      <div>
                        <b>Uptime:</b>{" "}
                        {fmtUptimeSeconds(selectedServerStats.uptime_seconds)}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        Sample time:{" "}
                        <b style={{ color: "var(--text)" }}>
                          {selectedServerStats.ts
                            ? new Date(
                                String(selectedServerStats.ts),
                              ).toLocaleString()
                            : "—"}
                        </b>
                      </div>
                      {selectedServerStats.error ? (
                        <div style={{ color: "#9f1239", fontWeight: 900 }}>
                          {String(selectedServerStats.error)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {/* Pro: node alerts drilldown */}
                {proMode && !isServerNode(selectedNode) ? (
                  <div
                    style={{
                      border: "1px solid var(--border)",
                      background: "rgba(255,255,255,0.75)",
                      borderRadius: 16,
                      padding: 12,
                      boxShadow: "var(--shadow-sm)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <div style={{ fontWeight: 950 }}>Active Alerts</div>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        {nodeAlertsAt ? (
                          <span style={{ fontSize: 12, color: "var(--muted)" }}>
                            cached:{" "}
                            <b style={{ color: "var(--text)" }}>
                              {new Date(nodeAlertsAt).toLocaleString()}
                            </b>
                          </span>
                        ) : null}
                        <Button
                          variant="secondary"
                          onClick={() =>
                            loadNodeActiveAlerts(
                              String((selectedNode as any).device_id || ""),
                            )
                          }
                          disabled={nodeAlertsLoading}
                        >
                          {nodeAlertsLoading ? "Refreshing…" : "Refresh"}
                        </Button>
                      </div>
                    </div>

                    {nodeAlertsError ? (
                      <div
                        style={{
                          marginTop: 10,
                          color: "#9f1239",
                          fontWeight: 900,
                        }}
                      >
                        {nodeAlertsError}
                      </div>
                    ) : null}

                    {!nodeActiveAlerts.length ? (
                      <div
                        style={{
                          marginTop: 10,
                          color: "var(--muted)",
                          fontSize: 13,
                        }}
                      >
                        No active alerts for this device.
                      </div>
                    ) : (
                      <div
                        style={{
                          marginTop: 10,
                          display: "grid",
                          gap: 10,
                          maxHeight: 320,
                          overflowY: "auto",
                        }}
                      >
                        {nodeActiveAlerts.slice(0, 40).map((a: any) => {
                          const sev = normSev(a);
                          return (
                            <div
                              key={String(a.id || Math.random())}
                              style={{
                                border: "1px solid var(--border)",
                                borderRadius: 14,
                                padding: 10,
                                background: "var(--card)",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 10,
                                }}
                              >
                                <div style={{ fontWeight: 950 }}>
                                  {alertTitle(a)}
                                </div>
                                <span style={sevStyle(sev)}>
                                  {sev.toUpperCase()}
                                </span>
                              </div>

                              <div
                                style={{
                                  fontSize: 12,
                                  color: "var(--muted)",
                                  marginTop: 4,
                                }}
                              >
                                {alertMeta(a)}
                              </div>

                              <div
                                style={{
                                  fontSize: 12,
                                  color: "var(--muted)",
                                  marginTop: 6,
                                }}
                              >
                                {alertWhen(a) ? (
                                  <>
                                    Raised:{" "}
                                    <b style={{ color: "var(--text)" }}>
                                      {alertWhen(a)}
                                    </b>
                                  </>
                                ) : (
                                  "Raised: —"
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div
                      style={{
                        marginTop: 10,
                        display: "flex",
                        justifyContent: "flex-end",
                      }}
                    >
                      <Button
                        variant="primary"
                        onClick={() =>
                          navigate(
                            `/alerts?device_id=${encodeURIComponent(
                              String((selectedNode as any).device_id || ""),
                            )}&active_only=1`,
                          )
                        }
                      >
                        Open Alerts Console
                      </Button>
                    </div>
                  </div>
                ) : null}

                {/* Pro: link inspector */}
                {proMode && selectedLink ? (
                  <div
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 16,
                      padding: 12,
                      background: "rgba(15,23,42,0.03)",
                    }}
                  >
                    <div style={{ fontWeight: 950, marginBottom: 8 }}>
                      Link Inspector
                    </div>
                    <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                      <div>
                        <b>From:</b> {String((selectedLink as any).from)}
                      </div>
                      <div>
                        <b>To:</b> {String((selectedLink as any).to)}
                      </div>
                      <div>
                        <b>Status:</b>{" "}
                        {String((selectedLink as any).status || "—")}
                      </div>
                      <div>
                        <b>Latency:</b>{" "}
                        {String((selectedLink as any).latency ?? "—")}
                      </div>
                      <div>
                        <b>RSSI:</b> {String((selectedLink as any).rssi ?? "—")}
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Diagnostics quick actions */}
                {!isServerNode(selectedNode) &&
                (selectedNode as any)?.device_id ? (
                  <div
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 16,
                      padding: 12,
                      background: "rgba(255,255,255,0.75)",
                    }}
                  >
                    <div style={{ fontWeight: 950, marginBottom: 10 }}>
                      Diagnostics
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          handlePing(String((selectedNode as any).device_id))
                        }
                        disabled={diagLoading !== null}
                      >
                        {diagLoading === "ping" ? "Pinging…" : "Ping"}
                      </Button>

                      <Button
                        variant="secondary"
                        onClick={() =>
                          handleTraceroute(
                            String((selectedNode as any).device_id),
                          )
                        }
                        disabled={diagLoading !== null}
                      >
                        {diagLoading === "trace" ? "Tracing…" : "Traceroute"}
                      </Button>

                      <Button
                        variant="secondary"
                        onClick={() =>
                          handleBandwidth(
                            String((selectedNode as any).device_id),
                          )
                        }
                        disabled={diagLoading !== null}
                      >
                        {diagLoading === "bandwidth" ? "Testing…" : "Bandwidth"}
                      </Button>
                    </div>

                    {diagResult ? (
                      <pre
                        style={{
                          marginTop: 10,
                          padding: 12,
                          borderRadius: 14,
                          background: "var(--card2)",
                          border: "1px solid var(--border)",
                          fontSize: 12,
                          overflowX: "auto",
                        }}
                      >
                        {JSON.stringify(diagResult, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ROUTING */}
      {tab === "routing" && (
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          }}
        >
          <Card
            title="Compute Route (Dijkstra)"
            subtitle="Select a device and compute path"
            accent="blue"
          >
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div
                  style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}
                >
                  Device ID
                </div>
                <Input
                  value={routeDeviceId}
                  onChange={(e) => setRouteDeviceId(e.target.value)}
                  placeholder="ESP32_01"
                />
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button variant="primary" onClick={handleComputeRoute}>
                  Compute
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setRouteResult(null)}
                >
                  Clear
                </Button>
              </div>

              {routeResult ? (
                <pre
                  style={{
                    marginTop: 10,
                    padding: 12,
                    borderRadius: 14,
                    background: "var(--card2)",
                    border: "1px solid var(--border)",
                    fontSize: 12,
                    overflowX: "auto",
                  }}
                >
                  {JSON.stringify(routeResult, null, 2)}
                </pre>
              ) : (
                <div style={{ color: "var(--muted)", fontSize: 13 }}>
                  Run a route computation to see the selected path and cost.
                </div>
              )}
            </div>
          </Card>

          <Card
            title="Route Timeline"
            subtitle="Recent routing / path change events"
            accent="slate"
          >
            {!routeTimeline.length ? (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                No route events yet.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 10,
                  maxHeight: 420,
                  overflowY: "auto",
                }}
              >
                {routeTimeline.slice(0, 60).map((e: any, idx: number) => (
                  <div
                    key={String(e.id || idx)}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                      padding: 10,
                      background: "var(--card)",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      {e.ts ? new Date(e.ts).toLocaleString() : "—"}
                    </div>
                    <div style={{ fontWeight: 950, marginTop: 4 }}>
                      {String(e.event || "route_event")}
                    </div>
                    {e.detail ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--muted)",
                          marginTop: 4,
                        }}
                      >
                        {String(e.detail)}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
