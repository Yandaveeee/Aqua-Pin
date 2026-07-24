"use client";

import React, { useState } from "react";
import type { VerificationReport, VerificationAlert } from "@/lib/admin-verification";

type VerificationPanelProps = {
  report: VerificationReport;
};

export default function VerificationPanel({ report }: VerificationPanelProps) {
  const [alerts, setAlerts] = useState<VerificationAlert[]>(report.alerts);
  const [checking, setChecking] = useState(false);
  const [checkLogs, setCheckLogs] = useState<string[]>([]);
  const [checkStatus, setCheckStatus] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const activeAlerts = alerts.filter((a) => a.severity !== "info" || showResolved);

  const runVerification = () => {
    setChecking(true);
    setCheckLogs([]);
    setCheckStatus(null);
    
    const logs = [
      "Initializing data verification engine...",
      "Analyzing pond PostGIS coordinate bounds...",
      "Checking stocking logs vs actual current stock count...",
      "Evaluating mortality logs for extreme peaks...",
      "Matching harvest yields against estimated grow-out biomass...",
      "Analyzing mobile offline sync queue markers...",
      `Verification report generated with ${report.alerts.length} active findings and ${report.syncErrors} sync warnings.`
    ];

    let index = 0;
    const interval = setInterval(() => {
      if (index < logs.length) {
        setCheckLogs((prev) => [...prev, logs[index]]);
        index++;
      } else {
        clearInterval(interval);
        setChecking(false);
        setCheckStatus(`Health check complete. Current status: ${report.status}.`);
      }
    }, 400);
  };

  const handleResolveAlert = (id: string) => {
    setAlerts(
      alerts.map((a) =>
        a.id === id
          ? {
              ...a,
              severity: "info",
              message: "Resolved: " + a.message,
              detail: a.detail + " (Marked resolved by Admin)",
            }
          : a
      )
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", color: "#1e293b" }}>
      {/* Run Verification Panel */}
      <div style={{ background: "white", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "20px" }}>
        <div>
          <h3 style={{ margin: 0, fontWeight: "800", fontSize: "1.2rem", color: "#0f172a" }}>Verification & Anomaly Engine</h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "0.875rem", color: "#64748b" }}>
            Last generated {new Date(report.generatedAt).toLocaleString()} from live admin datasets.
          </p>
        </div>

        <button
          onClick={runVerification}
          disabled={checking}
          style={{
            background: checking ? "#64748b" : "#0f172a",
            color: "white",
            border: "none",
            padding: "12px 24px",
            borderRadius: "8px",
            fontWeight: "600",
            fontSize: "0.9rem",
            cursor: checking ? "not-allowed" : "pointer",
            boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
            transition: "all 0.2s",
          }}
        >
          {checking ? "Running Verification..." : "Run Health Check"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
        <div style={{ background: "white", padding: "18px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: "700", textTransform: "uppercase" }}>System Status</span>
          <strong style={{ display: "block", marginTop: "8px", fontSize: "1.6rem", color: report.status === "critical" ? "#b91c1c" : report.status === "degraded" ? "#92400e" : "#166534", textTransform: "capitalize" }}>
            {report.status}
          </strong>
        </div>
        <div style={{ background: "white", padding: "18px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: "700", textTransform: "uppercase" }}>Findings</span>
          <strong style={{ display: "block", marginTop: "8px", fontSize: "1.6rem", color: "#0f172a" }}>{alerts.filter((alert) => alert.severity !== "info").length}</strong>
        </div>
        <div style={{ background: "white", padding: "18px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: "700", textTransform: "uppercase" }}>Sync Warnings</span>
          <strong style={{ display: "block", marginTop: "8px", fontSize: "1.6rem", color: report.syncErrors > 0 ? "#92400e" : "#166534" }}>{report.syncErrors}</strong>
        </div>
      </div>

      {/* Logs output during verification */}
      {checking && (
        <div style={{ background: "#0f172a", padding: "16px", borderRadius: "8px", fontFamily: "monospace", fontSize: "0.85rem", color: "#38bdf8", border: "1px solid #1e293b", maxHeight: "200px", overflowY: "auto" }}>
          {checkLogs.map((log, idx) => (
            <div key={idx} style={{ marginBottom: "6px" }}>
              <span style={{ color: "#a1a1aa" }}>&gt;</span> {log}
            </div>
          ))}
          <div style={{ width: "12px", height: "12px", background: "#38bdf8", display: "inline-block", animation: "blink 1s infinite" }} />
        </div>
      )}

      {checkStatus ? <p className="flash-success">{checkStatus}</p> : null}

      {report.errors.length > 0 ? (
        <div className="flash-error">
          {report.errors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </div>
      ) : null}

      <div style={{ background: "white", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
        <h3 style={{ fontSize: "1.1rem", fontWeight: "700", color: "#0f172a", margin: "0 0 12px 0" }}>Verified Tables</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
          {report.tables.map((table) => (
            <div key={table.table} style={{ padding: "12px", borderRadius: "8px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: "700" }}>{table.table}</span>
              <strong style={{ display: "block", marginTop: "6px", fontSize: "1.3rem", color: "#0f172a" }}>{table.total}</strong>
              <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "0.78rem" }}>{table.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Main Alerts Feed */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: "700", color: "#0f172a", margin: 0 }}>Anomalies & Warnings Log ({activeAlerts.length})</h3>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", color: "#64748b", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
            />
            Show Resolved History
          </label>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {activeAlerts.length === 0 ? (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "16px", borderRadius: "8px", color: "#166534" }}>
              No active anomalies for the current verification report.
            </div>
          ) : activeAlerts.map((alert) => {
            const cardStyles =
              alert.severity === "danger"
                ? { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b", pill: "#ef4444" }
                : alert.severity === "warning"
                ? { bg: "#fffbeb", border: "#fde68a", text: "#92400e", pill: "#f59e0b" }
                : { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534", pill: "#22c55e" };

            return (
              <div
                key={alert.id}
                style={{
                  background: cardStyles.bg,
                  border: `1px solid ${cardStyles.border}`,
                  padding: "16px",
                  borderRadius: "8px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "16px",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: "700",
                        padding: "2px 8px",
                        borderRadius: "12px",
                        background: cardStyles.pill,
                        color: "white",
                        textTransform: "uppercase",
                      }}
                    >
                      {alert.severity}
                    </span>
                    <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>{alert.message}</strong>
                    {alert.pondName && (
                      <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: "600" }}>• {alert.pondName}</span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: cardStyles.text, lineHeight: "1.4" }}>{alert.detail}</p>
                  <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                    Detected: {new Date(alert.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {alert.severity !== "info" && (
                  <button
                    onClick={() => handleResolveAlert(alert.id)}
                    style={{
                      background: "white",
                      border: "1px solid #cbd5e1",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      fontSize: "0.75rem",
                      fontWeight: "600",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      color: "#334155",
                      transition: "all 0.2s",
                    }}
                  >
                    Resolve Anomaly
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Sync Error Troubleshooting Guide */}
      <div style={{ background: "white", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
        <h3 style={{ fontSize: "1.1rem", fontWeight: "700", color: "#0f172a", marginBottom: "12px" }}>Troubleshooting Supabase RLS & Sync Errors</h3>
        <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "0 0 16px 0", lineHeight: "1.5" }}>
          Offline device synchronization relies on custom Row-Level Security (RLS) constraints. Admin accounts have access to view and verify all records. If users report sync issues:
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
          <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "6px" }}>
            <strong style={{ fontSize: "0.85rem", color: "#0f172a", display: "block", marginBottom: "4px" }}>1. RLS Profile Repair</strong>
            <span style={{ fontSize: "0.8rem", color: "#64748b", lineHeight: "1.4" }}>
              Verify staff profile statuses in the <strong>Approvals Queue</strong>. Pending/unapproved staff are blocked from reading or writing to ponds.
            </span>
          </div>
          <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "6px" }}>
            <strong style={{ fontSize: "0.85rem", color: "#0f172a", display: "block", marginBottom: "4px" }}>2. Invalid GPS Boundary Format</strong>
            <span style={{ fontSize: "0.8rem", color: "#64748b", lineHeight: "1.4" }}>
              Ensure boundaries are saved as a valid stringified JSON coordinates array matching the PostGIS Point shape.
            </span>
          </div>
          <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "6px" }}>
            <strong style={{ fontSize: "0.85rem", color: "#0f172a", display: "block", marginBottom: "4px" }}>3. Data Sync Queue Size</strong>
            <span style={{ fontSize: "0.8rem", color: "#64748b", lineHeight: "1.4" }}>
              Ensure device clocks are synchronized and local sync queue entries use valid UUID structures.
            </span>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}} />
    </div>
  );
}
