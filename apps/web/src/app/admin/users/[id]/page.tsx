import Link from "next/link";
import { notFound } from "next/navigation";
import type { Database } from "@aquapin/shared";
import { formatDateTime, formatRelativeTime } from "@/lib/admin-format";
import { requireApprovedAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PublicProfile = Database["public"]["Tables"]["public_profiles"]["Row"];

type AssignedPond = {
  id: string;
  name: string;
  isActive: boolean;
  species: string | null;
  stockCount: number;
  location: string | null;
};

type AdminUserDetailPageProps = {
  params: Promise<{ id: string }>;
};

const ENRICHED_PROFILE_FIELDS =
  "id, email, full_name, role, status, last_login_at, latest_latitude, latest_longitude, location_accuracy_m, location_label, municipality, barangay, region, location_updated_at, created_at, updated_at";

function fallbackName(email: string) {
  return email
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function parsePondLocation(value: unknown) {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    "coordinates" in value &&
    Array.isArray((value as { coordinates?: unknown[] }).coordinates)
  ) {
    const coordinates = (value as { coordinates: unknown[] }).coordinates;
    if (coordinates.length >= 2) {
      return `${Number(coordinates[1]).toFixed(5)}, ${Number(coordinates[0]).toFixed(5)}`;
    }
  }
  return null;
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function mockUser(id: string): PublicProfile | null {
  const now = Date.now();
  const profiles: Record<string, Partial<PublicProfile> & Pick<PublicProfile, "id" | "email" | "role">> = {
    "mock-admin": {
      id: "mock-admin",
      email: "admin@aquapin.com",
      full_name: "AquaPin Administrator",
      role: "admin",
      last_login_at: new Date(now - 2 * 3600e3).toISOString(),
    },
    "mock-staff-miguel": {
      id: "mock-staff-miguel",
      email: "miguel@aquapin.com",
      full_name: "Miguel Cruz",
      role: "field_staff",
      last_login_at: new Date(now - 3 * 3600e3).toISOString(),
      latest_latitude: 14.6124,
      latest_longitude: 121.0124,
      location_accuracy_m: 12,
      location_label: "Laguna North Farm, Los Baños",
      municipality: "Los Baños",
      barangay: "Bayog",
      region: "CALABARZON",
      location_updated_at: new Date(now - 3 * 3600e3).toISOString(),
    },
    "mock-staff-sarah": {
      id: "mock-staff-sarah",
      email: "sarah@aquapin.com",
      full_name: "Sarah Santos",
      role: "field_staff",
      last_login_at: new Date(now - 6 * 3600e3).toISOString(),
      latest_latitude: 14.5824,
      latest_longitude: 120.9724,
      location_accuracy_m: 18,
      location_label: "Laguna South Grow-out Area",
      municipality: "Calamba",
      barangay: "Real",
      region: "CALABARZON",
      location_updated_at: new Date(now - 6 * 3600e3).toISOString(),
    },
    "mock-staff-jose": {
      id: "mock-staff-jose",
      email: "jose@aquapin.com",
      full_name: "Jose Rizal",
      role: "field_staff",
      last_login_at: null,
      latest_latitude: 14.6542,
      latest_longitude: 121.1524,
      location_accuracy_m: 22,
      location_label: "Rizal Hillside Pond Area",
      municipality: "Antipolo",
      barangay: "San Jose",
      region: "CALABARZON",
      location_updated_at: new Date(now - 12 * 3600e3).toISOString(),
    },
  };
  const source = profiles[id];
  if (!source) return null;

  return {
    id: source.id,
    email: source.email,
    full_name: source.full_name ?? fallbackName(source.email),
    role: source.role,
    status: "approved",
    last_login_at: source.last_login_at ?? null,
    latest_latitude: source.latest_latitude ?? null,
    latest_longitude: source.latest_longitude ?? null,
    location_accuracy_m: source.location_accuracy_m ?? null,
    location_label: source.location_label ?? null,
    municipality: source.municipality ?? null,
    barangay: source.barangay ?? null,
    region: source.region ?? null,
    location_updated_at: source.location_updated_at ?? null,
    created_at: new Date(now - (source.role === "admin" ? 30 : 14) * 864e5).toISOString(),
    updated_at: source.location_updated_at ?? new Date(now - 864e5).toISOString(),
  };
}

export default async function AdminUserDetailPage({ params }: AdminUserDetailPageProps) {
  await requireApprovedAdmin();
  const { id } = await params;
  const { cookies } = await import("next/headers");
  const isMock = (await cookies()).get("aquapin_mock_admin")?.value === "true";
  let profile: PublicProfile | null = null;
  let assignedPonds: AssignedPond[] = [];

  if (isMock) {
    profile = mockUser(id);
    if (profile?.role === "field_staff") {
      const { MOCK_PONDS } = await import("@/lib/mock-data");
      const key = profile.email.split("@")[0];
      assignedPonds = MOCK_PONDS
        .filter((pond) => pond.createdBy.toLowerCase().includes(key))
        .map((pond) => ({
          id: pond.id,
          name: pond.name,
          isActive: pond.isActive,
          species: pond.currentSpecies,
          stockCount: pond.currentStockCount,
          location: pond.location,
        }));
    }
  } else {
    const supabase = await createSupabaseServerClient();
    const enrichedResult = await supabase
      .from("public_profiles")
      .select(ENRICHED_PROFILE_FIELDS)
      .eq("id", id)
      .maybeSingle();

    if (enrichedResult.error) {
      console.warn("Enriched staff profile fields are unavailable; using legacy profile data:", enrichedResult.error.message);
      const legacyResult = await supabase
        .from("public_profiles")
        .select("id, email, role, status, created_at, updated_at")
        .eq("id", id)
        .maybeSingle();
      if (legacyResult.data) {
        const legacy = legacyResult.data as any;
        profile = {
          ...legacy,
          full_name: fallbackName(legacy.email),
          last_login_at: null,
          latest_latitude: null,
          latest_longitude: null,
          location_accuracy_m: null,
          location_label: null,
          municipality: null,
          barangay: null,
          region: null,
          location_updated_at: null,
        };
      }
    } else {
      profile = enrichedResult.data as unknown as PublicProfile | null;
    }

    if (profile) {
      const pondResult = await supabase
        .from("ponds")
        .select("id, name, is_active, current_species, current_stock_count, location")
        .eq("created_by", profile.id)
        .order("name", { ascending: true });
      if (pondResult.error) console.error("Failed to load assigned ponds:", pondResult.error.message);
      assignedPonds = (pondResult.data ?? []).map((pond: any) => ({
        id: pond.id,
        name: pond.name,
        isActive: Boolean(pond.is_active),
        species: pond.current_species,
        stockCount: Number(pond.current_stock_count ?? 0),
        location: parsePondLocation(pond.location),
      }));
    }
  }

  if (!profile) notFound();

  const fullName = profile.full_name?.trim() || fallbackName(profile.email);
  const hasCoordinates =
    Number.isFinite(profile.latest_latitude) && Number.isFinite(profile.latest_longitude);
  const latitude = hasCoordinates ? Number(profile.latest_latitude) : null;
  const longitude = hasCoordinates ? Number(profile.latest_longitude) : null;
  const mapUrl =
    latitude !== null && longitude !== null
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - 0.012}%2C${latitude - 0.009}%2C${longitude + 0.012}%2C${latitude + 0.009}&layer=mapnik&marker=${latitude}%2C${longitude}`
      : null;
  const addressParts = [profile.barangay, profile.municipality, profile.region].filter(Boolean);

  return (
    <section className="staff-profile-page">
      <nav className="staff-profile-breadcrumb" aria-label="Breadcrumb">
        <Link href="/admin/users">
          <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m12.5 4-6 6 6 6" /></svg>
          Users
        </Link>
        <span>/</span>
        <span>{fullName}</span>
      </nav>

      <header className="staff-profile-hero">
        <span className="staff-profile-avatar" aria-hidden="true">{initials(fullName)}</span>
        <div className="staff-profile-hero-copy">
          <div className="staff-profile-title-row">
            <h1>{fullName}</h1>
            <span className={`ui-pill ${profile.status === "approved" ? "ui-pill-success" : "ui-pill-warning"}`}>
              {profile.status === "approved" ? "Active" : "Pending"}
            </span>
          </div>
          <p>{profile.email}</p>
          <div className="staff-profile-meta-row">
            <span>{profile.role === "admin" ? "Administrator" : "Field staff"}</span>
            <span>Joined {formatDateTime(profile.created_at)}</span>
            <span>
              {profile.last_login_at ? `Last login ${formatRelativeTime(profile.last_login_at)}` : "No login recorded"}
            </span>
          </div>
        </div>
        <Link className="secondary-button" href="/admin/records">View activity</Link>
      </header>

      <div className="staff-profile-summary-grid">
        <article>
          <span>Account status</span>
          <strong>{profile.status === "approved" ? "Active" : "Pending"}</strong>
          <small>{profile.role === "admin" ? "Web console access" : "Mobile field account"}</small>
        </article>
        <article>
          <span>Last login</span>
          <strong>{profile.last_login_at ? formatRelativeTime(profile.last_login_at) : "Unavailable"}</strong>
          <small>{profile.last_login_at ? formatDateTime(profile.last_login_at) : "Recorded after the next mobile sign-in"}</small>
        </article>
        <article>
          <span>Assigned ponds</span>
          <strong>{assignedPonds.length}</strong>
          <small>{assignedPonds.length === 1 ? "Current responsibility" : "Current responsibilities"}</small>
        </article>
        <article>
          <span>Latest GPS report</span>
          <strong>{profile.location_updated_at ? formatRelativeTime(profile.location_updated_at) : "Unavailable"}</strong>
          <small>{profile.location_updated_at ? formatDateTime(profile.location_updated_at) : "No location submitted yet"}</small>
        </article>
      </div>

      <div className="staff-profile-content-grid">
        <section className="staff-profile-card staff-location-card">
          <div className="staff-profile-card-head">
            <div>
              <p className="eyebrow">Latest reported location</p>
              <h2>{(profile.location_label ?? addressParts.join(", ")) || "Location unavailable"}</h2>
            </div>
            {profile.location_updated_at ? (
              <span className="ui-pill ui-pill-ghost">{formatRelativeTime(profile.location_updated_at)}</span>
            ) : null}
          </div>

          {mapUrl ? (
            <div className="staff-location-map">
              <iframe
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={mapUrl}
                title={`Latest reported location for ${fullName}`}
              />
            </div>
          ) : (
            <div className="staff-location-empty">
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              <strong>No GPS snapshot yet</strong>
              <span>The location appears after this staff member opens the mobile map with permission enabled.</span>
            </div>
          )}

          <dl className="staff-location-details">
            <div><dt>Coordinates</dt><dd>{latitude !== null && longitude !== null ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` : "Not available"}</dd></div>
            <div><dt>Accuracy</dt><dd>{profile.location_accuracy_m != null ? `±${Math.round(profile.location_accuracy_m)} m` : "Not available"}</dd></div>
            <div><dt>Barangay</dt><dd>{profile.barangay ?? "Not available"}</dd></div>
            <div><dt>Municipality</dt><dd>{profile.municipality ?? "Not available"}</dd></div>
            <div><dt>Region</dt><dd>{profile.region ?? "Not available"}</dd></div>
          </dl>
          <p className="staff-location-note">
            This is the latest location voluntarily reported by the mobile app, not continuous live tracking.
          </p>
        </section>

        <section className="staff-profile-card">
          <div className="staff-profile-card-head">
            <div>
              <p className="eyebrow">Responsibilities</p>
              <h2>Assigned ponds</h2>
            </div>
            <Link href="/admin/ponds">Open map</Link>
          </div>
          {assignedPonds.length > 0 ? (
            <div className="staff-assignment-list">
              {assignedPonds.map((pond) => (
                <article key={pond.id}>
                  <div>
                    <strong>{pond.name}</strong>
                    <span>{pond.species ?? "No species"} · {pond.stockCount.toLocaleString()} fish</span>
                    {pond.location ? <small>{pond.location}</small> : null}
                  </div>
                  <span className={`ui-pill ${pond.isActive ? "ui-pill-success" : "ui-pill-ghost"}`}>
                    {pond.isActive ? "Active" : "Inactive"}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-panel">
              <p>No ponds are assigned to this user.</p>
              <p className="muted">Ponds created by field staff will appear here automatically.</p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
