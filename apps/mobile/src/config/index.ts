const DEFAULT_SUPABASE_URL = 'https://povferhanayvnzedxajp.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvdmZlcmhhbmF5dm56ZWR4YWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4ODY1MDgsImV4cCI6MjA4ODQ2MjUwOH0.jdjOi6FElHDK8qQGj89IZ7zLP0dSuG0R4CWeRBFyrOQ';
const DEFAULT_MAPS_API_KEY = 'AIzaSyA1c1Gw2fRPp_bHw2_y_477IpVPzrCOqvg';

const SUPABASE_URL = (
  process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL
).trim();
const SUPABASE_ANON_KEY = (
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY
).trim();
const MAPS_API_KEY = (
  process.env.EXPO_PUBLIC_MAPS_API_KEY || DEFAULT_MAPS_API_KEY
).trim();
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
