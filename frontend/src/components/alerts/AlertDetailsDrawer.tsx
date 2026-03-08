import React, { useMemo } from "react";
import type { AlertEvent } from "../../api/alerts";
import SeverityBadge from "./SeverityBadge";

function ms(iso?: string | null) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function fmt(iso?: string | null) {
  if (!iso) return "—";
  const t = new Date(iso);
  const ms = t.getTime();
  if (!Number.isFinite(ms)) return "—";
  return t.toLocaleString();
}

function fmtDuration(sec: number | null) {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

export default function AlertDetailsDrawer({
  alert,
  onClose,
  actionBusy,
  ackNote,
  setAckNote,
  onAck,
  onResolve,
}: {
  alert: AlertEvent | null;
  onClose: () => void;
  actionBusy: boolean;
  ackNote: string;
  setAckNote: (v: string) => void;
  onAck?: () => void;
  onResolve?: () => void;
}) {
  const open = !!alert;
  if (!open) return null;

  const status = (alert!.status || "").toString() || "active";
  const level = (alert!.level || "").toString();
  const direction = (alert!.severity || "").toString();

  const timeline = useMemo(() => {
    const tCreated = ms(alert!.created_at);
    const tAcked = ms(alert!.acked_at);
    const tResolved = ms(alert!.resolved_at);

    const toAck =
      tCreated != null && tAcked != null
        ? Math.max(0, Math.floor((tAcked - tCreated) / 1000))
        : null;

    const toResolve =
      tCreated != null && tResolved != null
        ? Math.max(0, Math.floor((tResolved - tCreated) / 1000))
        : null;

    const ackToResolve =
      tAcked != null && tResolved != null
        ? Math.max(0, Math.floor((tResolved - tAcked) / 1000))
        : null;

    return { toAck, toResolve, ackToResolve };
  }, [alert]);

  const isResolved =
    status.toLowerCase() === "resolved" || !!alert!.resolved_at;
  const isAcked = !!alert!.acked_at || status.toLowerCase() === "acked";

  // Badge priority:
  // level -> severity -> status
  const badge = level || direction || status;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        height: "100vh",
        width: 420,
        background: "#fff",
        borderLeft: "1px solid #e5e7eb",
        boxShadow: "-6px 0 20px rgba(0,0,0,0.08)",
        padding: 14,
        zIndex: 50,
        overflowY: "auto",
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 10 }}
      >
        <div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Alert Details</div>
          <div style={{ color: "#6b7280", fontSize: 12 }}>ID #{alert!.id}</div>
        </div>

        <button
          onClick={onClose}
          style={{
            padding: "7px 10px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          Close
        </button>
      </div>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <SeverityBadge severity={badge} />
        <div style={{ fontWeight: 900 }}>
          {alert!.device_id || "Unknown device"}
        </div>
      </div>

      {/* Core details */}
      <div
        style={{
          marginTop: 12,
          border: "1px solid #f3f4f6",
          borderRadius: 12,
          padding: 12,
        }}
      >
        <div style={{ fontWeight: 900 }}>{alert!.message || "Alert event"}</div>

        <div style={{ color: "#6b7280", fontSize: 12, marginTop: 6 }}>
          status: <b>{status}</b>
          {level ? (
            <>
              {" "}
              • level: <b>{level}</b>
            </>
          ) : null}
          {direction ? (
            <>
              {" "}
              • direction: <b>{direction}</b>
            </>
          ) : null}
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 13 }}>
          <div>
            <b>Parameter:</b> {alert!.parameter || alert!.sensor_type || "—"}
          </div>
          <div>
            <b>Value:</b>{" "}
            {typeof alert!.value === "number" ? alert!.value : "—"}
          </div>
          <div>
            <b>Min:</b> {alert!.min_value ?? "—"}
          </div>
          <div>
            <b>Max:</b> {alert!.max_value ?? "—"}
          </div>
        </div>
      </div>

      {/* Audit timeline */}
      <div
        style={{
          marginTop: 12,
          border: "1px solid #f3f4f6",
          borderRadius: 12,
          padding: 12,
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Audit Timeline</div>

        <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
          <div>
            <div style={{ fontWeight: 900 }}>Created</div>
            <div style={{ color: "#6b7280" }}>{fmt(alert!.created_at)}</div>
          </div>

          <div>
            <div style={{ fontWeight: 900 }}>Acknowledged</div>
            <div style={{ color: "#6b7280" }}>{fmt(alert!.acked_at)}</div>
            <div style={{ color: "#6b7280", marginTop: 2 }}>
              Time to ack: <b>{fmtDuration(timeline.toAck)}</b>
            </div>
            {alert!.ack_note ? (
              <div style={{ marginTop: 4 }}>
                <div style={{ fontWeight: 900 }}>Ack note</div>
                <div style={{ color: "#374151" }}>{alert!.ack_note}</div>
              </div>
            ) : null}
          </div>

          <div>
            <div style={{ fontWeight: 900 }}>Resolved</div>
            <div style={{ color: "#6b7280" }}>{fmt(alert!.resolved_at)}</div>
            <div style={{ color: "#6b7280", marginTop: 2 }}>
              Time to resolve: <b>{fmtDuration(timeline.toResolve)}</b>
              {timeline.ackToResolve != null ? (
                <>
                  {" "}
                  • Ack → resolve: <b>{fmtDuration(timeline.ackToResolve)}</b>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div
        style={{
          marginTop: 12,
          border: "1px solid #f3f4f6",
          borderRadius: 12,
          padding: 12,
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Acknowledge</div>

        <textarea
          value={ackNote}
          onChange={(e) => setAckNote(e.target.value)}
          placeholder="Optional acknowledgment note..."
          style={{
            width: "100%",
            minHeight: 80,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #e5e7eb",
          }}
        />

        <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
          <button
            disabled={actionBusy || isAcked || isResolved}
            onClick={onAck}
            style={{
              padding: "9px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              cursor: actionBusy ? "not-allowed" : "pointer",
              fontWeight: 900,
            }}
          >
            Ack
          </button>

          <button
            disabled={actionBusy || isResolved}
            onClick={onResolve}
            style={{
              padding: "9px 12px",
              borderRadius: 10,
              border: "1px solid #111827",
              background: "#111827",
              color: "white",
              cursor: actionBusy ? "not-allowed" : "pointer",
              fontWeight: 900,
            }}
          >
            Resolve
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
          Tip: In “Only unacked” mode, acknowledging an alert may remove it from
          the current view after refresh.
        </div>
      </div>
    </div>
  );
}
