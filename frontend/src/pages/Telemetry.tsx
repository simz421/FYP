// src/pages/Telemetry.tsx
import { useEffect, useMemo, useState } from "react";
import Card from "../ui/Card";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Select from "../ui/Select";

import { fetchTelemetry } from "../api/telemetry";
import { fetchDevices } from "../api/devices";
import type { Device, SensorReading } from "../types/api";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

import {
  mean,
  min,
  max,
  classifyTrend,
  countAnomalies,
  pctChange,
} from "../utils/analytics";

import { generateSmartInsight } from "../utils/insightsRules";

function formatTs(ts?: string | null) {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString();
  } catch {
    return ts;
  }
}

type BucketMode = "2h" | "day";

function getSensorUnit(sensorType: string) {
  const key = sensorType.toLowerCase().trim();
  const map: Record<string, { label: string; unit: string }> = {
    temperature: { label: "Temperature", unit: "°C" },
    humidity: { label: "Humidity", unit: "%" },
    soil_moisture: { label: "Soil Moisture", unit: "raw" }, // switch to "%" if your sensor outputs %
    ph: { label: "pH", unit: "pH" },
    light: { label: "Light", unit: "lux" },
    ec: { label: "EC", unit: "mS/cm" },
  };
  return map[key] ?? { label: sensorType || "Value", unit: "" };
}

function parseReadingTime(r: SensorReading) {
  const ts = r.created_at || r.timestamp;
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function bucketKey(d: Date, mode: BucketMode) {
  const x = new Date(d);
  if (mode === "day") {
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  }
  const hr = x.getHours();
  const bucketHr = Math.floor(hr / 2) * 2;
  x.setHours(bucketHr, 0, 0, 0);
  return x.getTime();
}

function formatBucketLabel(ms: number, mode: BucketMode) {
  const d = new Date(ms);
  if (mode === "day") return d.toLocaleDateString();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function buildAggregatedSeries(rows: SensorReading[], rangeDays: number) {
  const mode: BucketMode = rangeDays === 1 ? "2h" : "day";
  const buckets = new Map<number, { sum: number; count: number }>();

  for (const r of rows) {
    if (typeof r.value !== "number") continue;
    const d = parseReadingTime(r);
    if (!d) continue;
    const k = bucketKey(d, mode);
    const cur = buckets.get(k) ?? { sum: 0, count: 0 };
    cur.sum += r.value;
    cur.count += 1;
    buckets.set(k, cur);
  }

  let points = Array.from(buckets.entries())
    .map(([k, v]) => ({
      t: k,
      label: formatBucketLabel(k, mode),
      avg: Number((v.sum / Math.max(v.count, 1)).toFixed(2)),
      n: v.count,
    }))
    .sort((a, b) => a.t - b.t);

  // If All time, keep UI readable
  if (rangeDays === 0 && points.length > 60) {
    points = points.slice(points.length - 60);
  }

  return { mode, points };
}

function severityTone(sev?: string) {
  const s = String(sev || "").toLowerCase();
  if (s.includes("crit")) return "bad";
  if (s.includes("warn")) return "warn";
  return "info";
}

export default function TelemetryPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [rows, setRows] = useState<SensorReading[]>([]);
  const [allRows, setAllRows] = useState<SensorReading[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [sensorType, setSensorType] = useState<string>("");
  const [limit, setLimit] = useState<number>(50);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rangeDays, setRangeDays] = useState<number>(7);

  const [source, setSource] = useState<string>("—");
  const [insightNote, setInsightNote] = useState<string>("");

  const sensorTypeOptions = useMemo(() => {
    const set = new Set<string>();
    allRows.forEach((r: any) => {
      const v = (r.sensor_type ?? r.parameter ?? "").toString().trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort();
  }, [allRows]);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const d = await fetchDevices();
      setDevices((Array.isArray(d.data) ? d.data : []) as Device[]);

      const all = await fetchTelemetry({});
      setAllRows(Array.isArray(all.data) ? all.data : []);
      setSource(all.usedPath);

      const extendedRange = rangeDays === 0 ? 0 : rangeDays * 2;

      const t = await fetchTelemetry({
        deviceId: deviceId || undefined,
        sensorType: sensorType || undefined,
        limit,
        rangeDays: extendedRange,
      });

      setRows(Array.isArray(t.data) ? t.data : []);
    } catch (e: unknown) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Failed to load telemetry");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = rows.length;

  const chartMeta = useMemo(() => {
    if (!sensorType) {
      return {
        canPlot: false,
        xLabel: "Time",
        yLabel: "Value",
        unit: "",
        mode: "day" as const,
        points: [] as Array<{
          t: number;
          label: string;
          avg: number;
          n: number;
        }>,
      };
    }

    const { label, unit } = getSensorUnit(sensorType);
    const { mode, points } = buildAggregatedSeries(rows, rangeDays);

    const xLabel =
      rangeDays === 1 ? "Time (2-hour averages)" : "Days (daily averages)";

    const yLabel = unit ? `${label} (${unit})` : label;

    return { canPlot: true, xLabel, yLabel, unit, mode, points };
  }, [rows, sensorType, rangeDays]);

  const compareSeries = useMemo(() => {
    if (!sensorType || rangeDays === 0) return null;

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    const currentSince = now - rangeDays * oneDayMs;
    const previousSince = now - rangeDays * 2 * oneDayMs;

    const currentPoints = chartMeta.points.filter((p) => p.t >= currentSince);
    const prevPointsRaw = chartMeta.points.filter(
      (p) => p.t >= previousSince && p.t < currentSince,
    );

    const shiftMs = rangeDays * oneDayMs;
    const prevPointsAligned = prevPointsRaw.map((p) => ({
      ...p,
      t: p.t + shiftMs,
      label: p.label,
    }));

    type ComparePoint = {
      t: number;
      label: string;
      currentAvg?: number;
      prevAvg?: number;
    };

    const byT = new Map<number, ComparePoint>();
    for (const p of currentPoints) {
      byT.set(p.t, { t: p.t, label: p.label, currentAvg: p.avg });
    }
    for (const p of prevPointsAligned) {
      const existing = byT.get(p.t) || { t: p.t, label: p.label };
      existing.prevAvg = p.avg;
      byT.set(p.t, existing);
    }

    const merged = Array.from(byT.values()).sort((a, b) => a.t - b.t);

    return { merged, hasPrev: prevPointsAligned.length > 0 };
  }, [sensorType, rangeDays, chartMeta.points]);

  const insights = useMemo(() => {
    if (!sensorType) return null;

    const canCompare = rangeDays !== 0;
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    const currentSince = rangeDays === 0 ? 0 : now - rangeDays * oneDayMs;
    const previousSince = rangeDays === 0 ? 0 : now - rangeDays * 2 * oneDayMs;

    const currentPoints =
      rangeDays === 0
        ? chartMeta.points
        : chartMeta.points.filter((p) => p.t >= currentSince);

    const previousPoints =
      rangeDays === 0
        ? []
        : chartMeta.points.filter(
            (p) => p.t >= previousSince && p.t < currentSince,
          );

    const currentVals = currentPoints.map((p) => p.avg);
    const prevVals = previousPoints.map((p) => p.avg);

    const currentAvg = mean(currentVals);
    const currentMin = min(currentVals);
    const currentMax = max(currentVals);
    const prevAvg = mean(prevVals);

    const change = canCompare ? pctChange(currentAvg, prevAvg) : null;
    const trend = classifyTrend(currentVals, 0.03);
    const anomalies = countAnomalies(currentVals, 2.0);

    let note = "";
    if (!currentVals.length) {
      note = "No data available for this selection.";
    } else if (!canCompare) {
      note = `Trend is ${trend}. Detected ${anomalies} anomaly bucket(s) in the visible window.`;
    } else {
      const changeText =
        change === null
          ? "No previous baseline."
          : change > 0
            ? `Average increased by ${change.toFixed(1)}% vs previous period.`
            : change < 0
              ? `Average decreased by ${Math.abs(change).toFixed(1)}% vs previous period.`
              : "Average unchanged vs previous period.";

      note = `${changeText} Trend is ${trend}. Detected ${anomalies} anomaly bucket(s).`;
    }

    const smart = generateSmartInsight({
      sensorType,
      unit: chartMeta.unit,
      avg: currentAvg,
      min: currentMin,
      max: currentMax,
      changePct: change,
      trend,
      anomalies,
    });

    return {
      currentAvg,
      currentMin,
      currentMax,
      prevAvg,
      change,
      trend,
      anomalies,
      note,
      smart,
      bucketCount: currentVals.length,
      compareBucketCount: prevVals.length,
    };
  }, [sensorType, rangeDays, chartMeta.points, chartMeta.unit]);

  useEffect(() => {
    if (insights?.note) setInsightNote(insights.note);
  }, [insights?.note]);

  const trendLabel =
    insights?.trend === "rising"
      ? "↑ Rising"
      : insights?.trend === "falling"
        ? "↓ Falling"
        : "→ Stable";

  return (
    <div>
      {/* Toolbar header */}
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
              Telemetry
            </h2>
            <Badge tone="neutral">Analytics Console</Badge>
            {loading ? (
              <Badge tone="info">LOADING…</Badge>
            ) : (
              <Badge tone="good">READY</Badge>
            )}
            {error ? <Badge tone="bad">ERROR</Badge> : null}
          </div>
          <div className="nms-subtitle" style={{ marginTop: 6 }}>
            Time-series insights • Offline-first data access • Aggregated views
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={() => load()} disabled={loading}>
            Refresh
          </Button>
          <Button variant="primary" onClick={() => load()} disabled={loading}>
            {loading ? "Loading…" : "Apply"}
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error ? (
        <Card
          title="Error"
          subtitle="Fix the issue and retry."
          accent="red"
          style={{ marginBottom: 12 }}
        >
          <div style={{ fontSize: 13, fontWeight: 950, color: "#9f1239" }}>
            {error}
          </div>
        </Card>
      ) : null}

      {/* Top grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(380px, 0.95fr) minmax(420px, 1.25fr)",
          gap: 12,
          marginBottom: 12,
        }}
      >
        {/* Filters */}
        <Card
          title="Filters"
          subtitle="Select scope and refresh to load telemetry"
          accent="blue"
          right={<Badge tone="neutral">Source: {source}</Badge>}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}>
                Device
              </div>
              <Select
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
              >
                <option value="">All devices</option>
                {(devices ?? []).map((d) => (
                  <option
                    key={(d as any).id ?? d.device_id}
                    value={d.device_id || ""}
                  >
                    {d.device_id} ({(d as any).status || "—"})
                  </option>
                ))}
              </Select>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}>
                Sensor type
              </div>
              <Select
                value={sensorType}
                onChange={(e) => setSensorType(e.target.value)}
              >
                <option value="">All sensors</option>
                {sensorTypeOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Tip: select a sensor type to enable chart + analytics.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <div style={{ display: "grid", gap: 6 }}>
                <div
                  style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}
                >
                  Limit
                </div>
                <Select
                  value={String(limit)}
                  onChange={(e) => setLimit(Number(e.target.value))}
                >
                  {[10, 20, 50, 100, 200].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div
                  style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}
                >
                  Time range
                </div>
                <Select
                  value={String(rangeDays)}
                  onChange={(e) => setRangeDays(Number(e.target.value))}
                >
                  <option value="1">Today (24h)</option>
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="0">All time</option>
                </Select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                variant="primary"
                onClick={() => load()}
                disabled={loading}
              >
                {loading ? "Loading…" : "Apply"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setDeviceId("");
                  setSensorType("");
                  setLimit(50);
                  setRangeDays(7);
                }}
                disabled={loading}
              >
                Reset
              </Button>
            </div>
          </div>
        </Card>

        {/* KPI Summary */}
        <Card
          title="Snapshot"
          subtitle="Quick operational view of the selection"
          accent="slate"
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 10,
            }}
          >
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
                style={{ fontSize: 12, color: "var(--muted)", fontWeight: 900 }}
              >
                Rows loaded
              </div>
              <div style={{ fontSize: 22, fontWeight: 950 }}>{total}</div>
            </div>

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
                style={{ fontSize: 12, color: "var(--muted)", fontWeight: 900 }}
              >
                Chart buckets
              </div>
              <div style={{ fontSize: 22, fontWeight: 950 }}>
                {sensorType ? chartMeta.points.length : "—"}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {sensorType
                  ? chartMeta.mode === "2h"
                    ? "2-hour avg"
                    : "Daily avg"
                  : "Select sensor"}
              </div>
            </div>

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
                style={{ fontSize: 12, color: "var(--muted)", fontWeight: 900 }}
              >
                Trend
              </div>
              <div style={{ fontSize: 18, fontWeight: 950 }}>
                {sensorType && insights ? trendLabel : "—"}
              </div>
              <div style={{ marginTop: 6 }}>
                {sensorType && insights ? (
                  <Badge
                    tone={
                      insights.trend === "rising"
                        ? "warn"
                        : insights.trend === "falling"
                          ? "info"
                          : "good"
                    }
                  >
                    {String(insights.trend).toUpperCase()}
                  </Badge>
                ) : (
                  <Badge tone="neutral">N/A</Badge>
                )}
              </div>
            </div>

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
                style={{ fontSize: 12, color: "var(--muted)", fontWeight: 900 }}
              >
                Anomalies
              </div>
              <div style={{ fontSize: 22, fontWeight: 950 }}>
                {sensorType && insights ? insights.anomalies : "—"}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                z-score buckets
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Insights */}
      <Card
        title="Insights"
        subtitle="Interpretable analytics for thesis + NOC workflow"
        accent="blue"
        style={{ marginBottom: 12 }}
      >
        {!sensorType ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Select a <b>sensor type</b> to generate analytics insights.
          </div>
        ) : !insights ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            No insights available.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: 10,
              }}
            >
              <div
                style={{
                  padding: 12,
                  borderRadius: 16,
                  border: "1px solid var(--border)",
                  background: "rgba(15,23,42,0.03)",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    fontWeight: 900,
                  }}
                >
                  Avg
                </div>
                <div style={{ fontSize: 22, fontWeight: 950 }}>
                  {insights.currentAvg.toFixed(2)} {chartMeta.unit}
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 16,
                  border: "1px solid var(--border)",
                  background: "rgba(15,23,42,0.03)",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    fontWeight: 900,
                  }}
                >
                  Min
                </div>
                <div style={{ fontSize: 22, fontWeight: 950 }}>
                  {insights.currentMin.toFixed(2)} {chartMeta.unit}
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 16,
                  border: "1px solid var(--border)",
                  background: "rgba(15,23,42,0.03)",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    fontWeight: 900,
                  }}
                >
                  Max
                </div>
                <div style={{ fontSize: 22, fontWeight: 950 }}>
                  {insights.currentMax.toFixed(2)} {chartMeta.unit}
                </div>
              </div>

              {rangeDays !== 0 ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 16,
                    border: "1px solid var(--border)",
                    background: "rgba(15,23,42,0.03)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      fontWeight: 900,
                    }}
                  >
                    Change vs prev
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 950 }}>
                    {insights.change === null
                      ? "—"
                      : `${insights.change.toFixed(1)}%`}
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 16,
                    border: "1px solid var(--border)",
                    background: "rgba(15,23,42,0.03)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      fontWeight: 900,
                    }}
                  >
                    Window
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 950 }}>All-time</div>
                </div>
              )}
            </div>

            <div
              style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.55 }}
            >
              <b>Interpretation:</b> {insightNote}
            </div>

            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Buckets used:{" "}
              <b style={{ color: "var(--text)" }}>{insights.bucketCount}</b>
              {rangeDays !== 0 ? (
                <>
                  {" "}
                  • Previous period buckets:{" "}
                  <b style={{ color: "var(--text)" }}>
                    {insights.compareBucketCount}
                  </b>
                </>
              ) : null}
            </div>

            {insights.smart ? (
              <div
                style={{
                  borderRadius: 18,
                  border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.8)",
                  boxShadow: "var(--shadow-md)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "8px 12px",
                    background:
                      insights.smart.severity === "critical"
                        ? "rgba(17,24,39,0.95)"
                        : insights.smart.severity === "warning"
                          ? "rgba(245,158,11,0.18)"
                          : "rgba(59,130,246,0.14)",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div style={{ fontWeight: 950 }}>
                    {insights.smart.severity === "critical"
                      ? "🚨 "
                      : insights.smart.severity === "warning"
                        ? "⚠️ "
                        : "ℹ️ "}
                    {insights.smart.headline}
                  </div>
                  <Badge tone={severityTone(insights.smart.severity) as any}>
                    {String(insights.smart.severity || "info").toUpperCase()}
                  </Badge>
                </div>
                <div
                  style={{
                    padding: 12,
                    color: "var(--text)",
                    lineHeight: 1.55,
                  }}
                >
                  {insights.smart.message}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      {/* Chart */}
      <Card
        title="Chart"
        subtitle="Aggregated averages (offline-friendly) with optional previous-period overlay"
        accent="slate"
        style={{ marginBottom: 12 }}
      >
        {!sensorType ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Select a <b>sensor type</b> to plot. (We don’t mix multiple sensors
            on one chart.)
          </div>
        ) : (
          <>
            <div
              style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}
            >
              Showing{" "}
              <b style={{ color: "var(--text)" }}>
                {chartMeta.mode === "2h" ? "2-hour averages" : "daily averages"}
              </b>{" "}
              for <b style={{ color: "var(--text)" }}>{sensorType}</b>
              {rangeDays === 0 ? (
                <>
                  {" "}
                  • <span>All time selected (rendering last 60 days)</span>
                </>
              ) : null}
            </div>

            <div style={{ width: "100%", height: 320 }}>
              {chartMeta.points.length < 2 ? (
                <div style={{ color: "var(--muted)" }}>
                  Not enough points to plot (need at least 2 buckets).
                </div>
              ) : (
                <ResponsiveContainer>
                  <LineChart
                    data={compareSeries?.merged ?? chartMeta.points}
                    margin={{ top: 10, right: 18, left: 0, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 12 }}
                      label={{
                        value: chartMeta.xLabel,
                        position: "insideBottom",
                        offset: -10,
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      label={{
                        value: chartMeta.yLabel,
                        angle: -90,
                        position: "insideLeft",
                      }}
                    />
                    <Tooltip
                      formatter={(value?: number | string) => {
                        if (value === undefined) return "—";
                        const v =
                          typeof value === "number" ? value : Number(value);
                        const text = Number.isFinite(v)
                          ? v.toString()
                          : String(value);
                        return chartMeta.unit
                          ? `${text} ${chartMeta.unit}`
                          : text;
                      }}
                      labelFormatter={(label?: any) =>
                        `Bucket: ${label ?? "—"}`
                      }
                    />

                    <Line
                      type="monotone"
                      dataKey={compareSeries ? "currentAvg" : "avg"}
                      dot={false}
                      strokeWidth={2}
                      name="Current"
                    />

                    {compareSeries?.hasPrev ? (
                      <Line
                        type="monotone"
                        dataKey="prevAvg"
                        dot={false}
                        strokeWidth={2}
                        name="Previous"
                        strokeDasharray="6 4"
                      />
                    ) : null}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        )}
      </Card>

      {/* Table */}
      <Card
        title="Readings Table"
        subtitle="Raw readings under current filter"
        accent="slate"
      >
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}
          >
            <thead>
              <tr style={{ color: "var(--muted)" }}>
                <th style={{ textAlign: "left", padding: "10px 0" }}>Time</th>
                <th style={{ textAlign: "left", padding: "10px 0" }}>Device</th>
                <th style={{ textAlign: "left", padding: "10px 0" }}>Sensor</th>
                <th style={{ textAlign: "left", padding: "10px 0" }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{ padding: 12, color: "var(--muted)" }}
                  >
                    No data (try clearing filters).
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    style={{ borderTop: "1px solid var(--border)" }}
                  >
                    <td style={{ padding: "10px 0", color: "var(--muted)" }}>
                      {formatTs(r.created_at || r.timestamp)}
                    </td>
                    <td style={{ padding: "10px 0", fontWeight: 900 }}>
                      {r.device_id}
                    </td>
                    <td style={{ padding: "10px 0" }}>
                      {(r as any).parameter ?? r.sensor_type}
                    </td>
                    <td style={{ padding: "10px 0", fontWeight: 950 }}>
                      {r.value}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
