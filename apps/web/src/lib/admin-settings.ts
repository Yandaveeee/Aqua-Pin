import type {
  AdminSettingsSections,
  Json,
  SettingSection,
} from "@aquapin/shared";
import type { Database } from "@aquapin/shared";

type AdminSettingsRow = Database["public"]["Tables"]["admin_settings"]["Row"];
type SettingsSectionState<T extends SettingSection = SettingSection> = {
  section: T;
  value: AdminSettingsSections[T];
  updatedAt: string | null;
  updatedBy: string | null;
};

type PrimitiveSettingValue = string | number | boolean;

type SectionMeta = {
  title: string;
  description: string;
  caption: string;
};

type FieldLabelMap = Record<string, string>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getFieldValue(formData: FormData, name: string) {
  const values = formData.getAll(name);
  const lastValue = values.at(-1);
  return typeof lastValue === "string" ? lastValue.trim() : "";
}

function getRequiredString(formData: FormData, name: string, label: string) {
  const value = getFieldValue(formData, name);
  if (!value) {
    throw new Error(`${label} is required.`);
  }

  return value;
}

function getOptionalString(formData: FormData, name: string) {
  return getFieldValue(formData, name);
}

function getBoolean(formData: FormData, name: string) {
  const value = getFieldValue(formData, name).toLowerCase();
  return value === "true" || value === "on" || value === "1" || value === "yes";
}

function getNumber(
  formData: FormData,
  name: string,
  label: string,
  options: { min?: number; max?: number; integer?: boolean } = {}
) {
  const rawValue = getRequiredString(formData, name, label);
  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid number.`);
  }

  if (options.integer && !Number.isInteger(parsed)) {
    throw new Error(`${label} must be a whole number.`);
  }

  if (typeof options.min === "number" && parsed < options.min) {
    throw new Error(`${label} must be at least ${options.min}.`);
  }

  if (typeof options.max === "number" && parsed > options.max) {
    throw new Error(`${label} must be at most ${options.max}.`);
  }

  return parsed;
}

function validateOptionalUrl(value: string, label: string) {
  if (!value) return value;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error();
    }

    return value;
  } catch {
    throw new Error(`${label} must be a valid http or https URL.`);
  }
}

export const ADMIN_SETTINGS_DEFAULTS: AdminSettingsSections = {
  general: {
    organizationName: "AquaPin Operations",
    timezone: "Asia/Manila",
    units: "metric",
  },
  operations: {
    survivalThresholdPercent: 84,
    lowStockThreshold: 1500,
    defaultMapCenterLat: 13.4104,
    defaultMapCenterLng: 122.5639,
  },
  notifications: {
    inAppEnabled: true,
    emailEnabled: true,
    staleSyncMinutes: 45,
    criticalAlertsOnly: false,
  },
  integrations: {
    googleMapsApiKey: "",
    webhookUrl: "",
  },
  security: {
    sessionTimeoutMinutes: 120,
    enforceStrongPasswords: true,
    requireMfaForAdmins: false,
  },
};

export const SETTINGS_SECTION_META: Record<SettingSection, SectionMeta> = {
  general: {
    title: "General",
    description: "The organization name shown in the admin console.",
    caption: "Organization profile",
  },
  operations: {
    title: "Operations",
    description: "Choose when an active pond should be flagged for low stock.",
    caption: "Operational thresholds",
  },
  notifications: {
    title: "Activity alerts",
    description: "Choose how long a pond can go without new records before it is flagged.",
    caption: "Pond activity",
  },
  integrations: {
    title: "Integrations",
    description: "External service keys and webhook destinations used by the console.",
    caption: "Connected services",
  },
  security: {
    title: "Security",
    description: "Session behavior and admin security requirements.",
    caption: "Access controls",
  },
};

export const SETTINGS_FIELD_LABELS: Record<SettingSection, FieldLabelMap> = {
  general: {
    organizationName: "Organization name",
    timezone: "Time zone",
    units: "Units",
  },
  operations: {
    survivalThresholdPercent: "Survival threshold",
    lowStockThreshold: "Low-stock threshold",
    defaultMapCenterLat: "Default latitude",
    defaultMapCenterLng: "Default longitude",
  },
  notifications: {
    inAppEnabled: "In-app alerts",
    emailEnabled: "Email alerts",
    staleSyncMinutes: "Stale activity window",
    criticalAlertsOnly: "Critical alerts only",
  },
  integrations: {
    googleMapsApiKey: "Google Maps API key",
    webhookUrl: "Webhook URL",
  },
  security: {
    sessionTimeoutMinutes: "Session timeout",
    enforceStrongPasswords: "Strong passwords",
    requireMfaForAdmins: "Admin MFA",
  },
};

export function normalizeAdminSettingSection<T extends SettingSection>(
  section: T,
  value: unknown
): AdminSettingsSections[T] {
  const rawValue = isPlainObject(value) ? value : {};

  switch (section) {
    case "general": {
      const fallback = ADMIN_SETTINGS_DEFAULTS.general;
      return {
        organizationName: readString(rawValue.organizationName, fallback.organizationName),
        timezone: readString(rawValue.timezone, fallback.timezone),
        units: rawValue.units === "imperial" ? "imperial" : fallback.units,
      } as AdminSettingsSections[T];
    }
    case "operations": {
      const fallback = ADMIN_SETTINGS_DEFAULTS.operations;
      return {
        survivalThresholdPercent: readNumber(
          rawValue.survivalThresholdPercent,
          fallback.survivalThresholdPercent
        ),
        lowStockThreshold: readNumber(rawValue.lowStockThreshold, fallback.lowStockThreshold),
        defaultMapCenterLat: readNumber(rawValue.defaultMapCenterLat, fallback.defaultMapCenterLat),
        defaultMapCenterLng: readNumber(rawValue.defaultMapCenterLng, fallback.defaultMapCenterLng),
      } as AdminSettingsSections[T];
    }
    case "notifications": {
      const fallback = ADMIN_SETTINGS_DEFAULTS.notifications;
      return {
        inAppEnabled: readBoolean(rawValue.inAppEnabled, fallback.inAppEnabled),
        emailEnabled: readBoolean(rawValue.emailEnabled, fallback.emailEnabled),
        staleSyncMinutes: readNumber(rawValue.staleSyncMinutes, fallback.staleSyncMinutes),
        criticalAlertsOnly: readBoolean(rawValue.criticalAlertsOnly, fallback.criticalAlertsOnly),
      } as AdminSettingsSections[T];
    }
    case "integrations": {
      const fallback = ADMIN_SETTINGS_DEFAULTS.integrations;
      return {
        googleMapsApiKey: readString(rawValue.googleMapsApiKey, fallback.googleMapsApiKey),
        webhookUrl: readString(rawValue.webhookUrl, fallback.webhookUrl),
      } as AdminSettingsSections[T];
    }
    case "security": {
      const fallback = ADMIN_SETTINGS_DEFAULTS.security;
      return {
        sessionTimeoutMinutes: readNumber(
          rawValue.sessionTimeoutMinutes,
          fallback.sessionTimeoutMinutes
        ),
        enforceStrongPasswords: readBoolean(
          rawValue.enforceStrongPasswords,
          fallback.enforceStrongPasswords
        ),
        requireMfaForAdmins: readBoolean(
          rawValue.requireMfaForAdmins,
          fallback.requireMfaForAdmins
        ),
      } as AdminSettingsSections[T];
    }
    default:
      return ADMIN_SETTINGS_DEFAULTS.general as AdminSettingsSections[T];
  }
}

export function buildSettingsSectionStates(
  rows: Pick<AdminSettingsRow, "section" | "value" | "updated_at" | "updated_by">[]
) {
  const rowMap = new Map(rows.map((row) => [row.section, row]));

  return (Object.keys(ADMIN_SETTINGS_DEFAULTS) as SettingSection[]).map((section) => {
    const row = rowMap.get(section);

    return {
      section,
      value: normalizeAdminSettingSection(section, row?.value),
      updatedAt: row?.updated_at ?? null,
      updatedBy: row?.updated_by ?? null,
    };
  }) as SettingsSectionState[];
}

export function parseSettingFormData<T extends SettingSection>(section: T, formData: FormData) {
  switch (section) {
    case "general":
      return {
        organizationName: getRequiredString(formData, "organizationName", "Organization name"),
        timezone: getRequiredString(formData, "timezone", "Time zone"),
        units: getFieldValue(formData, "units") === "imperial" ? "imperial" : "metric",
      } as AdminSettingsSections[T];
    case "operations":
      return {
        survivalThresholdPercent: getNumber(
          formData,
          "survivalThresholdPercent",
          "Survival threshold",
          { min: 0, max: 100 }
        ),
        lowStockThreshold: getNumber(formData, "lowStockThreshold", "Low-stock threshold", {
          min: 0,
          integer: true,
        }),
        defaultMapCenterLat: getNumber(formData, "defaultMapCenterLat", "Default latitude", {
          min: -90,
          max: 90,
        }),
        defaultMapCenterLng: getNumber(formData, "defaultMapCenterLng", "Default longitude", {
          min: -180,
          max: 180,
        }),
      } as AdminSettingsSections[T];
    case "notifications":
      return {
        inAppEnabled: getBoolean(formData, "inAppEnabled"),
        emailEnabled: getBoolean(formData, "emailEnabled"),
        staleSyncMinutes: getNumber(
          formData,
          "staleSyncMinutes",
          "Stale activity window",
          { min: 1, max: 1440, integer: true }
        ),
        criticalAlertsOnly: getBoolean(formData, "criticalAlertsOnly"),
      } as AdminSettingsSections[T];
    case "integrations":
      return {
        googleMapsApiKey: getOptionalString(formData, "googleMapsApiKey"),
        webhookUrl: validateOptionalUrl(
          getOptionalString(formData, "webhookUrl"),
          "Webhook URL"
        ),
      } as AdminSettingsSections[T];
    case "security":
      return {
        sessionTimeoutMinutes: getNumber(
          formData,
          "sessionTimeoutMinutes",
          "Session timeout",
          { min: 15, max: 1440, integer: true }
        ),
        enforceStrongPasswords: getBoolean(formData, "enforceStrongPasswords"),
        requireMfaForAdmins: getBoolean(formData, "requireMfaForAdmins"),
      } as AdminSettingsSections[T];
    default:
      throw new Error("Unsupported settings section.");
  }
}

function maskSensitiveValue(fieldName: string, value: string) {
  if (!value) return "Not configured";
  if (!fieldName.toLowerCase().includes("apikey")) return value;

  const tail = value.slice(-4);
  return `Configured (${tail ? `...${tail}` : "hidden"})`;
}

export function formatSettingFieldValue(fieldName: string, value: PrimitiveSettingValue) {
  if (typeof value === "boolean") {
    return value ? "Enabled" : "Disabled";
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toString() : value.toFixed(4);
  }

  if (fieldName === "units") {
    return value === "imperial" ? "Imperial" : "Metric";
  }

  if (fieldName.toLowerCase().includes("apikey")) {
    return maskSensitiveValue(fieldName, value);
  }

  return value || "Not configured";
}

export function getSettingDiffEntries(
  section: SettingSection,
  previousValue: Json | null,
  nextValue: Json
) {
  const previous = normalizeAdminSettingSection(section, previousValue);
  const next = normalizeAdminSettingSection(section, nextValue);
  const labels = SETTINGS_FIELD_LABELS[section];

  return Object.keys(next).map((fieldName) => {
    const previousFieldValue = previous[fieldName as keyof typeof previous] as PrimitiveSettingValue;
    const nextFieldValue = next[fieldName as keyof typeof next] as PrimitiveSettingValue;

    return {
      fieldName,
      label: labels[fieldName] ?? fieldName,
      previousValue: formatSettingFieldValue(fieldName, previousFieldValue),
      nextValue: formatSettingFieldValue(fieldName, nextFieldValue),
      changed:
        JSON.stringify(previousFieldValue ?? null) !== JSON.stringify(nextFieldValue ?? null),
    };
  });
}
