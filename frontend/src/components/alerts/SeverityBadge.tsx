import React from "react";

export default function SeverityBadge({
  severity,
}: {
  severity?: string | null;
}) {
  const s0 = (severity || "info").toLowerCase();

  // Normalize threshold direction → severity
  let s = s0;
  if (s0 === "above_max") s = "critical";
  if (s0 === "below_min") s = "warning";

  let bg = "#eff6ff";
  let border = "#bfdbfe";
  let color = "#1d4ed8";
  let label = s;

  if (s === "warning" || s === "warn") {
    bg = "#fffbeb";
    border = "#fde68a";
    color = "#92400e";
    label = "warning";
  } else if (s === "critical" || s === "crit") {
    bg = "#fef2f2";
    border = "#fecaca";
    color = "#b91c1c";
    label = "critical";
  } else if (s === "acked" || s === "resolved") {
    bg = "#f3f4f6";
    border = "#e5e7eb";
    color = "#374151";
    label = s;
  } else {
    label = s || "info";
  }

  return (
    <span
      style={{
        padding: "4px 8px",
        borderRadius: 999,
        border: `1px solid ${border}`,
        background: bg,
        color,
        fontWeight: 800,
        fontSize: 12,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
