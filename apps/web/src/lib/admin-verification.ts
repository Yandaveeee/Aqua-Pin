import type { Database, Json } from "@aquapin/shared";
import {
  MOCK_HARVESTS,
  MOCK_MORTALITY_LOGS,
  MOCK_PONDS,
  MOCK_STOCKING_LOGS,
  MOCK_VERIFICATION_ALERTS,
} from "@/lib/mock-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PondRow = Database["public"]["Tables"]["ponds"]["Row"];
type MortalityRow = Database["public"]["Tables"]["mortality_logs"]["Row"];
type HarvestRow = Database["public"]["Tables"]["harvests"]["Row"];
type StockingRow = Database["public"]["Tables"]["stocking_logs"]["Row"];
type PondHistoryRow = Database["public"]["Tables"]["pond_history"]["Row"];
type VerificationTone = "healthy" | "degraded" | "critical";

export type VerificationAlertType =
  | "gps_out_of_bounds"
  | "high_mortality"
  | "harvest_imbalance"
  | "impossible_growth"
  | "sync_error";

export interface VerificationAlert {
  id: string;
  pondId?: string;
  pondName?: string;
  severity: "info" | "warning" | "danger";
  type: VerificationAlertType;
  message: string;
  detail: string;
  createdAt: string;
}

export interface VerificationTableStat {
  table: string;
  total: number;
  lastRecord: string | null;
  status: VerificationTone;
  detail: string;
}

export interface VerificationReport {
  status: VerificationTone;
  generatedAt: string;
  alerts: VerificationAlert[];
  tables: VerificationTableStat[];
  syncErrors: number;
  errors: string[];
}

function isPlainObject(value: Json | null | undefined): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStaleSyncMinutes(settingsValue: Json | null | undefined) {
  if (!isPlainObject(settingsValue)) return 45;
  const rawValue = settingsValue.staleSyncMinutes;
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 45;
}

function getLastRecord<T extends { created_at: string }>(rows: T[]) {
  return rows
    .map((row) => row.created_at)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

function hasUsableBoundary(pond: PondRow) {
  if (!pond.boundary) return false;

  try {
    const parsed = JSON.parse(pond.boundary);
    return Array.isArray(parsed) && parsed.length >= 3;
  } catch {
    return false;
  }
}

function tableStat(table: string, rows: Array<{ created_at: string }>, detail: string): VerificationTableStat {
  return {
    table,
    total: rows.length,
    lastRecord: getLastRecord(rows),
    status: rows.length > 0 ? "healthy" : "degraded",
    detail,
  };
}

function buildMockReport(): VerificationReport {
  return {
    status: "degraded",
    generatedAt: new Date().toISOString(),
    alerts: MOCK_VERIFICATION_ALERTS,
    tables: [
      tableStat("ponds", MOCK_PONDS.map((row: any) => ({ created_at: row.createdAt })), "Mock pond boundaries loaded"),
      tableStat("stocking_logs", MOCK_STOCKING_LOGS.map((row: any) => ({ created_at: row.createdAt })), "Mock stocking records loaded"),
      tableStat("mortality_logs", MOCK_MORTALITY_LOGS.map((row: any) => ({ created_at: row.createdAt })), "Mock mortality records loaded"),
      tableStat("harvests", MOCK_HARVESTS.map((row: any) => ({ created_at: row.createdAt })), "Mock harvest records loaded"),
    ],
    syncErrors: MOCK_VERIFICATION_ALERTS.filter((alert: VerificationAlert) => alert.type === "sync_error").length,
    errors: [],
  };
}

export async function getAdminVerificationReport(): Promise<VerificationReport> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const isMock = cookieStore.get("aquapin_mock_admin")?.value === "true";

  if (isMock) return buildMockReport();

  const supabase = (await createSupabaseServerClient()) as any;
  const [pondsResult, mortalityResult, harvestResult, stockingResult, historyResult, settingsResult] =
    await Promise.all([
      supabase.from("ponds").select("*"),
      supabase.from("mortality_logs").select("*"),
      supabase.from("harvests").select("*"),
      supabase.from("stocking_logs").select("*"),
      supabase.from("pond_history").select("*"),
      supabase.from("admin_settings").select("section, value").eq("section", "notifications").maybeSingle(),
    ]);

  const errors = [
    pondsResult.error ? `ponds: ${pondsResult.error.message}` : null,
    mortalityResult.error ? `mortality_logs: ${mortalityResult.error.message}` : null,
    harvestResult.error ? `harvests: ${harvestResult.error.message}` : null,
    stockingResult.error ? `stocking_logs: ${stockingResult.error.message}` : null,
    historyResult.error ? `pond_history: ${historyResult.error.message}` : null,
    settingsResult.error ? `admin_settings: ${settingsResult.error.message}` : null,
  ].filter(Boolean) as string[];

  const ponds = ((pondsResult.data ?? []) as PondRow[]);
  const mortalities = ((mortalityResult.data ?? []) as MortalityRow[]);
  const harvests = ((harvestResult.data ?? []) as HarvestRow[]);
  const stockings = ((stockingResult.data ?? []) as StockingRow[]);
  const history = ((historyResult.data ?? []) as PondHistoryRow[]);
  const staleSyncMinutes = getStaleSyncMinutes(settingsResult.data?.value);
  const now = Date.now();

  const alerts: VerificationAlert[] = [];
  const pondMap = new Map(ponds.map((pond) => [pond.id, pond]));
  const stockedByPond = new Map<string, number>();
  const mortalityByPond = new Map<string, number>();
  const lastHistoryByPond = new Map<string, string>();

  stockings.forEach((row) => {
    if (row.status.toLowerCase() === "harvested") return;
    stockedByPond.set(row.pond_id, (stockedByPond.get(row.pond_id) ?? 0) + row.quantity);
  });

  mortalities.forEach((row) => {
    mortalityByPond.set(row.pond_id, (mortalityByPond.get(row.pond_id) ?? 0) + row.quantity);
  });

  history.forEach((row) => {
    const previous = lastHistoryByPond.get(row.pond_id);
    if (!previous || new Date(row.created_at).getTime() > new Date(previous).getTime()) {
      lastHistoryByPond.set(row.pond_id, row.created_at);
    }
  });

  ponds.forEach((pond) => {
    if (!hasUsableBoundary(pond)) {
      alerts.push({
        id: `boundary-${pond.id}`,
        pondId: pond.id,
        pondName: pond.name,
        severity: pond.is_active ? "warning" : "info",
        type: "gps_out_of_bounds",
        message: "Boundary needs verification",
        detail: `${pond.name} does not have a valid multi-point boundary saved for GIS review.`,
        createdAt: new Date().toISOString(),
      });
    }

    if (pond.is_active) {
      const lastHistoryAt = lastHistoryByPond.get(pond.id);
      const staleMinutes = lastHistoryAt
        ? Math.round((now - new Date(lastHistoryAt).getTime()) / 60000)
        : Number.POSITIVE_INFINITY;

      if (!lastHistoryAt || staleMinutes > staleSyncMinutes) {
        alerts.push({
          id: `stale-${pond.id}`,
          pondId: pond.id,
          pondName: pond.name,
          severity: "warning",
          type: "sync_error",
          message: "Stale pond activity",
          detail: lastHistoryAt
            ? `${pond.name} has no pond history update for ${staleMinutes.toLocaleString()} minutes. Target window is ${staleSyncMinutes} minutes.`
            : `${pond.name} has no pond history records. Verify mobile sync and field activity submission.`,
          createdAt: lastHistoryAt ?? new Date().toISOString(),
        });
      }
    }
  });

  mortalities.forEach((row) => {
    const pond = pondMap.get(row.pond_id);
    const stocked = stockedByPond.get(row.pond_id) ?? pond?.current_stock_count ?? 0;
    const mortalityRate = stocked > 0 ? (row.quantity / stocked) * 100 : 0;
    const threshold = Math.max(500, stocked * 0.1);

    if (row.quantity >= threshold) {
      alerts.push({
        id: `mortality-${row.id}`,
        pondId: row.pond_id,
        pondName: pond?.name,
        severity: mortalityRate >= 25 || row.quantity >= 2500 ? "danger" : "warning",
        type: "high_mortality",
        message: "High mortality detected",
        detail:
          stocked > 0
            ? `${row.quantity.toLocaleString()} mortalities represent ${mortalityRate.toFixed(1)}% of tracked stock for ${pond?.name ?? row.pond_id}.`
            : `${row.quantity.toLocaleString()} mortalities were logged without an active stocking baseline.`,
        createdAt: row.created_at,
      });
    }
  });

  harvests.forEach((row) => {
    const pond = pondMap.get(row.pond_id);
    const currentStock = pond?.current_stock_count ?? 0;

    if (row.fish_count && currentStock > 0 && row.is_partial && row.fish_count > currentStock * 1.5) {
      alerts.push({
        id: `harvest-imbalance-${row.id}`,
        pondId: row.pond_id,
        pondName: pond?.name,
        severity: "warning",
        type: "harvest_imbalance",
        message: "Harvest count exceeds remaining stock",
        detail: `${row.fish_count.toLocaleString()} harvested fish were logged while the pond shows ${currentStock.toLocaleString()} fish remaining.`,
        createdAt: row.created_at,
      });
    }

    if (row.fish_count && row.fish_count > 0) {
      const kgPerFish = row.yield_kg / row.fish_count;
      if (kgPerFish > 2 || kgPerFish < 0.02) {
        alerts.push({
          id: `growth-${row.id}`,
          pondId: row.pond_id,
          pondName: pond?.name,
          severity: "warning",
          type: "impossible_growth",
          message: "Harvest weight needs review",
          detail: `Average harvest weight is ${kgPerFish.toFixed(2)} kg/fish, outside normal validation bounds.`,
          createdAt: row.created_at,
        });
      }
    }
  });

  const dangerCount = alerts.filter((alert) => alert.severity === "danger").length;
  const status: VerificationTone =
    errors.length > 0 || dangerCount > 0 ? "critical" : alerts.length > 0 ? "degraded" : "healthy";

  return {
    status,
    generatedAt: new Date().toISOString(),
    alerts: alerts.sort((a, b) => {
      const severityRank = { danger: 0, warning: 1, info: 2 };
      return severityRank[a.severity] - severityRank[b.severity]
        || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }),
    tables: [
      tableStat("ponds", ponds, "Pond geometry and current stock records"),
      tableStat("stocking_logs", stockings, "Stocking baselines used for survival checks"),
      tableStat("mortality_logs", mortalities, "Mortality events scanned for anomaly thresholds"),
      tableStat("harvests", harvests, "Harvest biomass and fish count records"),
      tableStat("pond_history", history, "Mobile sync history and field activity trail"),
    ],
    syncErrors: alerts.filter((alert) => alert.type === "sync_error").length,
    errors,
  };
}
