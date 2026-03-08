// src/components/network/TopologyGraph.tsx
import React, { useMemo, useState } from "react";
import type {
  EnhancedNode,
  EnhancedTopology,
  EnhancedLink,
} from "../../api/network";

type Props = {
  topology: EnhancedTopology | null;
  selectedNodeId: number | null;
  onSelectNode: (n: EnhancedNode) => void;

  // Pro mode extensions
  proMode?: boolean;
  showLinkLabels?: boolean;
  showStatusBadges?: boolean;
  showAlertBadges?: boolean;

  nodeAlertCounts?: Record<string, number>;

  onSelectLink?: (l: EnhancedLink) => void;
  selectedLinkId?: number | null;
};

type Pos = { x: number; y: number };

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

function nodeStatus(n: EnhancedNode): "online" | "offline" | "degraded" {
  const s = (n.status || "").toLowerCase();
  if (s === "offline") return "offline";
  if (s === "degraded") return "degraded";

  // Your enhanced topology health.delivery_rate is often a string like "95.0%" or "N/A"
  const pct = pctFromAny((n as any)?.health?.delivery_rate);
  if (pct != null && pct < 80) return "degraded";

  if (s === "online") return "online";
  return "degraded";
}

function nodeColor(st: "online" | "offline" | "degraded") {
  if (st === "online") return "#16a34a";
  if (st === "offline") return "#ef4444";
  return "#f59e0b";
}

function linkQuality(link: EnhancedLink): "good" | "mid" | "bad" {
  const status = (link.status || "").toLowerCase();
  if (status && status !== "up" && status !== "online") return "bad";

  const rssi = typeof link.rssi === "number" ? link.rssi : null;
  const lat = typeof link.latency === "number" ? link.latency : null;

  if (rssi != null) {
    if (rssi >= -65) return "good";
    if (rssi >= -78) return "mid";
    return "bad";
  }

  if (lat != null) {
    if (lat <= 60) return "good";
    if (lat <= 160) return "mid";
    return "bad";
  }

  return "mid";
}

function linkColor(q: "good" | "mid" | "bad") {
  if (q === "good") return "#16a34a";
  if (q === "mid") return "#f59e0b";
  return "#ef4444";
}

function linkWidth(q: "good" | "mid" | "bad") {
  if (q === "good") return 3;
  if (q === "mid") return 2;
  return 2;
}

// Gateway-centered ring layout by hop distance
function layout(
  topology: EnhancedTopology,
  W: number,
  H: number,
): Map<number, Pos> {
  const nodes = topology.nodes || [];
  const links = topology.links || [];

  const gateways = nodes.filter(
    (n) => (n.type || "").toLowerCase() === "gateway",
  );
  const gatewayIds = gateways.length
    ? gateways.map((g) => g.id)
    : ([nodes[0]?.id].filter(Boolean) as number[]);

  // adjacency
  const adj = new Map<number, number[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const l of links) {
    if (!adj.has(l.from)) adj.set(l.from, []);
    if (!adj.has(l.to)) adj.set(l.to, []);
    adj.get(l.from)!.push(l.to);
    adj.get(l.to)!.push(l.from);
  }

  // BFS distances from closest gateway
  const dist = new Map<number, number>();
  const q: number[] = [];
  for (const gid of gatewayIds) {
    dist.set(gid, 0);
    q.push(gid);
  }
  while (q.length) {
    const u = q.shift()!;
    const du = dist.get(u)!;
    for (const v of adj.get(u) || []) {
      if (!dist.has(v)) {
        dist.set(v, du + 1);
        q.push(v);
      }
    }
  }

  const maxD = Math.max(
    1,
    ...Array.from(dist.values(), (d) => (typeof d === "number" ? d : 1)),
  );

  // groups by distance ring
  const rings = new Map<number, number[]>();
  for (const n of nodes) {
    const d = dist.get(n.id) ?? maxD;
    if (!rings.has(d)) rings.set(d, []);
    rings.get(d)!.push(n.id);
  }

  const center = { x: W / 2, y: H / 2 };
  const minR = 40;
  const maxR = Math.min(W, H) * 0.42;

  const positions = new Map<number, Pos>();

  for (const [d, ids] of rings.entries()) {
    const r = minR + (maxR - minR) * (d / maxD);
    const step = (Math.PI * 2) / Math.max(1, ids.length);

    ids.forEach((id, i) => {
      if (d === 0) {
        const offset = (i - (ids.length - 1) / 2) * 30;
        positions.set(id, { x: center.x + offset, y: center.y });
        return;
      }

      const a = i * step;
      positions.set(id, {
        x: center.x + Math.cos(a) * r,
        y: center.y + Math.sin(a) * r,
      });
    });
  }

  return positions;
}

export default function TopologyGraph({
  topology,
  selectedNodeId,
  onSelectNode,
  proMode = false,
  showLinkLabels = false,
  showStatusBadges = false,
  showAlertBadges = false,
  nodeAlertCounts = {},
  onSelectLink,
  selectedLinkId = null,
}: Props) {
  const [hoverId, setHoverId] = useState<number | null>(null);

  const W = 980;
  const H = 560;

  const positions = useMemo(() => {
    if (!topology) return new Map<number, Pos>();
    return layout(topology, W, H);
  }, [topology]);

  const byId = useMemo(() => {
    const m = new Map<number, EnhancedNode>();
    for (const n of topology?.nodes || []) m.set(n.id, n);
    return m;
  }, [topology]);

  const hoveredNode = hoverId != null ? byId.get(hoverId) : null;

  if (!topology) {
    return (
      <div
        style={{
          height: "100%",
          borderRadius: 12,
          border: "1px dashed #e5e7eb",
          display: "grid",
          placeItems: "center",
          color: "#6b7280",
        }}
      >
        No topology snapshot yet.
      </div>
    );
  }

  const nodes = topology.nodes || [];
  const links = topology.links || [];

  return (
    <div style={{ height: "100%", position: "relative" }}>
      {/* Hover tooltip */}
      {hoveredNode && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 2,
            background: "rgba(255,255,255,0.92)",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 10,
            fontSize: 12,
            minWidth: 260,
          }}
        >
          <div style={{ fontWeight: 900 }}>{hoveredNode.device_id}</div>
          <div style={{ color: "#6b7280", marginTop: 2 }}>
            {hoveredNode.name}
          </div>

          <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
            <div>
              <b>Status:</b> {hoveredNode.status}
            </div>
            <div>
              <b>Delivery:</b>{" "}
              {String((hoveredNode as any)?.health?.delivery_rate ?? "—")}
            </div>
            <div>
              <b>RSSI:</b> {String((hoveredNode as any)?.signal?.rssi ?? "—")} (
              {String((hoveredNode as any)?.signal?.quality ?? "—")})
            </div>
            <div>
              <b>Active alerts:</b>{" "}
              {nodeAlertCounts[hoveredNode.device_id || ""] || 0}
            </div>
            <div>
              <b>Last seen:</b>{" "}
              {hoveredNode.last_seen
                ? new Date(hoveredNode.last_seen).toLocaleString()
                : "—"}
            </div>
          </div>
        </div>
      )}

      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          background: "#ffffff",
        }}
      >
        {/* Links */}
        {links.map((l) => {
          const a = positions.get(l.from);
          const b = positions.get(l.to);
          if (!a || !b) return null;

          const q = linkQuality(l);
          const stroke = linkColor(q);
          const sw = linkWidth(q);
          const isSel = selectedLinkId === l.id;

          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;

          return (
            <g key={l.id}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={stroke}
                strokeWidth={isSel ? sw + 2 : sw}
                opacity={0.85}
              />

              {/* click target (invisible) */}
              {proMode && (
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="transparent"
                  strokeWidth={12}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectLink?.(l);
                  }}
                  style={{ cursor: "pointer" }}
                />
              )}

              {/* link labels */}
              {proMode && showLinkLabels && (
                <g>
                  <rect
                    x={mx - 34}
                    y={my - 12}
                    width={68}
                    height={22}
                    rx={8}
                    fill="rgba(255,255,255,0.85)"
                    stroke="#e5e7eb"
                  />
                  <text
                    x={mx}
                    y={my + 3}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#111827"
                    style={{ userSelect: "none" }}
                  >
                    {l.latency != null ? `${l.latency}ms` : "—"} /{" "}
                    {l.rssi != null ? `${l.rssi}` : "—"}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((n) => {
          const p = positions.get(n.id);
          if (!p) return null;

          const st = nodeStatus(n);
          const fill = nodeColor(st);

          const delivery = pctFromAny((n as any)?.health?.delivery_rate);
          const ring =
            delivery != null
              ? Math.max(2, Math.round((delivery / 100) * 6))
              : 2;

          const isSelected = selectedNodeId === n.id;
          const isGateway = String(n.type || "").toLowerCase() === "gateway";

          const radius = isGateway ? 18 : 14;

          const badgeText =
            st === "offline" ? "OFF" : st === "degraded" ? "!" : "";
          const alertCount = (nodeAlertCounts[n.device_id || ""] ||
            0) as number;

          return (
            <g
              key={n.id}
              transform={`translate(${p.x}, ${p.y})`}
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() =>
                setHoverId((cur) => (cur === n.id ? null : cur))
              }
              onClick={() => onSelectNode(n)}
              style={{ cursor: "pointer" }}
            >
              {/* Delivery ring */}
              <circle
                r={radius + 6}
                fill="none"
                stroke="#111827"
                strokeWidth={ring}
                opacity={delivery != null ? 0.08 : 0}
              />

              {/* Base node */}
              <circle
                r={radius}
                fill={fill}
                stroke={isSelected ? "#111827" : "#ffffff"}
                strokeWidth={isSelected ? 3 : 2}
              />

              {/* Gateway marker */}
              {isGateway && <circle r={5} fill="#111827" opacity={0.9} />}

              {/* Status badge (OFF / !) */}
              {proMode && showStatusBadges && badgeText && (
                <g>
                  <circle
                    cx={radius - 2}
                    cy={-radius + 2}
                    r={8}
                    fill="#111827"
                    opacity={0.9}
                  />
                  <text
                    x={radius - 2}
                    y={-radius + 5}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#fff"
                    style={{ userSelect: "none", fontWeight: 900 }}
                  >
                    {badgeText}
                  </text>
                </g>
              )}

              {/* Alert count badge */}
              {proMode && showAlertBadges && alertCount > 0 && (
                <g>
                  <circle
                    cx={-radius + 2}
                    cy={-radius + 2}
                    r={9}
                    fill="#111827"
                    opacity={0.92}
                  />
                  <text
                    x={-radius + 2}
                    y={-radius + 6}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#fff"
                    style={{ userSelect: "none", fontWeight: 900 }}
                  >
                    {alertCount > 99 ? "99+" : String(alertCount)}
                  </text>
                </g>
              )}

              {/* Label */}
              <text
                x={0}
                y={radius + 16}
                textAnchor="middle"
                fontSize={11}
                fill="#111827"
                style={{ userSelect: "none" }}
              >
                {n.device_id}
              </text>

              {/* Delivery label */}
              {delivery != null && (
                <text
                  x={0}
                  y={-radius - 10}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#6b7280"
                  style={{ userSelect: "none" }}
                >
                  {delivery}%
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
