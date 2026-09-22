"use client";

import { useEffect, useState } from "react";
import { formatDateTime, formatRelativeTime } from "@/lib/admin-format";

export type AdminRecordRow = { id: string; type: "stocking" | "mortality" | "harvest"; createdAt: string; detail: string; pondName: string; userName: string };

function tone(type: AdminRecordRow["type"]) {
  return type === "mortality" ? "danger" : type === "stocking" ? "success" : "info";
}

function csvCell(value: string) { return `"${value.replaceAll('"', '""')}"`; }

export default function AdminRecordsTable({ rows, exportRows }: { rows: AdminRecordRow[]; exportRows: AdminRecordRow[] }) {
  const [selected, setSelected] = useState<AdminRecordRow | null>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const exportCsv = () => {
    const header = ["Type", "Details", "Pond", "Submitted by", "Created at"];
    const lines = exportRows.map((row) => [row.type, row.detail, row.pondName, row.userName, row.createdAt].map(csvCell).join(","));
    const blob = new Blob([[header.map(csvCell).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `aquapin-records-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return <>
    <div className="records-table-actions"><span>{exportRows.length} matching record{exportRows.length === 1 ? "" : "s"}</span><button className="secondary-button compact-button" type="button" onClick={exportCsv} disabled={!exportRows.length}>Export CSV</button></div>
    {rows.length ? <div className="table-wrap records-table-wrap"><table className="data-table records-table"><thead><tr><th>Type</th><th>Details</th><th>Pond</th><th>Submitted by</th><th>When</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{rows.map((record) => <tr key={`${record.type}-${record.id}`}><td data-label="Type"><span className={`ui-pill ui-pill-${tone(record.type)}`}>{record.type}</span></td><td className="table-primary-cell" data-label="Details"><strong>{record.detail}</strong></td><td data-label="Pond">{record.pondName}</td><td data-label="Submitted by">{record.userName}</td><td data-label="When" title={formatDateTime(record.createdAt)}>{formatRelativeTime(record.createdAt)}</td><td className="table-action-cell"><button type="button" onClick={() => setSelected(record)}>Details</button></td></tr>)}</tbody></table></div> : <div className="empty-panel records-empty"><p>No records match these filters.</p><p className="muted">Clear a filter or widen the date range.</p></div>}
    {selected ? <div className="record-drawer-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><aside className="record-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="record-detail-title"><div className="record-detail-head"><div><p className="eyebrow">Record details</p><h2 id="record-detail-title">{selected.type[0].toUpperCase() + selected.type.slice(1)}</h2></div><button type="button" aria-label="Close record details" onClick={() => setSelected(null)}>×</button></div><dl className="record-detail-list"><div><dt>Details</dt><dd>{selected.detail}</dd></div><div><dt>Pond</dt><dd>{selected.pondName}</dd></div><div><dt>Submitted by</dt><dd>{selected.userName}</dd></div><div><dt>Submitted</dt><dd>{formatDateTime(selected.createdAt)}</dd></div><div><dt>Record ID</dt><dd className="record-id">{selected.id}</dd></div></dl></aside></div> : null}
  </>;
}
