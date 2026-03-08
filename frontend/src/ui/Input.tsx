import React from "react";

export default function Input(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  return (
    <input
      {...props}
      style={{
        width: props.style?.width ?? "100%",
        padding: "9px 10px",
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "#fff",
        boxShadow: "0 6px 14px rgba(15,23,42,0.05)",
        outline: "none",
        fontSize: 13,
        color: "var(--text)",
        ...props.style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = `0 0 0 4px var(--ring)`;
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = "0 6px 14px rgba(15,23,42,0.05)";
        props.onBlur?.(e);
      }}
    />
  );
}
