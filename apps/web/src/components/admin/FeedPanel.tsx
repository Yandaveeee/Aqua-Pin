"use client";

import React, { useState } from "react";
import {
  MOCK_FEED_LOGS,
  MOCK_FEED_INVENTORY,
  MOCK_PONDS,
  MockFeedLog,
  MockPond,
} from "@/lib/mock-data";
import {
  createFeedLogAction,
  createStockingPlanAction,
} from "@/app/admin/feed/actions";

interface FeedPanelProps {
  ponds?: MockPond[];
  feedLogs?: MockFeedLog[];
  inventory?: FeedInventorySnapshot;
  stockingPlans?: StockingPlan[];
}

export interface FeedInventorySnapshot {
  remainingBags: number;
  estimatedDays: number;
  consumptionRateBagsPerDay: number;
  lowStockAlert: boolean;
  items: Array<{
    brand: string;
    remainingBags: number;
    thresholdBags: number;
    low: boolean;
  }>;
}

export interface StockingPlan {
  id: string;
  pondId: string;
  species: string;
  quantity: number;
  averageWeightG: number;
  stockedBy: string;
  plannedDate: string;
  feedBudgetBags: number;
}

const DEFAULT_STOCKING_PLANS: StockingPlan[] = [
  {
    id: "plan-1",
    pondId: "pond-1-laguna-north",
    species: "Tilapia",
    quantity: 15000,
    averageWeightG: 0.5,
    stockedBy: "Miguel Cruz",
    plannedDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split("T")[0],
    feedBudgetBags: 45,
  },
  {
    id: "plan-2",
    pondId: "pond-4-rizal-hillside",
    species: "Tilapia",
    quantity: 8000,
    averageWeightG: 0.5,
    stockedBy: "Jose Rizal",
    plannedDate: new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString().split("T")[0],
    feedBudgetBags: 24,
  },
];

export default function FeedPanel({
  ponds = MOCK_PONDS,
  feedLogs = MOCK_FEED_LOGS,
  inventory = MOCK_FEED_INVENTORY,
  stockingPlans = DEFAULT_STOCKING_PLANS,
}: FeedPanelProps) {
  const [activeTab, setActiveTab] = useState<"inventory" | "planner">("inventory");

  const [showLogModal, setShowLogModal] = useState(false);
  const [feedBrand, setFeedBrand] = useState("");
  const [feedType, setFeedType] = useState<"purchase" | "consumption" | "adjustment">("purchase");
  const [quantity, setQuantity] = useState(10);
  const [pondId, setPondId] = useState(ponds[0]?.id || "");
  const [notes, setNotes] = useState("");

  const [showPlannerModal, setShowPlannerModal] = useState(false);
  const [planPondId, setPlanPondId] = useState(ponds[0]?.id || "");
  const [planSpecies, setPlanSpecies] = useState("Tilapia");
  const [planQuantity, setPlanQuantity] = useState(10000);
  const [planWeight, setPlanWeight] = useState(0.5);
  const [planDate, setPlanDate] = useState("");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", color: "#1e293b" }}>
      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", gap: "16px" }}>
        <button
          onClick={() => setActiveTab("inventory")}
          style={{
            padding: "12px 16px",
            fontSize: "1rem",
            fontWeight: "600",
            border: "none",
            background: "none",
            borderBottom: activeTab === "inventory" ? "2px solid #3b82f6" : "none",
            color: activeTab === "inventory" ? "#3b82f6" : "#64748b",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          Feed Inventory Logs
        </button>
        <button
          onClick={() => setActiveTab("planner")}
          style={{
            padding: "12px 16px",
            fontSize: "1rem",
            fontWeight: "600",
            border: "none",
            background: "none",
            borderBottom: activeTab === "planner" ? "2px solid #3b82f6" : "none",
            color: activeTab === "planner" ? "#3b82f6" : "#64748b",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          Stocking Planning Logs
        </button>
      </div>

      {activeTab === "inventory" ? (
        <>
          {/* Inventory Overview */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px" }}>
            <div style={{ background: "white", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: "0.875rem", color: "#64748b", fontWeight: "600" }}>Total Feed Available</span>
                <div style={{ fontSize: "2rem", fontWeight: "800", color: "#0f172a", marginTop: "8px" }}>
                  {inventory.remainingBags} <span style={{ fontSize: "1.1rem", fontWeight: "500", color: "#64748b" }}>Bags</span>
                </div>
                <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>1 bag = 25 kg standard</span>
              </div>
              <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "#eff6ff", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center", color: "#3b82f6", fontSize: "1.8rem" }}>🌾</div>
            </div>

            <div style={{ background: "white", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: "0.875rem", color: "#64748b", fontWeight: "600" }}>Daily Consumption Rate</span>
                <div style={{ fontSize: "2rem", fontWeight: "800", color: "#0f172a", marginTop: "8px" }}>
                  {inventory.consumptionRateBagsPerDay} <span style={{ fontSize: "1.1rem", fontWeight: "500", color: "#64748b" }}>Bags/day</span>
                </div>
                <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>~202.5 kg feed consumed daily</span>
              </div>
              <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "#fef2f2", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center", color: "#ef4444", fontSize: "1.8rem" }}>📉</div>
            </div>

            <div style={{ background: "white", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: "0.875rem", color: "#64748b", fontWeight: "600" }}>Forecast Days Remaining</span>
                <div style={{ fontSize: "2rem", fontWeight: "800", color: inventory.remainingBags < 100 ? "#e11d48" : "#0d9488", marginTop: "8px" }}>
                  {inventory.estimatedDays} <span style={{ fontSize: "1.1rem", fontWeight: "500", color: "#64748b" }}>Days</span>
                </div>
                <span style={{ fontSize: "0.75rem", color: inventory.remainingBags < 100 ? "#b91c1c" : "#0f766e", fontWeight: "500" }}>
                  {inventory.remainingBags < 100 ? "⚠️ Critical refill threshold" : "Stock level is stable"}
                </span>
              </div>
              <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: inventory.remainingBags < 100 ? "#fee2e2" : "#ccfbf1", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center", color: inventory.remainingBags < 100 ? "#ef4444" : "#0d9488", fontSize: "1.8rem" }}>⏰</div>
            </div>
          </div>

          {/* Action Row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px" }}>
            <h3 style={{ fontSize: "1.2rem", fontWeight: "700", color: "#0f172a" }}>Inventory & Log Book</h3>
            <button
              onClick={() => setShowLogModal(true)}
              style={{
                background: "#0f172a",
                color: "white",
                border: "none",
                padding: "10px 20px",
                borderRadius: "8px",
                fontWeight: "600",
                fontSize: "0.875rem",
                cursor: "pointer",
                transition: "background 0.2s",
              }}
            >
              + Log Feed Movement
            </button>
          </div>

          {/* Feed Brand Status List */}
          <div style={{ background: "white", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <h4 style={{ fontWeight: "700", marginBottom: "12px" }}>Stock levels by Feed Type</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {inventory.items.map((item) => (
                <div key={item.brand} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", fontWeight: "600" }}>
                    <span>{item.brand}</span>
                    <span style={{ color: item.low ? "#ef4444" : "#10b981" }}>
                      {item.remainingBags} Bags {item.low && "(Low Stock)"}
                    </span>
                  </div>
                  <div style={{ width: "100%", height: "8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${Math.min(100, (item.remainingBags / 100) * 100)}%`,
                        height: "100%",
                        background: item.low ? "#ef4444" : "#10b981",
                        borderRadius: "4px",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Feed Logs Table */}
          <div style={{ background: "white", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                    <th style={{ padding: "12px 8px", color: "#64748b", fontWeight: "600" }}>Date</th>
                    <th style={{ padding: "12px 8px", color: "#64748b", fontWeight: "600" }}>Type</th>
                    <th style={{ padding: "12px 8px", color: "#64748b", fontWeight: "600" }}>Feed Brand</th>
                    <th style={{ padding: "12px 8px", color: "#64748b", fontWeight: "600" }}>Qty (Bags)</th>
                    <th style={{ padding: "12px 8px", color: "#64748b", fontWeight: "600" }}>Affected Pond</th>
                    <th style={{ padding: "12px 8px", color: "#64748b", fontWeight: "600" }}>Logged By</th>
                    <th style={{ padding: "12px 8px", color: "#64748b", fontWeight: "600" }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {feedLogs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "14px 8px", color: "#334155" }}>
                        {new Date(log.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td style={{ padding: "14px 8px" }}>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontWeight: "600",
                            background: log.quantityBags >= 0 ? "#dcfce7" : "#fee2e2",
                            color: log.quantityBags >= 0 ? "#15803d" : "#b91c1c",
                          }}
                        >
                          {log.type === "purchase"
                            ? "Refill / Purchase"
                            : log.type === "adjustment"
                              ? "Adjustment"
                              : "Consumption"}
                        </span>
                      </td>
                      <td style={{ padding: "14px 8px", fontWeight: "500" }}>{log.feedBrand}</td>
                      <td style={{ padding: "14px 8px", fontWeight: "700", color: log.quantityBags >= 0 ? "#10b981" : "#ef4444" }}>
                        {log.quantityBags > 0 ? `+${log.quantityBags}` : log.quantityBags}
                      </td>
                      <td style={{ padding: "14px 8px", color: "#475569" }}>{log.pondName || "Global Inventory"}</td>
                      <td style={{ padding: "14px 8px", color: "#64748b" }}>{log.loggedBy}</td>
                      <td style={{ padding: "14px 8px", color: "#64748b", fontStyle: "italic" }}>{log.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Planner Overview */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: "1.2rem", fontWeight: "700", color: "#0f172a" }}>Target Stocking Density Planner</h3>
            <button
              onClick={() => setShowPlannerModal(true)}
              style={{
                background: "#0f172a",
                color: "white",
                border: "none",
                padding: "10px 20px",
                borderRadius: "8px",
                fontWeight: "600",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              + Create Stocking Plan
            </button>
          </div>

          <div style={{ background: "white", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                    <th style={{ padding: "12px 8px", color: "#64748b", fontWeight: "600" }}>Target Pond</th>
                    <th style={{ padding: "12px 8px", color: "#64748b", fontWeight: "600" }}>Pond Size (m²)</th>
                    <th style={{ padding: "12px 8px", color: "#64748b", fontWeight: "600" }}>Planned Date</th>
                    <th style={{ padding: "12px 8px", color: "#64748b", fontWeight: "600" }}>Species</th>
                    <th style={{ padding: "12px 8px", color: "#64748b", fontWeight: "600" }}>Planned Qty</th>
                    <th style={{ padding: "12px 8px", color: "#64748b", fontWeight: "600" }}>Target Density</th>
                    <th style={{ padding: "12px 8px", color: "#64748b", fontWeight: "600" }}>Feed Budget</th>
                    <th style={{ padding: "12px 8px", color: "#64748b", fontWeight: "600" }}>Planned By</th>
                  </tr>
                </thead>
                <tbody>
                  {stockingPlans.map((plan) => {
                    const matchedPond = ponds.find((p) => p.id === plan.pondId);
                    const size = matchedPond?.areaSqm || 10000;
                    const density = plan.quantity / size;
                    const densityAlert = density > 10;

                    return (
                      <tr key={plan.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "14px 8px", fontWeight: "600" }}>{matchedPond?.name}</td>
                        <td style={{ padding: "14px 8px", color: "#334155" }}>{size.toLocaleString()} m²</td>
                        <td style={{ padding: "14px 8px", color: "#334155" }}>{plan.plannedDate}</td>
                        <td style={{ padding: "14px 8px", color: "#334155" }}>{plan.species}</td>
                        <td style={{ padding: "14px 8px", fontWeight: "600" }}>{plan.quantity.toLocaleString()} pcs</td>
                        <td style={{ padding: "14px 8px" }}>
                          <span style={{ fontWeight: "700", color: densityAlert ? "#ef4444" : "#10b981" }}>
                            {density.toFixed(1)} fish/m²
                          </span>{" "}
                          {densityAlert && "(Excessive)"}
                        </td>
                        <td style={{ padding: "14px 8px", color: "#4f46e5", fontWeight: "600" }}>{plan.feedBudgetBags} Bags</td>
                        <td style={{ padding: "14px 8px", color: "#64748b" }}>{plan.stockedBy}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Feed Modal */}
      {showLogModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <form action={createFeedLogAction} style={{ background: "white", padding: "24px", borderRadius: "12px", width: "400px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <h3 style={{ margin: 0, fontWeight: "700", fontSize: "1.2rem" }}>Log Feed Movement</h3>
            
            <label style={{ fontSize: "0.85rem", fontWeight: "600", display: "flex", flexDirection: "column", gap: "6px" }}>
              Action Type
              <select name="feedType" value={feedType} onChange={(e) => setFeedType(e.target.value as any)} style={{ padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                <option value="purchase">Refill / Purchase</option>
                <option value="consumption">Consumption / Feeding</option>
                <option value="adjustment">Inventory Adjustment</option>
              </select>
            </label>

            <label style={{ fontSize: "0.85rem", fontWeight: "600", display: "flex", flexDirection: "column", gap: "6px" }}>
              Feed Brand
              <input name="feedBrand" type="text" value={feedBrand} onChange={(e) => setFeedBrand(e.target.value)} placeholder="e.g. Tateh Tilapia Starter" required style={{ padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }} />
            </label>

            <label style={{ fontSize: "0.85rem", fontWeight: "600", display: "flex", flexDirection: "column", gap: "6px" }}>
              Quantity (Bags)
              <input name="quantity" type="number" min="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} required style={{ padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }} />
            </label>

            {feedType === "consumption" && (
              <label style={{ fontSize: "0.85rem", fontWeight: "600", display: "flex", flexDirection: "column", gap: "6px" }}>
                Select Pond
                <select name="pondId" value={pondId} onChange={(e) => setPondId(e.target.value)} style={{ padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                  {ponds.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
            )}

            <label style={{ fontSize: "0.85rem", fontWeight: "600", display: "flex", flexDirection: "column", gap: "6px" }}>
              Notes
              <textarea name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add remarks..." style={{ padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", minHeight: "60px", resize: "none" }} />
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
              <button type="button" onClick={() => setShowLogModal(false)} style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "none", cursor: "pointer" }}>Cancel</button>
              <button type="submit" style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "#0f172a", color: "white", fontWeight: "600", cursor: "pointer" }}>Save Log</button>
            </div>
          </form>
        </div>
      )}

      {/* Stocking Planner Modal */}
      {showPlannerModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <form action={createStockingPlanAction} style={{ background: "white", padding: "24px", borderRadius: "12px", width: "400px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <h3 style={{ margin: 0, fontWeight: "700", fontSize: "1.2rem" }}>Create Stocking Plan</h3>
            
            <label style={{ fontSize: "0.85rem", fontWeight: "600", display: "flex", flexDirection: "column", gap: "6px" }}>
              Target Pond
              <select name="planPondId" value={planPondId} onChange={(e) => setPlanPondId(e.target.value)} style={{ padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                {ponds.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.areaSqm} m²)</option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: "0.85rem", fontWeight: "600", display: "flex", flexDirection: "column", gap: "6px" }}>
              Species
              <input name="planSpecies" type="text" value={planSpecies} onChange={(e) => setPlanSpecies(e.target.value)} required style={{ padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }} />
            </label>

            <label style={{ fontSize: "0.85rem", fontWeight: "600", display: "flex", flexDirection: "column", gap: "6px" }}>
              Target Stock Quantity (pcs)
              <input name="planQuantity" type="number" min="1" value={planQuantity} onChange={(e) => setPlanQuantity(Number(e.target.value))} required style={{ padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }} />
            </label>

            <label style={{ fontSize: "0.85rem", fontWeight: "600", display: "flex", flexDirection: "column", gap: "6px" }}>
              Initial Average Weight (g)
              <input name="planWeight" type="number" step="0.1" value={planWeight} onChange={(e) => setPlanWeight(Number(e.target.value))} required style={{ padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }} />
            </label>

            <label style={{ fontSize: "0.85rem", fontWeight: "600", display: "flex", flexDirection: "column", gap: "6px" }}>
              Planned Stock Date
              <input name="planDate" type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} required style={{ padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }} />
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
              <button type="button" onClick={() => setShowPlannerModal(false)} style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "none", cursor: "pointer" }}>Cancel</button>
              <button type="submit" style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "#0f172a", color: "white", fontWeight: "600", cursor: "pointer" }}>Save Plan</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
