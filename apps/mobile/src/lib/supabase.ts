import { fetchWithTimeout } from './network';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { CONFIG, getMissingConfigVars } from '../config';

const FALLBACK_URL = 'https://placeholder.supabase.co';
const FALLBACK_ANON_KEY = 'placeholder-key';

const supabaseUrl = CONFIG.supabase.url || FALLBACK_URL;
const supabaseAnonKey = CONFIG.supabase.anonKey || FALLBACK_ANON_KEY;
const supabaseHost = new URL(supabaseUrl).hostname;

export const SUPABASE_AUTH_STORAGE_KEY = `sb-${supabaseHost.split('.')[0]}-auth-token`;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithTimeout },
  auth: {
    storage: AsyncStorage,
    storageKey: SUPABASE_AUTH_STORAGE_KEY,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export function isSupabaseConfigured(): boolean {
  return getMissingConfigVars().length === 0;
}

export function getSupabaseConfigError(): string | null {
  const missing = getMissingConfigVars();
  if (missing.length === 0) {
    return null;
  }

  return `Missing configuration: ${missing.join(', ')}. Restart Expo after updating your .env file.`;
}
