import PondMap from "@/components/admin/PondMap";
import { requireApprovedAdmin } from "@/lib/auth";
import type { MockPond } from "@/lib/mock-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const revalidate = 0;

function mapPond(row: any, creatorName?: string): MockPond {
  let lat = 14.5995;
  let lng = 120.9842;
  let hasLocation = false;
  const location = typeof row.location === "string" ? row.location : "";
  const values = location.split(",").map((value: string) => Number(value.trim()));

  if (values.length === 2 && values.every(Number.isFinite)) {
    [lat, lng] = values;
    hasLocation = true;
  } else {
    const point = location.match(/^POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)$/i);
    if (point) {
      lng = Number(point[1]);
      lat = Number(point[2]);
      hasLocation = true;
    }
  }

  const geoJsonCoordinates = row.location?.coordinates;
  if (
    Array.isArray(geoJsonCoordinates) &&
    geoJsonCoordinates.length >= 2 &&
    Number.isFinite(Number(geoJsonCoordinates[0])) &&
    Number.isFinite(Number(geoJsonCoordinates[1]))
  ) {
    lng = Number(geoJsonCoordinates[0]);
    lat = Number(geoJsonCoordinates[1]);
    hasLocation = true;
  }

  let boundary: MockPond["boundary"] = null;
  if (row.boundary) {
    try {
      const parsed = JSON.parse(row.boundary);
      if (Array.isArray(parsed)) {
        boundary = parsed.map((point) => ({
          lat: Number(point.latitude ?? point.lat),
          lng: Number(point.longitude ?? point.lng),
        }));
      }
    } catch {
      boundary = null;
    }
  }

  if (!hasLocation && boundary && boundary.length > 0) {
    lat = boundary.reduce((sum, point) => sum + point.lat, 0) / boundary.length;
    lng = boundary.reduce((sum, point) => sum + point.lng, 0) / boundary.length;
  }

  return {
    id: row.id,
    name: row.name,
    location: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    coordinates: { lat, lng },
    boundary,
    createdBy: row.created_by,
    createdByName: creatorName || "Field staff",
    createdAt: row.created_at,
    isActive: row.is_active ?? false,
    currentSpecies: row.current_species,
    currentStockCount: row.current_stock_count ?? 0,
    areaSqm: boundary ? Math.max(1000, boundary.length * 2500) : 10000,
  };
}

export default async function AdminPondsPage() {
  await requireApprovedAdmin();
  const { cookies } = await import("next/headers");
  const isMock =
    process.env.NEXT_PUBLIC_ENABLE_MOCK_ADMIN === "true" &&
    (await cookies()).get("aquapin_mock_admin")?.value === "true";
  let ponds: MockPond[] | undefined;

  if (isMock) {
    ponds = (await import("@/lib/mock-data")).MOCK_PONDS;
  } else {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("ponds")
      .select("id, name, location, boundary, created_by, is_active, current_species, current_stock_count, created_at")
      .order("name", { ascending: true });

    if (error) console.error("Failed to load ponds:", error.message);
    const pondRows = (data ?? []) as any[];
    const creatorIds = Array.from(new Set(pondRows.map((pond) => pond.created_by)));
    const profileResult = creatorIds.length
      ? await supabase.from("public_profiles").select("id, email").in("id", creatorIds)
      : { data: [], error: null };

    if (profileResult.error) {
      console.error("Failed to load pond creators:", profileResult.error.message);
    }

    const creatorLabels = new Map(
      ((profileResult.data ?? []) as Array<{ id: string; email: string }>).map((profile) => [
        profile.id,
        profile.email,
      ])
    );
    ponds = pondRows.map((pond) => mapPond(pond, creatorLabels.get(pond.created_by)));
  }

  return (
    <section className="map-page-stack">
      <PondMap ponds={ponds} />
    </section>
  );
}
