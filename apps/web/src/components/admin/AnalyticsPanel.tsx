"use client";

import React, { useState } from "react";
import {
  MOCK_PONDS,
  MOCK_MORTALITY_LOGS,
  MOCK_HARVESTS,
  MOCK_STOCKING_LOGS,
  MOCK_FEED_LOGS,
  MockPond,
  MockMortalityLog,
  MockHarvest,
  MockStockingLog,
  MockFeedLog,
} from "@/lib/mock-data";

interface AnalyticsPanelProps {
  ponds?: MockPond[];
  mortalityLogs?: MockMortalityLog[];
  harvests?: MockHarvest[];
  stockingLogs?: MockStockingLog[];
  feedLogs?: MockFeedLog[];
}

export default function AnalyticsPanel({
  ponds = MOCK_PONDS,
  mortalityLogs = MOCK_MORTALITY_LOGS,
  harvests = MOCK_HARVESTS,
  stockingLogs = MOCK_STOCKING_LOGS,
  feedLogs = MOCK_FEED_LOGS,
}: AnalyticsPanelProps) {
  const [selectedPondId, setSelectedPondId] = useState<string>("all");
  const [timeframe, setTimeframe] = useState<"30d" | "90d" | "12mo">("90d");

  // Filtering data based on selection
  const filteredPonds = selectedPondId === "all" ? ponds : ponds.filter((p) => p.id === selectedPondId);
  const filteredMortalities = selectedPondId === "all"
    ? mortalityLogs
    : mortalityLogs.filter((m) => m.pondId === selectedPondId);
  const filteredHarvests = selectedPondId === "all"
    ? harvests
    : harvests.filter((h) => h.pondId === selectedPondId);
  const filteredStockings = selectedPondId === "all"
    ? stockingLogs
    : stockingLogs.filter((s) => s.pondId === selectedPondId);
  const filteredFeedLogs = selectedPondId === "all"
    ? feedLogs
    : feedLogs.filter((log) => log.pondId === selectedPondId);

  // 1. KPI calculations
  const totalActivePonds = filteredPonds.filter((p) => p.isActive).length;
  const totalStockedCount = filteredPonds.reduce((sum, p) => sum + p.currentStockCount, 0);
  const totalMortalityCount = filteredMortalities.reduce((sum, m) => sum + m.quantity, 0);
  
  // Calculate average survival rate
  const initialStockedTotal = filteredStockings.reduce((sum, s) => sum + s.quantity, 0);
  const averageSurvivalRate = initialStockedTotal > 0
    ? Math.max(0, Math.min(100, ((initialStockedTotal - totalMortalityCount) / initialStockedTotal) * 100))
    : 92.5;

  const totalHarvestBiomass = filteredHarvests.reduce((sum, h) => sum + h.yieldKg, 0);
  const totalFeedConsumedKg = filteredFeedLogs
    .filter((log) => log.type === "consumption")
    .reduce((sum, log) => sum + Math.abs(log.quantityBags) * 25, 0);
  const averageFcr = totalHarvestBiomass > 0 && totalFeedConsumedKg > 0
    ? totalFeedConsumedKg / totalHarvestBiomass
    : null;

  // 2. Prepare Chart Data (Mortality Trend over time - monthly mock format)
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const mortalityTrendData = selectedPondId === "pond-1-laguna-north" ? [180, 240, 150, 120, 80, 100]
    : selectedPondId === "pond-2-laguna-south" ? [320, 410, 280, 350, 210, 180]
    : selectedPondId === "pond-3-bulacan-delta" ? [500, 800, 1200, 450, 1500, 900]
    : selectedPondId === "pond-4-rizal-hillside" ? [150, 220, 340, 180, 7650, 120]
    : [1150, 1670, 1970, 1100, 9440, 1300]; // combined

  const maxMortality = Math.max(...mortalityTrendData, 100);

  // 3. Prepare Harvest Yields by Pond
  const harvestLabels = ponds.map((p) => p.name);
  const harvestYieldData = ponds.map((p) => {
    const pondHarvests = harvests.filter((h) => h.pondId === p.id);
    return pondHarvests.reduce((sum, h) => sum + h.yieldKg, 0);
  });
  const maxHarvest = Math.max(...harvestYieldData, 500);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", color: "#1e293b" }}>
      {/* Filters Header */}
      <div style={{ background: "white", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#64748b" }}>Select Pond Scope:</label>
          <select
            value={selectedPondId}
            onChange={(e) => setSelectedPondId(e.target.value)}
            style={{
              padding: "8px 16px",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              fontSize: "0.9rem",
              background: "white",
              fontWeight: "500",
              outline: "none",
            }}
          >
            <option value="all">Global Farm Analytics</option>
            {ponds.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.currentSpecies || "No Species"})
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", background: "#f1f5f9", padding: "4px", borderRadius: "8px" }}>
          {(["30d", "90d", "12mo"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              style={{
                padding: "6px 16px",
                borderRadius: "6px",
                border: "none",
                fontSize: "0.85rem",
                fontWeight: "600",
                cursor: "pointer",
                background: timeframe === t ? "white" : "transparent",
                color: timeframe === t ? "#0f172a" : "#64748b",
                boxShadow: timeframe === t ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                transition: "all 0.2s",
              }}
            >
              {t === "30d" ? "Last 30 Days" : t === "90d" ? "Last 90 Days" : "12 Months"}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "20px" }}>
        <div style={{ background: "white", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
          <span style={{ fontSize: "0.875rem", color: "#64748b", fontWeight: "500" }}>Active Ponds / Total</span>
          <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "#0f172a", marginTop: "8px" }}>
            {totalActivePonds} <span style={{ fontSize: "1.1rem", color: "#94a3b8", fontWeight: "500" }}>/ {filteredPonds.length}</span>
          </div>
          <div style={{ marginTop: "8px", fontSize: "0.75rem", color: "#10b981", fontWeight: "600" }}>
            ↑ 100% operational efficiency
          </div>
        </div>

        <div style={{ background: "white", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
          <span style={{ fontSize: "0.875rem", color: "#64748b", fontWeight: "500" }}>Total Current Stock</span>
          <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "#0f172a", marginTop: "8px" }}>
            {totalStockedCount.toLocaleString()} <span style={{ fontSize: "0.9rem", color: "#64748b", fontWeight: "500" }}>pcs</span>
          </div>
          <div style={{ marginTop: "8px", fontSize: "0.75rem", color: "#3b82f6", fontWeight: "600" }}>
            Active grow-out density
          </div>
        </div>

        <div style={{ background: "white", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
          <span style={{ fontSize: "0.875rem", color: "#64748b", fontWeight: "500" }}>Average Survival Rate</span>
          <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "#0f172a", marginTop: "8px" }}>
            {averageSurvivalRate.toFixed(1)}%
          </div>
          <div style={{ marginTop: "8px", fontSize: "0.75rem", color: averageSurvivalRate > 90 ? "#10b981" : "#f59e0b", fontWeight: "600" }}>
            {averageSurvivalRate > 90 ? "Excellent survival metrics" : "Requires water quality audit"}
          </div>
        </div>

        <div style={{ background: "white", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
          <span style={{ fontSize: "0.875rem", color: "#64748b", fontWeight: "500" }}>Feed Conversion Ratio (FCR)</span>
          <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "#0f172a", marginTop: "8px" }}>
            {averageFcr === null ? "N/A" : averageFcr.toFixed(2)}
          </div>
          <div style={{ marginTop: "8px", fontSize: "0.75rem", color: averageFcr === null || averageFcr <= 1.5 ? "#10b981" : "#ef4444", fontWeight: "600" }}>
            {averageFcr === null
              ? "Awaiting feed and harvest pairing"
              : averageFcr <= 1.5
                ? "High feed-to-biomass efficiency"
                : "Elevated feed waste detected"}
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "24px" }}>
        {/* Mortality Trend Chart */}
        <div style={{ background: "white", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: "700", color: "#0f172a", marginBottom: "16px" }}>Mortality Trend (Quantity Over Time)</h3>
          
          <div style={{ height: "240px", position: "relative", width: "100%" }}>
            <svg viewBox="0 0 500 240" style={{ width: "100%", height: "100%" }}>
              {/* Grid Lines */}
              <line x1="40" y1="30" x2="480" y2="30" stroke="#f1f5f9" strokeWidth="1" />
              <line x1="40" y1="80" x2="480" y2="80" stroke="#f1f5f9" strokeWidth="1" />
              <line x1="40" y1="130" x2="480" y2="130" stroke="#f1f5f9" strokeWidth="1" />
              <line x1="40" y1="180" x2="480" y2="180" stroke="#cbd5e1" strokeWidth="1.5" />

              {/* Y Axis Labels */}
              <text x="32" y="34" fontSize="10" fill="#64748b" textAnchor="end">{Math.round(maxMortality).toLocaleString()}</text>
              <text x="32" y="105" fontSize="10" fill="#64748b" textAnchor="end">{Math.round(maxMortality / 2).toLocaleString()}</text>
              <text x="32" y="184" fontSize="10" fill="#64748b" textAnchor="end">0</text>

              {/* Draw Data Points and Lines */}
              {(() => {
                const points = mortalityTrendData.map((val, idx) => {
                  const x = 40 + (idx * 440) / (months.length - 1);
                  const y = 180 - (val / maxMortality) * 150;
                  return { x, y, val };
                });

                const pathD = points.reduce((acc, p, idx) => {
                  return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
                }, "");

                const areaD = `${pathD} L ${points[points.length - 1].x} 180 L ${points[0].x} 180 Z`;

                return (
                  <>
                    <path d={areaD} fill="url(#mortalityGrad)" opacity="0.15" />
                    <path d={pathD} fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />
                    
                    {points.map((p, idx) => (
                      <g key={idx}>
                        <circle cx={p.x} cy={p.y} r="5" fill="#ef4444" stroke="white" strokeWidth="2" />
                        <text x={p.x} y={p.y - 10} fontSize="10" fontWeight="700" fill="#ef4444" textAnchor="middle">
                          {p.val >= 1000 ? `${(p.val / 1000).toFixed(1)}k` : p.val}
                        </text>
                        {/* X Axis labels */}
                        <text x={p.x} y="200" fontSize="10.5" fontWeight="500" fill="#64748b" textAnchor="middle">
                          {months[idx]}
                        </text>
                      </g>
                    ))}
                  </>
                );
              })()}

              <defs>
                <linearGradient id="mortalityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        {/* Harvest Yields by Pond */}
        <div style={{ background: "white", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: "700", color: "#0f172a", marginBottom: "16px" }}>Harvest Yield Biomass by Pond (kg)</h3>

          <div style={{ height: "240px", position: "relative", width: "100%" }}>
            <svg viewBox="0 0 500 240" style={{ width: "100%", height: "100%" }}>
              {/* Grid Lines */}
              <line x1="40" y1="30" x2="480" y2="30" stroke="#f1f5f9" strokeWidth="1" />
              <line x1="40" y1="105" x2="480" y2="105" stroke="#f1f5f9" strokeWidth="1" />
              <line x1="40" y1="180" x2="480" y2="180" stroke="#cbd5e1" strokeWidth="1.5" />

              {/* Y Axis Labels */}
              <text x="32" y="34" fontSize="10" fill="#64748b" textAnchor="end">{maxHarvest.toLocaleString()} kg</text>
              <text x="32" y="109" fontSize="10" fill="#64748b" textAnchor="end">{(maxHarvest / 2).toLocaleString()} kg</text>
              <text x="32" y="184" fontSize="10" fill="#64748b" textAnchor="end">0</text>

              {/* Bars */}
              {harvestYieldData.map((val, idx) => {
                const barWidth = 45;
                const gap = (440 - barWidth * harvestYieldData.length) / (harvestYieldData.length + 1);
                const x = 40 + gap + idx * (barWidth + gap);
                const height = (val / maxHarvest) * 150;
                const y = 180 - height;

                return (
                  <g key={idx}>
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={Math.max(4, height)}
                      rx="4"
                      fill="url(#harvestGrad)"
                      style={{ transition: "all 0.3s" }}
                    />
                    <text x={x + barWidth / 2} y={y - 8} fontSize="10" fontWeight="700" fill="#3b82f6" textAnchor="middle">
                      {val.toLocaleString()}
                    </text>
                    <text x={x + barWidth / 2} y="196" fontSize="9" fontWeight="600" fill="#64748b" textAnchor="middle">
                      Pond {idx + 1}
                    </text>
                  </g>
                );
              })}

              <defs>
                <linearGradient id="harvestGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#1d4ed8" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>

      {/* Detailed Data Table */}
      <div style={{ background: "white", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
        <h3 style={{ fontSize: "1.1rem", fontWeight: "700", color: "#0f172a", marginBottom: "16px" }}>Pond-Level Stock & Analytics Summary</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                <th style={{ padding: "12px 8px", color: "#64748b", fontWeight: "600" }}>Pond Name</th>
                <th style={{ padding: "12px 8px", color: "#64748b", fontWeight: "600" }}>Species</th>
                <th style={{ padding: "12px 8px", color: "#64748b", fontWeight: "600" }}>Current Stock</th>
                <th style={{ padding: "12px 8px", color: "#64748b", fontWeight: "600" }}>Total Mortalities</th>
                <th style={{ padding: "12px 8px", color: "#64748b", fontWeight: "600" }}>Total Harvested</th>
                <th style={{ padding: "12px 8px", color: "#64748b", fontWeight: "600" }}>FCR</th>
                <th style={{ padding: "12px 8px", color: "#64748b", fontWeight: "600" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {ponds.map((pond) => {
                const pondMorts = mortalityLogs.filter((m) => m.pondId === pond.id).reduce((sum, m) => sum + m.quantity, 0);
                const pondHarvest = harvests.filter((h) => h.pondId === pond.id).reduce((sum, h) => sum + h.yieldKg, 0);
                const pondFeedKg = feedLogs
                  .filter((log) => log.pondId === pond.id && log.type === "consumption")
                  .reduce((sum, log) => sum + Math.abs(log.quantityBags) * 25, 0);
                const fcrVal = pondHarvest > 0 && pondFeedKg > 0 ? pondFeedKg / pondHarvest : null;

                return (
                  <tr key={pond.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "14px 8px", fontWeight: "600", color: "#0f172a" }}>{pond.name}</td>
                    <td style={{ padding: "14px 8px", color: "#334155" }}>{pond.currentSpecies || "None"}</td>
                    <td style={{ padding: "14px 8px", color: "#334155", fontWeight: "500" }}>{pond.currentStockCount.toLocaleString()} pcs</td>
                    <td style={{ padding: "14px 8px", color: "#ef4444", fontWeight: "500" }}>{pondMorts.toLocaleString()}</td>
                    <td style={{ padding: "14px 8px", color: "#10b981", fontWeight: "500" }}>{pondHarvest.toLocaleString()} kg</td>
                    <td style={{ padding: "14px 8px", color: "#4f46e5", fontWeight: "600" }}>
                      {fcrVal === null ? "N/A" : fcrVal.toFixed(2)}
                    </td>
                    <td style={{ padding: "14px 8px" }}>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontWeight: "600",
                          background: pond.currentStockCount < 1000 ? "#fee2e2" : "#dcfce7",
                          color: pond.currentStockCount < 1000 ? "#b91c1c" : "#15803d",
                        }}
                      >
                        {pond.currentStockCount < 1000 ? "Low Stock Alert" : "Healthy Stock"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
