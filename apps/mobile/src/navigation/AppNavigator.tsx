import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, StyleSheet, ActivityIndicator as RNActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../contexts/AuthContext';
import { useAppearance } from '../contexts/AppearanceContext';
import LoginScreen from '../screens/LoginScreen';
import MapScreen from '../screens/MapScreen';
import PondsScreen from '../screens/PondsScreen';
import DataEntryScreen from '../screens/DataEntryScreen';
import SyncScreen from '../screens/SyncScreen';
import ReportScreen from '../screens/ReportScreen';
import AquapinTabBar from '../components/navigation/AquapinTabBar';
import DashboardScreen from '../screens/overview/DashboardScreen';
import PondManagementScreen from '../screens/overview/PondManagementScreen';
import RecordsOverviewScreen from '../screens/overview/RecordsOverviewScreen';
import ProfileOverviewScreen from '../screens/overview/ProfileOverviewScreen';
import { aquapinColors } from '../theme/aquapin';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Main tab navigator for authenticated users
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AquapinTabBar {...props} />}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Ponds" component={PondManagementScreen} />
      <Tab.Screen name="Records" component={RecordsOverviewScreen} />
      <Tab.Screen name="Profile" component={ProfileOverviewScreen} />
    </Tab.Navigator>
  );
}

// Enhanced loading screen
function LoadingScreen({ isDarkMode }: { isDarkMode: boolean }) {
  const loadingBackground = isDarkMode ? '#081120' : aquapinColors.background;
  const loadingBubble = isDarkMode ? 'rgba(14, 165, 233, 0.14)' : aquapinColors.blueSoft;
  const spinnerColor = isDarkMode ? '#38bdf8' : aquapinColors.blue;

  return (
    <SafeAreaView
      style={[styles.loadingContainer, { backgroundColor: loadingBackground }]}
      edges={['top', 'left', 'right', 'bottom']}
    >
      <View style={styles.loadingContent}>
        <View style={[styles.loadingIcon, { backgroundColor: loadingBubble }]}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.loadingImage}
            resizeMode="contain"
          />
        </View>
        <RNActivityIndicator size="small" color={spinnerColor} style={{ marginTop: 16 }} />
      </View>
    </SafeAreaView>
  );
}

// Root navigator with auth check
export default function AppNavigator() {
  const { user, isInitializing } = useAuth();
  const { isDarkMode } = useAppearance();
  const authFlowTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: aquapinColors.blue,
      background: aquapinColors.background,
      card: aquapinColors.surface,
      text: aquapinColors.text,
      border: aquapinColors.border,
      notification: aquapinColors.red,
    },
  };

  const appTheme = isDarkMode
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          primary: '#38bdf8',
          background: '#081120',
          card: '#0d1a2d',
          text: '#e2e8f0',
          border: '#1f304a',
          notification: '#ef4444',
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          primary: aquapinColors.blue,
          background: aquapinColors.background,
          card: aquapinColors.surface,
          text: aquapinColors.text,
          border: aquapinColors.border,
          notification: aquapinColors.red,
        },
      };
  const navigationTheme = user ? appTheme : authFlowTheme;

  if (isInitializing) {
    return <LoadingScreen isDarkMode={!!user && isDarkMode} />;
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="PondWorkspace" component={PondManagementScreen} />
            <Stack.Screen name="PondMap" component={MapScreen} />
            <Stack.Screen name="RecordsWorkspace" component={DataEntryScreen} />
            <Stack.Screen name="SyncStatus" component={SyncScreen} />
            <Stack.Screen name="AiAssistant" component={ReportScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    alignItems: 'center',
  },
  loadingIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingImage: {
    width: 48,
    height: 48,
    borderRadius: 10,
  },
});
