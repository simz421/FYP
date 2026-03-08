import React from "react";

export type Incident = {
  ts: string;
  title: string;
  detail?: string;
  kind: "alert" | "route" | "network";
  severity?: string;
  device_id?: string;
};

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function IncidentsFeed({
  items,
  onSelectDevice,
}: {
  items: Incident[];
  onSelectDevice?: (deviceId: string) => void;
}) {
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
        <div style={{ fontWeight: 900 }}>Recent Incidents</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
          Alerts + route changes + network events
        </div>
      </div>

      <div style={{ maxHeight: 360, overflowY: "auto" }}>
        {items.map((it, idx) => (
          <div
            key={idx}
            style={{
              padding: 12,
              borderTop: idx ? "1px solid #f3f4f6" : "none",
              display: "grid",
              gap: 4,
            }}
          >
            <div style={{ fontSize: 12, color: "#6b7280" }}>{fmt(it.ts)}</div>
            <div style={{ fontWeight: 900 }}>
              {it.title}{" "}
              {it.severity ? (
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  • {it.severity}
                </span>
              ) : null}
            </div>
            {it.detail ? (
              <div style={{ fontSize: 12, color: "#374151" }}>{it.detail}</div>
            ) : null}
            {it.device_id ? (
              <button
                onClick={() => onSelectDevice?.(it.device_id!)}
                style={{
                  width: "fit-content",
                  marginTop: 6,
                  padding: "6px 10px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                Open {it.device_id}
              </button>
            ) : null}
          </div>
        ))}

        {!items.length && (
          <div style={{ padding: 12, color: "#6b7280" }}>
            No incidents in the selected window.
          </div>
        )}
      </div>
    </div>
  );
}
