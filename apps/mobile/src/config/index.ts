const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const MAPS_API_KEY = (process.env.EXPO_PUBLIC_MAPS_API_KEY || '').trim();
const AUTH_EMAIL_REDIRECT_URL = (
  process.env.EXPO_PUBLIC_AUTH_EMAIL_REDIRECT_URL || 'aquapin://auth/callback'
).trim();

// Configuration for the mobile app
export const CONFIG = {
  supabase: {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
  },
  auth: {
    emailRedirectUrl: AUTH_EMAIL_REDIRECT_URL,
  },
  mapsApiKey: MAPS_API_KEY,
};

export function getMissingConfigVars(): string[] {
  const missing: string[] = [];

  if (!CONFIG.supabase.url) missing.push('EXPO_PUBLIC_SUPABASE_URL');
  if (!CONFIG.supabase.anonKey) missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');

  return missing;
}

// Validate required config
export function validateConfig() {
  const missing = getMissingConfigVars();

  if (missing.length > 0) {
    console.warn('Missing environment variables:', missing.join(', '));
  }

  return missing.length === 0;
}
