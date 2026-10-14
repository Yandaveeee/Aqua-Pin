import { NextResponse } from "next/server";
import { getApkReleaseInfo } from "@/lib/admin-data";
import { ADMIN_SETTINGS_DEFAULTS } from "@/lib/admin-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const generalSettings = await getApkReleaseInfo();
    const downloadUrl =
      generalSettings.apkDownloadUrl ||
      ADMIN_SETTINGS_DEFAULTS.general.apkDownloadUrl ||
      "https://github.com/Yandaveeee/Aquapin/releases/latest/download/aquapin-release.apk";

    return NextResponse.redirect(downloadUrl, {
      status: 307,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    console.error("Failed to redirect to APK download:", err);
    const fallbackUrl =
      ADMIN_SETTINGS_DEFAULTS.general.apkDownloadUrl ||
      "https://github.com/Yandaveeee/Aquapin/releases/latest/download/aquapin-release.apk";
    return NextResponse.redirect(fallbackUrl, { status: 307 });
  }
}
