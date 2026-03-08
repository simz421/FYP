import React from "react";

type Tone = "neutral" | "good" | "warn" | "bad" | "info";

export default function Badge({
  tone = "neutral",
  children,
  style,
}: {
  tone?: Tone;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const bg =
    tone === "good"
      ? "#ecfdf5"
      : tone === "warn"
        ? "#fffbeb"
        : tone === "bad"
          ? "#fff1f2"
          : tone === "info"
            ? "#eff6ff"
            : "#f8fafc";

  const bd =
    tone === "good"
      ? "rgba(22,163,74,0.25)"
      : tone === "warn"
        ? "rgba(217,119,6,0.28)"
        : tone === "bad"
          ? "rgba(220,38,38,0.25)"
          : tone === "info"
            ? "rgba(37,99,235,0.25)"
            : "var(--border)";

  const tx =
    tone === "good"
      ? "#065f46"
      : tone === "warn"
        ? "#92400e"
        : tone === "bad"
          ? "#9f1239"
          : tone === "info"
            ? "#1d4ed8"
            : "var(--text)";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 10px",
        fontSize: 12,
        fontWeight: 950,
        borderRadius: 999,
        background: bg,
        border: `1px solid ${bd}`,
        color: tx,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}
