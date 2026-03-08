import React from "react";

export default function KpiCards({
  items,
}: {
  items: Array<{
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
  }>;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      }}
    >
      {items.map((it, idx) => (
        <div
          key={idx}
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 12,
            background: "#fff",
          }}
        >
          <div style={{ fontSize: 12, color: "#6b7280" }}>{it.label}</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>
            {it.value}
          </div>
          {it.sub ? (
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
              {it.sub}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
