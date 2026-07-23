"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireApprovedAdmin } from "@/lib/auth";
import {
  getStep5AccessMigrationMessage,
  isMissingSchemaFunctionError,
} from "@/lib/supabase-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function appendQueryParam(path: string, key: string, value: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${key}=${encodeURIComponent(value)}`;
}

export async function approvePendingStaffAction(formData: FormData) {
  await requireApprovedAdmin();

  const targetUserId = String(formData.get("targetUserId") ?? "").trim();
  const notesInput = String(formData.get("notes") ?? "");
  const notes = notesInput.trim().length > 0 ? notesInput.trim() : null;
  const returnTo = String(formData.get("returnTo") ?? "/admin/approvals");
  const safeReturnTo = returnTo.startsWith("/admin/approvals") ? returnTo : "/admin/approvals";

  if (!targetUserId) {
    redirect(appendQueryParam(safeReturnTo, "error", "Missing target user id."));
  }

  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const isMock = cookieStore.get("aquapin_mock_admin")?.value === "true";

  if (isMock) {
    // Simulate approval in mock mode
  } else {
    const supabase = (await createSupabaseServerClient()) as any;
    const { error } = await supabase.rpc("admin_approve_staff", {
      target_user_id: targetUserId,
      notes,
    });

    if (error) {
      if (isMissingSchemaFunctionError(error, "admin_approve_staff")) {
        redirect(appendQueryParam(safeReturnTo, "error", getStep5AccessMigrationMessage()));
      }

      redirect(appendQueryParam(safeReturnTo, "error", error.message));
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/approvals");
  redirect(appendQueryParam(safeReturnTo, "approved", "1"));
}

export async function bulkApprovePendingStaffAction(formData: FormData) {
  await requireApprovedAdmin();

  const targetUserIds = Array.from(
    new Set(
      formData
        .getAll("targetUserId")
        .map((value) => String(value).trim())
        .filter(Boolean)
    )
  );
  const notesInput = String(formData.get("notes") ?? "");
  const notes = notesInput.trim().length > 0 ? notesInput.trim() : null;
  const returnTo = String(formData.get("returnTo") ?? "/admin/approvals");
  const safeReturnTo = returnTo.startsWith("/admin/approvals") ? returnTo : "/admin/approvals";

  if (targetUserIds.length === 0) {
    redirect(appendQueryParam(safeReturnTo, "error", "Select at least one account to approve."));
  }

  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const isMock = cookieStore.get("aquapin_mock_admin")?.value === "true";

  if (isMock) {
    // Simulate bulk approval in mock mode
  } else {
    const supabase = (await createSupabaseServerClient()) as any;

    for (const targetUserId of targetUserIds) {
      const { error } = await supabase.rpc("admin_approve_staff", {
        target_user_id: targetUserId,
        notes,
      });

      if (error) {
        if (isMissingSchemaFunctionError(error, "admin_approve_staff")) {
          redirect(appendQueryParam(safeReturnTo, "error", getStep5AccessMigrationMessage()));
        }

        redirect(appendQueryParam(safeReturnTo, "error", error.message));
      }
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/approvals");
  redirect(appendQueryParam(safeReturnTo, "approved", String(targetUserIds.length)));
}
