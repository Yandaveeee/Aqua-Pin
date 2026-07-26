import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import { supabase, isSupabaseConfigured, getSupabaseConfigError, SUPABASE_AUTH_STORAGE_KEY } from '../lib/supabase';
import { clearLocalDatabase, LOCAL_DB_STORAGE_PREFIX } from '../db';
import { clearSyncRuntimeState, getSyncQueueSnapshot, SYNC_LAST_PULL_AT_KEY, SYNC_LAST_PUSH_AT_KEY } from '../db/syncQueue';
import { CONFIG } from '../config';

type AuthFailure = {
  message: string;
  isRateLimit?: boolean;
  retryAfterSeconds?: number;
};

const SUPABASE_AUTH_USER_STORAGE_KEY = `${SUPABASE_AUTH_STORAGE_KEY}-user`;
const AUTH_LAST_ACTIVE_USER_STORAGE_KEY = '@aquapin_auth_last_user_id';

const parseAuthCallbackUrl = (url: string): {
  accessToken?: string;
  refreshToken?: string;
  code?: string;
} | null => {
  if (!url || !url.includes('auth/callback')) {
    return null;
  }

  const params = new Map<string, string>();
  const [, queryAndHash = ''] = url.split('?');
  const query = queryAndHash.split('#')[0] || '';
  const hash = url.includes('#') ? url.split('#')[1] || '' : '';

  for (const part of [query, hash]) {
    if (!part) continue;

    for (const pair of part.split('&')) {
      if (!pair) continue;
      const [rawKey, rawValue = ''] = pair.split('=');
      if (!rawKey) continue;

      try {
        params.set(decodeURIComponent(rawKey), decodeURIComponent(rawValue.replace(/\+/g, ' ')));
      } catch (_error) {
        params.set(rawKey, rawValue);
      }
    }
  }

  return {
    accessToken: params.get('access_token') || undefined,
    refreshToken: params.get('refresh_token') || undefined,
    code: params.get('code') || undefined,
  };
};

const parseStoredValue = <T,>(raw: string | null): T | null => {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch (_error) {
    return null;
  }
};

const readStoredSession = async (): Promise<Session | null> => {
  try {
    const [rawSession, rawUser] = await Promise.all([
      AsyncStorage.getItem(SUPABASE_AUTH_STORAGE_KEY),
      AsyncStorage.getItem(SUPABASE_AUTH_USER_STORAGE_KEY),
    ]);

    const parsedSession = parseStoredValue<Session>(rawSession);
    const parsedUser = parseStoredValue<User>(rawUser);

    if (!parsedSession) return null;

    const hydratedUser = parsedUser || parsedSession.user;
    if (!hydratedUser?.id) {
      return null;
    }

    return {
      ...parsedSession,
      user: hydratedUser,
    };
  } catch (_error) {
    return null;
  }
};

const isInvalidRefreshTokenError = (error: unknown): boolean => {
  const message = typeof (error as any)?.message === 'string' ? String((error as any).message).toLowerCase() : '';
  const code = typeof (error as any)?.code === 'string' ? String((error as any).code).toLowerCase() : '';

  return (
    message.includes('invalid refresh token') ||
    message.includes('refresh token not found') ||
    code === 'invalid_refresh_token' ||
    code === 'refresh_token_not_found'
  );
};

const parseRetryAfterSeconds = (text: string): number | undefined => {
  const secondsMatch = text.match(/(\d+)\s*(second|seconds|sec|secs)\b/i);
  if (secondsMatch) {
    return Number(secondsMatch[1]);
  }

  const minutesMatch = text.match(/(\d+)\s*(minute|minutes|min|mins)\b/i);
  if (minutesMatch) {
    return Number(minutesMatch[1]) * 60;
  }

  return undefined;
};

const waitForUiToSettle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 50));
};

// Error message mapper for user-friendly error messages
const getErrorDetails = (error: AuthError): AuthFailure => {
  const errorMessages: Record<string, string> = {
    'Invalid login credentials': 'Invalid email or password. Please try again.',
    'Email not confirmed':
      'Your account exists, but email confirmation is still enabled in Supabase. Verify the email first, or disable Confirm email in Supabase Auth settings if sign-in should work immediately.',
    'User already registered': 'An account with this email already exists.',
    'Password should be at least 6 characters': 'Password must be at least 6 characters long.',
    'Unable to validate email address: invalid format': 'Please enter a valid email address.',
    'Signup requires a valid password': 'Please enter a valid password.',
    'User not found': 'No account found with this email address.',
    'JWT expired': 'Your session has expired. Please sign in again.',
    'Invalid Refresh Token: Refresh Token Not Found': 'Your session has expired. Please sign in again.',
    'Rate limit exceeded': 'Too many attempts. Please try again later.',
    'Invalid API key': 'App configuration error: invalid API key. Restart Expo and verify EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  };

  const rawMessage = error.message || 'An unexpected error occurred. Please try again.';
  const normalizedMessage = rawMessage.toLowerCase();
  const errorCode = typeof (error as any).code === 'string' ? String((error as any).code).toLowerCase() : '';
  const statusCode = typeof (error as any).status === 'number' ? Number((error as any).status) : undefined;
  const retryAfterSeconds = parseRetryAfterSeconds(rawMessage);
  const isRateLimit =
    statusCode === 429 ||
    normalizedMessage.includes('rate limit') ||
    normalizedMessage.includes('too many requests') ||
    normalizedMessage.includes('too many attempts') ||
    errorCode === 'over_email_send_rate_limit' ||
    errorCode === 'over_request_rate_limit';

  if (isRateLimit) {
    return {
      message: retryAfterSeconds
        ? `Too many attempts. Please wait ${retryAfterSeconds} seconds before trying again.`
        : 'Too many attempts. Please wait about a minute before trying again.',
      isRateLimit: true,
      retryAfterSeconds: retryAfterSeconds || 60,
    };
  }

  return {
    message: errorMessages[rawMessage] || rawMessage,
  };
};

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isInitializing: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthFailure | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: AuthFailure | null; user: User | null; signedIn: boolean }>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const authTransitionIdRef = useRef(0);

  const clearExpiredSession = useCallback(async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (_error) {
      // Local cleanup is best-effort. State reset below is the critical path.
    }

    setSession(null);
    setUser(null);
  }, []);

  const hasLegacyStandaloneState = useCallback(async (): Promise<boolean> => {
    try {
      const [keys, snapshot] = await Promise.all([
        AsyncStorage.getAllKeys(),
        getSyncQueueSnapshot(1),
      ]);

      if (snapshot.pending > 0) {
        return false;
      }

      return keys.some(
        (key) =>
          key.startsWith(LOCAL_DB_STORAGE_PREFIX) ||
          key.startsWith('@aquapin_sync:') ||
          key === SYNC_LAST_PULL_AT_KEY ||
          key === SYNC_LAST_PUSH_AT_KEY
      );
    } catch (_error) {
      return false;
    }
  }, []);

  const resetStandaloneDataForUserChange = useCallback(async () => {
    await clearSyncRuntimeState();
    try {
      await clearLocalDatabase();
    } catch (error) {
      console.warn('Standalone database reset failed on first attempt, retrying once.', error);
      await waitForUiToSettle();
      await clearLocalDatabase();
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const applySessionState = (nextSession: Session | null) => {
      if (!isMounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    };

    const finishInitialization = () => {
      if (!isMounted) return;
      setIsInitializing(false);
    };

    const resolveAuthState = async (
      nextSession: Session | null,
      options: {
        allowLegacyReset: boolean;
      }
    ) => {
      const requestId = ++authTransitionIdRef.current;
      const nextUserId = nextSession?.user?.id ?? null;

      try {
        const storedUserId = (await AsyncStorage.getItem(AUTH_LAST_ACTIVE_USER_STORAGE_KEY))?.trim() || null;
        let shouldResetLocalState = Boolean(storedUserId && nextUserId && storedUserId !== nextUserId);

        if (!shouldResetLocalState && options.allowLegacyReset && nextUserId && !storedUserId) {
          shouldResetLocalState = await hasLegacyStandaloneState();
        }

        if (shouldResetLocalState) {
          if (!isMounted || requestId !== authTransitionIdRef.current) return;
          setIsInitializing(true);
          applySessionState(null);
          await waitForUiToSettle();
          await resetStandaloneDataForUserChange();
        }

        if (!isMounted || requestId !== authTransitionIdRef.current) return;

        applySessionState(nextSession);

        if (nextUserId) {
          await AsyncStorage.setItem(AUTH_LAST_ACTIVE_USER_STORAGE_KEY, nextUserId);
        }

        finishInitialization();
      } catch (error) {
        if (!isMounted || requestId !== authTransitionIdRef.current) return;
        console.error('Failed to reconcile auth state:', error);
        applySessionState(nextSession);
        finishInitialization();
      }
    };

    const configError = getSupabaseConfigError();
    if (configError) {
      console.error(configError);
      applySessionState(null);
      finishInitialization();
      return;
    }

    const bootstrapAuth = async () => {
      const cachedSession = await readStoredSession();
      if (cachedSession) {
        await resolveAuthState(cachedSession, { allowLegacyReset: false });
      } else {
        finishInitialization();
      }

      try {
        const { data: { session: liveSession }, error } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (error) {
          if (isInvalidRefreshTokenError(error)) {
            console.warn('Expired auth session detected during startup. Clearing local session.');
            await clearExpiredSession();
            return;
          }

          console.warn('Using cached auth session during startup because live session lookup failed:', error);
          return;
        }

        await resolveAuthState(liveSession, { allowLegacyReset: true });
      } catch (error) {
        if (!isMounted) return;

        if (isInvalidRefreshTokenError(error)) {
          console.warn('Expired auth session detected during startup. Clearing local session.');
          await clearExpiredSession();
          return;
        }

        console.warn('Using cached auth session during startup because live session lookup threw:', error);
      }
    };

    void bootstrapAuth();

    const handleAuthCallbackUrl = async (url: string | null) => {
      if (!url || !isMounted) return;

      const authParams = parseAuthCallbackUrl(url);
      if (!authParams) return;

      try {
        if (authParams.accessToken && authParams.refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: authParams.accessToken,
            refresh_token: authParams.refreshToken,
          });

          if (error) {
            console.warn('Failed to apply auth callback session:', error);
            return;
          }

          await resolveAuthState(data.session, { allowLegacyReset: true });
          if (data.session) {
            const { error: activityError } = await supabase.rpc('record_staff_session');
            if (activityError) {
              console.warn('Failed to record verified staff login activity:', activityError.message);
            }
          }
          return;
        }

        if (authParams.code && typeof supabase.auth.exchangeCodeForSession === 'function') {
          const { data, error } = await supabase.auth.exchangeCodeForSession(authParams.code);

          if (error) {
            console.warn('Failed to exchange auth callback code:', error);
            return;
          }

          await resolveAuthState(data.session, { allowLegacyReset: true });
          if (data.session) {
            const { error: activityError } = await supabase.rpc('record_staff_session');
            if (activityError) {
              console.warn('Failed to record verified staff login activity:', activityError.message);
            }
          }
        }
      } catch (error) {
        console.warn('Failed to handle auth callback URL:', error);
      }
    };

    void Linking.getInitialURL().then(handleAuthCallbackUrl);

    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthCallbackUrl(url);
    });

    // Listen for auth state changes.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: any, session: any) => {
      if (!isMounted) return;

      if (event === 'SIGNED_OUT' || !session) {
        setSession(null);
        setUser(null);
        setIsInitializing(false);
        return;
      }

      void resolveAuthState(session, { allowLegacyReset: true });
    });

    return () => {
      isMounted = false;
      linkingSubscription.remove();
      subscription.unsubscribe();
    };
  }, [clearExpiredSession, hasLegacyStandaloneState, resetStandaloneDataForUserChange]);

  const signIn = useCallback(async (email: string, password: string): Promise<{ error: AuthFailure | null }> => {
    if (!isSupabaseConfigured()) {
      return {
        error: {
          message: getSupabaseConfigError() || 'Supabase is not configured.',
        },
      };
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        return { error: getErrorDetails(error) };
      }

      if (data.session) {
        const { error: activityError } = await supabase.rpc('record_staff_session');
        if (activityError) {
          console.warn('Failed to record staff login activity:', activityError.message);
        }
      }

      return { error: null };
    } catch (err) {
      console.error('Sign in error:', err);
      return { error: { message: 'An unexpected error occurred. Please try again.' } };
    } finally {
      setLoading(false);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string): Promise<{ error: AuthFailure | null; user: User | null; signedIn: boolean }> => {
    if (!isSupabaseConfigured()) {
      return {
        error: {
          message: getSupabaseConfigError() || 'Supabase is not configured.',
        },
        user: null,
        signedIn: false,
      };
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          emailRedirectTo: CONFIG.auth.emailRedirectUrl,
          data: {
            full_name: fullName.trim().replace(/\s+/g, ' '),
            role: 'field_staff',
            status: 'approved',
          },
        },
      });

      if (error) {
        return { error: getErrorDetails(error), user: null, signedIn: false };
      }

      if (data.session) {
        const { error: activityError } = await supabase.rpc('record_staff_session');
        if (activityError) {
          console.warn('Failed to record initial staff login activity:', activityError.message);
        }
      }

      // public_profiles is created by the auth.users trigger. Client inserts are blocked by RLS.

      return { error: null, user: data.user, signedIn: Boolean(data.session) };
    } catch (err) {
      console.error('Sign up error:', err);
      return { error: { message: 'An unexpected error occurred. Please try again.' }, user: null, signedIn: false };
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      if (!isInvalidRefreshTokenError(err)) {
        console.error('Sign out error:', err);
      }
    } finally {
      await clearExpiredSession();
      setLoading(false);
    }
  }, [clearExpiredSession]);

  const refreshSession = useCallback(async (): Promise<void> => {
    if (!isSupabaseConfigured()) {
      return;
    }

    try {
      const { data: { session }, error } = await supabase.auth.refreshSession();
      if (error) {
        if (isInvalidRefreshTokenError(error)) {
          console.warn('Refresh token is no longer valid. Clearing local session.');
          await clearExpiredSession();
          return;
        }

        console.error('Error refreshing session:', error);
      } else {
        setSession(session);
        setUser(session?.user ?? null);
      }
    } catch (err) {
      if (isInvalidRefreshTokenError(err)) {
        console.warn('Refresh token is no longer valid. Clearing local session.');
        await clearExpiredSession();
        return;
      }

      console.error('Refresh session error:', err);
    }
  }, [clearExpiredSession]);

  const value: AuthContextType = {
    user,
    session,
    loading,
    isInitializing,
    signIn,
    signUp,
    signOut,
    refreshSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
