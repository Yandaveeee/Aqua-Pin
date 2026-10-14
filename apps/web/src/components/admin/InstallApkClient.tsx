"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { GeneralSettings } from "@aquapin/shared";
import { updateAdminSettingAction } from "@/app/admin/settings/actions";

type InstallApkClientProps = {
  generalSettings: GeneralSettings;
  qrCodeDataUrl: string;
  downloadUrl: string;
  saved?: string;
  error?: string;
};

export default function InstallApkClient({
  generalSettings,
  qrCodeDataUrl,
  downloadUrl,
  saved,
  error,
}: InstallApkClientProps) {
  const [copied, setCopied] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const version = generalSettings.appVersion || "1.0.0";
  const fileSize = generalSettings.apkFileSize || "62.1 MB";
  const releaseNotes =
    generalSettings.appReleaseNotes ||
    "Official AquaPin Android release featuring GPS pond geotagging, offline record caching, and harvest logging.";

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(downloadUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="install-apk-container">
      {saved && (
        <div className="alert-banner alert-success" role="status">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <div>
            <strong>Success!</strong> APK release settings have been updated and are now live.
          </div>
        </div>
      )}

      {error && (
        <div className="alert-banner alert-danger" role="alert">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}

      <div className="apk-hero-card">
        <div className="apk-hero-info">
          <div className="apk-badge-row">
            <span className="ui-pill ui-pill-info">Android APK</span>
            <span className="ui-pill ui-pill-ghost">v{version}</span>
            <span className="ui-pill ui-pill-success">Ready to Install</span>
          </div>
          <h2 className="apk-hero-title">AquaPin Mobile Application</h2>
          <p className="apk-hero-description">
            Install the field application on Android smartphones to capture GPS pond boundaries, record stocking and harvests, and synchronize data offline.
          </p>

          <div className="apk-meta-grid">
            <div className="apk-meta-item">
              <span className="apk-meta-label">App Version</span>
              <span className="apk-meta-value">v{version}</span>
            </div>
            <div className="apk-meta-item">
              <span className="apk-meta-label">Package Size</span>
              <span className="apk-meta-value">{fileSize}</span>
            </div>
            <div className="apk-meta-item">
              <span className="apk-meta-label">Target Platform</span>
              <span className="apk-meta-value">Android 8.0+</span>
            </div>
            <div className="apk-meta-item">
              <span className="apk-meta-label">Architecture</span>
              <span className="apk-meta-value">Universal (arm64 / x86_64)</span>
            </div>
          </div>

          <div className="apk-actions-row">
            <a
              href="/api/download/apk"
              className="action-button action-button-primary apk-download-btn"
              download="aquapin-release.apk"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download APK (v{version})
            </a>

            <button
              type="button"
              onClick={handleCopyLink}
              className="action-button action-button-secondary"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {copied ? "Link Copied!" : "Copy APK Link"}
            </button>

            <Link
              href="/download"
              target="_blank"
              className="action-button action-button-ghost"
            >
              Public Download Page
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </Link>
          </div>
        </div>

        {qrCodeDataUrl && (
          <div className="apk-qr-card">
            <div className="apk-qr-frame">
              <Image
                src={qrCodeDataUrl}
                alt="Scan QR code to install AquaPin APK"
                width={200}
                height={200}
                className="apk-qr-image"
                unoptimized
              />
            </div>
            <p className="apk-qr-label">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 18h.01M8 21h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z" />
              </svg>
              Scan with phone camera
            </p>
            <span className="apk-qr-hint">Instant download on Android</span>
          </div>
        )}
      </div>

      <div className="apk-grid-layout">
        <section className="settings-card apk-manage-card">
          <div className="settings-card-head">
            <div>
              <h3>Insert APK / Release Configuration</h3>
              <p className="muted">
                Insert or update the APK download link, version identifier, and notes for field staff.
              </p>
            </div>
          </div>

          <form
            action={updateAdminSettingAction}
            onChange={() => setIsDirty(true)}
            onSubmit={() => setIsDirty(false)}
            className="apk-settings-form"
          >
            <input type="hidden" name="section" value="general" />
            <input type="hidden" name="returnTo" value="/admin/install-apk" />
            <input type="hidden" name="organizationName" value={generalSettings.organizationName} />
            <input type="hidden" name="timezone" value={generalSettings.timezone} />
            <input type="hidden" name="units" value={generalSettings.units} />

            <div className="settings-field">
              <label htmlFor="apkDownloadUrl" className="field-label">
                APK Download URL / File Link
              </label>
              <input
                id="apkDownloadUrl"
                name="apkDownloadUrl"
                type="url"
                required
                defaultValue={downloadUrl}
                placeholder="https://github.com/.../aquapin-release.apk"
                className="ui-input"
              />
              <p className="field-hint">
                Direct download URL for the APK file (GitHub Release asset, Supabase Storage, CDN, or hosted link).
              </p>
            </div>

            <div className="form-row-two-col">
              <div className="settings-field">
                <label htmlFor="appVersion" className="field-label">
                  App Version
                </label>
                <input
                  id="appVersion"
                  name="appVersion"
                  type="text"
                  required
                  defaultValue={version}
                  placeholder="1.0.0"
                  className="ui-input"
                />
              </div>

              <div className="settings-field">
                <label htmlFor="apkFileSize" className="field-label">
                  File Size
                </label>
                <input
                  id="apkFileSize"
                  name="apkFileSize"
                  type="text"
                  defaultValue={fileSize}
                  placeholder="62.1 MB"
                  className="ui-input"
                />
              </div>
            </div>

            <div className="settings-field">
              <label htmlFor="appReleaseNotes" className="field-label">
                Release Notes & Changelog
              </label>
              <textarea
                id="appReleaseNotes"
                name="appReleaseNotes"
                rows={3}
                defaultValue={releaseNotes}
                placeholder="Details about improvements, bug fixes, or newly supported features..."
                className="ui-textarea"
              />
            </div>

            <div className="form-action-row">
              <button
                type="submit"
                className={`action-button action-button-primary ${isDirty ? "is-highlighted" : ""}`}
              >
                Save APK Configuration
              </button>
              <a
                href={downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="action-button action-button-secondary"
              >
                Test Download URL
              </a>
            </div>
          </form>
        </section>

        <section className="settings-card apk-instructions-card">
          <div className="settings-card-head">
            <div>
              <h3>How to Install on Android</h3>
              <p className="muted">Standard instructions for field technicians and operators</p>
            </div>
          </div>

          <div className="install-steps-list">
            <div className="install-step-item">
              <span className="install-step-badge">1</span>
              <div>
                <strong>Download the APK</strong>
                <p>Tap the download button on your phone or scan the QR code above.</p>
              </div>
            </div>

            <div className="install-step-item">
              <span className="install-step-badge">2</span>
              <div>
                <strong>Open Downloaded File</strong>
                <p>Pull down notification shade or open your <em>Files / Downloads</em> folder and tap <code>aquapin-release.apk</code>.</p>
              </div>
            </div>

            <div className="install-step-item">
              <span className="install-step-badge">3</span>
              <div>
                <strong>Enable Installation Permission</strong>
                <p>If prompted with <em>&quot;Install unknown apps&quot;</em>, tap <strong>Settings</strong> and toggle on <strong>Allow from this source</strong>.</p>
              </div>
            </div>

            <div className="install-step-item">
              <span className="install-step-badge">4</span>
              <div>
                <strong>Complete Installation</strong>
                <p>Tap <strong>Install</strong>, then tap <strong>Open</strong> to launch AquaPin. Sign in with your assigned staff account.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
