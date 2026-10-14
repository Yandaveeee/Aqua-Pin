import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppearanceMode = 'light' | 'dark';

const APP_APPEARANCE_KEY = '@aquapin_app_appearance';

type AppearanceContextType = {
  appearanceMode: AppearanceMode;
  isDarkMode: boolean;
  isLoaded: boolean;
  setAppearanceMode: (mode: AppearanceMode, persist?: boolean) => Promise<void>;
};

const AppearanceContext = createContext<AppearanceContextType | undefined>(undefined);

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [appearanceMode, setAppearanceModeState] = useState<AppearanceMode>('light');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadAppearance = async () => {
      try {
        const storedMode = await AsyncStorage.getItem(APP_APPEARANCE_KEY);
        if (!mounted) return;

        if (storedMode === 'light' || storedMode === 'dark') {
          setAppearanceModeState(storedMode);
        }
      } catch (error) {
        console.warn('Unable to restore appearance', error);
      } finally {
        if (mounted) {
          setIsLoaded(true);
        }
      }
    };

    loadAppearance();

    return () => {
      mounted = false;
    };
  }, []);

  const setAppearanceMode = useCallback(async (mode: AppearanceMode, persist = true) => {
    if (persist) await AsyncStorage.setItem(APP_APPEARANCE_KEY, mode);
    setAppearanceModeState(mode);
  }, []);

  const value = useMemo<AppearanceContextType>(() => ({
    appearanceMode,
    isDarkMode: appearanceMode === 'dark',
    isLoaded,
    setAppearanceMode,
  }), [appearanceMode, isLoaded, setAppearanceMode]);

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextType {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error('useAppearance must be used within an AppearanceProvider');
  }

  return context;
}
