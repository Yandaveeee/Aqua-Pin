import type { Json } from "@aquapin/shared";
import type { Database } from "@aquapin/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeAdminSettingSection } from "@/lib/admin-settings";
import { formatSignedDelta, pluralize } from "@/lib/admin-format";

type EventTable = "stocking_logs" | "mortality_logs" | "harvests" | "pond_history";
type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type SettingsRow = Pick<
  Database["public"]["Tables"]["admin_settings"]["Row"],
  "section" | "value"
>;
type PondSummaryRow = Pick<
  Database["public"]["Tables"]["ponds"]["Row"],
  "id" | "name" | "is_active" | "current_stock_count"
>;
type PondHistoryRow = Database["public"]["Tables"]["pond_history"]["Row"];
type ProfileLabelRow = Pick<
  Database["public"]["Tables"]["public_profiles"]["Row"],
  "id" | "email"
>;

const EVENT_TABLES: EventTable[] = ["stocking_logs", "mortality_logs", "harvests", "pond_history"];

export type ShellData = {
  organizationName: string;
  attentionCount: number;
  navBadges: {
    dashboard: number;
    settings: number;
  };
};

export type DashboardMetric = {
  label: string;
  value: string;
  detail: string;
  trend: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  href: string;
};

export type DashboardAttentionItem = {
  id: string;
  title: string;
  description: string;
  tone: "info" | "warning" | "danger";
  href: string;
  actionLabel: string;
};

export type DashboardTimelineItem = {
  id: string;
  createdAt: string;
  pondName: string;
  actorName: string;
  badge: string;
  tone: "info" | "success" | "warning" | "danger";
  summary: string;
  detail: string;
  rawData: Json | null;
};

export type DashboardOverview = {
  metrics: DashboardMetric[];
  attentionItems: DashboardAttentionItem[];
  recentEvents: DashboardTimelineItem[];
  counts: {
    totalStaff: number;
    lowStockCount: number;
    stalePondsCount: number;
    activePonds: number;
    totalPonds: number;
  };
  thresholds: {
    lowStockThreshold: number;
    staleSyncMinutes: number;
  };
  updatedAt: string;
};

function isPlainObject(value: Json | null): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toTitleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function readNumber(raw: Record<string, Json>, keys: string[]) {
  for (const key of keys) {
    const value = Number(raw[key]);
    if (Number.isFinite(value)) return value;
  }

  return null;
}

function readString(raw: Record<string, Json>, keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function eventToneForType(eventType: string) {
  const normalized = eventType.toLowerCase();

  if (
    normalized.includes("mortal") ||
    normalized.includes("error") ||
    normalized.includes("critical") ||
    normalized.includes("alert")
  ) {
    return "danger" as const;
  }

  if (normalized.includes("stock") || normalized.includes("approve")) {
    return "success" as const;
  }

  if (normalized.includes("harvest")) {
    return "info" as const;
  }

  return "warning" as const;
}

function summarizeEvent(event: PondHistoryRow, pondName: string) {
  const eventData = isPlainObject(event.event_data) ? event.event_data : {};
  const eventType = event.event_type.toLowerCase();
  const badge = toTitleCase(event.event_type);

  if (eventType.includes("stock")) {
    const quantity = readNumber(eventData, ["quantity", "stockCount", "count"]);
    const species = readString(eventData, ["species", "current_species"]);
    return {
      badge,
      tone: "success" as const,
      summary: quantity
        ? `${pluralize(quantity, "fish")} stocked into ${pondName}.`
        : `Stocking activity recorded for ${pondName}.`,
      detail: species ? `Species: ${species}` : "Stocking parameters updated.",
    };
  }

  if (eventType.includes("mortal")) {
    const quantity = readNumber(eventData, ["quantity", "count", "losses"]);
    const notes = readString(eventData, ["notes", "reason"]);
    return {
      badge,
      tone: "danger" as const,
      summary: quantity
        ? `${pluralize(quantity, "mortality event", "mortality events")} logged for ${pondName}.`
        : `Mortality activity recorded for ${pondName}.`,
      detail: notes ? notes : "Review pond health and follow-up actions.",
    };
  }

  if (eventType.includes("harvest")) {
    const yieldKg = readNumber(eventData, ["yield_kg", "yieldKg", "weightKg"]);
    const fishCount = readNumber(eventData, ["fish_count", "fishCount", "count"]);
    return {
      badge,
      tone: "info" as const,
      summary: yieldKg
        ? `${yieldKg} kg harvested from ${pondName}.`
        : `Harvest activity recorded for ${pondName}.`,
      detail: fishCount
        ? `${pluralize(fishCount, "fish")} counted in the harvest record.`
        : "Harvest totals updated.",
    };
  }

  const notes = readString(eventData, ["notes", "message", "summary"]);
  return {
    badge,
    tone: eventToneForType(event.event_type),
    summary: `${toTitleCase(event.event_type)} recorded for ${pondName}.`,
    detail: notes ?? "Open the event payload for more context.",
  };
}

async function countRows(
  supabase: SupabaseClient,
  table: string,
  applyFilters?: (query: any) => any
): Promise<number> {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (applyFilters) {
    query = applyFilters(query);
  }

  const { count, error } = await query;
  if (error) {
    console.error(`Count failed for ${table}:`, error.message);
    return 0;
  }

  return count ?? 0;
}

async function countEventsBetween(supabase: SupabaseClient, sinceIso: string, untilIso?: string) {
  const counts = await Promise.all(
    EVENT_TABLES.map((table) =>
      countRows(supabase, table, (query) => {
        let nextQuery = query.gte("created_at", sinceIso);
        if (untilIso) {
          nextQuery = nextQuery.lt("created_at", untilIso);
        }

        return nextQuery;
      })
    )
  );

  return counts.reduce((sum, value) => sum + value, 0);
}

async function getSettingsSnapshot(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("admin_settings")
    .select("section, value")
    .in("section", ["general", "operations", "notifications"]);

  if (error) {
    console.error("Failed to load admin settings snapshot:", error.message);
  }

  const rows = (data ?? []) as SettingsRow[];
  const rowMap = new Map(rows.map((row) => [row.section, row.value]));

  return {
    general: normalizeAdminSettingSection("general", rowMap.get("general")),
    operations: normalizeAdminSettingSection("operations", rowMap.get("operations")),
    notifications: normalizeAdminSettingSection("notifications", rowMap.get("notifications")),
  };
}

async function getStalePonds(supabase: SupabaseClient, staleSyncMinutes: number) {
  const sinceIso = new Date(Date.now() - staleSyncMinutes * 60 * 1000).toISOString();
  const [{ data: activePondsData, error: activePondsError }, { data: recentHistoryData, error: recentHistoryError }] =
    await Promise.all([
      supabase
        .from("ponds")
        .select("id, name, is_active, current_stock_count")
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase.from("pond_history").select("pond_id").gte("created_at", sinceIso),
    ]);

  if (activePondsError) {
    console.error("Failed to load active ponds:", activePondsError.message);
  }

  if (recentHistoryError) {
    console.error("Failed to load recent pond history for stale check:", recentHistoryError.message);
  }

  const activePonds = (activePondsData ?? []) as PondSummaryRow[];
  const recentHistoryRows = (recentHistoryData ?? []) as Array<{ pond_id: string }>;
  const recentPondIds = new Set(recentHistoryRows.map((row) => row.pond_id));

  return activePonds.filter((pond) => !recentPondIds.has(pond.id));
}

export async function getAdminShellData(): Promise<ShellData> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const isMock = cookieStore.get("aquapin_mock_admin")?.value === "true";

  if (isMock) {
    return {
      organizationName: "AquaPin Laguna Farm (Mock)",
      attentionCount: 1,
      navBadges: {
        dashboard: 1,
        settings: 2,
      },
    };
  }

  const supabase = await createSupabaseServerClient();
  const [settingsSnapshot, settingsChanges24h] = await Promise.all([
    getSettingsSnapshot(supabase),
    countRows(supabase, "admin_settings_audit", (query) =>
      query.gte("changed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    ),
  ]);

  const lowStockThreshold = settingsSnapshot.operations.lowStockThreshold;
  const staleSyncMinutes = settingsSnapshot.notifications.staleSyncMinutes;

  const [lowStockCount, stalePonds] = await Promise.all([
    countRows(supabase, "ponds", (query) =>
      query.eq("is_active", true).lt("current_stock_count", lowStockThreshold)
    ),
    getStalePonds(supabase, staleSyncMinutes),
  ]);

  const attentionCount = [lowStockCount, stalePonds.length].filter(
    (count) => count > 0
  ).length;

  return {
    organizationName: settingsSnapshot.general.organizationName,
    attentionCount,
    navBadges: {
      dashboard: attentionCount,
      settings: settingsChanges24h,
    },
  };
}

export async function getDashboardOverview(days: number): Promise<DashboardOverview> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const isMock = cookieStore.get("aquapin_mock_admin")?.value === "true";

  if (isMock) {
    const { MOCK_PONDS, MOCK_STOCKING_LOGS, MOCK_MORTALITY_LOGS, MOCK_HARVESTS } = await import("./mock-data");

    const timelineItems: DashboardTimelineItem[] = [];
    MOCK_STOCKING_LOGS.forEach((log) => {
      timelineItems.push({
        id: log.id,
        createdAt: log.createdAt,
        pondName: log.pondName,
        actorName: log.stockedBy.split("@")[0].replace("staff-", ""),
        badge: "Stocking",
        tone: "success",
        summary: `${log.quantity.toLocaleString()} Tilapia stocked into ${log.pondName}.`,
        detail: `Source: ${log.source}, Avg Weight: ${log.averageWeightG}g`,
        rawData: log as any,
      });
    });

    MOCK_MORTALITY_LOGS.forEach((log) => {
      timelineItems.push({
        id: log.id,
        createdAt: log.createdAt,
        pondName: log.pondName,
        actorName: log.loggedBy.split("@")[0].replace("staff-", ""),
        badge: "Mortality",
        tone: "danger",
        summary: `${log.quantity.toLocaleString()} mortalities logged for ${log.pondName}.`,
        detail: `Reason: ${log.notes}`,
        rawData: log as any,
      });
    });

    MOCK_HARVESTS.forEach((log) => {
      timelineItems.push({
        id: log.id,
        createdAt: log.createdAt,
        pondName: log.pondName,
        actorName: log.harvestedBy.split("@")[0].replace("staff-", ""),
        badge: "Harvest",
        tone: "info",
        summary: `${log.yieldKg.toLocaleString()} kg harvested from ${log.pondName}.`,
        detail: `Species: ${log.species}, Fish Count: ${log.fishCount.toLocaleString()}`,
        rawData: log as any,
      });
    });

    // Filter timeline by days
    const feedSinceTime = Date.now() - days * 24 * 60 * 60 * 1000;
    const filteredTimeline = timelineItems
      .filter((item) => new Date(item.createdAt).getTime() >= feedSinceTime)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const attentionItems: DashboardAttentionItem[] = [
      {
        id: "low-stock",
        title: "1 low-stock pond below threshold",
        description: "Rizal Hillside Pond D (350). Threshold: 1500.",
        tone: "danger",
        href: "/admin/ponds",
        actionLabel: "Inspect pond health",
      },
    ];

    const metrics: DashboardMetric[] = [
      {
        label: "Field Staff",
        value: "3",
        detail: "Mobile users with field access",
        trend: "View staff accounts and roles",
        tone: "neutral",
        href: "/admin/users",
      },
      {
        label: "Low-Stock Ponds",
        value: "1",
        detail: "Threshold below 1500 fish",
        trend: "1 pond needs restock review",
        tone: "danger",
        href: "/admin/ponds",
      },
      {
        label: "Stale Activity",
        value: "0",
        detail: "No pond history in 45 minutes",
        trend: "All active ponds reporting within target window",
        tone: "success",
        href: "/admin/ponds",
      },
      {
        label: "Activity (24h)",
        value: "3",
        detail: "Stocking, mortality, harvest, and history records",
        trend: "+1 vs previous 24h",
        tone: "success",
        href: "/admin/records?days=1",
      },
      {
        label: "Active Ponds",
        value: `${MOCK_PONDS.filter((p) => p.isActive).length}/${MOCK_PONDS.length}`,
        detail: "3 field staff records supporting operations",
        trend: "All ponds marked active",
        tone: "neutral",
        href: "/admin/ponds",
      },
      {
        label: "Settings Changes",
        value: "2",
        detail: "Configuration changes captured in the audit trail",
        trend: "Recent configuration activity detected",
        tone: "info",
        href: "/admin/settings",
      },
    ];

    return {
      metrics,
      attentionItems,
      recentEvents: filteredTimeline,
      counts: {
        totalStaff: 3,
        lowStockCount: 1,
        stalePondsCount: 0,
        activePonds: MOCK_PONDS.filter((p) => p.isActive).length,
        totalPonds: MOCK_PONDS.length,
      },
      thresholds: {
        lowStockThreshold: 1500,
        staleSyncMinutes: 45,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  const supabase = await createSupabaseServerClient();
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const previous24h = new Date(now - 48 * 60 * 60 * 1000).toISOString();
  const feedSince = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();

  const [
    settingsSnapshot,
    totalStaff,
    totalPonds,
    activePonds,
    events24h,
    eventsPrevious24h,
    settingsChanges24h,
  ] = await Promise.all([
    getSettingsSnapshot(supabase),
    countRows(supabase, "public_profiles", (query) => query.eq("role", "field_staff")),
    countRows(supabase, "ponds"),
    countRows(supabase, "ponds", (query) => query.eq("is_active", true)),
    countEventsBetween(supabase, since24h),
    countEventsBetween(supabase, previous24h, since24h),
    countRows(supabase, "admin_settings_audit", (query) => query.gte("changed_at", since24h)),
  ]);

  const lowStockThreshold = settingsSnapshot.operations.lowStockThreshold;
  const staleSyncMinutes = settingsSnapshot.notifications.staleSyncMinutes;

  const [
    lowStockCount,
    lowStockPondsResult,
    stalePonds,
    recentEventsResult,
  ] = await Promise.all([
    countRows(supabase, "ponds", (query) =>
      query.eq("is_active", true).lt("current_stock_count", lowStockThreshold)
    ),
    supabase
      .from("ponds")
      .select("id, name, is_active, current_stock_count")
      .eq("is_active", true)
      .lt("current_stock_count", lowStockThreshold)
      .order("current_stock_count", { ascending: true })
      .limit(4),
    getStalePonds(supabase, staleSyncMinutes),
    supabase
      .from("pond_history")
      .select("id, pond_id, event_type, event_data, recorded_by, created_at")
      .gte("created_at", feedSince)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const lowStockPonds = (lowStockPondsResult.data ?? []) as PondSummaryRow[];
  const recentEvents = (recentEventsResult.data ?? []) as PondHistoryRow[];

  if (lowStockPondsResult.error) {
    console.error("Failed to load low-stock ponds:", lowStockPondsResult.error.message);
  }

  if (recentEventsResult.error) {
    console.error("Failed to load dashboard feed:", recentEventsResult.error.message);
  }

  const pondIds = new Set(recentEvents.map((event) => event.pond_id));
  const actorIds = new Set(recentEvents.map((event) => event.recorded_by));

  const pondLabelRows = (
    pondIds.size > 0
      ? ((await supabase.from("ponds").select("id, name").in("id", Array.from(pondIds))).data ?? [])
      : []
  ) as Array<{ id: string; name: string }>;
  const actorLabelRows = (
    actorIds.size > 0
      ? ((await supabase
          .from("public_profiles")
          .select("id, email")
          .in("id", Array.from(actorIds))).data ?? [])
      : []
  ) as ProfileLabelRow[];

  const pondMap = new Map(pondLabelRows.map((row) => [row.id, row.name]));
  const actorMap = new Map(actorLabelRows.map((row) => [row.id, row.email]));

  const timelineItems = recentEvents.map((event) => {
    const pondName = pondMap.get(event.pond_id) ?? `Pond ${event.pond_id.slice(0, 8)}`;
    const actorName = actorMap.get(event.recorded_by) ?? event.recorded_by;
    const summary = summarizeEvent(event, pondName);

    return {
      id: event.id,
      createdAt: event.created_at,
      pondName,
      actorName,
      badge: summary.badge,
      tone: summary.tone,
      summary: summary.summary,
      detail: summary.detail,
      rawData: event.event_data,
    };
  });

  const attentionItems: DashboardAttentionItem[] = [];

  if (lowStockCount > 0) {
    const pondPreview =
      lowStockPonds.length > 0
        ? lowStockPonds
            .map((pond) => `${pond.name} (${pond.current_stock_count ?? "unknown"})`)
            .join(", ")
        : "Inspect low-stock ponds and restocking schedules.";

    attentionItems.push({
      id: "low-stock",
      title: `${pluralize(lowStockCount, "low-stock pond")} below threshold`,
      description: `${pondPreview}. Threshold: ${lowStockThreshold}.`,
      tone: lowStockCount > 3 ? "danger" : "warning",
      href: "/admin/ponds",
      actionLabel: "Inspect pond health",
    });
  }

  if (stalePonds.length > 0) {
    attentionItems.push({
      id: "stale-activity",
      title: `${pluralize(stalePonds.length, "active pond")} with stale activity`,
      description: `${stalePonds
        .slice(0, 4)
        .map((pond: any) => pond.name)
        .join(", ")}${stalePonds.length > 4 ? "..." : ""}. No pond history in ${staleSyncMinutes} minutes.`,
      tone: stalePonds.length > 2 ? "danger" : "warning",
      href: "/admin/ponds",
      actionLabel: "Review stale ponds",
    });
  }

  if (attentionItems.length === 0) {
    attentionItems.push({
      id: "all-clear",
      title: "No urgent operational blockers",
      description: "Pond thresholds and recent mobile activity are within target.",
      tone: "info",
      href: "/admin/records",
      actionLabel: "Review records",
    });
  }

  const metrics: DashboardMetric[] = [
    {
      label: "Field Staff",
      value: totalStaff.toString(),
      detail: "Mobile users with field access",
      trend: "View staff accounts and roles",
      tone: "neutral",
      href: "/admin/users",
    },
    {
      label: "Low-Stock Ponds",
      value: lowStockCount.toString(),
      detail: `Threshold below ${lowStockThreshold} fish`,
      trend:
        lowStockCount > 0
          ? `${pluralize(lowStockCount, "pond")} need restock review`
          : "All active ponds above target",
      tone: lowStockCount > 0 ? "danger" : "success",
      href: "/admin/ponds",
    },
    {
      label: "Stale Activity",
      value: stalePonds.length.toString(),
      detail: `No pond history in ${staleSyncMinutes} minutes`,
      trend:
        stalePonds.length > 0
          ? `${pluralize(activePonds - stalePonds.length, "active pond")} reporting recently`
          : "All active ponds reporting within target window",
      tone: stalePonds.length > 0 ? "warning" : "success",
      href: "/admin/ponds",
    },
    {
      label: "Activity (24h)",
      value: events24h.toString(),
      detail: "Stocking, mortality, harvest, and history records",
      trend: `${formatSignedDelta(events24h - eventsPrevious24h)} vs previous 24h`,
      tone:
        events24h > eventsPrevious24h ? "success" : events24h < eventsPrevious24h ? "warning" : "neutral",
      href: "/admin/records?days=1",
    },
    {
      label: "Active Ponds",
      value: `${activePonds}/${totalPonds}`,
      detail: `${totalStaff} field staff records supporting operations`,
      trend:
        totalPonds - activePonds > 0
          ? `${pluralize(totalPonds - activePonds, "pond")} inactive`
          : "All ponds marked active",
      tone: "neutral",
      href: "/admin/ponds",
    },
    {
      label: "Settings Changes",
      value: settingsChanges24h.toString(),
      detail: "Configuration changes captured in the audit trail",
      trend:
        settingsChanges24h > 0 ? "Recent configuration activity detected" : "No config changes in 24h",
      tone: settingsChanges24h > 0 ? "info" : "neutral",
      href: "/admin/settings",
    },
  ];

  return {
    metrics,
    attentionItems,
    recentEvents: timelineItems,
    counts: {
      totalStaff,
      lowStockCount,
      stalePondsCount: stalePonds.length,
      activePonds,
      totalPonds,
    },
    thresholds: {
      lowStockThreshold,
      staleSyncMinutes,
    },
    updatedAt: new Date().toISOString(),
  };
}
