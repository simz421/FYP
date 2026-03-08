import React from "react";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error?: unknown };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // show full crash info in console too
    console.error("App crashed:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 16,
            fontFamily: "system-ui",
            color: "white",
            background: "#0f1115",
            minHeight: "100vh",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Frontend crashed</h2>
          <p style={{ opacity: 0.8 }}>
            Open DevTools → Console to see the full stack trace.
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              padding: 12,
              borderRadius: 12,
              background: "rgba(255,255,255,0.06)",
            }}
          >
            {String(this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
