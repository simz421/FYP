// frontend/src/components/system/SystemMonitorCards.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  getSystemMonitorStats,
  type SystemMonitorStats,
} from "../../api/system_monitor";

type Props = {
  pollMs?: number; // default 10s
};

function pctLabel(v?: number) {
  if (typeof v !== "number") return "—";
  return `${Math.round(v)}%`;
}

function secondsToUptime(s?: number) {
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

function statusFor(value?: number, warnAt = 80, critAt = 90) {
  if (typeof value !== "number") return "unknown";
  if (value >= critAt) return "critical";
  if (value >= warnAt) return "warning";
  return "ok";
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 14,
  background: "#fff",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
  gap: 12,
};

const smallText: React.CSSProperties = { fontSize: 12, color: "#6b7280" };

export default function SystemMonitorCards({ pollMs = 10000 }: Props) {
  const [stats, setStats] = useState<SystemMonitorStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastOkAt, setLastOkAt] = useState<string | null>(null);

  const derived = useMemo(() => {
    const cpu = stats?.cpu_percent;
    const mem = stats?.mem_percent;
    const disk = stats?.disk_percent;

    return {
      cpuStatus: statusFor(cpu),
      memStatus: statusFor(mem),
      diskStatus: statusFor(disk, 85, 95),
    };
  }, [stats]);

  async function load() {
    setLoading(true);
    try {
      setError(null);
      const s = await getSystemMonitorStats();
      setStats(s);
      setLastOkAt(new Date().toISOString());
    } catch (e: any) {
      setError(e?.message || "Failed to load system monitor stats");
      // keep previous stats (offline-first)
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    load();
    const t = window.setInterval(() => {
      if (!alive) return;
      load();
    }, pollMs);

    return () => {
      alive = false;
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollMs]);

  const banner = error ? (
    <div
      style={{
        marginBottom: 10,
        border: "1px solid #fee2e2",
        background: "#fff1f2",
        color: "#9f1239",
        padding: "10px 12px",
        borderRadius: 12,
      }}
    >
      <div style={{ fontWeight: 800 }}>System Monitor Offline</div>
      <div style={{ fontSize: 13 }}>
        {error}. Showing last known values (if available).
      </div>
    </div>
  ) : null;

  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 900 }}>
            Server Health (Offline NMS Host)
          </div>
          <div style={smallText}>
            CPU / RAM / Disk / Uptime from local backend system monitor
          </div>
        </div>

        <div style={smallText}>
          {loading ? "Refreshing…" : " "}
          {lastOkAt
            ? `Last update: ${new Date(lastOkAt).toLocaleString()}`
            : ""}
        </div>
      </div>

      {banner}

      <div style={gridStyle}>
        <MetricCard
          title="CPU"
          value={pctLabel(stats?.cpu_percent)}
          status={derived.cpuStatus}
          subtitle="Host compute load"
        />
        <MetricCard
          title="Memory"
          value={pctLabel(stats?.mem_percent)}
          status={derived.memStatus}
          subtitle="RAM usage"
        />
        <MetricCard
          title="Disk"
          value={pctLabel(stats?.disk_percent)}
          status={derived.diskStatus}
          subtitle="Storage pressure"
        />
        <MetricCard
          title="Uptime"
          value={secondsToUptime(stats?.uptime_seconds)}
          status="ok"
          subtitle="Service availability"
        />
      </div>

      <div
        style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}
      >
        <MiniPill label="Load (1m)" value={fmt(stats?.load_1)} />
        <MiniPill label="Load (5m)" value={fmt(stats?.load_5)} />
        <MiniPill label="Load (15m)" value={fmt(stats?.load_15)} />
        <MiniPill label="TS" value={stats?.ts ? String(stats.ts) : "—"} />
      </div>
    </div>
  );
}

function fmt(v?: number) {
  if (typeof v !== "number") return "—";
  return v.toFixed(2);
}

function MetricCard(props: {
  title: string;
  value: string;
  status: "ok" | "warning" | "critical" | "unknown";
  subtitle?: string;
}) {
  const { title, value, status, subtitle } = props;

  const badge = (() => {
    const base: React.CSSProperties = {
      fontSize: 12,
      fontWeight: 800,
      padding: "4px 10px",
      borderRadius: 999,
      border: "1px solid #e5e7eb",
      background: "#fff",
    };

    if (status === "critical")
      return (
        <span
          style={{
            ...base,
            borderColor: "#fecaca",
            background: "#fff1f2",
            color: "#9f1239",
          }}
        >
          CRITICAL
        </span>
      );
    if (status === "warning")
      return (
        <span
          style={{
            ...base,
            borderColor: "#fde68a",
            background: "#fffbeb",
            color: "#92400e",
          }}
        >
          WARNING
        </span>
      );
    if (status === "unknown")
      return (
        <span
          style={{
            ...base,
            borderColor: "#e5e7eb",
            background: "#f9fafb",
            color: "#374151",
          }}
        >
          UNKNOWN
        </span>
      );
    return (
      <span
        style={{
          ...base,
          borderColor: "#bbf7d0",
          background: "#f0fdf4",
          color: "#166534",
        }}
      >
        OK
      </span>
    );
  })();

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div style={{ fontWeight: 900 }}>{title}</div>
        {badge}
      </div>

      <div style={{ fontSize: 26, fontWeight: 950, letterSpacing: -0.5 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
        {subtitle || " "}
      </div>
    </div>
  );
}

function MiniPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        background: "#fff",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        color: "#374151",
      }}
    >
      <span style={{ color: "#6b7280", fontWeight: 700 }}>{label}:</span>{" "}
      <span style={{ fontWeight: 900 }}>{value}</span>
    </div>
  );
}
