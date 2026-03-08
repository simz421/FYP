import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  ackAlert,
  fetchAlerts,
  resolveAlert,
  fetchAlertTrends,
  type AlertEvent,
  type AlertTrendBucket,
  type AlertsQuery,
} from "../api/alerts";
import { useAlertsSocket } from "../realtime/useAlertsSocket";

import SeverityBadge from "../components/alerts/SeverityBadge";
import AlertsTable from "../components/alerts/AlertsTable";
import AlertDetailsDrawer from "../components/alerts/AlertDetailsDrawer";

import Card from "../ui/Card";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Input from "../ui/Input";
import Select from "../ui/Select";

type StatusFilter = "all" | "active" | "acked" | "resolved";
type LevelFilter = "all" | "WARNING" | "CRITICAL";
type DirectionFilter = "all" | "BELOW_MIN" | "ABOVE_MAX";
type SortMode = "newest" | "critical_first" | "oldest";

function secondsSince(iso?: string | null) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 1000);
}

function formatAge(iso?: string | null) {
  const s = secondsSince(iso);
  if (s == null) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

function toMs(iso?: string | null) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function normalizeStatus(
  a: AlertEvent,
): "active" | "acked" | "resolved" | "unknown" {
  const s = (a.status || "").toLowerCase();
  if (s === "active" || s === "acked" || s === "resolved") return s;
  if (a.resolved_at) return "resolved";
  if (a.acked_at) return "acked";
  if (a.created_at) return "active";
  return "unknown";
}

function severityRank(a: AlertEvent): number {
  // higher = more important
  const lvl = (a.level || "").toLowerCase();
  if (lvl === "critical") return 3;
  if (lvl === "warning") return 2;
  if (lvl === "info") return 1;

  const dir = (a.severity || "").toLowerCase();
  if (dir === "above_max") return 3;
  if (dir === "below_min") return 2;

  return 0;
}

function sortAlerts(list: AlertEvent[], mode: SortMode) {
  const arr = [...list];

  if (mode === "newest") {
    arr.sort((a, b) => (toMs(b.created_at) ?? 0) - (toMs(a.created_at) ?? 0));
    return arr;
  }

  if (mode === "oldest") {
    arr.sort((a, b) => (toMs(a.created_at) ?? 0) - (toMs(b.created_at) ?? 0));
    return arr;
  }

  // critical_first
  arr.sort((a, b) => {
    const ra = severityRank(a);
    const rb = severityRank(b);
    if (rb !== ra) return rb - ra;

    // unresolved first
    const sa = normalizeStatus(a);
    const sb = normalizeStatus(b);
    const unresolvedRank = (s: string) => (s === "resolved" ? 0 : 1);
    const ua = unresolvedRank(sa);
    const ub = unresolvedRank(sb);
    if (ub !== ua) return ub - ua;

    // newest within same group
    return (toMs(b.created_at) ?? 0) - (toMs(a.created_at) ?? 0);
  });

  return arr;
}

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
        transition: "transform 120ms ease, box-shadow 120ms ease",
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = "translateY(1px)";
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = "translateY(0px)";
      }}
    >
      {label}
    </button>
  );
}

// --- URL param helpers (D.5) ---
function parseIntSafe(v: string | null, fallback: number) {
  // IMPORTANT: Number(null) === 0, which would accidentally override defaults.
  // Treat null/empty as missing.
  if (v == null) return fallback;
  const s = String(v).trim();
  if (!s) return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(n: number, min: number, max: number) {
  const x = Number.isFinite(n) ? Math.trunc(n) : min;
  return Math.max(min, Math.min(max, x));
}

function isTruthy(v: string | null) {
  if (!v) return false;
  const s = v.toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y";
}

export default function Alerts() {
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();

  // ----- Initial state from URL (only once on mount) -----
  const initDone = useRef(false);

  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [count, setCount] = useState(0);
  const [, setTrend] = useState<AlertTrendBucket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<AlertEvent | null>(null);

  // Filters
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [level, setLevel] = useState<LevelFilter>("all");
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [deviceId, setDeviceId] = useState("");

  // Paging
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);

  // Sorting
  const [sortMode, setSortMode] = useState<SortMode>("newest");

  // Actions
  const [actionBusyId, setActionBusyId] = useState<number | null>(null);
  const [ackNote, setAckNote] = useState("");

  // D.5: read URL params into UI state
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    const sp = new URLSearchParams(location.search);

    const urlQ = sp.get("q") || "";
    const urlDevice = sp.get("device_id") || sp.get("deviceId") || "";
    const urlStatus = (sp.get("status") || "").toLowerCase();
    const urlLevel = (sp.get("level") || "").toUpperCase();
    const urlSeverity = (sp.get("severity") || "").toUpperCase();
    const urlActiveOnly = isTruthy(sp.get("active_only"));

    // ✅ clamp so limit never becomes 0/NaN
    const urlLimit = clampInt(parseIntSafe(sp.get("limit"), 50), 1, 200);
    const urlOffset = clampInt(
      parseIntSafe(sp.get("offset"), 0),
      0,
      1_000_000_000,
    );

    // Apply
    if (urlQ) setQ(urlQ);
    if (urlDevice) setDeviceId(urlDevice);

    // status/active_only
    if (urlActiveOnly) {
      setStatus("active");
    } else if (
      urlStatus === "active" ||
      urlStatus === "acked" ||
      urlStatus === "resolved"
    ) {
      setStatus(urlStatus as StatusFilter);
    }

    // level
    if (urlLevel === "CRITICAL" || urlLevel === "WARNING") {
      setLevel(urlLevel as LevelFilter);
    }

    // severity might be either direction (BELOW_MIN/ABOVE_MAX) OR legacy severity strings like "critical"
    if (urlSeverity === "BELOW_MIN" || urlSeverity === "ABOVE_MAX") {
      setDirection(urlSeverity as DirectionFilter);
    } else if (urlSeverity === "CRITICAL") {
      setLevel("CRITICAL");
    } else if (urlSeverity === "WARNING") {
      setLevel("WARNING");
    }

    // paging
    setLimit(urlLimit);
    setOffset(urlOffset);
  }, [location.search]);

  // ✅ Use safe values everywhere (prevents NaN children forever)
  const safeLimit = useMemo(() => clampInt(limit, 1, 200), [limit]);
  const safeOffset = useMemo(
    () => clampInt(offset, 0, 1_000_000_000),
    [offset],
  );

  // Build query object for backend
  const queryObj: AlertsQuery = useMemo(
    () => ({
      limit: safeLimit,
      offset: safeOffset,
      q: q.trim() || undefined,
      device_id: deviceId.trim() || undefined,

      // status lifecycle (active/acked/resolved)
      status: status === "all" ? undefined : status,

      // CRITICAL/WARNING
      level: level === "all" ? undefined : level,

      // BELOW_MIN/ABOVE_MAX
      severity: direction === "all" ? undefined : direction,

      // convenience flag (keep it consistent with links like active_only=1)
      active_only: status === "active" ? true : undefined,
    }),
    [safeLimit, safeOffset, q, deviceId, status, level, direction],
  );

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAlerts(queryObj);
      if (!res.ok) setError(res.error || "Failed to load alerts");
      setAlerts(Array.isArray(res.data) ? res.data : []);
      setCount(typeof res.count === "number" ? res.count : 0);
    } catch (e: any) {
      setError(e?.message || "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [queryObj]);

  const loadTrends = useCallback(async () => {
    const res = await fetchAlertTrends({ hours: 24, bucket_min: 60 });
    if (res.ok) setTrend(Array.isArray(res.data) ? res.data : []);
  }, []);

  // Live updates (Socket.IO)
  const socketState = useAlertsSocket((event, payload) => {
    if (event === "new_alert") {
      const incoming: AlertEvent = payload;

      // If user is filtering by device, only inject if it matches.
      if (deviceId.trim() && (incoming.device_id || "") !== deviceId.trim())
        return;

      setAlerts((prev) => {
        const exists = prev.some((a) => a.id === incoming.id);
        const next = exists ? prev : [incoming, ...prev];
        return next.slice(0, 500);
      });
      setCount((c) => c + 1);
    }

    if (event === "alert_update") {
      const incoming: AlertEvent = payload;

      // If user is filtering by device, ignore mismatching updates.
      if (deviceId.trim() && (incoming.device_id || "") !== deviceId.trim())
        return;

      setAlerts((prev) =>
        prev.map((a) => (a.id === incoming.id ? { ...a, ...incoming } : a)),
      );
      setSelected((cur) =>
        cur?.id === incoming.id ? { ...cur, ...incoming } : cur,
      );
    }
  });

  useEffect(() => {
    loadAlerts();
    loadTrends().catch(() => {});
  }, [loadAlerts, loadTrends]);

  // Fallback polling only when socket disconnected
  useEffect(() => {
    if (socketState.connected) return;
    const id = setInterval(() => {
      loadAlerts().catch(() => {});
    }, 12000);
    return () => clearInterval(id);
  }, [socketState.connected, loadAlerts]);

  const summary = useMemo(() => {
    const total = alerts.length;
    const active = alerts.filter((a) => normalizeStatus(a) === "active").length;
    const critical = alerts.filter(
      (a) => (a.level || "").toString() === "CRITICAL",
    ).length;
    const unacked = alerts.filter(
      (a) => !a.acked_at && normalizeStatus(a) === "active",
    ).length;

    const acked = alerts
      .filter((a) => a.acked_at && a.created_at)
      .map((a) => {
        const t0 = new Date(a.created_at!).getTime();
        const t1 = new Date(a.acked_at!).getTime();
        return Number.isFinite(t0) && Number.isFinite(t1)
          ? Math.max(0, Math.floor((t1 - t0) / 1000))
          : null;
      })
      .filter((x): x is number => x != null);

    const mtta = acked.length
      ? Math.floor(acked.reduce((s, x) => s + x, 0) / acked.length)
      : null;

    return { total, active, critical, unacked, mtta };
  }, [alerts]);

  const sortedAlerts = useMemo(
    () => sortAlerts(alerts, sortMode),
    [alerts, sortMode],
  );

  const page = Math.floor(safeOffset / safeLimit) + 1;
  const pageCount = count > 0 ? Math.max(1, Math.ceil(count / safeLimit)) : 1;
  const canPrev = safeOffset > 0;
  const canNext = safeOffset + safeLimit < count;

  async function onAck(alert: AlertEvent) {
    try {
      setActionBusyId(alert.id);
      setError(null);
      const updated = await ackAlert(alert.id, ackNote || undefined);

      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alert.id ? { ...a, ...(updated as any) } : a,
        ),
      );
      setSelected((cur) =>
        cur?.id === alert.id ? { ...cur, ...(updated as any) } : cur,
      );
      setAckNote("");
    } catch (e: any) {
      setError(e?.message || "Failed to acknowledge alert");
    } finally {
      setActionBusyId(null);
    }
  }

  async function onResolve(alert: AlertEvent) {
    try {
      setActionBusyId(alert.id);
      setError(null);
      const updated = await resolveAlert(alert.id);

      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alert.id ? { ...a, ...(updated as any) } : a,
        ),
      );
      setSelected((cur) =>
        cur?.id === alert.id ? { ...cur, ...(updated as any) } : cur,
      );
    } catch (e: any) {
      setError(e?.message || "Failed to resolve alert");
    } finally {
      setActionBusyId(null);
    }
  }

  // D.5: Sync URL to current filters when applying
  function applyFilters() {
    setOffset(0);

    const params = new URLSearchParams();

    // keep paging shareable
    params.set("limit", String(safeLimit));
    params.set("offset", "0");

    if (q.trim()) params.set("q", q.trim());
    if (deviceId.trim()) params.set("device_id", deviceId.trim());

    if (status !== "all") params.set("status", status);
    if (status === "active") params.set("active_only", "1");

    if (level !== "all") params.set("level", level);
    if (direction !== "all") params.set("severity", direction);

    // push url
    setSearchParams(params);

    // reload
    loadAlerts().catch(() => {});
  }

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
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <h2 className="nms-title" style={{ margin: 0 }}>
              Alerts Console
            </h2>
            <Badge tone={liveTone as any}>{liveText}</Badge>
            {deviceId.trim() ? (
              <Badge tone="neutral">Device: {deviceId.trim()}</Badge>
            ) : null}
            {status !== "all" ? (
              <Badge tone="neutral">Status: {status.toUpperCase()}</Badge>
            ) : null}
          </div>

          <div className="nms-subtitle" style={{ marginTop: 6 }}>
            Threshold + fault alerts • offline-first • showing{" "}
            <b style={{ color: "var(--text)" }}>{sortedAlerts.length}</b> of{" "}
            <b style={{ color: "var(--text)" }}>{count}</b> • page{" "}
            <b style={{ color: "var(--text)" }}>{page}</b>/
            <b style={{ color: "var(--text)" }}>{pageCount}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button
            variant="secondary"
            onClick={() => {
              loadAlerts().catch(() => {});
              loadTrends().catch(() => {});
            }}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error ? (
        <div style={{ marginBottom: 12 }}>
          <Card
            title="Alerts Error"
            subtitle="Offline-safe: you can retry refresh."
            accent="red"
          >
            <div style={{ fontSize: 13, fontWeight: 900, color: "#9f1239" }}>
              {error}
            </div>
          </Card>
        </div>
      ) : null}

      {/* KPI strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <Card title="Total" subtitle="in current view" accent="slate">
          <div style={{ fontSize: 28, fontWeight: 950 }}>{summary.total}</div>
        </Card>

        <Card title="Active" subtitle="unresolved" accent="blue">
          <div style={{ fontSize: 28, fontWeight: 950 }}>{summary.active}</div>
        </Card>

        <Card title="Critical" subtitle="priority incidents" accent="red">
          <div style={{ fontSize: 28, fontWeight: 950 }}>
            {summary.critical}
          </div>
        </Card>

        <Card title="Unacked" subtitle="needs attention" accent="amber">
          <div style={{ fontSize: 28, fontWeight: 950 }}>{summary.unacked}</div>
        </Card>

        <Card title="MTTA" subtitle="mean time to ack (sec)" accent="green">
          <div style={{ fontSize: 28, fontWeight: 950 }}>
            {summary.mtta ?? "—"}
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card
        title="Filters"
        subtitle="Apply to refresh results. Links are shareable."
        accent="slate"
        right={
          <Button variant="primary" onClick={applyFilters} disabled={loading}>
            Apply filters
          </Button>
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 0.9fr",
              gap: 12,
              alignItems: "end",
            }}
          >
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
                Search
              </div>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search (message/parameter)…"
              />
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
                Device ID
              </div>
              <Input
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                placeholder="ESP32_01"
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <ToggleChip
                active={status === "all"}
                label="All"
                onClick={() => setStatus("all")}
              />
              <ToggleChip
                active={status === "active"}
                label="Active"
                onClick={() => setStatus("active")}
              />
              <ToggleChip
                active={status === "acked"}
                label="Acked"
                onClick={() => setStatus("acked")}
              />
              <ToggleChip
                active={status === "resolved"}
                label="Resolved"
                onClick={() => setStatus("resolved")}
              />
            </div>

            <div style={{ flex: 1 }} />

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div style={{ minWidth: 180 }}>
                <Select
                  value={level}
                  onChange={(e) => setLevel(e.target.value as LevelFilter)}
                >
                  <option value="all">All levels</option>
                  <option value="WARNING">WARNING</option>
                  <option value="CRITICAL">CRITICAL</option>
                </Select>
              </div>

              <div style={{ minWidth: 200 }}>
                <Select
                  value={direction}
                  onChange={(e) =>
                    setDirection(e.target.value as DirectionFilter)
                  }
                >
                  <option value="all">All directions</option>
                  <option value="BELOW_MIN">BELOW_MIN</option>
                  <option value="ABOVE_MAX">ABOVE_MAX</option>
                </Select>
              </div>

              <div style={{ minWidth: 190 }}>
                <Select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                >
                  <option value="newest">Newest</option>
                  <option value="critical_first">Critical first</option>
                  <option value="oldest">Oldest</option>
                </Select>
              </div>

              <div style={{ minWidth: 160 }}>
                <Select
                  value={safeLimit}
                  onChange={(e) => {
                    setLimit(clampInt(Number(e.target.value), 1, 200));
                    setOffset(0);
                  }}
                >
                  <option value={20}>20 / page</option>
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                </Select>
              </div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Tip: shareable links like{" "}
            <b style={{ color: "var(--text)" }}>
              /alerts?device_id=ESP32_01&amp;active_only=1
            </b>
          </div>
        </div>
      </Card>

      {/* Alerts table */}
      <AlertsTable
        alerts={sortedAlerts}
        onSelect={(a) => setSelected(a)}
        renderSeverity={(sev) => (
          <SeverityBadge severity={String(sev || "info").toUpperCase()} />
        )}
        formatAge={formatAge}
        actionBusyId={actionBusyId}
        onAck={onAck}
        onResolve={onResolve}
      />

      {/* Paging */}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          Showing <b style={{ color: "var(--text)" }}>{sortedAlerts.length}</b>{" "}
          of <b style={{ color: "var(--text)" }}>{count}</b>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Button
            variant="secondary"
            disabled={!canPrev}
            onClick={() => {
              const next = Math.max(0, safeOffset - safeLimit);
              setOffset(next);
            }}
          >
            Prev
          </Button>

          <Badge tone="neutral">
            Page <b>{page}</b> / <b>{pageCount}</b>
          </Badge>

          <Button
            variant="secondary"
            disabled={!canNext}
            onClick={() => {
              const next = safeOffset + safeLimit;
              setOffset(next);
            }}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Drawer */}
      <AlertDetailsDrawer
        alert={selected}
        actionBusy={actionBusyId === (selected?.id ?? -1)}
        ackNote={ackNote}
        setAckNote={setAckNote}
        onClose={() => setSelected(null)}
        onAck={() => selected && onAck(selected)}
        onResolve={() => selected && onResolve(selected)}
      />
    </div>
  );
}
