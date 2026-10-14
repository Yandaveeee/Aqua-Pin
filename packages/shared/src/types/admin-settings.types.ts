export type SettingSection = 'general' | 'operations' | 'notifications' | 'integrations' | 'security'

export interface GeneralSettings {
  organizationName: string
  timezone: string
  units: 'metric' | 'imperial'
  apkDownloadUrl?: string
  appVersion?: string
  apkFileSize?: string
  appReleaseNotes?: string
}

export interface OperationsSettings {
  survivalThresholdPercent: number
  lowStockThreshold: number
  defaultMapCenterLat: number
  defaultMapCenterLng: number
}

export interface NotificationsSettings {
  inAppEnabled: boolean
  emailEnabled: boolean
  staleSyncMinutes: number
  criticalAlertsOnly: boolean
}

export interface IntegrationsSettings {
  googleMapsApiKey: string
  webhookUrl: string
}

export interface SecuritySettings {
  sessionTimeoutMinutes: number
  enforceStrongPasswords: boolean
  requireMfaForAdmins: boolean
}

export interface AdminSettingsSections {
  general: GeneralSettings
  operations: OperationsSettings
  notifications: NotificationsSettings
  integrations: IntegrationsSettings
  security: SecuritySettings
}

export interface AdminSettingsResponse {
  sections: AdminSettingsSections
  source: 'database' | 'fallback'
  updatedAt: string
}

export interface SettingsSectionUpdateResponse {
  section: SettingSection
  value: AdminSettingsSections[SettingSection]
  updatedAt: string
}

export interface SettingsAuditRecord {
  id: string
  section: SettingSection
  changed_by: string
  changed_at: string
  previous_value: unknown
  new_value: unknown
}

export interface SettingsIntegrationTestResponse {
  provider: 'maps' | 'webhook'
  ok: boolean
  message: string
}

