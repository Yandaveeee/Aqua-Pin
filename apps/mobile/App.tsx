import AppErrorBoundary from './src/components/AppErrorBoundary';
import { LanguageProvider } from './src/contexts/LanguageContext';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Image } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { AppearanceProvider, useAppearance } from './src/contexts/AppearanceContext';
import { RealtimeSyncBridge } from './src/components/RealtimeSyncBridge';
import { SyncProvider } from './src/hooks/useOfflineData';
import AppNavigator from './src/navigation/AppNavigator';

// Splash screen component shown during auth initialization
function SplashScreen() {
  const { isDarkMode } = useAppearance();

  return (
    <View style={[styles.splashContainer, { backgroundColor: isDarkMode ? '#081120' : '#f8f9fa' }]}>
      <View style={styles.splashContent}>
        <View style={[styles.iconCircle, { backgroundColor: isDarkMode ? 'rgba(14, 165, 233, 0.14)' : '#e3f2fd' }]}>
          <Image
            source={require('./assets/icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <Text style={[styles.title, { color: isDarkMode ? '#f8fafc' : '#1a1a1a' }]}>AquaPin</Text>
        <Text style={[styles.subtitle, { color: isDarkMode ? '#94a3b8' : '#666' }]}>Field Operations</Text>
        <ActivityIndicator 
          color={isDarkMode ? '#38bdf8' : '#007bff'}
          size="large" 
          style={styles.loader}
        />
      </View>
    </View>
  );
}

// Root component that handles auth state
function Root() {
  const { isInitializing } = useAuth();

  if (isInitializing) {
    return <SplashScreen />;
  }

  return <AppNavigator />;
}

function AppFrame() {
  const { user } = useAuth();
  const { isDarkMode } = useAppearance();

  return (
    <SyncProvider key={user?.id || 'signed-out'} enabled={!!user}>
      <RealtimeSyncBridge />
      <AppErrorBoundary><Root /></AppErrorBoundary>
      <StatusBar style={user && isDarkMode ? 'light' : 'dark'} />
    </SyncProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppearanceProvider>
        <AuthProvider>
          <LanguageProvider><AppFrame /></LanguageProvider>
        </AuthProvider>
      </AppearanceProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashContent: {
    alignItems: 'center',
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    width: 54,
    height: 54,
    borderRadius: 12,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#1a1a1a',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  loader: {
    marginTop: 32,
  },
});
