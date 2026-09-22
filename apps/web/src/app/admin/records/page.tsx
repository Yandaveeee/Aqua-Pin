import Link from "next/link";
import AdminRecordsTable, { type AdminRecordRow } from "@/components/admin/AdminRecordsTable";
import { requireApprovedAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RecordType = "all" | "stocking" | "mortality" | "harvest";
type RawRecord = Omit<AdminRecordRow, "pondName" | "userName"> & { pondId: string; userId: string };
type Params = { type?: string; days?: string; from?: string; to?: string; q?: string; pond?: string; user?: string; sort?: string; page?: string };
const PAGE_SIZE = 25;
const safeText = (value: string | undefined, max = 120) => (value ?? "").trim().slice(0, max);
const validDate = (value: string | undefined) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? value! : "";
const typeValue = (value: string | undefined): RecordType => value === "stocking" || value === "mortality" || value === "harvest" ? value : "all";

export default async function AdminRecordsPage({ searchParams }: { searchParams?: Promise<Params> }) {
  await requireApprovedAdmin();
  const params = await searchParams;
  const type = typeValue(params?.type);
  const days = [1, 7, 30, 90].includes(Number(params?.days)) ? Number(params?.days) : 7;
  const from = validDate(params?.from);
  const to = validDate(params?.to);
  const query = safeText(params?.q).toLowerCase();
  const pondFilter = safeText(params?.pond);
  const userFilter = safeText(params?.user);
  const sort = params?.sort === "oldest" ? "oldest" : "newest";
  const requestedPage = Math.max(1, Number.parseInt(params?.page ?? "1", 10) || 1);
  const since = from ? new Date(`${from}T00:00:00`).toISOString() : new Date(Date.now() - days * 864e5).toISOString();
  const until = to ? new Date(`${to}T23:59:59.999`).toISOString() : null;
  const { cookies } = await import("next/headers");
  const isMock = (await cookies()).get("aquapin_mock_admin")?.value === "true";
  let records: RawRecord[] = [];
  let ponds = new Map<string, string>();
  let users = new Map<string, string>();

  if (isMock) {
    const mock = await import("@/lib/mock-data");
    records = [
      ...mock.MOCK_STOCKING_LOGS.map((row) => ({ id: row.id, type: "stocking" as const, createdAt: row.createdAt, pondId: row.pondId, userId: row.stockedBy, detail: `${row.quantity.toLocaleString()} ${row.species}${row.source ? ` from ${row.source}` : ""}` })),
      ...mock.MOCK_MORTALITY_LOGS.map((row) => ({ id: row.id, type: "mortality" as const, createdAt: row.createdAt, pondId: row.pondId, userId: row.loggedBy, detail: `${row.quantity.toLocaleString()} fish${row.notes ? ` — ${row.notes}` : ""}` })),
      ...mock.MOCK_HARVESTS.map((row) => ({ id: row.id, type: "harvest" as const, createdAt: row.createdAt, pondId: row.pondId, userId: row.harvestedBy, detail: `${row.yieldKg.toLocaleString()} kg ${row.species}${row.isPartial ? " (partial)" : ""}` })),
    ];
    ponds = new Map(mock.MOCK_PONDS.map((pond) => [pond.id, pond.name]));
  } else {
    const supabase = await createSupabaseServerClient();
    const load = (table: string, columns: string) => {
      let request = supabase.from(table).select(columns).gte("created_at", since).order("created_at", { ascending: false }).limit(250);
      if (until) request = request.lte("created_at", until);
      return request;
    };
    const [stocking, mortality, harvest] = await Promise.all([
      type === "all" || type === "stocking" ? load("stocking_logs", "id, pond_id, species, quantity, source, stocked_by, created_at") : Promise.resolve({ data: [], error: null }),
      type === "all" || type === "mortality" ? load("mortality_logs", "id, pond_id, quantity, notes, logged_by, created_at") : Promise.resolve({ data: [], error: null }),
      type === "all" || type === "harvest" ? load("harvests", "id, pond_id, yield_kg, species, is_partial, harvested_by, created_at") : Promise.resolve({ data: [], error: null }),
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
      userIds.length ? supabase.from("public_profiles").select("id, email, full_name").in("id", userIds) : Promise.resolve({ data: [] }),
    ]);
    ponds = new Map((pondResult.data ?? []).map((pond: any) => [pond.id, pond.name]));
    users = new Map((userResult.data ?? []).map((user: any) => [user.id, user.full_name?.trim() || user.email]));
  }

  const allRows: AdminRecordRow[] = records.filter((record) => type === "all" || record.type === type).filter((record) => new Date(record.createdAt) >= new Date(since) && (!until || new Date(record.createdAt) <= new Date(until))).map((record) => ({ ...record, pondName: ponds.get(record.pondId) ?? `Pond ${record.pondId.slice(0, 8)}`, userName: users.get(record.userId) ?? record.userId })).filter((record) => !pondFilter || record.pondName === pondFilter).filter((record) => !userFilter || record.userName === userFilter).filter((record) => !query || `${record.type} ${record.detail} ${record.pondName} ${record.userName}`.toLowerCase().includes(query)).sort((a, b) => (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) * (sort === "newest" ? 1 : -1));
  const pageCount = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const rows = allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pondOptions = Array.from(new Set(Array.from(ponds.values()))).sort();
  const userOptions = Array.from(new Set(Array.from(users.values()))).sort();
  const hrefFor = (next: Partial<Params>) => { const merged: Params = { ...params, ...next }; const search = new URLSearchParams(); Object.entries(merged).forEach(([key, value]) => { if (value) search.set(key, value); }); return `/admin/records?${search}`; };

  return <section className="stack records-page">
    <form className="records-filter-panel" method="GET">
      <div className="records-filter-main">
        <label><span>Search</span><input className="field-input" type="search" name="q" defaultValue={params?.q} placeholder="Pond, staff, species, or notes" /></label>
        <label><span>Type</span><select className="field-input" name="type" defaultValue={type}><option value="all">All records</option><option value="stocking">Stocking</option><option value="mortality">Mortality</option><option value="harvest">Harvest</option></select></label>
        <label><span>Pond</span><select className="field-input" name="pond" defaultValue={pondFilter}><option value="">All ponds</option>{pondOptions.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Staff</span><select className="field-input" name="user" defaultValue={userFilter}><option value="">All staff</option>{userOptions.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>From</span><input className="field-input" type="date" name="from" defaultValue={from} /></label>
        <label><span>To</span><input className="field-input" type="date" name="to" defaultValue={to} /></label>
        <label><span>Sort</span><select className="field-input" name="sort" defaultValue={sort}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
      </div>
      <div className="records-filter-actions"><button className="primary-button" type="submit">Apply filters</button><Link className="secondary-button" href="/admin/records">Clear all</Link></div>
    </form>
    <div className="records-quick-range" aria-label="Quick date range"><span>Quick range</span>{[1, 7, 30, 90].map((value) => <Link key={value} className={`chip ${!from && days === value ? "chip-active" : ""}`} href={hrefFor({ days: String(value), from: "", to: "", page: "1" })}>{value}d</Link>)}</div>
    <article className="panel records-panel"><AdminRecordsTable rows={rows} exportRows={allRows} />{pageCount > 1 ? <nav className="pager" aria-label="Records pagination"><Link className={`secondary-button ${page <= 1 ? "is-disabled" : ""}`} aria-disabled={page <= 1} href={page <= 1 ? hrefFor({ page: "1" }) : hrefFor({ page: String(page - 1) })}>Previous</Link><span>Page {page} of {pageCount}</span><Link className={`secondary-button ${page >= pageCount ? "is-disabled" : ""}`} aria-disabled={page >= pageCount} href={page >= pageCount ? hrefFor({ page: String(pageCount) }) : hrefFor({ page: String(page + 1) })}>Next</Link></nav> : null}</article>
  </section>;
}
