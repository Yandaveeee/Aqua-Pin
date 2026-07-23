import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { formatDateTime, formatRelativeTime } from "@/lib/admin-format";
import { requireApprovedAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RecordType = "all" | "stocking" | "mortality" | "harvest";
type RecordItem = {
  id: string;
  type: Exclude<RecordType, "all">;
  createdAt: string;
  pondId: string;
  userId: string;
  detail: string;
};

type RecordsPageProps = {
  searchParams?: Promise<{ type?: string; days?: string }>;
};

function normalizeType(value: string | undefined): RecordType {
  return value === "stocking" || value === "mortality" || value === "harvest" ? value : "all";
}

function normalizeDays(value: string | undefined) {
  const days = Number(value ?? "7");
  return Number.isInteger(days) && [1, 7, 30, 90].includes(days) ? days : 7;
}

function typeTone(type: RecordItem["type"]) {
  if (type === "mortality") return "danger";
  if (type === "stocking") return "success";
  return "info";
}

export default async function AdminRecordsPage({ searchParams }: RecordsPageProps) {
  await requireApprovedAdmin();
  const params = await searchParams;
  const type = normalizeType(params?.type);
  const days = normalizeDays(params?.days);
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { cookies } = await import("next/headers");
  const isMock = (await cookies()).get("aquapin_mock_admin")?.value === "true";
  let records: RecordItem[] = [];
  let ponds = new Map<string, string>();
  let users = new Map<string, string>();

  if (isMock) {
    const mock = await import("@/lib/mock-data");
    records = [
      ...mock.MOCK_STOCKING_LOGS.map((row) => ({ id: row.id, type: "stocking" as const, createdAt: row.createdAt, pondId: row.pondId, userId: row.stockedBy, detail: `${row.quantity.toLocaleString()} ${row.species} from ${row.source}` })),
      ...mock.MOCK_MORTALITY_LOGS.map((row) => ({ id: row.id, type: "mortality" as const, createdAt: row.createdAt, pondId: row.pondId, userId: row.loggedBy, detail: `${row.quantity.toLocaleString()} fish${row.notes ? ` — ${row.notes}` : ""}` })),
      ...mock.MOCK_HARVESTS.map((row) => ({ id: row.id, type: "harvest" as const, createdAt: row.createdAt, pondId: row.pondId, userId: row.harvestedBy, detail: `${row.yieldKg.toLocaleString()} kg ${row.species}${row.isPartial ? " (partial)" : ""}` })),
    ];
    ponds = new Map(mock.MOCK_PONDS.map((pond) => [pond.id, pond.name]));
  } else {
    const supabase = await createSupabaseServerClient();
    const [stocking, mortality, harvest] = await Promise.all([
      type === "all" || type === "stocking" ? supabase.from("stocking_logs").select("id, pond_id, species, quantity, source, stocked_by, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
      type === "all" || type === "mortality" ? supabase.from("mortality_logs").select("id, pond_id, quantity, notes, logged_by, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
      type === "all" || type === "harvest" ? supabase.from("harvests").select("id, pond_id, yield_kg, species, is_partial, harvested_by, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
    ]);
    [stocking, mortality, harvest].forEach((result) => { if (result.error) console.error("Failed to load records:", result.error.message); });
    records = [
      ...(stocking.data ?? []).map((row: any) => ({ id: row.id, type: "stocking" as const, createdAt: row.created_at, pondId: row.pond_id, userId: row.stocked_by, detail: `${Number(row.quantity).toLocaleString()} ${row.species}${row.source ? ` from ${row.source}` : ""}` })),
      ...(mortality.data ?? []).map((row: any) => ({ id: row.id, type: "mortality" as const, createdAt: row.created_at, pondId: row.pond_id, userId: row.logged_by, detail: `${Number(row.quantity).toLocaleString()} fish${row.notes ? ` — ${row.notes}` : ""}` })),
      ...(harvest.data ?? []).map((row: any) => ({ id: row.id, type: "harvest" as const, createdAt: row.created_at, pondId: row.pond_id, userId: row.harvested_by, detail: `${Number(row.yield_kg).toLocaleString()} kg ${row.species || "harvest"}${row.is_partial ? " (partial)" : ""}` })),
    ];
    const pondIds = Array.from(new Set(records.map((record) => record.pondId)));
    const userIds = Array.from(new Set(records.map((record) => record.userId)));
    const [pondResult, userResult] = await Promise.all([
      pondIds.length ? supabase.from("ponds").select("id, name").in("id", pondIds) : Promise.resolve({ data: [] }),
      userIds.length ? supabase.from("public_profiles").select("id, email").in("id", userIds) : Promise.resolve({ data: [] }),
    ]);
    ponds = new Map((pondResult.data ?? []).map((pond: any) => [pond.id, pond.name]));
    users = new Map((userResult.data ?? []).map((user: any) => [user.id, user.email]));
  }

  records = records.filter((record) => type === "all" || record.type === type).filter((record) => new Date(record.createdAt) >= new Date(since)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const hrefFor = (targetType: RecordType) => `/admin/records?type=${targetType}&days=${days}`;

  return (
    <section className="stack">
      <AdminPageHeader
        eyebrow="Mobile Activity"
        title="Records"
        description="Read-only oversight of stocking, mortality, and harvest records sent by field staff through the mobile app."
        actions={<Link className="secondary-button" href="/admin/ponds">View ponds</Link>}
      />

      <div className="page-tools">
        <div className="chip-row">
          {(["all", "stocking", "mortality", "harvest"] as RecordType[]).map((value) => <Link key={value} className={`chip ${type === value ? "chip-active" : ""}`} href={hrefFor(value)}>{value === "all" ? "All records" : `${value[0].toUpperCase()}${value.slice(1)}`}</Link>)}
        </div>
        <div className="chip-row">
          {[1, 7, 30, 90].map((value) => <Link key={value} className={`chip ${days === value ? "chip-active" : ""}`} href={`/admin/records?type=${type}&days=${value}`}>{value}d</Link>)}
        </div>
      </div>

      <article className="panel">
        <div className="panel-header-row"><div><h3 className="panel-title">Field submissions</h3><p className="panel-subtitle">{records.length} record{records.length === 1 ? "" : "s"} in the selected period.</p></div><span className="ui-pill ui-pill-ghost">Last {days} days</span></div>
        {records.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Type</th><th>Details</th><th>Pond</th><th>Submitted by</th><th>When</th></tr></thead><tbody>{records.map((record) => <tr key={`${record.type}-${record.id}`}><td><span className={`ui-pill ui-pill-${typeTone(record.type)}`}>{record.type}</span></td><td className="table-primary-cell"><strong>{record.detail}</strong></td><td>{ponds.get(record.pondId) ?? `Pond ${record.pondId.slice(0, 8)}`}</td><td>{users.get(record.userId) ?? record.userId}</td><td title={formatDateTime(record.createdAt)}>{formatRelativeTime(record.createdAt)}</td></tr>)}</tbody></table></div> : <div className="empty-panel"><p>No records were submitted in this period.</p><p className="muted">Records created in the mobile app will appear here after sync.</p></div>}
      </article>
    </section>
  );
}
