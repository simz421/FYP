import React from "react";
import type { AlertEvent } from "../../api/alerts";

function badgeValue(a: AlertEvent): string {
  const lvl = (a.level || "").toString().toLowerCase();
  if (lvl === "critical" || lvl === "warning" || lvl === "info") return lvl;

  const sev = (a.severity || "").toString().toLowerCase();
  if (sev === "above_max") return "critical";
  if (sev === "below_min") return "warning";

  return (
    a.is_active ? "active" : a.resolved_at ? "resolved" : "active"
  ).toString();
}

export default function AlertsTable({
  alerts,
  onSelect,
  renderSeverity,
  formatAge,
  actionBusyId,
  onAck,
  onResolve,
}: {
  alerts: AlertEvent[];
  onSelect: (a: AlertEvent) => void;
  renderSeverity: (sev?: string | null) => React.ReactNode;
  formatAge: (iso?: string | null) => string;
  actionBusyId: number | null;
  onAck: (a: AlertEvent) => void;
  onResolve: (a: AlertEvent) => void;
}) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        overflow: "hidden",
        background: "#fff",
      }}
    >
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
            <th style={{ padding: "10px 10px" }}>Severity</th>
            <th style={{ padding: "10px 10px" }}>Device</th>
            <th style={{ padding: "10px 10px" }}>Parameter</th>
            <th style={{ padding: "10px 10px" }}>Message</th>
            <th style={{ padding: "10px 10px" }}>Ack</th>
            <th style={{ padding: "10px 10px" }}>Age</th>
            <th style={{ padding: "10px 10px" }}>Actions</th>
          </tr>
        </thead>

        <tbody>
          {alerts.map((a) => {
            const busy = actionBusyId === a.id;
            const isResolved = !!a.resolved_at || a.is_active === false;
            const isAcked = !!a.acked_at || a.is_acked === true;

            return (
              <tr
                key={a.id}
                style={{ borderTop: "1px solid #f3f4f6", cursor: "pointer" }}
                onClick={() => onSelect(a)}
              >
                <td style={{ padding: "10px 10px" }}>
                  {renderSeverity(badgeValue(a))}
                </td>
                <td style={{ padding: "10px 10px", fontWeight: 800 }}>
                  {a.device_id || "—"}
                </td>
                <td style={{ padding: "10px 10px", color: "#6b7280" }}>
                  {a.parameter || "—"}
                </td>

                <td style={{ padding: "10px 10px" }}>
                  <div style={{ fontWeight: 700 }}>
                    {a.message || "Alert event"}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    value: {typeof a.value === "number" ? a.value : "—"} • min:{" "}
                    {a.min_value ?? "—"} • max: {a.max_value ?? "—"}
                  </div>
                </td>

                <td style={{ padding: "10px 10px", color: "#6b7280" }}>
                  {isAcked ? "Yes" : "No"}
                </td>

                <td style={{ padding: "10px 10px", color: "#6b7280" }}>
                  {formatAge(a.created_at)}
                </td>

                <td
                  style={{ padding: "10px 10px" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      disabled={busy || isAcked || isResolved}
                      onClick={() => onAck(a)}
                      style={{
                        padding: "7px 10px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        fontWeight: 800,
                      }}
                    >
                      Ack
                    </button>

                    <button
                      disabled={busy || isResolved}
                      onClick={() => onResolve(a)}
                      style={{
                        padding: "7px 10px",
                        borderRadius: 10,
                        border: "1px solid #111827",
                        background: "#111827",
                        color: "white",
                        fontWeight: 800,
                      }}
                    >
                      Resolve
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}

          {alerts.length === 0 && (
            <tr>
              <td colSpan={7} style={{ padding: 14, color: "#6b7280" }}>
                No alerts found for the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
