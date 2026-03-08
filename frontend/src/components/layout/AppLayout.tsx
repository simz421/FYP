import React, { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import Badge from "../../ui/Badge";
import { useNocSocket } from "../../realtime/useNocSocket";
import { fetchHealth, type HealthResponse } from "../../api/health";

function navLinkStyle({
  isActive,
}: {
  isActive: boolean;
}): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderRadius: 10,
    textDecoration: "none",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "-0.01em",
    color: isActive ? "var(--text)" : "rgba(15,23,42,0.72)",
    background: isActive ? "rgba(15,23,42,0.06)" : "transparent",
    border: isActive
      ? "1px solid rgba(15,23,42,0.12)"
      : "1px solid transparent",
    transition: "background 120ms ease, border 120ms ease",
    whiteSpace: "nowrap",
  };
}

function proLinkStyle({
  isActive,
}: {
  isActive: boolean;
}): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderRadius: 999,
    textDecoration: "none",
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: "-0.01em",
    color: isActive ? "#fff" : "var(--text)",
    background: isActive
      ? "linear-gradient(180deg, var(--primary), var(--primary2))"
      : "rgba(15,23,42,0.06)",
    border: "1px solid rgba(15,23,42,0.12)",
    boxShadow: isActive ? "var(--shadow-md)" : "var(--shadow-sm)",
    whiteSpace: "nowrap",
  };
}

function dot(color: string) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: 999,
        background: color,
        boxShadow: "0 0 0 3px rgba(255,255,255,0.7)",
      }}
    />
  );
}

function fmtUptime(sec?: number) {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec < 0) return "—";
  const days = Math.floor(sec / 86400);
  sec -= days * 86400;
  const hrs = Math.floor(sec / 3600);
  sec -= hrs * 3600;
  const mins = Math.floor(sec / 60);
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

export default function AppLayout() {
  const location = useLocation();
  const inPro = location.pathname.startsWith("/topology/pro");

  // ---- Socket status (no-op handler; we only need connected flag)
  const onSocketEvent = useCallback((_event: string, _payload: any) => {}, []);
  const socketState = useNocSocket(onSocketEvent);

  // ---- API health status
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthAt, setHealthAt] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function poll() {
      try {
        const h = await fetchHealth();
        if (!alive) return;
        setApiOnline(true);
        setHealth(h || null);
        setHealthAt(new Date().toISOString());
      } catch {
        if (!alive) return;
        setApiOnline(false);
        setHealthAt(new Date().toISOString());
      }
    }

    poll().catch(() => {});
    const id = window.setInterval(() => poll().catch(() => {}), 10000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const statusBadges = useMemo(() => {
    const apiTone = apiOnline === null ? "neutral" : apiOnline ? "good" : "bad";

    const apiText =
      apiOnline === null
        ? "API: …"
        : apiOnline
          ? "API: ONLINE"
          : "API: OFFLINE";

    const socketTone = socketState.connected ? "info" : "neutral";
    const socketText = socketState.connected ? "SOCKET: LIVE" : "SOCKET: OFF";

    const apiDot =
      apiOnline === null
        ? dot("rgba(100,116,139,0.7)")
        : apiOnline
          ? dot("rgba(34,197,94,0.9)")
          : dot("rgba(225,29,72,0.9)");

    const socketDot = socketState.connected
      ? dot("rgba(59,130,246,0.9)")
      : dot("rgba(100,116,139,0.7)");

    const uptime = fmtUptime(health?.uptime_seconds);
    const stale = healthAt ? Date.now() - new Date(healthAt).getTime() : null;
    const isStale = stale != null && stale > 20000; // >20s old

    return {
      apiTone,
      apiText,
      apiDot,
      socketTone,
      socketText,
      socketDot,
      uptime,
      isStale,
    };
  }, [apiOnline, socketState.connected, health, healthAt]);

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Top Bar */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backdropFilter: "blur(10px)",
          background: "rgba(255,255,255,0.75)",
          borderBottom: "1px solid rgba(15,23,42,0.10)",
          boxShadow: "0 6px 24px rgba(15,23,42,0.08)",
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          {/* Brand */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  background:
                    "linear-gradient(180deg, rgba(59,130,246,0.20), rgba(15,23,42,0.08))",
                  border: "1px solid rgba(15,23,42,0.10)",
                  boxShadow: "var(--shadow-sm)",
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 950,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Offline Smart Farming NMS
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  Local-first monitoring · routing · alerts · reports
                </div>
              </div>
            </div>
          </div>

          {/* Nav + Status */}
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "flex-end",
            }}
          >
            <nav
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <NavLink to="/" style={navLinkStyle} end>
                Dashboard
              </NavLink>
              <NavLink to="/telemetry" style={navLinkStyle}>
                Telemetry
              </NavLink>
              <NavLink to="/alerts" style={navLinkStyle}>
                Alerts
              </NavLink>
              <NavLink to="/topology" style={navLinkStyle}>
                Topology
              </NavLink>
              <NavLink to="/topology/pro" style={proLinkStyle}>
                Topology Pro
              </NavLink>
              <NavLink to="/predictive" style={navLinkStyle}>
                Predictive
              </NavLink>
              <NavLink to="/recommendations" style={navLinkStyle}>
                Recommendations
              </NavLink>
              <NavLink to="/reports" style={navLinkStyle}>
                Reports
              </NavLink>
              <NavLink to="/settings" style={navLinkStyle}>
                Settings
              </NavLink>
            </nav>

            {/* Status strip */}
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <Badge tone={inPro ? "info" : "neutral"}>
                {inPro ? "PRO MODE" : "CONSOLE"}
              </Badge>

              <Badge tone={statusBadges.apiTone as any}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {statusBadges.apiDot}
                  {statusBadges.apiText}
                </span>
              </Badge>

              <Badge tone={statusBadges.socketTone as any}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {statusBadges.socketDot}
                  {statusBadges.socketText}
                </span>
              </Badge>

              {apiOnline ? (
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  Uptime:{" "}
                  <b style={{ color: "var(--text)" }}>{statusBadges.uptime}</b>
                  {statusBadges.isStale ? (
                    <span style={{ marginLeft: 8, fontWeight: 900 }}>
                      • STALE
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="nms-page">
        <Outlet />
      </main>

      {/* Footer */}
      <footer
        style={{
          padding: "18px 18px 24px",
          color: "var(--muted)",
          fontSize: 12,
          textAlign: "center",
        }}
      >
        © {new Date().getFullYear()} Smart Farming NMS — Offline-first · Local
        backend · SQLite
      </footer>
    </div>
  );
}
