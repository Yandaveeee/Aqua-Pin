"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireApprovedAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const FEED_TYPES = new Set(["purchase", "consumption", "adjustment"]);

function withQuery(path: string, key: string, value: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${key}=${encodeURIComponent(value)}`;
}

function readRequiredString(formData: FormData, name: string, label: string) {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) {
    throw new Error(`${label} is required.`);
  }

  return value;
}

function readNumber(
  formData: FormData,
  name: string,
  label: string,
  options: { min?: number; integer?: boolean } = {}
) {
  const rawValue = readRequiredString(formData, name, label);
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

  return parsed;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function createFeedLogAction(formData: FormData) {
  const { user } = await requireApprovedAdmin();

  let feedType: "purchase" | "consumption" | "adjustment";
  let feedBrand: string;
  let quantity: number;
  let pondId: string | null;
  let notes: string | null;

  try {
    const rawFeedType = readRequiredString(formData, "feedType", "Feed action type");
    if (!FEED_TYPES.has(rawFeedType)) {
      throw new Error("Invalid feed action type.");
    }

    feedType = rawFeedType as "purchase" | "consumption" | "adjustment";
    feedBrand = readRequiredString(formData, "feedBrand", "Feed brand");
    quantity = readNumber(formData, "quantity", "Quantity", { min: 1 });
    pondId =
      feedType === "consumption"
        ? readRequiredString(formData, "pondId", "Affected pond")
        : null;
    notes = String(formData.get("notes") ?? "").trim() || null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid feed log.";
    redirect(withQuery("/admin/feed", "error", message));
  }

  const signedQuantity = feedType === "consumption" ? -quantity : quantity;

  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const isMock = cookieStore.get("aquapin_mock_admin")?.value === "true";

  if (!isMock) {
    const supabase = (await createSupabaseServerClient()) as any;

    const { error: logError } = await supabase.from("feed_logs").insert({
      pond_id: pondId,
      type: feedType,
      feed_brand: feedBrand,
      quantity_bags: signedQuantity,
      notes,
      logged_by: user.id,
    });

    if (logError) {
      redirect(withQuery("/admin/feed", "error", logError.message));
    }

    const { data: inventoryItem, error: itemReadError } = await supabase
      .from("feed_inventory_items")
      .select("id, remaining_bags, threshold_bags")
      .eq("feed_brand", feedBrand)
      .maybeSingle();

    if (itemReadError) {
      redirect(withQuery("/admin/feed", "error", itemReadError.message));
    }

    const nextRemainingBags = Math.max(
      0,
      Number(inventoryItem?.remaining_bags ?? 0) + signedQuantity
    );

    const inventoryWrite =
      inventoryItem?.id
        ? await supabase
            .from("feed_inventory_items")
            .update({
              remaining_bags: nextRemainingBags,
              updated_by: user.id,
              updated_at: new Date().toISOString(),
            })
            .eq("id", inventoryItem.id)
        : await supabase.from("feed_inventory_items").insert({
            feed_brand: feedBrand,
            remaining_bags: nextRemainingBags,
            threshold_bags: 20,
            updated_by: user.id,
          });

    if (inventoryWrite.error) {
      redirect(withQuery("/admin/feed", "error", inventoryWrite.error.message));
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/feed");
  redirect(withQuery("/admin/feed", "saved", "feed-log"));
}

export async function createStockingPlanAction(formData: FormData) {
  const { user } = await requireApprovedAdmin();

  let pondId: string;
  let species: string;
  let quantity: number;
  let averageWeightG: number;
  let plannedDate: string;
  let feedBudgetBags: number;

  try {
    pondId = readRequiredString(formData, "planPondId", "Target pond");
    species = readRequiredString(formData, "planSpecies", "Species");
    quantity = readNumber(formData, "planQuantity", "Target stock quantity", {
      min: 1,
      integer: true,
    });
    averageWeightG = readNumber(formData, "planWeight", "Initial average weight", {
      min: 0,
    });
    plannedDate = String(formData.get("planDate") ?? "").trim() || todayDate();
    feedBudgetBags = Math.max(1, Math.round(quantity * 0.003));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid stocking plan.";
    redirect(withQuery("/admin/feed", "error", message));
  }

  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const isMock = cookieStore.get("aquapin_mock_admin")?.value === "true";

  if (!isMock) {
    const supabase = (await createSupabaseServerClient()) as any;
    const { error } = await supabase.from("stocking_plans").insert({
      pond_id: pondId,
      species,
      quantity,
      average_weight_g: averageWeightG,
      planned_date: plannedDate,
      feed_budget_bags: feedBudgetBags,
      planned_by: user.id,
      status: "planned",
    });

    if (error) {
      redirect(withQuery("/admin/feed", "error", error.message));
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/feed");
  redirect(withQuery("/admin/feed", "saved", "stocking-plan"));
}
