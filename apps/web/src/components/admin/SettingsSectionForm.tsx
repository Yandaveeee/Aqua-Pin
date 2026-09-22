"use client";

import type { AdminSettingsSections, SettingSection } from "@aquapin/shared";
import { useEffect, useRef, useState } from "react";
import { updateAdminSettingAction } from "@/app/admin/settings/actions";
import { formatDateTime } from "@/lib/admin-format";
import { SETTINGS_SECTION_META } from "@/lib/admin-settings";

type SettingsSectionFormProps = {
  section: SettingSection;
  value: AdminSettingsSections[SettingSection];
  updatedAt: string | null;
  updatedByLabel: string;
};

const ACTIVE_FIELDS = {
  general: { name: "organizationName", label: "Organization name", hint: "Shown in the admin sidebar and header.", type: "text" },
  operations: { name: "lowStockThreshold", label: "Low-stock threshold (fish)", hint: "Active ponds below this stock count appear in dashboard alerts.", type: "number", min: 0 },
  notifications: { name: "staleSyncMinutes", label: "Stale activity window (minutes)", hint: "Flag active ponds that have no new records within this time.", type: "number", min: 1, max: 1440 },
} as const;

export default function SettingsSectionForm({ section, value, updatedAt, updatedByLabel }: SettingsSectionFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnUnsaved);
    return () => window.removeEventListener("beforeunload", warnUnsaved);
  }, [dirty]);

  if (!(section in ACTIVE_FIELDS)) return null;
  const field = ACTIVE_FIELDS[section as keyof typeof ACTIVE_FIELDS];
  const meta = SETTINGS_SECTION_META[section];
  const values = value as unknown as Record<string, string | number | boolean>;

  return (
    <form
      className={`settings-card${dirty ? " is-dirty" : ""}`}
      action={updateAdminSettingAction}
      ref={formRef}
      onChange={() => setDirty(true)}
      onSubmit={() => setDirty(false)}
    >
      <div className="settings-card-head">
        <div>
          <h4>{meta.title}</h4>
          <p className="muted">{meta.description}</p>
        </div>
      </div>
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="returnTo" value="/admin/settings" />
      {/* Preserve existing values required by the stored section schema. */}
      {Object.entries(values).filter(([name]) => name !== field.name).map(([name, storedValue]) => (
        <input key={name} type="hidden" name={name} value={String(storedValue)} />
      ))}
      <div className="settings-field">
        <label className="field-label" htmlFor={`${section}-${field.name}`}>{field.label}</label>
        <input
          className="field-input"
          id={`${section}-${field.name}`}
          name={field.name}
          defaultValue={String(values[field.name])}
          type={field.type}
          min={"min" in field ? field.min : undefined}
          max={"max" in field ? field.max : undefined}
          step={field.type === "number" ? 1 : undefined}
          required
        />
        <p className="field-hint">{field.hint}</p>
      </div>
      <div className="settings-card-footer">
        <span className="settings-unsaved-status" aria-live="polite">{dirty ? "Unsaved changes" : "All changes saved"}</span>
        <div>
          {dirty ? <button className="secondary-button" type="button" onClick={() => { formRef.current?.reset(); setDirty(false); }}>Discard</button> : null}
          <button className="primary-button" type="submit" disabled={!dirty}>Save {meta.title}</button>
        </div>
      </div>
      {updatedAt ? <p className="muted">Updated {formatDateTime(updatedAt)} by {updatedByLabel}</p> : null}
    </form>
  );
}
