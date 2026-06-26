import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: "32px", background: "#fef2f2",
          borderRadius: "16px", border: "1px solid #fecaca",
          margin: "20px",
        }}>
          <h3 style={{ color: "#dc2626", margin: "0 0 10px" }}>Something went wrong</h3>
          <pre style={{ color: "#991b1b", fontSize: "12px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: "14px", background: "#dc2626", color: "white",
              border: "none", padding: "8px 18px", borderRadius: "8px", cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
