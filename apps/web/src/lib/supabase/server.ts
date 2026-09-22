import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import type { SetAllCookies } from "@supabase/ssr";
import type { Database } from "@aquapin/shared";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/lib/supabase/env";

// Share one client within a server render; never cache across users or requests.
export const createSupabaseServerClient = cache(async function createSupabaseServerClient() {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // noop: writes are only available in server actions/route handlers.
        }
      },
    },
  });
});
