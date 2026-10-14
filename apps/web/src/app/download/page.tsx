import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { getApkReleaseInfo } from "@/lib/admin-data";
import { generateQrCodeDataUrl } from "@/lib/qr-code";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Download AquaPin Mobile App | Official Android APK",
  description:
    "Install the AquaPin field operations app on your Android device. Features GPS pond geotagging, offline record caching, and harvest logging.",
};

export default async function DownloadPage() {
  const generalSettings = await getApkReleaseInfo();

  const reqHeaders = await headers();
  const host = reqHeaders.get("host") || "localhost:3000";
  const proto = reqHeaders.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const downloadEndpoint = `${origin}/api/download/apk`;
  const qrCodeDataUrl = await generateQrCodeDataUrl(downloadEndpoint);

  const version = generalSettings.appVersion || "1.0.0";
  const fileSize = generalSettings.apkFileSize || "62.1 MB";
  const releaseNotes =
    generalSettings.appReleaseNotes ||
    "Official AquaPin Android release featuring GPS pond geotagging, offline record caching, and harvest logging.";

  return (
    <main className="public-download-page">
      <header className="public-download-header">
        <Link href="/" className="public-download-brand" aria-label="AquaPin Home">
          <Image
            src="/media/branding/logo.png"
            alt="AquaPin logo"
            width={48}
            height={48}
            priority
          />
          <div>
            <strong>AquaPin</strong>
            <small>Field Operations Mobile App</small>
          </div>
        </Link>

        <div className="public-download-nav">
          <Link href="/" className="public-nav-link">
            Home
          </Link>
          <Link href="/login" className="public-nav-link public-nav-login">
            Admin Login
          </Link>
        </div>
      </header>

      <div className="public-download-hero">
        <div className="public-download-inner">
          <div className="public-download-copy">
            <div className="public-pill-row">
              <span className="ui-pill ui-pill-info">Official Release</span>
              <span className="ui-pill ui-pill-ghost">Android APK</span>
              <span className="ui-pill ui-pill-success">v{version}</span>
            </div>

            <h1 className="public-download-title">
              Install AquaPin on your <span>Android Device</span>
            </h1>

            <p className="public-download-subtitle">
              Designed for aquaculture technicians and pond managers. Map pond boundaries with high-accuracy GPS, log feeding and harvests, and synchronize automatically when connected.
            </p>

            <div className="public-specs-grid">
              <div className="public-spec-card">
                <span className="public-spec-label">Version</span>
                <span className="public-spec-value">v{version}</span>
              </div>
              <div className="public-spec-card">
                <span className="public-spec-label">File Size</span>
                <span className="public-spec-value">{fileSize}</span>
              </div>
              <div className="public-spec-card">
                <span className="public-spec-label">Required OS</span>
                <span className="public-spec-value">Android 8.0+</span>
              </div>
              <div className="public-spec-card">
                <span className="public-spec-label">Format</span>
                <span className="public-spec-value">Direct APK</span>
              </div>
            </div>

            <div className="public-cta-actions">
              <a
                href="/api/download/apk"
                className="public-download-btn"
                download="aquapin-release.apk"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download APK (v{version})
              </a>

              <a
                href="#install-steps"
                className="public-steps-btn"
              >
                View Install Guide
              </a>
            </div>

            <p className="public-security-note">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
              </svg>
              Verified safe and signed package. No Google Play account required.
            </p>
          </div>

          {qrCodeDataUrl && (
            <div className="public-qr-card">
              <div className="public-qr-box">
                <Image
                  src={qrCodeDataUrl}
                  alt="QR Code to download AquaPin APK"
                  width={210}
                  height={210}
                  className="public-qr-img"
                  unoptimized
                />
              </div>
              <div className="public-qr-copy">
                <strong>Scan to Install</strong>
                <p>Open your smartphone camera or scanner to download directly onto your phone.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <section className="public-install-section" id="install-steps">
        <div className="public-section-head">
          <p className="public-section-kicker">Quick Setup</p>
          <h2>How to Install on Android</h2>
          <span>Follow these 4 simple steps to install the APK directly</span>
        </div>

        <div className="public-steps-grid">
          <div className="public-step-card">
            <div className="public-step-number">1</div>
            <h3>Download the APK</h3>
            <p>Tap the <strong>Download APK</strong> button or scan the QR code using your phone camera.</p>
          </div>

          <div className="public-step-card">
            <div className="public-step-number">2</div>
            <h3>Open the File</h3>
            <p>Once downloaded, open the notification or find <code>aquapin-release.apk</code> in your <strong>Downloads</strong> folder.</p>
          </div>

          <div className="public-step-card">
            <div className="public-step-number">3</div>
            <h3>Allow Installation</h3>
            <p>If prompted with <em>&quot;Install unknown apps&quot;</em>, tap <strong>Settings</strong> and switch on <strong>Allow from this source</strong>.</p>
          </div>

          <div className="public-step-card">
            <div className="public-step-number">4</div>
            <h3>Launch &amp; Sign In</h3>
            <p>Tap <strong>Install</strong>, then tap <strong>Open</strong> to launch AquaPin. Sign in with your field staff credentials.</p>
          </div>
        </div>
      </section>

      {releaseNotes && (
        <section className="public-notes-section">
          <div className="public-notes-card">
            <h3>What&apos;s in this version</h3>
            <p>{releaseNotes}</p>
          </div>
        </section>
      )}

      <footer className="public-download-footer">
        <div>
          <strong>AquaPin</strong>
          <p>A geotagging and geospatial mapping system for aquaculture management.</p>
        </div>
        <div className="public-footer-links">
          <Link href="/">Home</Link>
          <Link href="/login">Admin Login</Link>
          <a href="#install-steps">Installation Guide</a>
        </div>
      </footer>
    </main>
  );
}
