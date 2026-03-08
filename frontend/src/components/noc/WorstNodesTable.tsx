import React from "react";
import type { EnhancedTopology } from "../../api/routing";

function rssiRank(rssi: number | null) {
  if (rssi == null) return 0;
  if (rssi >= -60) return 4;
  if (rssi >= -70) return 3;
  if (rssi >= -80) return 2;
  return 1;
}

function deliveryPercentToNumber(s: string | undefined) {
  if (!s) return null;
  const m = String(s).match(/([\d.]+)/);
  if (!m) return null;
  return Number(m[1]);
}

export default function WorstNodesTable({
  topology,
  onSelect,
  maxRows = 8,
}: {
  topology: EnhancedTopology | null;
  onSelect: (deviceId: string) => void;
  maxRows?: number;
}) {
  const nodes = topology?.nodes ?? [];

  const ranked = [...nodes]
    .filter((n) => n.type !== "gateway")
    .map((n) => {
      const delivery = deliveryPercentToNumber(n.health?.delivery_rate) ?? 100;
      const rssi = n.signal?.rssi ?? null;
      const latency = (() => {
        // derive avg latency from links adjacent to node if available
        const links = topology?.links ?? [];
        const adj = links.filter((l) => l.from === n.id || l.to === n.id);
        const vals = adj
          .map((l) => l.latency)
          .filter((x): x is number => typeof x === "number");
        if (!vals.length) return null;
        return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      })();

      return {
        ...n,
        _delivery: delivery,
        _rssiRank: rssiRank(rssi),
        _latency: latency,
      };
    })
    .sort((a, b) => {
      // worst first:
      // offline > online
      const ao = (a.status || "").toLowerCase() === "offline" ? 1 : 0;
      const bo = (b.status || "").toLowerCase() === "offline" ? 1 : 0;
      if (bo !== ao) return bo - ao;

      // low delivery rate first
      if (a._delivery !== b._delivery) return a._delivery - b._delivery;

      // low RSSI first
      if (a._rssiRank !== b._rssiRank) return a._rssiRank - b._rssiRank;

      // high latency first (null last)
      const al = a._latency ?? -1;
      const bl = b._latency ?? -1;
      return bl - al;
    })
    .slice(0, maxRows);

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: 12, borderBottom: "1px solid #f3f4f6" }}>
        <div style={{ fontWeight: 900 }}>Worst Nodes Watchlist</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
          Ranked by offline → delivery rate → RSSI → latency
        </div>
      </div>

      <table
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
      >
        <thead>
          <tr
            style={{
              textAlign: "left",
              background: "#f9fafb",
              color: "#6b7280",
            }}
          >
            <th style={{ padding: "10px 12px" }}>Device</th>
            <th style={{ padding: "10px 12px" }}>Status</th>
            <th style={{ padding: "10px 12px" }}>Delivery</th>
            <th style={{ padding: "10px 12px" }}>RSSI</th>
            <th style={{ padding: "10px 12px" }}>Latency</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((n) => (
            <tr
              key={n.device_id}
              onClick={() => onSelect(n.device_id)}
              style={{ borderTop: "1px solid #f3f4f6", cursor: "pointer" }}
            >
              <td style={{ padding: "10px 12px", fontWeight: 900 }}>
                {n.device_id}
                <div
                  style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}
                >
                  {n.name}
                </div>
              </td>
              <td style={{ padding: "10px 12px" }}>{n.status}</td>
              <td style={{ padding: "10px 12px" }}>
                {n.health?.delivery_rate ?? "—"}
              </td>
              <td style={{ padding: "10px 12px" }}>{n.signal?.rssi ?? "—"}</td>
              <td style={{ padding: "10px 12px" }}>
                {n._latency != null ? `${n._latency}ms` : "—"}
              </td>
            </tr>
          ))}

          {!ranked.length && (
            <tr>
              <td colSpan={5} style={{ padding: 12, color: "#6b7280" }}>
                No sensor nodes found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
