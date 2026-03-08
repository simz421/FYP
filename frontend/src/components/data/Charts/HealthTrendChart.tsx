// frontend/src/components/data/Charts/HealthTrendChart.tsx
import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export type HealthTrendPoint = {
  ts: string; // ISO-ish
  label: string; // "14:00"
  health_score: number; // 0..100
  online_pct?: number; // 0..100
  delivery_pct?: number; // 0..100
  avg_rssi?: number | null;
  active_alerts?: number;
};

function toLabel(ts: string) {
  try {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    return `${hh}:00`;
  } catch {
    return ts;
  }
}

function clamp01to100(x: any): number | null {
  if (x == null) return null;
  const n = typeof x === "number" ? x : Number(x);
  if (!Number.isFinite(n)) return null;
  if (n <= 1) return Math.round(n * 100);
  return Math.round(n);
}

export default function HealthTrendChart({
  data,
  height = 220,
}: {
  data: HealthTrendPoint[];
  height?: number;
}) {
  const safe = useMemo(() => {
    const arr = Array.isArray(data) ? data : [];
    return arr
      .filter((p) => p && typeof p.health_score === "number")
      .map((p) => ({
        ...p,
        label: p.label || toLabel(p.ts),
        health_score: Math.max(0, Math.min(100, Math.round(p.health_score))),
        online_pct: clamp01to100(p.online_pct),
        delivery_pct: clamp01to100(p.delivery_pct),
      }));
  }, [data]);

  if (!safe.length) {
    return (
      <div style={{ opacity: 0.85, fontSize: 12 }}>No trend data yet.</div>
    );
  }

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={safe}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              background: "rgba(0,0,0,0.85)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              color: "#e5e7eb",
              fontSize: 12,
            }}
            labelStyle={{ color: "#e5e7eb", fontWeight: 800 }}
            formatter={(value: any, name: any, props: any) => {
              const p = props?.payload as HealthTrendPoint;
              if (name === "health_score") return [`${value}%`, "Health"];
              return [String(value), String(name)];
            }}
            labelFormatter={(label: any) => `Hour: ${label}`}
          />

          <Line
            type="monotone"
            dataKey="health_score"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      <div style={{ marginTop: 8, fontSize: 11, opacity: 0.8 }}>
        Health score is normalized to 0–100 per hour (last 24h).
      </div>
    </div>
  );
}
