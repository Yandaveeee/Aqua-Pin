import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { 
  View, 
  StyleSheet, 
  ActivityIndicator as RNActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../contexts/AuthContext';
import { useAppearance } from '../contexts/AppearanceContext';
import LoginScreen from '../screens/LoginScreen';
import MapScreen from '../screens/MapScreen';
import PondsScreen from '../screens/PondsScreen';
import DataEntryScreen from '../screens/DataEntryScreen';
import SyncScreen from '../screens/SyncScreen';
import ReportScreen from '../screens/ReportScreen';
import ProfileScreen from '../screens/ProfileScreen';
import PondAlertNotifications from '../components/PondAlertNotifications';

// Enhanced tab icon component
const TabIcon = ({
  name,
  focused,
  color,
  isDarkMode,
}: {
  name: string;
  focused: boolean;
  color: string;
  isDarkMode: boolean;
}) => {
  const icons: Record<string, { outline: any; filled: any }> = {
    Map: { outline: 'map-outline', filled: 'map' },
    Ponds: { outline: 'water-outline', filled: 'water' },
    Data: { outline: 'create-outline', filled: 'create' },
    Reports: { outline: 'bar-chart-outline', filled: 'bar-chart' },
    Sync: { outline: 'sync-outline', filled: 'sync' },
    Profile: { outline: 'person-outline', filled: 'person' },
  };

  const iconName = focused ? icons[name].filled : icons[name].outline;

  return (
    <View
      style={[
        styles.tabIconContainer,
        focused && (isDarkMode ? styles.tabIconContainerActiveDark : styles.tabIconContainerActive),
      ]}
    >
      <Ionicons 
        name={iconName} 
        size={22} 
        color={color}
      />
    </View>
  );
};

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Main tab navigator for authenticated users
function MainTabs() {
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useAppearance();

  const tabBarBackground = isDarkMode ? '#0a1323' : '#fff';
  const tabBarBorder = isDarkMode ? '#1f304a' : '#e1e4e8';
  const tabActive = isDarkMode ? '#38bdf8' : '#007bff';
  const tabInactive = isDarkMode ? '#8fa5c2' : '#666';

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => (
          <TabIcon name={route.name} focused={focused} color={String(color)} isDarkMode={isDarkMode} />
        ),
        tabBarActiveTintColor: tabActive,
        tabBarInactiveTintColor: tabInactive,
        tabBarLabelStyle: styles.tabLabel,
        headerShown: false,
        tabBarShowLabel: true,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: tabBarBackground,
          borderTopWidth: 1,
          borderTopColor: tabBarBorder,
          height: 64 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom,
          elevation: 0,
          shadowOpacity: 0,
        },
      })}
    >
      <Tab.Screen 
        name="Map" 
        component={MapScreen}
        options={{ tabBarLabel: 'Map' }}
      />
      <Tab.Screen 
        name="Data" 
        component={DataEntryScreen}
        options={{ tabBarLabel: 'Data' }}
      />
      <Tab.Screen
        name="Ponds"
        component={PondsScreen}
        options={{ tabBarLabel: 'Ponds' }}
      />
      <Tab.Screen 
        name="Reports" 
        component={ReportScreen}
        options={{ tabBarLabel: 'Ai Assistant' }}
      />
      <Tab.Screen 
        name="Sync" 
        component={SyncScreen}
        options={{ tabBarLabel: 'Sync' }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

// Enhanced loading screen
function LoadingScreen({ isDarkMode }: { isDarkMode: boolean }) {
  const loadingBackground = isDarkMode ? '#081120' : '#f8f9fa';
  const loadingBubble = isDarkMode ? 'rgba(14, 165, 233, 0.14)' : '#e3f2fd';
  const spinnerColor = isDarkMode ? '#38bdf8' : '#007bff';

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
      primary: '#0284c7',
      background: '#f5fbff',
      card: '#ffffff',
      text: '#102132',
      border: '#d9e8f1',
      notification: '#ef4444',
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
          primary: '#0ea5e9',
          background: '#f4f6f8',
          card: '#ffffff',
          text: '#111827',
          border: '#e5e7eb',
          notification: '#ef4444',
        },
      };
  const navigationTheme = user ? appTheme : authFlowTheme;

  if (isInitializing) {
    return <LoadingScreen isDarkMode={!!user && isDarkMode} />;
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      {user ? <PondAlertNotifications /> : null}
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 4,
  },
  tabIconContainer: {
    width: 40,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  tabIconContainerActive: {
    backgroundColor: 'rgba(0, 123, 255, 0.1)',
  },
  tabIconContainerActiveDark: {
    backgroundColor: 'rgba(56, 189, 248, 0.18)',
  },
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
