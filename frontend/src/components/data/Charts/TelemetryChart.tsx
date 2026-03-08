// src/components/data/Charts/TelemetryChart.tsx
import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

/**
 * A resilient, "drop-in" TelemetryChart component.
 * - Works even if caller props differ (dataKey/series/valueKey/etc.)
 * - Prevents build breaks when the project expects this file to exist.
 */

type AnyObj = Record<string, any>;

export type TelemetrySeries = {
  /** label shown in legend */
  name: string;
  /** key inside each data row */
  key: string;
  /** optional: force line type */
  type?: "monotone" | "linear" | "step" | "stepBefore" | "stepAfter";
};

export type TelemetryChartProps = {
  title?: string;
  subtitle?: string;

  /** main dataset */
  data?: AnyObj[];

  /**
   * If you pass series, chart will draw multiple lines:
   *   series=[{name:"Temp", key:"temperature"}, ...]
   */
  series?: TelemetrySeries[];

  /**
   * If you only have one line:
   * - dataKey OR valueKey can be used
   */
  dataKey?: string;
  valueKey?: string;

  /**
   * X key:
   * - defaults to "ts", then "timestamp", then "time", then "created_at"
   */
  xKey?: string;

  /** units appended to tooltip & y-axis ticks (e.g. °C, %, pH) */
  unit?: string;

  /** height in px for container */
  height?: number;

  /** show legend */
  showLegend?: boolean;

  /** Optional formatters */
  formatX?: (v: any) => string;
  formatY?: (v: any) => string;

  /** if true, show dots on line points */
  showDots?: boolean;
};

function pickXKey(sample: AnyObj | undefined, preferred?: string) {
  if (!sample) return preferred || "ts";
  if (preferred && preferred in sample) return preferred;
  const candidates = ["ts", "timestamp", "time", "created_at", "date", "x"];
  for (const k of candidates) if (k in sample) return k;
  return preferred || "ts";
}

function pickYKey(sample: AnyObj | undefined, preferred?: string) {
  if (!sample) return preferred || "value";
  if (preferred && preferred in sample) return preferred;

  // common telemetry keys
  const candidates = ["value", "avg", "mean", "reading", "y"];
  for (const k of candidates) if (k in sample) return k;

  // fallback: first numeric-like field
  for (const [k, v] of Object.entries(sample)) {
    if (typeof v === "number") return k;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)))
      return k;
  }

  return preferred || "value";
}

function safeNum(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function defaultFormatX(v: any) {
  if (v === null || v === undefined) return "";
  // If looks like ISO date, shorten it
  if (typeof v === "string") {
    const s = v;
    // ISO-ish
    if (s.includes("T") && s.includes(":"))
      return s.replace("T", " ").slice(0, 16);
    return s;
  }
  return String(v);
}

function defaultFormatY(v: any, unit?: string) {
  const n = safeNum(v);
  if (n === null) return "";
  // keep short
  const rounded = Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2);
  return unit ? `${rounded} ${unit}` : rounded;
}

export default function TelemetryChart(props: TelemetryChartProps) {
  const {
    title,
    subtitle,
    data = [],
    series,
    dataKey,
    valueKey,
    xKey,
    unit,
    height = 260,
    showLegend = true,
    formatX,
    formatY,
    showDots = false,
  } = props;

  const sample = data[0];

  const resolvedXKey = useMemo(() => pickXKey(sample, xKey), [sample, xKey]);

  const resolvedSingleYKey = useMemo(
    () => pickYKey(sample, dataKey || valueKey),
    [sample, dataKey, valueKey],
  );

  const resolvedSeries: TelemetrySeries[] = useMemo(() => {
    if (series && series.length) return series;

    // If caller didn’t pass series, draw a single series using resolvedSingleYKey
    return [
      { name: title || resolvedSingleYKey || "value", key: resolvedSingleYKey },
    ];
  }, [series, resolvedSingleYKey, title]);

  const xFormatter = formatX || defaultFormatX;
  const yFormatter = (v: any) =>
    formatY ? formatY(v) : defaultFormatY(v, unit);

  // ensure chart doesn't crash on weird values
  const cleaned = useMemo(() => {
    return (data || []).map((row) => {
      const out: AnyObj = { ...row };
      // coerce y keys
      for (const s of resolvedSeries) {
        out[s.key] = safeNum(row?.[s.key]);
      }
      return out;
    });
  }, [data, resolvedSeries]);

  return (
    <div style={{ width: "100%" }}>
      {(title || subtitle) && (
        <div style={{ marginBottom: 10 }}>
          {title && (
            <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
          )}
          {subtitle && (
            <div style={{ opacity: 0.7, fontSize: 12 }}>{subtitle}</div>
          )}
        </div>
      )}

      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={cleaned}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey={resolvedXKey}
              tickFormatter={xFormatter}
              minTickGap={18}
            />
            <YAxis tickFormatter={(v) => yFormatter(v)} width={64} />
            <Tooltip
              formatter={(v: any) => yFormatter(v)}
              labelFormatter={(v: any) => xFormatter(v)}
            />
            {showLegend && <Legend />}

            {resolvedSeries.map((s, idx) => (
              <Line
                key={`${s.key}-${idx}`}
                type={s.type || "monotone"}
                dataKey={s.key}
                name={s.name}
                dot={showDots}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Named export too (in case some files import { TelemetryChart })
export { TelemetryChart };
