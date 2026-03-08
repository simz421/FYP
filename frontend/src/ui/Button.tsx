import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export default function Button({
  variant = "secondary",
  children,
  style,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
}) {
  const base: React.CSSProperties = {
    padding: "9px 12px",
    borderRadius: 14,
    fontWeight: 950,
    fontSize: 13,
    cursor: props.disabled ? "not-allowed" : "pointer",
    transition:
      "transform 120ms ease, box-shadow 120ms ease, background 120ms ease",
    outline: "none",
    userSelect: "none",
  };

  const v: Record<Variant, React.CSSProperties> = {
    primary: {
      border: "1px solid rgba(15,23,42,0.85)",
      background: "linear-gradient(180deg, #111827 0%, #0b1220 100%)",
      color: "#fff",
      boxShadow: "0 10px 20px rgba(15,23,42,0.18)",
    },
    secondary: {
      border: "1px solid var(--border)",
      background: "#fff",
      color: "var(--text)",
      boxShadow: "0 6px 14px rgba(15,23,42,0.06)",
    },
    ghost: {
      border: "1px solid transparent",
      background: "transparent",
      color: "var(--text)",
    },
    danger: {
      border: "1px solid rgba(220,38,38,0.35)",
      background: "linear-gradient(180deg, #fff1f2 0%, #ffe4e6 100%)",
      color: "#9f1239",
      boxShadow: "0 8px 18px rgba(220,38,38,0.12)",
    },
  };

  return (
    <button
      {...props}
      style={{
        ...base,
        ...v[variant],
        opacity: props.disabled ? 0.65 : 1,
        ...style,
      }}
      onMouseDown={(e) => {
        if (!props.disabled)
          e.currentTarget.style.transform = "translateY(1px)";
        props.onMouseDown?.(e);
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = "translateY(0px)";
        props.onMouseUp?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.transform = "translateY(0px)";
        props.onBlur?.(e);
      }}
    >
      {children}
    </button>
  );
}
