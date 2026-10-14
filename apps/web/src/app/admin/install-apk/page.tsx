import { headers } from "next/headers";
import { getApkReleaseInfo } from "@/lib/admin-data";
import { generateQrCodeDataUrl } from "@/lib/qr-code";
import InstallApkClient from "@/components/admin/InstallApkClient";

type AdminInstallApkPageProps = {
  searchParams?: Promise<{ saved?: string; error?: string }>;
};

export const dynamic = "force-dynamic";

export default async function AdminInstallApkPage({ searchParams }: AdminInstallApkPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const generalSettings = await getApkReleaseInfo();

  const reqHeaders = await headers();
  const host = reqHeaders.get("host") || "localhost:3000";
  const proto = reqHeaders.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const publicDownloadPageUrl = `${origin}/download`;
  const qrCodeDataUrl = await generateQrCodeDataUrl(publicDownloadPageUrl);

  const downloadUrl =
    generalSettings.apkDownloadUrl ||
    "https://github.com/Yandaveeee/Aquapin/releases/download/v1.0.0/aquapin-release.apk";

  return (
    <div className="admin-page-content">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Install Mobile APK</h2>
          <p className="admin-page-subtitle">
            Manage mobile app distribution, insert or update the APK release URL, and provide field staff with direct download & QR installation.
          </p>
        </div>
      </div>

      <InstallApkClient
        generalSettings={generalSettings}
        qrCodeDataUrl={qrCodeDataUrl}
        downloadUrl={downloadUrl}
        saved={params?.saved}
        error={params?.error}
      />
    </div>
  );
}
