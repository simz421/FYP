import React, { useEffect, useMemo, useState } from "react";
import Card from "../ui/Card";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Select from "../ui/Select";
import Input from "../ui/Input";

import { fetchDevices } from "../api/devices";
import {
  getForecast,
  getNetworkRisk,
  getPatterns,
  getMaintenancePlan,
  getBreachRisk,
  getFleetBreachScan,
} from "../api/predictive";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

type Device = any;

function fmtTs(ts?: string | null) {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString();
  } catch {
    return ts;
  }
}

function riskTone(level?: string) {
  const lvl = String(level || "").toLowerCase();
  if (lvl === "critical" || lvl === "high") return "bad";
  if (lvl === "medium") return "warn";
  if (lvl === "low") return "good";
  return "neutral";
}

function num(v: any, digits = 2) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export default function Predictive() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");

  const [parameter, setParameter] = useState<string>("temperature");
  const [hoursAhead, setHoursAhead] = useState<number>(6);
  const [lookbackDays, setLookbackDays] = useState<number>(7);
  const [patternDays, setPatternDays] = useState<number>(30);

  const [forecast, setForecast] = useState<any>(null);
  const [risk, setRisk] = useState<any>(null);
  const [patterns, setPatterns] = useState<any>(null);
  const [maintenance, setMaintenance] = useState<any>(null);

  const [breach, setBreach] = useState<any>(null);
  const [fleetScan, setFleetScan] = useState<any>(null);

  const [loading, setLoading] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await fetchDevices();
        const list = Array.isArray(d?.data) ? d.data : [];
        setDevices(list);
        if (!deviceId && list[0]?.device_id) setDeviceId(list[0].device_id);
      } catch {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedDevice = useMemo(() => {
    return (devices || []).find((d) => d.device_id === deviceId) || null;
  }, [devices, deviceId]);

  async function runForecast() {
    if (!deviceId) return;
    setErr(null);
    setLoading("forecast");
    try {
      const res = await getForecast({
        device_id: deviceId,
        parameter,
        hours_ahead: hoursAhead,
      });
      if (!res.ok) throw new Error(res.error);
      setForecast(res.data);
    } catch (e: any) {
      setErr(e?.message || "Forecast failed");
    } finally {
      setLoading(null);
    }
  }

  async function runRisk() {
    if (!deviceId) return;
    setErr(null);
    setLoading("risk");
    try {
      const res = await getNetworkRisk({
        device_id: deviceId,
        lookback_days: lookbackDays,
      });
      if (!res.ok) throw new Error(res.error);
      setRisk(res.data);
    } catch (e: any) {
      setErr(e?.message || "Risk analysis failed");
    } finally {
      setLoading(null);
    }
  }

  async function runPatterns() {
    if (!deviceId) return;
    setErr(null);
    setLoading("patterns");
    try {
      const res = await getPatterns({
        device_id: deviceId,
        parameter,
        days: patternDays,
      });
      if (!res.ok) throw new Error(res.error);
      setPatterns(res.data);
    } catch (e: any) {
      setErr(e?.message || "Pattern analysis failed");
    } finally {
      setLoading(null);
    }
  }

  async function runMaintenance() {
    setErr(null);
    setLoading("maintenance");
    try {
      const res = await getMaintenancePlan();
      if (!res.ok) throw new Error(res.error);
      setMaintenance(res.data);
    } catch (e: any) {
      setErr(e?.message || "Maintenance plan failed");
    } finally {
      setLoading(null);
    }
  }

  async function runBreach() {
    if (!deviceId) return;
    setErr(null);
    setLoading("breach");
    try {
      const res = await getBreachRisk({
        device_id: deviceId,
        parameter,
        hours_ahead: hoursAhead,
      });
      if (!res.ok) throw new Error(res.error);
      setBreach(res.data);
    } catch (e: any) {
      setErr(e?.message || "Breach prediction failed");
    } finally {
      setLoading(null);
    }
  }

  async function runFleetScan() {
    setErr(null);
    setLoading("fleet");
    try {
      const res = await getFleetBreachScan({
        parameter,
        hours_ahead: hoursAhead,
        limit: 50,
        only_registered: 1,
      });
      if (!res.ok) throw new Error(res.error);
      setFleetScan(res.data);
    } catch (e: any) {
      setErr(e?.message || "Fleet scan failed");
    } finally {
      setLoading(null);
    }
  }

  async function runDeviceAnalysis() {
    if (!deviceId) return;
    await Promise.allSettled([
      runForecast(),
      runRisk(),
      runPatterns(),
      runBreach(),
      runFleetScan(),
    ]);
  }

  const breachTone = useMemo(() => {
    return riskTone(breach?.risk?.risk_level);
  }, [breach?.risk?.risk_level]);

  return (
    <div>
      {/* Toolbar */}
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
              Predictive Analytics
            </h2>
            <Badge tone="neutral">Intelligence Layer</Badge>
            {loading ? (
              <Badge tone="info">RUNNING…</Badge>
            ) : (
              <Badge tone="good">READY</Badge>
            )}
            {err ? <Badge tone="bad">ERROR</Badge> : null}
          </div>
          <div className="nms-subtitle" style={{ marginTop: 6 }}>
            Forecasts • Threshold breach risk • Fleet early warning inbox •
            Maintenance planning
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button
            variant="secondary"
            onClick={() => runFleetScan()}
            disabled={!!loading}
          >
            {loading === "fleet" ? "Scanning…" : "Scan Fleet"}
          </Button>
          <Button
            variant="primary"
            onClick={() => runDeviceAnalysis()}
            disabled={!!loading || !deviceId}
          >
            {loading ? "Running…" : "Run Device Analysis"}
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {err ? (
        <Card
          title="Error"
          subtitle="Fix the issue and retry."
          accent="red"
          style={{ marginBottom: 12 }}
        >
          <div style={{ fontSize: 13, fontWeight: 950, color: "#9f1239" }}>
            {err}
          </div>
        </Card>
      ) : null}

      {/* Controls */}
      <Card
        title="Controls"
        subtitle="Select a device + parameter, then run analysis (offline-first safe)"
        accent="blue"
        right={
          selectedDevice ? (
            <Badge tone="neutral">
              Device: {selectedDevice.device_id} • Status:{" "}
              {selectedDevice.status || "—"}
            </Badge>
          ) : (
            <Badge tone="neutral">Select device</Badge>
          )
        }
        style={{ marginBottom: 12 }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(240px, 1.1fr) minmax(200px, 0.8fr) minmax(180px, 0.6fr) minmax(180px, 0.6fr)",
            gap: 12,
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}>
              Device
            </div>
            <Select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
            >
              <option value="">Select…</option>
              {(devices || []).map((d) => (
                <option key={d.device_id} value={d.device_id}>
                  {d.device_id} ({d.status || "—"})
                </option>
              ))}
            </Select>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}>
              Parameter
            </div>
            <Select
              value={parameter}
              onChange={(e) => setParameter(e.target.value)}
            >
              <option value="temperature">temperature</option>
              <option value="humidity">humidity</option>
              <option value="soil_moisture">soil_moisture</option>
              <option value="ph">ph</option>
            </Select>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}>
              Forecast horizon
            </div>
            <Select
              value={String(hoursAhead)}
              onChange={(e) => setHoursAhead(Number(e.target.value))}
            >
              <option value="1">1 hour</option>
              <option value="6">6 hours</option>
              <option value="24">24 hours</option>
            </Select>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}>
              Lookback days
            </div>
            <Select
              value={String(lookbackDays)}
              onChange={(e) => setLookbackDays(Number(e.target.value))}
            >
              <option value="3">3</option>
              <option value="7">7</option>
              <option value="14">14</option>
              <option value="30">30</option>
            </Select>
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <Button
            variant="secondary"
            onClick={() => runForecast()}
            disabled={!!loading || !deviceId}
          >
            {loading === "forecast" ? "Forecasting…" : "Forecast"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => runBreach()}
            disabled={!!loading || !deviceId}
          >
            {loading === "breach" ? "Scoring…" : "Breach Overlay"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => runRisk()}
            disabled={!!loading || !deviceId}
          >
            {loading === "risk" ? "Analyzing…" : "Network Risk"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => runPatterns()}
            disabled={!!loading || !deviceId}
          >
            {loading === "patterns" ? "Detecting…" : "Patterns"}
          </Button>

          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}>
              Pattern days
            </div>
            <Input
              value={String(patternDays)}
              onChange={(e) => setPatternDays(Number(e.target.value))}
              style={{ width: 110 }}
            />
          </div>
        </div>
      </Card>

      {/* Results grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 12,
        }}
      >
        {/* Forecast */}
        <Card
          title="Forecast"
          subtitle="Predicted value based on recent trend"
          accent="slate"
          right={
            forecast ? (
              <Badge tone="neutral">Conf {num(forecast.confidence, 2)}</Badge>
            ) : (
              <Badge tone="neutral">—</Badge>
            )
          }
        >
          {!forecast ? (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              Run <b>Forecast</b> to estimate the next value within the selected
              horizon.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    fontWeight: 900,
                  }}
                >
                  Predicted value
                </div>
                <div style={{ fontSize: 24, fontWeight: 950 }}>
                  {num(forecast.predicted_value, 2)}
                </div>
              </div>
              <div
                style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.55 }}
              >
                <b>Rationale:</b> {forecast.rationale || "—"}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Updated:{" "}
                <b style={{ color: "var(--text)" }}>
                  {fmtTs(forecast.timestamp)}
                </b>
              </div>
            </div>
          )}
        </Card>

        {/* Network Risk */}
        <Card
          title="Network Failure Risk"
          subtitle="Risk score derived from alerts + last_seen + signal"
          accent="slate"
          right={
            risk ? (
              <Badge tone={riskTone(risk.risk_level) as any}>
                {String(risk.risk_level || "—").toUpperCase()} •{" "}
                {risk.risk_score ?? "—"}/100
              </Badge>
            ) : (
              <Badge tone="neutral">—</Badge>
            )
          }
        >
          {!risk ? (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              Run <b>Network Risk</b> to score likelihood of device/network
              degradation.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 13, color: "var(--text)" }}>
                <b>Alerts:</b> {risk.alerts_in_period ?? "—"} •{" "}
                <b>Last seen:</b> {risk.last_seen ? fmtTs(risk.last_seen) : "—"}{" "}
                • <b>RSSI:</b> {risk.signal_strength ?? "—"}
              </div>

              {Array.isArray(risk.recommendations) &&
              risk.recommendations.length > 0 ? (
                <div>
                  <div
                    style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}
                  >
                    Recommended actions
                  </div>
                  <ul
                    style={{
                      marginTop: 8,
                      paddingLeft: 18,
                      color: "var(--muted)",
                      fontSize: 13,
                    }}
                  >
                    {risk.recommendations
                      .slice(0, 5)
                      .map((r: string, i: number) => (
                        <li key={i}>{r}</li>
                      ))}
                  </ul>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--muted)" }}>
                  No recommendations.
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Breach Overlay */}
        <Card
          title="Threshold Breach Overlay"
          subtitle="Forecast + threshold band + breach ETA"
          accent="blue"
          right={
            breach ? (
              <Badge tone={breachTone as any}>
                {String(breach?.risk?.risk_level || "—").toUpperCase()} •{" "}
                {breach?.risk?.risk_score ?? "—"}/100
              </Badge>
            ) : (
              <Badge tone="neutral">—</Badge>
            )
          }
          style={{ gridColumn: "1 / -1" }}
        >
          {!breach ? (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              Run <b>Breach Overlay</b> to compute the threshold band and breach
              ETA inside the horizon.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  fontSize: 13,
                  color: "var(--text)",
                }}
              >
                <div>
                  <b>Min:</b> {breach?.effective_threshold?.min_value ?? "—"}{" "}
                  <span style={{ color: "var(--muted)" }}>
                    ({breach?.effective_threshold ? "active" : "none"})
                  </span>
                </div>
                <div>
                  <b>Max:</b> {breach?.effective_threshold?.max_value ?? "—"}
                </div>
              </div>

              <div style={{ fontSize: 13, color: "var(--text)" }}>
                <b>Breach:</b>{" "}
                {breach?.breach?.will_breach ? (
                  <>
                    YES •{" "}
                    <b>{String(breach?.breach?.direction).toUpperCase()}</b> •
                    ETA ~ <b>{breach?.breach?.time_to_breach_hours}h</b> • at{" "}
                    <b>
                      {breach?.breach?.breach_at
                        ? fmtTs(breach.breach.breach_at)
                        : "—"}
                    </b>
                  </>
                ) : (
                  <>No breach predicted within horizon</>
                )}
              </div>

              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <LineChart
                    data={(breach?.forecast_points || []).map((p: any) => {
                      const d = new Date(p.ts);
                      const label = `${String(d.getHours()).padStart(2, "0")}:00`;
                      return { ...p, label };
                    })}
                    margin={{ top: 10, right: 18, left: 0, bottom: 18 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      labelFormatter={(l) => `Hour: ${String(l)}`}
                      formatter={(v: any) => [v, "forecast"]}
                    />

                    {typeof breach?.effective_threshold?.min_value ===
                    "number" ? (
                      <ReferenceLine
                        y={breach.effective_threshold.min_value}
                        strokeDasharray="6 4"
                        strokeWidth={2}
                        label={{ value: "MIN", position: "insideTopLeft" }}
                      />
                    ) : null}
                    {typeof breach?.effective_threshold?.max_value ===
                    "number" ? (
                      <ReferenceLine
                        y={breach.effective_threshold.max_value}
                        strokeDasharray="6 4"
                        strokeWidth={2}
                        label={{ value: "MAX", position: "insideTopLeft" }}
                      />
                    ) : null}

                    <Line
                      type="monotone"
                      dataKey="value"
                      dot={false}
                      strokeWidth={2}
                      name="Forecast"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "var(--muted)",
                  lineHeight: 1.55,
                }}
              >
                <b>Rationale:</b>{" "}
                {breach?.breach?.rationale || breach?.breach?.reason || "—"}
              </div>
            </div>
          )}
        </Card>

        {/* Patterns */}
        <Card
          title="Daily Pattern Detection"
          subtitle="Detect recurring peaks/troughs and daily variation"
          accent="slate"
          right={
            patterns?.daily_pattern?.significant ? (
              <Badge tone="warn">SIGNIFICANT</Badge>
            ) : (
              <Badge tone="neutral">—</Badge>
            )
          }
        >
          {!patterns ? (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              Run <b>Patterns</b> to detect peak/trough periods over the
              selected days.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div
                style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.55 }}
              >
                {patterns?.daily_pattern?.description ||
                  patterns?.message ||
                  "—"}
              </div>

              <details>
                <summary
                  style={{ cursor: "pointer", fontWeight: 950, fontSize: 12 }}
                >
                  Raw JSON
                </summary>
                <pre
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    background: "#0b1220",
                    color: "#e5e7eb",
                    borderRadius: 14,
                    padding: 12,
                    overflowX: "auto",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {JSON.stringify(patterns, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </Card>

        {/* Fleet Maintenance */}
        <Card
          title="Fleet Maintenance Plan"
          subtitle="Rank devices needing attention"
          accent="slate"
          right={
            maintenance ? (
              <Badge tone="neutral">
                Devices {maintenance.devices_analyzed ?? "—"}
              </Badge>
            ) : (
              <Badge tone="neutral">—</Badge>
            )
          }
          style={{ gridColumn: "1 / -1" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              alignItems: "center",
            }}
          >
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              Generates a ranked list based on observed degradation risk
              factors.
            </div>
            <Button
              variant="secondary"
              onClick={() => runMaintenance()}
              disabled={!!loading}
            >
              {loading === "maintenance" ? "Running…" : "Run Fleet Maintenance"}
            </Button>
          </div>

          {!maintenance ? (
            <div style={{ marginTop: 10, fontSize: 13, color: "var(--muted)" }}>
              Run to generate a maintenance schedule (offline-safe).
            </div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div style={{ fontSize: 13, color: "var(--text)" }}>
                Devices needing maintenance:{" "}
                <b>{maintenance.devices_needing_maintenance ?? "—"}</b> • High:{" "}
                <b>{maintenance.priority_breakdown?.high ?? 0}</b> • Medium:{" "}
                <b>{maintenance.priority_breakdown?.medium ?? 0}</b> • Low:{" "}
                <b>{maintenance.priority_breakdown?.low ?? 0}</b>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: 10,
                }}
              >
                {(maintenance.maintenance_plan || [])
                  .slice(0, 6)
                  .map((m: any, i: number) => (
                    <div
                      key={i}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 16,
                        padding: 12,
                        background: "rgba(255,255,255,0.8)",
                        boxShadow: "var(--shadow-sm)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          alignItems: "center",
                        }}
                      >
                        <div style={{ fontWeight: 950 }}>{m.device_id}</div>
                        <Badge
                          tone={
                            riskTone(
                              m.priority === "high"
                                ? "high"
                                : m.priority === "medium"
                                  ? "medium"
                                  : "low",
                            ) as any
                          }
                        >
                          {String(m.priority || "—").toUpperCase()} •{" "}
                          {m.maintenance_score ?? "—"}
                        </Badge>
                      </div>
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 13,
                          color: "var(--text)",
                          lineHeight: 1.55,
                        }}
                      >
                        {m.recommended_action || "—"}
                      </div>
                      {Array.isArray(m.factors) && m.factors.length > 0 ? (
                        <ul
                          style={{
                            marginTop: 8,
                            paddingLeft: 18,
                            color: "var(--muted)",
                            fontSize: 13,
                          }}
                        >
                          {m.factors
                            .slice(0, 4)
                            .map((f: string, idx: number) => (
                              <li key={idx}>{f}</li>
                            ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
              </div>

              <details>
                <summary
                  style={{ cursor: "pointer", fontWeight: 950, fontSize: 12 }}
                >
                  Raw JSON
                </summary>
                <pre
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    background: "#0b1220",
                    color: "#e5e7eb",
                    borderRadius: 14,
                    padding: 12,
                    overflowX: "auto",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {JSON.stringify(maintenance, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </Card>
      </div>

      {/* Early Warning Inbox */}
      <Card
        title="Early Warning Inbox"
        subtitle="Fleet scan ranked by predicted threshold breach risk"
        accent="blue"
        right={
          fleetScan ? (
            <Badge tone="neutral">
              {fleetScan.returned}/{fleetScan.total_devices} •{" "}
              {fmtTs(fleetScan.generated_at)}
            </Badge>
          ) : (
            <Badge tone="neutral">—</Badge>
          )
        }
      >
        {!fleetScan ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            Click <b>Scan Fleet</b> to populate the early warning inbox.
          </div>
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
                <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                  <th style={{ padding: "10px 0" }}>Device</th>
                  <th style={{ padding: "10px 0" }}>Risk</th>
                  <th style={{ padding: "10px 0" }}>ETA</th>
                  <th style={{ padding: "10px 0" }}>Current</th>
                  <th style={{ padding: "10px 0" }}>Slope/h</th>
                  <th style={{ padding: "10px 0" }}>Min</th>
                  <th style={{ padding: "10px 0" }}>Max</th>
                  <th style={{ padding: "10px 0" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {(fleetScan.items || []).length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      style={{ padding: 12, color: "var(--muted)" }}
                    >
                      No results.
                    </td>
                  </tr>
                ) : (
                  (fleetScan.items || []).map((it: any) => {
                    const tone = riskTone(it?.risk?.risk_level);
                    const will = !!it?.breach?.will_breach;
                    const eta = will ? it?.breach?.eta_hours : null;

                    return (
                      <tr
                        key={it.device_id}
                        style={{ borderTop: "1px solid var(--border)" }}
                      >
                        <td style={{ padding: "10px 0", fontWeight: 950 }}>
                          {it.device_id}
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--muted)",
                              fontWeight: 700,
                            }}
                          >
                            {it.node_name || "—"}
                          </div>
                        </td>

                        <td style={{ padding: "10px 0" }}>
                          <Badge tone={tone as any}>
                            {String(it?.risk?.risk_level || "—").toUpperCase()}{" "}
                            • {it?.risk?.risk_score ?? "—"}/100
                          </Badge>
                        </td>

                        <td style={{ padding: "10px 0", fontWeight: 900 }}>
                          {eta == null ? "—" : `${eta}h`}
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--muted)",
                              fontWeight: 700,
                            }}
                          >
                            {it?.breach?.breach_at
                              ? fmtTs(it.breach.breach_at)
                              : ""}
                          </div>
                        </td>

                        <td style={{ padding: "10px 0" }}>
                          {it.current_value ?? "—"}
                        </td>
                        <td style={{ padding: "10px 0" }}>
                          {typeof it.slope_per_hour === "number"
                            ? it.slope_per_hour.toFixed(3)
                            : "—"}
                        </td>
                        <td style={{ padding: "10px 0" }}>
                          {it?.threshold?.min_value ?? "—"}
                        </td>
                        <td style={{ padding: "10px 0" }}>
                          {it?.threshold?.max_value ?? "—"}
                        </td>

                        <td style={{ padding: "10px 0" }}>
                          <Button
                            variant="primary"
                            onClick={() => {
                              setDeviceId(it.device_id);
                              setTimeout(() => {
                                runBreach();
                                runForecast();
                                runRisk();
                                runPatterns();
                              }, 50);
                            }}
                          >
                            Open
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
