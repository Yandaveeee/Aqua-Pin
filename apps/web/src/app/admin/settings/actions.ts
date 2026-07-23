"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Json, SettingSection } from "@aquapin/shared";
import { requireApprovedAdmin } from "@/lib/auth";
import { parseSettingFormData } from "@/lib/admin-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_SECTIONS = new Set([
  "general",
  "operations",
  "notifications",
  "integrations",
  "security",
]);

function appendQueryParam(path: string, key: string, value: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${key}=${encodeURIComponent(value)}`;
}

export async function updateAdminSettingAction(formData: FormData) {
  await requireApprovedAdmin();

  const section = String(formData.get("section") ?? "").trim();
  const rawValue = String(formData.get("value") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/admin/settings");
  const safeReturnTo = returnTo.startsWith("/admin/settings") ? returnTo : "/admin/settings";

  if (!ALLOWED_SECTIONS.has(section)) {
    redirect(appendQueryParam(safeReturnTo, "error", "Invalid settings section."));
  }

  let parsedValue: Json | null = null;
  const hasRawJson = rawValue.trim().length > 0;

  try {
    if (hasRawJson) {
      parsedValue = JSON.parse(rawValue) as Json;
    } else {
      parsedValue = parseSettingFormData(section as SettingSection, formData) as unknown as Json;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : `Invalid settings for ${section}.`;
    return redirect(appendQueryParam(safeReturnTo, "error", message));
  }

  if (parsedValue === null) {
    return redirect(appendQueryParam(safeReturnTo, "error", `Invalid settings for ${section}.`));
  }

  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const isMock = cookieStore.get("aquapin_mock_admin")?.value === "true";

  if (isMock) {
    // Successfully simulate save in mock mode
  } else {
    const supabase = (await createSupabaseServerClient()) as any;
    const { error } = await supabase.rpc("admin_upsert_setting", {
      p_section: section,
      p_value: parsedValue,
    });

    if (error) {
      redirect(appendQueryParam(safeReturnTo, "error", error.message));
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  redirect(appendQueryParam(safeReturnTo, "saved", section));
}
