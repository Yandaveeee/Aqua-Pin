import type { Database } from "@aquapin/shared";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PublicProfile = Database["public"]["Tables"]["public_profiles"]["Row"];

export async function getCurrentUserAndProfile(): Promise<{
  user: User | null;
  profile: PublicProfile | null;
}> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const isMock =
    process.env.NEXT_PUBLIC_ENABLE_MOCK_ADMIN === "true" &&
    cookieStore.get("aquapin_mock_admin")?.value === "true";

  if (isMock) {
    return {
      user: {
        id: "00000000-0000-0000-0000-000000000000",
        email: "admin@aquapin.com",
        role: "authenticated",
        updated_at: new Date().toISOString(),
      } as any,
      profile: {
        id: "00000000-0000-0000-0000-000000000000",
        email: "admin@aquapin.com",
        full_name: "AquaPin Administrator",
        role: "admin",
        status: "approved",
        last_login_at: new Date().toISOString(),
        latest_latitude: null,
        latest_longitude: null,
        location_accuracy_m: null,
        location_label: null,
        municipality: null,
        barangay: null,
        region: null,
        location_updated_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };
  }

  const supabase = (await createSupabaseServerClient()) as any;
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { user: null, profile: null as PublicProfile | null };
  }

  const { data: profileData } = await supabase
    .from("public_profiles")
    .select("id, email, role, status, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  const profile = (profileData ?? null) as PublicProfile | null;

  return {
    user,
    profile,
  };
}

export async function requireApprovedAdmin(): Promise<{
  user: User;
  profile: PublicProfile;
}> {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) {
    redirect("/login?next=/admin");
  }

  // Account approval is not part of AquaPin's access model. A user with the
  // admin role can enter the console; field staff are provisioned as active
  // when they sign up for the mobile app.
  if (!profile || profile.role !== "admin") {
    redirect("/forbidden");
  }

  return {
    user: user as User,
    profile: profile as PublicProfile,
  };
}
