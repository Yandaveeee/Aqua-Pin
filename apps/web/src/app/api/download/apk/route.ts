import { NextResponse } from "next/server";
import { getApkReleaseInfo } from "@/lib/admin-data";
import { ADMIN_SETTINGS_DEFAULTS } from "@/lib/admin-settings";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const localApkPath = path.join(process.cwd(), "public", "aquapin-release.apk");
    if (fs.existsSync(localApkPath)) {
      const stats = fs.statSync(localApkPath);
      const fileBuffer = fs.readFileSync(localApkPath);
      return new Response(fileBuffer, {
        headers: {
          "Content-Type": "application/vnd.android.package-archive",
          "Content-Disposition": 'attachment; filename="aquapin-release.apk"',
          "Content-Length": stats.size.toString(),
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

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
    console.error("Failed to serve APK download:", err);
    const fallbackUrl =
      ADMIN_SETTINGS_DEFAULTS.general.apkDownloadUrl ||
      "https://github.com/Yandaveeee/Aquapin/releases/latest/download/aquapin-release.apk";
    return NextResponse.redirect(fallbackUrl, { status: 307 });
  }
}
