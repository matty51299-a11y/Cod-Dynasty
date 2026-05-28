// src/components/ErrorBoundary.jsx
// Catches uncaught render/runtime exceptions anywhere in the tree and shows
// a useful diagnostic panel instead of letting the page blank out.
//
// Reads game state and last action through props so the user (and dev tools)
// can see exactly what was happening when the crash hit.

import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error, info: null };
  }

  componentDidCatch(error, info) {
    this.setState({ error, info });
    if (typeof window !== "undefined") {
      window.__lastCrash = {
        message: error?.message,
        stack: error?.stack,
        componentStack: info?.componentStack,
        gameState: window.__gameState,
        lastAction: window.__lastAction,
        timestamp: new Date().toISOString(),
      };
    }
    // Surface to the console so it shows up in browser devtools too.
    console.error("[ErrorBoundary] caught render error:", error);
    console.error("[ErrorBoundary] componentStack:", info?.componentStack);
  }

  reset = () => {
    this.setState({ error: null, info: null });
  };

  clearSaveAndReload = () => {
    try { localStorage.removeItem("cdl_manager_save"); } catch { /* ignore */ }
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    const error = this.state.error;
    const stack = error?.stack || String(error);
    const componentStack = this.state.info?.componentStack;

    const gs = typeof window !== "undefined" ? window.__gameState : null;
    const la = typeof window !== "undefined" ? window.__lastAction : null;

    const schedule = gs?.schedule ?? {};
    const phase = schedule.phase ?? "(unknown)";
    const season = gs?.season ?? "(unknown)";
    const stageIdx = schedule.stageIdx ?? null;
    const majorIdx = schedule.majorIdx ?? null;
    const userTeamId = gs?.userTeamId ?? "(unknown)";
    const enteredMajorIdx = gs?.enteredMajorIdx ?? null;

    const currentMajor = majorIdx != null ? schedule?.majors?.[majorIdx] : null;
    const currentMajorSummary = currentMajor ? {
      name: currentMajor.name,
      completed: !!currentMajor.completed,
      bracketType: currentMajor.bracket?.type ?? null,
      seedCount: currentMajor.bracket?.seeds?.length ?? null,
      champion: currentMajor.bracket?.champion ?? null,
    } : null;

    const currentChampsSummary = schedule?.majors?.[4] ? {
      name: schedule.majors[4].name,
      completed: !!schedule.majors[4].completed,
      hasBracket: !!schedule.majors[4].bracket,
      bracketType: schedule.majors[4].bracket?.type ?? null,
      seedCount: schedule.majors[4].bracket?.seeds?.length ?? null,
      champion: schedule.majors[4].bracket?.champion ?? null,
    } : null;

    const currentQualifier = schedule.currentChallengerQualifier ? {
      name: schedule.currentChallengerQualifier.name,
      majorIdx: schedule.currentChallengerQualifier.majorIdx,
      completed: !!schedule.currentChallengerQualifier.completed,
      fieldSize: schedule.currentChallengerQualifier.field?.length ?? 0,
    } : null;

    const eventTeamIds = schedule.currentMajorEventTeams
      ? Object.keys(schedule.currentMajorEventTeams)
      : null;

    return (
      <div style={errStyles.backdrop}>
        <div style={errStyles.card}>
          <div style={errStyles.header}>
            <span style={errStyles.badge}>RUNTIME ERROR</span>
            <h2 style={errStyles.title}>Something blew up in render</h2>
            <p style={errStyles.subtitle}>
              The app caught the error and stopped the blank-screen behavior. Use
              the details below to share a bug report. Your save is untouched.
            </p>
          </div>

          <div style={errStyles.errBox}>
            <div style={errStyles.errMsg}>{error?.message || String(error)}</div>
            <pre style={errStyles.pre}>{stack}</pre>
            {componentStack && (
              <>
                <div style={errStyles.sectionLabel}>Component stack</div>
                <pre style={errStyles.pre}>{componentStack}</pre>
              </>
            )}
          </div>

          <div style={errStyles.grid}>
            <KV label="Phase" value={phase} />
            <KV label="Season" value={String(season)} />
            <KV label="Stage idx" value={stageIdx == null ? "—" : String(stageIdx)} />
            <KV label="Major idx" value={majorIdx == null ? "—" : String(majorIdx)} />
            <KV label="User team" value={userTeamId} />
            <KV label="Entered major" value={enteredMajorIdx == null ? "—" : String(enteredMajorIdx)} />
            <KV label="Event team ids" value={eventTeamIds ? eventTeamIds.join(", ") : "—"} wide />
          </div>

          {la && (
            <details style={errStyles.details} open>
              <summary style={errStyles.summary}>Last dispatched action</summary>
              <pre style={errStyles.pre}>{JSON.stringify(la, null, 2)}</pre>
            </details>
          )}

          {currentMajorSummary && (
            <details style={errStyles.details} open>
              <summary style={errStyles.summary}>Current major</summary>
              <pre style={errStyles.pre}>{JSON.stringify(currentMajorSummary, null, 2)}</pre>
            </details>
          )}

          {currentChampsSummary && currentChampsSummary !== currentMajorSummary && (
            <details style={errStyles.details}>
              <summary style={errStyles.summary}>Champs slot</summary>
              <pre style={errStyles.pre}>{JSON.stringify(currentChampsSummary, null, 2)}</pre>
            </details>
          )}

          {currentQualifier && (
            <details style={errStyles.details}>
              <summary style={errStyles.summary}>Current challenger qualifier</summary>
              <pre style={errStyles.pre}>{JSON.stringify(currentQualifier, null, 2)}</pre>
            </details>
          )}

          <div style={errStyles.actions}>
            <button style={errStyles.btnPrimary} onClick={this.reset}>
              Try rendering again
            </button>
            <button style={errStyles.btnSecondary} onClick={() => window.location.reload()}>
              Reload page
            </button>
            <button style={errStyles.btnDanger} onClick={this.clearSaveAndReload}>
              Erase save and reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

function KV({ label, value, wide }) {
  return (
    <div style={{ ...errStyles.kv, gridColumn: wide ? "1 / -1" : undefined }}>
      <span style={errStyles.kvLabel}>{label}</span>
      <span style={errStyles.kvValue}>{value}</span>
    </div>
  );
}

const errStyles = {
  backdrop: {
    position: "fixed", inset: 0, background: "#0f1724", color: "#e8eefc",
    padding: 24, overflow: "auto", zIndex: 99999, fontFamily: "system-ui, sans-serif",
  },
  card: {
    maxWidth: 880, margin: "0 auto", background: "#182235",
    border: "1px solid #2a3a57", borderRadius: 8, padding: 24,
    boxShadow: "0 2px 16px rgba(0,0,0,0.4)",
  },
  header: { marginBottom: 16 },
  badge: {
    display: "inline-block", background: "#f87171", color: "#0f1724",
    padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
    letterSpacing: 0.5, marginBottom: 8,
  },
  title: { margin: "4px 0 4px", fontSize: 22, color: "#f0f4ff" },
  subtitle: { margin: 0, color: "#9db0d0", fontSize: 13 },
  errBox: {
    background: "#0f1724", border: "1px solid #2a3a57", borderRadius: 6,
    padding: 12, marginBottom: 16,
  },
  errMsg: { color: "#fca5a5", fontWeight: 600, marginBottom: 8, fontSize: 14 },
  sectionLabel: { fontSize: 11, color: "#9db0d0", marginTop: 8, marginBottom: 4, letterSpacing: 0.5 },
  pre: {
    margin: 0, padding: 8, background: "#1f2b42", color: "#e8eefc",
    fontSize: 11, lineHeight: 1.4, fontFamily: "ui-monospace, monospace",
    whiteSpace: "pre-wrap", wordBreak: "break-word",
    maxHeight: 240, overflow: "auto", borderRadius: 4,
  },
  grid: {
    display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8,
    marginBottom: 16,
  },
  kv: {
    background: "#1f2b42", border: "1px solid #2a3a57", borderRadius: 4,
    padding: 8, display: "flex", flexDirection: "column", gap: 2,
  },
  kvLabel: { fontSize: 10, color: "#9db0d0", letterSpacing: 0.5 },
  kvValue: { fontSize: 13, color: "#e8eefc", fontFamily: "ui-monospace, monospace", wordBreak: "break-word" },
  details: {
    background: "#1f2b42", border: "1px solid #2a3a57", borderRadius: 4,
    padding: 8, marginBottom: 8,
  },
  summary: { cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#f0f4ff" },
  actions: { display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" },
  btnPrimary: {
    background: "#60a5fa", color: "#0f1724", border: "none",
    padding: "8px 14px", borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  btnSecondary: {
    background: "#1f2b42", color: "#e8eefc", border: "1px solid #2a3a57",
    padding: "8px 14px", borderRadius: 4, fontSize: 13, cursor: "pointer",
  },
  btnDanger: {
    background: "#f87171", color: "#0f1724", border: "none",
    padding: "8px 14px", borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
};
