import React from "react";

type Accent = "blue" | "green" | "amber" | "red" | "slate" | "none";

export default function Card({
  title,
  subtitle,
  right,
  accent = "none",
  children,
  style,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  accent?: Accent;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const acc =
    accent === "blue"
      ? "var(--acc-blue)"
      : accent === "green"
        ? "var(--acc-green)"
        : accent === "amber"
          ? "var(--acc-amber)"
          : accent === "red"
            ? "var(--acc-red)"
            : accent === "slate"
              ? "var(--acc-slate)"
              : "transparent";

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        background:
          "linear-gradient(180deg, var(--card) 0%, var(--card-2) 100%)",
        boxShadow: "var(--shadow-sm)",
        padding: 14,
        position: "relative",
        ...style,
      }}
    >
      {accent !== "none" ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "var(--radius)",
            pointerEvents: "none",
            boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.35)`,
          }}
        />
      ) : null}

      {accent !== "none" ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 12,
            bottom: 12,
            width: 4,
            borderRadius: 999,
            background: acc,
            boxShadow: `0 0 0 1px rgba(0,0,0,0.02)`,
          }}
        />
      ) : null}

      {(title || subtitle || right) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            marginBottom: 10,
            paddingLeft: accent !== "none" ? 10 : 0,
          }}
        >
          <div>
            {title ? (
              <div style={{ fontWeight: 950, letterSpacing: "-0.01em" }}>
                {title}
              </div>
            ) : null}
            {subtitle ? (
              <div
                style={{ marginTop: 4, fontSize: 12, color: "var(--muted)" }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>
          {right ? <div>{right}</div> : null}
        </div>
      )}

      <div style={{ paddingLeft: accent !== "none" ? 10 : 0 }}>{children}</div>
    </div>
  );
}
