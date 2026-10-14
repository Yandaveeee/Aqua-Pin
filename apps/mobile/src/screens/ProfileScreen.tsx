import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Modal,
  TextInput,
  Switch,
  Linking,
  ActivityIndicator,
  FlatList,
  Share,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../contexts/AuthContext';
import { useAppearance } from '../contexts/AppearanceContext';
import { usePonds, useSync } from '../hooks/useOfflineData';
import { supabase } from '../lib/supabase';
import { clearLocalDatabase } from '../db';
import {
  buildOperationsReport,
  renderOperationsReportCsv,
  renderOperationsReportHtml,
  renderOperationsReportText,
  ReportRange,
} from '../lib/reporting';

type Language = 'en' | 'fil';
type WeightUnit = 'kg' | 'g';
type FishCountFormat = 'full' | 'compact';
type ReportAction = 'csv' | 'pdf';

interface NotificationSettings {
  harvestReminders: boolean;
  mortalityAlerts: boolean;
  syncNotifications: boolean;
  weeklyReports: boolean;
}

interface PondAlertSettings {
  mortalitySpike: boolean;
  harvestDue: boolean;
  inactivity: boolean;
}

interface SecuritySettings {
  biometricLogin: boolean;
  pinProtection: boolean;
}

interface PreferenceSettings {
  language: Language;
  weightUnit: WeightUnit;
  fishCountFormat: FishCountFormat;
}

const PROFILE_NOTIFICATION_KEY = '@aquapin_profile_notifications';
const PROFILE_POND_ALERTS_KEY = '@aquapin_profile_pond_alerts';
const PROFILE_SECURITY_KEY = '@aquapin_profile_security';
const PROFILE_PIN_KEY = '@aquapin_profile_pin';
const PROFILE_PREFS_KEY = '@aquapin_profile_preferences';
const PROFILE_LOGS_KEY = '@aquapin_profile_logs';
const PROFILE_BACKUP_KEY = '@aquapin_profile_backup_latest';

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  harvestReminders: true,
  mortalityAlerts: true,
  syncNotifications: true,
  weeklyReports: false,
};

const DEFAULT_POND_ALERTS: PondAlertSettings = {
  mortalitySpike: true,
  harvestDue: true,
  inactivity: true,
};

const DEFAULT_SECURITY: SecuritySettings = {
  biometricLogin: false,
  pinProtection: false,
};

const DEFAULT_PREFERENCES: PreferenceSettings = {
  language: 'en',
  weightUnit: 'kg',
  fishCountFormat: 'full',
};

const PROFILE_COPY = {
  en: {
    unknownUser: 'Unknown user',
    fieldStaff: 'Field Staff',
    english: 'English',
    tagalog: 'Tagalog',
    syncStatus: 'SYNC STATUS',
    online: 'Online',
    offline: 'Offline',
    syncNow: 'Sync Now',
    pendingEntries: 'Unresolved Items',
    lastSyncTime: 'Last Sync Time',
    farmSnapshot: 'FARM SNAPSHOT',
    totalPonds: 'Total Ponds',
    active: 'Active',
    inactive: 'Inactive',
    speciesCount: 'Species Count',
    account: 'ACCOUNT',
    notificationSettings: 'Notification Settings',
    securityPassword: 'Security & Password',
    languageUnits: 'Language, Appearance & Units',
    dataTools: 'DATA TOOLS',
    exportCsv: 'Export CSV',
    exportPdfSummary: 'Export PDF Summary',
    shareReport: 'Share Report',
    reportRangeTitle: 'Choose Report Range',
    reportRangePrompt: 'Select the coverage period for the operations report.',
    today: 'Today',
    last7Days: 'Last 7 Days',
    last30Days: 'Last 30 Days',
    allTime: 'All Time',
    processingReport: 'Preparing report...',
    createBackup: 'Create Backup',
    restoreBackup: 'Restore Backup',
    helpCenter: 'HELP CENTER',
    searchFaqReportIssue: 'Search FAQ & Report Issue',
    accountActions: 'ACCOUNT ACTIONS',
    deactivateAccount: 'Deactivate Account',
    deleteAccount: 'Delete Account',
    signOut: 'Sign Out',
    processingAccountAction: 'Processing account action...',
    notificationSettingsTitle: 'Notification Settings',
    harvestReminders: 'Harvest Reminders',
    harvestRemindersDesc: 'Notify when cycle is likely harvest-ready.',
    mortalityAlerts: 'Mortality Alerts',
    mortalityAlertsDesc: 'Highlight unusual mortality increases.',
    syncNotifications: 'Sync Notifications',
    syncNotificationsDesc: 'Inform after sync success/failure.',
    weeklyReports: 'Weekly Reports',
    weeklyReportsDesc: 'Receive weekly operations summary.',
    configurePerPondAlerts: 'Configure Per-Pond Alerts',
    perPondAlertRules: 'Per-Pond Alert Rules',
    mortalitySpike: 'Mortality spike',
    harvestDue: 'Harvest due',
    inactivity: 'No activity / inactivity',
    noPondsForAlerts: 'No ponds available for alert configuration.',
    security: 'Security',
    biometricLogin: 'Biometric Login',
    biometricLoginDesc: 'Use face or fingerprint authentication when available.',
    pinLock: 'PIN Lock',
    pinLockDesc: 'Require 4-6 digit PIN before opening profile tools.',
    lockNow: 'Lock Now',
    updatePassword: 'Update Password',
    currentPassword: 'Current Password',
    newPassword: 'New Password',
    confirmNewPassword: 'Confirm New Password',
    setPinLock: 'Set PIN Lock',
    enterPin: 'Enter 4-6 digit PIN',
    confirmPin: 'Confirm PIN',
    cancel: 'Cancel',
    savePin: 'Save PIN',
    languageAndUnits: 'Language, Appearance & Units',
    appearance: 'Appearance',
    language: 'Language',
    lightMode: 'Light Mode',
    darkMode: 'Dark Mode',
    weightUnit: 'Weight Unit',
    kilogram: 'Kilogram (kg)',
    gram: 'Gram (g)',
    fishCountFormat: 'Fish Count Format',
    fullNumber: 'Full Number',
    compact: 'Compact',
    helpCenterTitle: 'Help Center',
    searchFaqs: 'Search FAQs',
    reportIssue: 'Report Issue',
    reportIssuePlaceholder: 'Describe the issue you encountered',
    reportWithLogs: 'Report with Device Info & Logs',
    recentLogs: 'Recent Logs',
    noRecentLogs: 'No recent logs',
    profileLocked: 'Profile Locked',
    enterPinToContinue: 'Enter your PIN to continue',
    pin: 'PIN',
    unlockWithPin: 'Unlock with PIN',
    unlockWithBiometrics: 'Unlock with Biometrics',
    version: 'Version 1.0.0',
  },
  fil: {
    unknownUser: 'Hindi kilalang user',
    fieldStaff: 'Field Staff',
    english: 'English',
    tagalog: 'Tagalog',
    syncStatus: 'KALAGAYAN NG SYNC',
    online: 'Online',
    offline: 'Offline',
    syncNow: 'Mag-sync Ngayon',
    pendingEntries: 'Nakahilerang Entry',
    lastSyncTime: 'Huling Oras ng Sync',
    farmSnapshot: 'BUOD NG FARM',
    totalPonds: 'Kabuuang Pond',
    active: 'Aktibo',
    inactive: 'Hindi Aktibo',
    speciesCount: 'Dami ng Species',
    account: 'ACCOUNT',
    notificationSettings: 'Mga Setting ng Notification',
    securityPassword: 'Seguridad at Password',
    languageUnits: 'Wika, Tema at Units',
    dataTools: 'MGA DATA TOOL',
    exportCsv: 'I-export ang CSV',
    exportPdfSummary: 'I-export ang Buod na PDF',
    shareReport: 'Ibahagi ang Report',
    reportRangeTitle: 'Piliin ang Saklaw ng Report',
    reportRangePrompt: 'Piliin ang saklaw ng panahon para sa operations report.',
    today: 'Ngayong Araw',
    last7Days: 'Huling 7 Araw',
    last30Days: 'Huling 30 Araw',
    allTime: 'Lahat ng Panahon',
    processingReport: 'Inihahanda ang report...',
    createBackup: 'Gumawa ng Backup',
    restoreBackup: 'Ibalik ang Backup',
    helpCenter: 'TULONG',
    searchFaqReportIssue: 'Maghanap sa FAQ at Mag-report ng Isyu',
    accountActions: 'MGA AKSYON SA ACCOUNT',
    deactivateAccount: 'I-deactivate ang Account',
    deleteAccount: 'Tanggalin ang Account',
    signOut: 'Mag-sign Out',
    processingAccountAction: 'Pinoproseso ang aksyon sa account...',
    notificationSettingsTitle: 'Mga Setting ng Notification',
    harvestReminders: 'Paalala sa Harvest',
    harvestRemindersDesc: 'Mag-abiso kapag malapit nang ma-harvest ang cycle.',
    mortalityAlerts: 'Alerto sa Mortality',
    mortalityAlertsDesc: 'I-highlight ang kakaibang pagtaas ng mortality.',
    syncNotifications: 'Mga Notification sa Sync',
    syncNotificationsDesc: 'Magpaalam pagkatapos ng matagumpay o bigong sync.',
    weeklyReports: 'Lingguhang Report',
    weeklyReportsDesc: 'Tumanggap ng lingguhang buod ng operasyon.',
    configurePerPondAlerts: 'I-set ang Alert Kada Pond',
    perPondAlertRules: 'Mga Rule ng Alert Kada Pond',
    mortalitySpike: 'Pagtaas ng mortality',
    harvestDue: 'Nakatakdang harvest',
    inactivity: 'Walang aktibidad / hindi nagamit',
    noPondsForAlerts: 'Walang pond para sa pag-set ng alert.',
    security: 'Seguridad',
    biometricLogin: 'Biometric Login',
    biometricLoginDesc: 'Gamitin ang face o fingerprint kung available.',
    pinLock: 'PIN Lock',
    pinLockDesc: 'Mangailangan ng 4-6 digit na PIN bago buksan ang profile tools.',
    lockNow: 'I-lock Ngayon',
    updatePassword: 'I-update ang Password',
    currentPassword: 'Kasalukuyang Password',
    newPassword: 'Bagong Password',
    confirmNewPassword: 'Kumpirmahin ang Bagong Password',
    setPinLock: 'Mag-set ng PIN Lock',
    enterPin: 'Ilagay ang 4-6 digit na PIN',
    confirmPin: 'Kumpirmahin ang PIN',
    cancel: 'Kanselahin',
    savePin: 'I-save ang PIN',
    languageAndUnits: 'Wika, Tema at Units',
    appearance: 'Tema',
    language: 'Wika',
    lightMode: 'Light Mode',
    darkMode: 'Dark Mode',
    weightUnit: 'Unit ng Timbang',
    kilogram: 'Kilogram (kg)',
    gram: 'Gram (g)',
    fishCountFormat: 'Format ng Bilang ng Isda',
    fullNumber: 'Buong Numero',
    compact: 'Maikli',
    helpCenterTitle: 'Sentro ng Tulong',
    searchFaqs: 'Maghanap sa FAQ',
    reportIssue: 'Mag-report ng Isyu',
    reportIssuePlaceholder: 'Ilarawan ang problemang naranasan mo',
    reportWithLogs: 'Mag-report kasama ang Device Info at Logs',
    recentLogs: 'Mga Huling Log',
    noRecentLogs: 'Walang recent logs',
    profileLocked: 'Naka-lock ang Profile',
    enterPinToContinue: 'Ilagay ang iyong PIN para magpatuloy',
    pin: 'PIN',
    unlockWithPin: 'I-unlock gamit ang PIN',
    unlockWithBiometrics: 'I-unlock gamit ang Biometrics',
    version: 'Bersyon 1.0.0',
  },
} as const;

const FAQ_ITEMS = {
  en: [
    {
      id: 'faq-1',
      question: 'How do I create a pond?',
      answer: 'Go to Map tab, tap add, choose point or boundary, then save.',
    },
    {
      id: 'faq-2',
      question: 'How do I log stocking or mortality?',
      answer: 'Open Data tab, select pond and activity type, fill details, then save.',
    },
    {
      id: 'faq-3',
      question: 'How does offline sync work?',
      answer: 'Entries save locally first and auto-sync once connection is restored.',
    },
    {
      id: 'faq-4',
      question: 'How do smart alerts work?',
      answer: 'Alerts are generated from pond history trends and active stock conditions.',
    },
    {
      id: 'faq-5',
      question: 'Can I export reports?',
      answer: 'Use Export CSV/PDF in the Data Tools section.',
    },
  ],
  fil: [
    {
      id: 'faq-1',
      question: 'Paano gumawa ng pond?',
      answer: 'Pumunta sa Map tab, pindutin ang add, pumili ng point o boundary, pagkatapos ay i-save.',
    },
    {
      id: 'faq-2',
      question: 'Paano mag-log ng stocking o mortality?',
      answer: 'Buksan ang Data tab, piliin ang pond at uri ng aktibidad, ilagay ang detalye, pagkatapos ay i-save.',
    },
    {
      id: 'faq-3',
      question: 'Paano gumagana ang offline sync?',
      answer: 'Unang nase-save ang entries nang lokal at awtomatikong nagsi-sync kapag bumalik ang koneksyon.',
    },
    {
      id: 'faq-4',
      question: 'Paano gumagana ang smart alerts?',
      answer: 'Ginagawa ang alerts mula sa trend ng pond history at kasalukuyang stock condition.',
    },
    {
      id: 'faq-5',
      question: 'Pwede ba akong mag-export ng reports?',
      answer: 'Gamitin ang Export CSV/PDF sa seksyong Data Tools.',
    },
  ],
} as const;

function formatDateTime(value: Date | null): string {
  if (!value) return 'Never';
  return value.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCount(value: number, compact: boolean): string {
  return compact ? value.toLocaleString('en', { notation: 'compact' }) : value.toLocaleString();
}

function buildMailTo(subject: string, body: string): string {
  return `mailto:support@aquapin.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { appearanceMode, setAppearanceMode, isDarkMode } = useAppearance();
  const { ponds } = usePonds();
  const { lastSync, isOnline, pendingChanges } = useSync();

  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationSettings>(DEFAULT_NOTIFICATIONS);
  const [pondAlerts, setPondAlerts] = useState<Record<string, PondAlertSettings>>({});
  const [security, setSecurity] = useState<SecuritySettings>(DEFAULT_SECURITY);
  const [preferences, setPreferences] = useState<PreferenceSettings>(DEFAULT_PREFERENCES);
  const [recentLogs, setRecentLogs] = useState<string[]>([]);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [faqQuery, setFaqQuery] = useState('');

  const [pinCode, setPinCode] = useState<string | null>(null);
  const [pinSetupA, setPinSetupA] = useState('');
  const [pinSetupB, setPinSetupB] = useState('');
  const [pinUnlockInput, setPinUnlockInput] = useState('');
  const [isLocked, setIsLocked] = useState(false);

  const [hydrated, setHydrated] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [reportAction, setReportAction] = useState<ReportAction | null>(null);

  const t = PROFILE_COPY[preferences.language];
  const compactCount = preferences.fishCountFormat === 'compact';
  const pendingTotal = pendingChanges.ponds + pendingChanges.entries;
  const colors = useMemo(() => (
    isDarkMode
      ? {
          page: '#081120',
          surface: '#0d1a2d',
          surfaceMuted: '#0f1d31',
          border: '#1f304a',
          borderSoft: '#18263b',
          text: '#e2e8f0',
          textMuted: '#94a3b8',
          textSubtle: '#8fa5c2',
          accent: '#38bdf8',
          accentSoft: 'rgba(56, 189, 248, 0.16)',
          accentText: '#bae6fd',
          overlay: 'rgba(2, 6, 23, 0.78)',
          inputBackground: '#0a1525',
          warningBackground: '#312006',
          warningBorder: '#854d0e',
          warningText: '#fcd34d',
          dangerBackground: '#2c1111',
          dangerBorder: '#7f1d1d',
          dangerText: '#fca5a5',
          signOutBackground: '#2c1416',
          signOutBorder: '#7f1d1d',
          signOutText: '#fda4af',
          loadingBackground: '#082f49',
          loadingBorder: '#155e75',
          loadingText: '#bae6fd',
        }
      : {
          page: '#f8fafc',
          surface: '#ffffff',
          surfaceMuted: '#f8fafc',
          border: '#e2e8f0',
          borderSoft: '#f1f5f9',
          text: '#0f172a',
          textMuted: '#64748b',
          textSubtle: '#475569',
          accent: '#0284c7',
          accentSoft: '#e0f2fe',
          accentText: '#0369a1',
          overlay: 'rgba(15, 23, 42, 0.45)',
          inputBackground: '#f8fafc',
          warningBackground: '#fffbeb',
          warningBorder: '#fde68a',
          warningText: '#92400e',
          dangerBackground: '#fef2f2',
          dangerBorder: '#fecaca',
          dangerText: '#991b1b',
          signOutBackground: '#fee2e2',
          signOutBorder: '#fecaca',
          signOutText: '#dc2626',
          loadingBackground: '#ecfeff',
          loadingBorder: '#bae6fd',
          loadingText: '#0c4a6e',
        }
  ), [isDarkMode]);
  const appearanceLabel = appearanceMode === 'dark' ? t.darkMode : t.lightMode;
  const reportRangeOptions: Array<{ id: ReportRange; label: string }> = [
    { id: 'today', label: t.today },
    { id: '7d', label: t.last7Days },
    { id: '30d', label: t.last30Days },
    { id: 'all', label: t.allTime },
  ];
  const loadingBannerCopy = reportAction ? t.processingReport : t.processingAccountAction;

  const farmStats = useMemo(() => {
    const active = ponds.filter((pond: any) => pond.isActive).length;
    const inactive = ponds.length - active;
    const speciesSet = new Set(
      ponds
        .map((pond: any) => (pond.currentSpecies || '').trim())
        .filter((species: string) => species.length > 0)
    );

    return {
      total: ponds.length,
      active,
      inactive,
      speciesCount: speciesSet.size,
    };
  }, [ponds]);

  const filteredFaq = useMemo(() => {
    const faqItems = FAQ_ITEMS[preferences.language];
    const q = faqQuery.trim().toLowerCase();
    if (!q) return faqItems;
    return faqItems.filter((item) => {
      return item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q);
    });
  }, [faqQuery, preferences.language]);

  const logAction = useCallback(async (message: string) => {
    const stamp = new Date().toLocaleString('en-PH', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const next = [`[${stamp}] ${message}`, ...recentLogs].slice(0, 30);
    setRecentLogs(next);
    await AsyncStorage.setItem(PROFILE_LOGS_KEY, JSON.stringify(next));
  }, [recentLogs]);

  const getPondAlertConfig = useCallback((pondId: string): PondAlertSettings => {
    return pondAlerts[pondId] || DEFAULT_POND_ALERTS;
  }, [pondAlerts]);

  const setPondAlertField = useCallback((pondId: string, key: keyof PondAlertSettings, value: boolean) => {
    setPondAlerts((prev) => {
      const existing = prev[pondId] || DEFAULT_POND_ALERTS;
      return {
        ...prev,
        [pondId]: {
          ...existing,
          [key]: value,
        },
      };
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadPreferences = async () => {
      try {
        const [notificationRaw, pondAlertsRaw, securityRaw, pinRaw, prefsRaw, logsRaw] = await Promise.all([
          AsyncStorage.getItem(PROFILE_NOTIFICATION_KEY),
          AsyncStorage.getItem(PROFILE_POND_ALERTS_KEY),
          AsyncStorage.getItem(PROFILE_SECURITY_KEY),
          AsyncStorage.getItem(PROFILE_PIN_KEY),
          AsyncStorage.getItem(PROFILE_PREFS_KEY),
          AsyncStorage.getItem(PROFILE_LOGS_KEY),
        ]);

        if (!mounted) return;

        if (notificationRaw) {
          setNotifications({ ...DEFAULT_NOTIFICATIONS, ...JSON.parse(notificationRaw) });
        }

        if (pondAlertsRaw) {
          setPondAlerts(JSON.parse(pondAlertsRaw));
        }

        if (securityRaw) {
          const parsed = { ...DEFAULT_SECURITY, ...JSON.parse(securityRaw) };
          setSecurity(parsed);
        }

        if (pinRaw) {
          setPinCode(pinRaw);
        }

        if (prefsRaw) {
          setPreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(prefsRaw) });
        }

        if (logsRaw) {
          setRecentLogs(JSON.parse(logsRaw));
        }

        setHydrated(true);
      } catch (_error) {
        setHydrated(true);
      }
    };

    loadPreferences();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(PROFILE_NOTIFICATION_KEY, JSON.stringify(notifications));
  }, [notifications, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(PROFILE_POND_ALERTS_KEY, JSON.stringify(pondAlerts));
  }, [pondAlerts, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(PROFILE_SECURITY_KEY, JSON.stringify(security));
  }, [security, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(PROFILE_PREFS_KEY, JSON.stringify(preferences));
  }, [preferences, hydrated]);

  useEffect(() => {
    if (!hydrated) return;

    if (security.pinProtection && pinCode) {
      setIsLocked(true);
    } else {
      setIsLocked(false);
    }
  }, [security.pinProtection, pinCode, hydrated]);

  useEffect(() => {
    if (!hydrated) return;

    setPondAlerts((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const pond of ponds as any[]) {
        if (!next[pond.id]) {
          next[pond.id] = { ...DEFAULT_POND_ALERTS };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [ponds, hydrated]);

  const authenticateBiometric = useCallback(async (): Promise<boolean> => {
    try {
      const dynamicRequire = (globalThis as any).require || ((0, eval)('require') as any);
      const LocalAuthentication = dynamicRequire('expo-local-authentication');

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        Alert.alert('Unavailable', 'Biometric hardware not detected on this device.');
        return false;
      }

      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        Alert.alert('Unavailable', 'No biometrics enrolled on this device.');
        return false;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to continue',
        disableDeviceFallback: false,
      });

      return Boolean(result.success);
    } catch (_error) {
      Alert.alert(
        'Biometric Module Missing',
        'Install expo-local-authentication in your build to enable biometric login.'
      );
      return false;
    }
  }, []);

  const handleToggleBiometric = async (value: boolean) => {
    if (!value) {
      setSecurity((prev) => ({ ...prev, biometricLogin: false }));
      await logAction('Biometric login disabled');
      return;
    }

    const ok = await authenticateBiometric();
    if (!ok) return;

    setSecurity((prev) => ({ ...prev, biometricLogin: true }));
    await logAction('Biometric login enabled');
  };

  const handlePinToggle = async (value: boolean) => {
    if (value) {
      setActiveModal('pinSetup');
      return;
    }

    Alert.alert(
      'Disable PIN Lock',
      'You are turning off PIN protection. Anyone with device access can open the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: async () => {
            setSecurity((prev) => ({ ...prev, pinProtection: false }));
            setPinCode(null);
            await AsyncStorage.removeItem(PROFILE_PIN_KEY);
            await logAction('PIN lock disabled');
          },
        },
      ]
    );
  };

  const savePinCode = async () => {
    if (!/^\d{4,6}$/.test(pinSetupA)) {
      Alert.alert('Invalid PIN', 'PIN must be 4 to 6 digits.');
      return;
    }

    if (pinSetupA !== pinSetupB) {
      Alert.alert('PIN Mismatch', 'PIN confirmation does not match.');
      return;
    }

    setPinCode(pinSetupA);
    setSecurity((prev) => ({ ...prev, pinProtection: true }));
    await AsyncStorage.setItem(PROFILE_PIN_KEY, pinSetupA);
    await logAction('PIN lock enabled');

    setPinSetupA('');
    setPinSetupB('');
    setActiveModal(null);
  };

  const unlockWithPin = async () => {
    if (!pinCode) {
      setIsLocked(false);
      return;
    }

    if (pinUnlockInput === pinCode) {
      setPinUnlockInput('');
      setIsLocked(false);
      await logAction('Profile unlocked with PIN');
      return;
    }

    Alert.alert('Invalid PIN', 'Please try again.');
  };

  const unlockWithBiometric = async () => {
    const ok = await authenticateBiometric();
    if (ok) {
      setIsLocked(false);
      await logAction('Profile unlocked with biometric auth');
    }
  };

  const handleUpdatePassword = async () => {
    if (!user?.email) {
      Alert.alert('Error', 'Missing user email. Please sign in again.');
      return;
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Validation', 'Please complete all password fields.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Validation', 'New password and confirmation do not match.');
      return;
    }

    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      Alert.alert('Weak Password', 'Use at least 8 chars with 1 uppercase and 1 number.');
      return;
    }

    setActionLoading(true);
    try {
      const verify = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (verify.error) {
        Alert.alert('Authentication Failed', 'Current password is incorrect.');
        return;
      }

      const update = await supabase.auth.updateUser({ password: newPassword });
      if (update.error) {
        Alert.alert('Update Failed', update.error.message || 'Could not update password.');
        return;
      }

      await logAction('Account password updated');
      Alert.alert('Success', 'Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } finally {
      setActionLoading(false);
    }
  };

  const loadBundledImageDataUri = useCallback(async (modulePath: number): Promise<string | null> => {
    try {
      if (!FileSystem.readAsStringAsync || !FileSystem.EncodingType?.Base64) {
        return null;
      }

      const asset = Asset.fromModule(modulePath);
      await asset.downloadAsync?.();
      const assetUri = asset.localUri || asset.uri;
      if (!assetUri) {
        return null;
      }

      const base64 = await FileSystem.readAsStringAsync(assetUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const normalizedUri = assetUri.toLowerCase();
      const mimeType =
        normalizedUri.endsWith('.jpg') || normalizedUri.endsWith('.jpeg')
          ? 'image/jpeg'
          : normalizedUri.endsWith('.webp')
            ? 'image/webp'
            : 'image/png';

      return `data:${mimeType};base64,${base64}`;
    } catch (_error) {
      return null;
    }
  }, []);

  const shareTextFile = useCallback(async (input: {
    filename: string;
    content: string;
    mimeType: string;
    dialogTitle: string;
    fallbackTitle: string;
  }) => {
    try {
      const cacheDirectory = FileSystem.cacheDirectory;
      const writeAsStringAsync = FileSystem.writeAsStringAsync;
      const encodingType = FileSystem.EncodingType?.UTF8;

      if (cacheDirectory && writeAsStringAsync && Sharing.isAvailableAsync) {
        const fileUri = `${cacheDirectory}${input.filename}`;
        await writeAsStringAsync(fileUri, input.content, encodingType ? { encoding: encodingType } : undefined);
        const canShare = await Sharing.isAvailableAsync();

        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: input.mimeType,
            dialogTitle: input.dialogTitle,
          });
          return;
        }
      }
    } catch (_error) {
      // Fall back to text share below.
    }

    await Share.share({
      title: input.fallbackTitle,
      message: input.content,
    });
  }, []);

  const openReportRangePicker = useCallback((nextAction: ReportAction) => {
    setReportAction(nextAction);
    setActiveModal('reportExport');
  }, []);

  const runReportExport = useCallback(async (range: ReportRange) => {
    if (!reportAction) {
      return;
    }

    setActionLoading(true);
    setActiveModal(null);

    try {
      const report = await buildOperationsReport({
        ponds: ponds as any[],
        pendingEntries: pendingTotal,
        lastSync,
        isOnline,
        generatedBy: user?.email,
        range,
      });

      const baseFilename = `aquapin-bfar-${report.range}-${report.generatedAt.toISOString().slice(0, 10)}`;

      if (reportAction === 'csv') {
        await shareTextFile({
          filename: `${baseFilename}.csv`,
          content: renderOperationsReportCsv(report),
          mimeType: 'text/csv',
          dialogTitle: 'Share AquaPin Operations CSV',
          fallbackTitle: 'AquaPin Operations CSV',
        });
        await logAction(`Operations CSV exported (${report.rangeLabel})`);
        return;
      }

      try {
        if (!Print.printToFileAsync || !Sharing.isAvailableAsync || !Sharing.shareAsync) {
          throw new Error('pdf_modules_unavailable');
        }

        const [appLogoDataUri, bfarLogoDataUri] = await Promise.all([
          loadBundledImageDataUri(require('../../assets/favicon.png')),
          loadBundledImageDataUri(require('../../assets/BFAR_logo.png')),
        ]);

        const pdf = await Print.printToFileAsync({
          html: renderOperationsReportHtml(report, {
            appLogoDataUri,
            bfarLogoDataUri,
          }),
        });

        const canShare = await Sharing.isAvailableAsync();
        if (!canShare) {
          throw new Error('pdf_sharing_unavailable');
        }

        await Sharing.shareAsync(pdf.uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share AquaPin BFAR PDF Report',
        });
      } catch (_error) {
        console.error('PDF export failed:', _error);
        Alert.alert(
          'PDF Export Unavailable',
          'This device could not generate or share the PDF file right now. Please try again.'
        );
        await logAction(`PDF export failed (${report.rangeLabel})`);
        return;
      }

      await logAction(`Operations PDF exported (${report.rangeLabel})`);
    } finally {
      setActionLoading(false);
      setReportAction(null);
    }
  }, [reportAction, ponds, pendingTotal, lastSync, isOnline, user?.email, shareTextFile, loadBundledImageDataUri, logAction]);

  const createBackup = async () => {
    setActionLoading(true);
    try {
      const keys = await AsyncStorage.getAllKeys();
      const appKeys = keys.filter((key) => key.startsWith('@aquapin_db:'));
      const entries = await AsyncStorage.multiGet(appKeys);
      const backupPayload = {
        createdAt: Date.now(),
        itemCount: entries.length,
        items: entries,
      };

      await AsyncStorage.setItem(PROFILE_BACKUP_KEY, JSON.stringify(backupPayload));
      await logAction(`Backup created (${entries.length} records)`);
      Alert.alert('Backup Created', `Saved ${entries.length} local records.`);
    } finally {
      setActionLoading(false);
    }
  };

  const restoreBackup = async () => {
    const raw = await AsyncStorage.getItem(PROFILE_BACKUP_KEY);
    if (!raw) {
      Alert.alert('No Backup', 'Create a backup first before restore.');
      return;
    }

    const parsed = JSON.parse(raw);
    const items: [string, string][] = parsed.items || [];

    Alert.alert(
      'Restore Backup',
      `Restore ${items.length} records from ${formatDateTime(new Date(parsed.createdAt))}? This will overwrite local data keys.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await AsyncStorage.multiSet(items);
              await logAction(`Backup restored (${items.length} records)`);
              Alert.alert('Restored', 'Local backup restored successfully.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const sendIssueReport = async () => {
    const body = [
      'Issue Report',
      '',
      `User: ${user?.email || 'unknown'}`,
      `Platform: ${Platform.OS} ${Platform.Version}`,
      `Online: ${isOnline ? 'Yes' : 'No'}`,
      `Unresolved Sync Items: ${pendingTotal}`,
      `Last Sync: ${formatDateTime(lastSync)}`,
      '',
      'Problem Description:',
      feedbackText.trim() || '(no details provided)',
      '',
      'Recent App Logs:',
      ...(recentLogs.slice(0, 8).length > 0 ? recentLogs.slice(0, 8) : ['(no logs available)']),
    ].join('\n');

    await Linking.openURL(buildMailTo('AquaPin Issue Report', body));
    await logAction('Issue report opened in email client');
    setFeedbackText('');
  };

  const clearSensitiveFields = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setFeedbackText('');
    setFaqQuery('');
  };

  const closeModal = () => {
    setActiveModal(null);
    setReportAction(null);
    clearSensitiveFields();
  };

  const clearLocalAppData = async () => {
    await clearLocalDatabase();
  };

  const handleDeactivateAccount = () => {
    Alert.alert(
      'Deactivate Account',
      'Impact: You will be signed out and your account metadata will be marked deactivated. You can request reactivation later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              const { error } = await supabase.auth.updateUser({
                data: {
                  account_status: 'deactivated',
                  deactivated_at: new Date().toISOString(),
                },
              });

              if (error) {
                Alert.alert('Failed', error.message || 'Could not deactivate account.');
                return;
              }

              await logAction('Account deactivated');
              await signOut();
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Impact: Local app data will be removed and a deletion request email will be generated. Permanent user deletion requires admin processing.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation',
              'Are you absolutely sure you want to request account deletion?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Request Deletion',
                  style: 'destructive',
                  onPress: async () => {
                    setActionLoading(true);
                    try {
                      await clearLocalAppData();
                      await logAction('Local data cleared for deletion request');

                      const body = [
                        'Please delete my AquaPin account and associated profile.',
                        '',
                        `User: ${user?.email || 'unknown'}`,
                        `Requested at: ${new Date().toLocaleString('en-PH')}`,
                      ].join('\n');

                      await Linking.openURL(buildMailTo('AquaPin Account Deletion Request', body));
                      await signOut();
                    } finally {
                      setActionLoading(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Do you want to sign out now?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logAction('User signed out');
          await signOut();
        },
      },
    ]);
  };

  const renderNotificationsModal = () => (
    <Modal visible={activeModal === 'notifications'} animationType="slide" transparent>
      <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t.notificationSettingsTitle}</Text>
            <TouchableOpacity onPress={closeModal}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView>
            <View style={[styles.settingItem, { borderBottomColor: colors.borderSoft }]}>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingTitle, { color: colors.text }]}>{t.harvestReminders}</Text>
                <Text style={[styles.settingDesc, { color: colors.textMuted }]}>{t.harvestRemindersDesc}</Text>
              </View>
              <Switch
                value={notifications.harvestReminders}
                onValueChange={(value) => setNotifications((prev) => ({ ...prev, harvestReminders: value }))}
              />
            </View>

            <View style={[styles.settingItem, { borderBottomColor: colors.borderSoft }]}>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingTitle, { color: colors.text }]}>{t.mortalityAlerts}</Text>
                <Text style={[styles.settingDesc, { color: colors.textMuted }]}>{t.mortalityAlertsDesc}</Text>
              </View>
              <Switch
                value={notifications.mortalityAlerts}
                onValueChange={(value) => setNotifications((prev) => ({ ...prev, mortalityAlerts: value }))}
              />
            </View>

            <View style={[styles.settingItem, { borderBottomColor: colors.borderSoft }]}>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingTitle, { color: colors.text }]}>{t.syncNotifications}</Text>
                <Text style={[styles.settingDesc, { color: colors.textMuted }]}>{t.syncNotificationsDesc}</Text>
              </View>
              <Switch
                value={notifications.syncNotifications}
                onValueChange={(value) => setNotifications((prev) => ({ ...prev, syncNotifications: value }))}
              />
            </View>

            <View style={[styles.settingItem, { borderBottomColor: colors.borderSoft }]}>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingTitle, { color: colors.text }]}>{t.weeklyReports}</Text>
                <Text style={[styles.settingDesc, { color: colors.textMuted }]}>{t.weeklyReportsDesc}</Text>
              </View>
              <Switch
                value={notifications.weeklyReports}
                onValueChange={(value) => setNotifications((prev) => ({ ...prev, weeklyReports: value }))}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.secondaryActionButton,
                { borderColor: colors.border, backgroundColor: colors.surfaceMuted },
              ]}
              onPress={() => setActiveModal('pondAlerts')}
            >
              <Ionicons name="notifications-circle-outline" size={18} color={colors.accent} />
              <Text style={[styles.secondaryActionText, { color: colors.accentText }]}>{t.configurePerPondAlerts}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const renderPondAlertsModal = () => (
    <Modal visible={activeModal === 'pondAlerts'} animationType="slide" transparent>
      <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t.perPondAlertRules}</Text>
            <TouchableOpacity onPress={closeModal}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={ponds as any[]}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 12 }}
            renderItem={({ item }) => {
              const config = getPondAlertConfig(item.id);
              return (
                <View style={[styles.pondAlertCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.pondAlertName, { color: colors.text }]}>{item.name}</Text>

                  <View style={styles.pondAlertRow}>
                    <Text style={[styles.pondAlertLabel, { color: colors.textSubtle }]}>{t.mortalitySpike}</Text>
                    <Switch
                      value={config.mortalitySpike}
                      onValueChange={(value) => setPondAlertField(item.id, 'mortalitySpike', value)}
                    />
                  </View>

                  <View style={styles.pondAlertRow}>
                    <Text style={[styles.pondAlertLabel, { color: colors.textSubtle }]}>{t.harvestDue}</Text>
                    <Switch
                      value={config.harvestDue}
                      onValueChange={(value) => setPondAlertField(item.id, 'harvestDue', value)}
                    />
                  </View>

                  <View style={styles.pondAlertRow}>
                    <Text style={[styles.pondAlertLabel, { color: colors.textSubtle }]}>{t.inactivity}</Text>
                    <Switch
                      value={config.inactivity}
                      onValueChange={(value) => setPondAlertField(item.id, 'inactivity', value)}
                    />
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textMuted }]}>{t.noPondsForAlerts}</Text>}
          />
        </View>
      </View>
    </Modal>
  );

  const renderSecurityModal = () => (
    <Modal visible={activeModal === 'security'} animationType="slide" transparent>
      <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t.security}</Text>
            <TouchableOpacity onPress={closeModal}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView>
            <View style={[styles.settingItem, { borderBottomColor: colors.borderSoft }]}>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingTitle, { color: colors.text }]}>{t.biometricLogin}</Text>
                <Text style={[styles.settingDesc, { color: colors.textMuted }]}>{t.biometricLoginDesc}</Text>
              </View>
              <Switch value={security.biometricLogin} onValueChange={handleToggleBiometric} />
            </View>

            <View style={[styles.settingItem, { borderBottomColor: colors.borderSoft }]}>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingTitle, { color: colors.text }]}>{t.pinLock}</Text>
                <Text style={[styles.settingDesc, { color: colors.textMuted }]}>{t.pinLockDesc}</Text>
              </View>
              <Switch value={security.pinProtection} onValueChange={handlePinToggle} />
            </View>

            {security.pinProtection && (
              <TouchableOpacity
                style={[
                  styles.secondaryActionButton,
                  { borderColor: colors.border, backgroundColor: colors.surfaceMuted },
                ]}
                onPress={() => setIsLocked(true)}
              >
                <Ionicons name="lock-closed-outline" size={18} color={colors.accent} />
                <Text style={[styles.secondaryActionText, { color: colors.accentText }]}>{t.lockNow}</Text>
              </TouchableOpacity>
            )}

            <Text style={[styles.modalSectionTitle, { color: colors.textSubtle }]}>{t.updatePassword}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
              placeholder={t.currentPassword}
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
              placeholder={t.newPassword}
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
              placeholder={t.confirmNewPassword}
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />

            <TouchableOpacity style={styles.primaryActionButton} onPress={handleUpdatePassword} disabled={actionLoading}>
              {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryActionText}>{t.updatePassword}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const renderPinSetupModal = () => (
    <Modal visible={activeModal === 'pinSetup'} animationType="slide" transparent>
      <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>{t.setPinLock}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
            keyboardType="number-pad"
            placeholder={t.enterPin}
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={pinSetupA}
            onChangeText={setPinSetupA}
          />
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
            keyboardType="number-pad"
            placeholder={t.confirmPin}
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={pinSetupB}
            onChangeText={setPinSetupB}
          />

          <View style={styles.modalButtonRow}>
            <TouchableOpacity style={[styles.modalGhostButton, { borderColor: colors.border }]} onPress={() => setActiveModal('security')}>
              <Text style={[styles.modalGhostText, { color: colors.textSubtle }]}>{t.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalDangerButton} onPress={savePinCode}>
              <Text style={styles.modalDangerText}>{t.savePin}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderPreferencesModal = () => (
    <Modal visible={activeModal === 'preferences'} animationType="slide" transparent>
      <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t.languageAndUnits}</Text>
            <TouchableOpacity onPress={closeModal}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView>
            <Text style={[styles.modalSectionTitle, { color: colors.textSubtle }]}>{t.appearance}</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[
                  styles.choiceChip,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  appearanceMode === 'light' && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
                ]}
                onPress={() => setAppearanceMode('light')}
              >
                <Text
                  style={[
                    styles.choiceChipText,
                    { color: colors.textSubtle },
                    appearanceMode === 'light' && { color: colors.accentText },
                  ]}
                >
                  {t.lightMode}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.choiceChip,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  appearanceMode === 'dark' && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
                ]}
                onPress={() => setAppearanceMode('dark')}
              >
                <Text
                  style={[
                    styles.choiceChipText,
                    { color: colors.textSubtle },
                    appearanceMode === 'dark' && { color: colors.accentText },
                  ]}
                >
                  {t.darkMode}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSectionTitle, { color: colors.textSubtle }]}>{t.language}</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[
                  styles.choiceChip,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  preferences.language === 'en' && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
                ]}
                onPress={() => setPreferences((prev) => ({ ...prev, language: 'en' }))}
              >
                <Text
                  style={[
                    styles.choiceChipText,
                    { color: colors.textSubtle },
                    preferences.language === 'en' && { color: colors.accentText },
                  ]}
                >
                  {t.english}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.choiceChip,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  preferences.language === 'fil' && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
                ]}
                onPress={() => setPreferences((prev) => ({ ...prev, language: 'fil' }))}
              >
                <Text
                  style={[
                    styles.choiceChipText,
                    { color: colors.textSubtle },
                    preferences.language === 'fil' && { color: colors.accentText },
                  ]}
                >
                  {t.tagalog}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSectionTitle, { color: colors.textSubtle }]}>{t.weightUnit}</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[
                  styles.choiceChip,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  preferences.weightUnit === 'kg' && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
                ]}
                onPress={() => setPreferences((prev) => ({ ...prev, weightUnit: 'kg' }))}
              >
                <Text
                  style={[
                    styles.choiceChipText,
                    { color: colors.textSubtle },
                    preferences.weightUnit === 'kg' && { color: colors.accentText },
                  ]}
                >
                  {t.kilogram}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.choiceChip,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  preferences.weightUnit === 'g' && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
                ]}
                onPress={() => setPreferences((prev) => ({ ...prev, weightUnit: 'g' }))}
              >
                <Text
                  style={[
                    styles.choiceChipText,
                    { color: colors.textSubtle },
                    preferences.weightUnit === 'g' && { color: colors.accentText },
                  ]}
                >
                  {t.gram}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSectionTitle, { color: colors.textSubtle }]}>{t.fishCountFormat}</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[
                  styles.choiceChip,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  preferences.fishCountFormat === 'full' && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
                ]}
                onPress={() => setPreferences((prev) => ({ ...prev, fishCountFormat: 'full' }))}
              >
                <Text
                  style={[
                    styles.choiceChipText,
                    { color: colors.textSubtle },
                    preferences.fishCountFormat === 'full' && { color: colors.accentText },
                  ]}
                >
                  {t.fullNumber}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.choiceChip,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  preferences.fishCountFormat === 'compact' && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
                ]}
                onPress={() => setPreferences((prev) => ({ ...prev, fishCountFormat: 'compact' }))}
              >
                <Text
                  style={[
                    styles.choiceChipText,
                    { color: colors.textSubtle },
                    preferences.fishCountFormat === 'compact' && { color: colors.accentText },
                  ]}
                >
                  {t.compact}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const renderReportExportModal = () => {
    const actionLabel =
      reportAction === 'csv'
        ? t.exportCsv
        : t.exportPdfSummary;

    return (
      <Modal visible={activeModal === 'reportExport'} animationType="fade" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t.reportRangeTitle}</Text>
            <Text style={[styles.reportActionLabel, { color: colors.accentText }]}>{actionLabel}</Text>
            <Text style={[styles.reportActionHint, { color: colors.textMuted }]}>{t.reportRangePrompt}</Text>

            <View style={styles.chipRow}>
              {reportRangeOptions.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.choiceChip, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
                  onPress={() => runReportExport(option.id)}
                >
                  <Text style={[styles.choiceChipText, { color: colors.textSubtle }]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalButtonRow}>
              <TouchableOpacity style={[styles.modalGhostButton, { borderColor: colors.border }]} onPress={closeModal}>
                <Text style={[styles.modalGhostText, { color: colors.textSubtle }]}>{t.cancel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderHelpModal = () => (
    <Modal visible={activeModal === 'help'} animationType="slide" transparent>
      <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t.helpCenterTitle}</Text>
            <TouchableOpacity onPress={closeModal}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
              value={faqQuery}
              onChangeText={setFaqQuery}
              placeholder={t.searchFaqs}
              placeholderTextColor={colors.textMuted}
            />

            {filteredFaq.map((item) => (
              <View key={item.id} style={[styles.faqItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.faqQuestion, { color: colors.text }]}>{item.question}</Text>
                <Text style={[styles.faqAnswer, { color: colors.textSubtle }]}>{item.answer}</Text>
              </View>
            ))}

            <Text style={[styles.modalSectionTitle, { color: colors.textSubtle }]}>{t.reportIssue}</Text>
            <TextInput
              style={[
                styles.input,
                styles.textArea,
                { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text },
              ]}
              value={feedbackText}
              onChangeText={setFeedbackText}
              placeholder={t.reportIssuePlaceholder}
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
            />

            <TouchableOpacity style={styles.primaryActionButton} onPress={sendIssueReport}>
              <Text style={styles.primaryActionText}>{t.reportWithLogs}</Text>
            </TouchableOpacity>

            <Text style={[styles.modalSectionTitle, { color: colors.textSubtle }]}>{t.recentLogs}</Text>
            {(recentLogs.length > 0 ? recentLogs.slice(0, 6) : [t.noRecentLogs]).map((entry, idx) => (
              <Text key={`${entry}-${idx}`} style={[styles.logText, { color: colors.textMuted }]}>{entry}</Text>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const renderLockOverlay = () => {
    if (!isLocked) return null;

    return (
      <View style={[styles.lockOverlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.lockCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="lock-closed" size={28} color={colors.accent} />
          <Text style={[styles.lockTitle, { color: colors.text }]}>{t.profileLocked}</Text>
          <Text style={[styles.lockSubtitle, { color: colors.textMuted }]}>{t.enterPinToContinue}</Text>

          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
            keyboardType="number-pad"
            placeholder={t.pin}
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={pinUnlockInput}
            onChangeText={setPinUnlockInput}
          />

          <TouchableOpacity style={styles.primaryActionButton} onPress={unlockWithPin}>
            <Text style={styles.primaryActionText}>{t.unlockWithPin}</Text>
          </TouchableOpacity>

          {security.biometricLogin && (
            <TouchableOpacity
              style={[
                styles.secondaryActionButton,
                { borderColor: colors.border, backgroundColor: colors.surfaceMuted },
              ]}
              onPress={unlockWithBiometric}
            >
              <Ionicons name="finger-print-outline" size={18} color={colors.accent} />
              <Text style={[styles.secondaryActionText, { color: colors.accentText }]}>{t.unlockWithBiometrics}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.secondaryActionButton,
              { borderColor: colors.border, backgroundColor: colors.surfaceMuted },
            ]}
            onPress={async () => {
              await signOut();
            }}
          >
            <Ionicons name="log-out-outline" size={18} color={colors.accent} />
            <Text style={[styles.secondaryActionText, { color: colors.accentText }]}>{t.signOut}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.page }]} edges={['top', 'left', 'right']}>
      {renderNotificationsModal()}
      {renderPondAlertsModal()}
      {renderSecurityModal()}
      {renderPinSetupModal()}
      {renderReportExportModal()}
      {renderHelpModal()}
      {renderLockOverlay()}

      <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: 28 }}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.email?.charAt(0).toUpperCase() || '?'}</Text>
          </View>
          <Text style={[styles.email, { color: colors.text }]}>{user?.email || t.unknownUser}</Text>
          <View style={[styles.roleBadge, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.roleText, { color: colors.accentText }]}>{t.fieldStaff}</Text>
          </View>
          <Text style={[styles.preferenceHint, { color: colors.textMuted }]}>
            {appearanceLabel} | {(preferences.language === 'fil' ? t.tagalog : t.english)} | {preferences.weightUnit.toUpperCase()} | {preferences.fishCountFormat === 'compact' ? t.compact : t.fullNumber}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{t.farmSnapshot}</Text>
          <View style={styles.snapshotRow}>
            <View style={[styles.snapshotCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={styles.snapshotValue}>{formatCount(farmStats.total, compactCount)}</Text>
              <Text style={[styles.snapshotLabel, { color: colors.textMuted }]}>{t.totalPonds}</Text>
            </View>
            <View style={[styles.snapshotCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={styles.snapshotValue}>{formatCount(farmStats.active, compactCount)}</Text>
              <Text style={[styles.snapshotLabel, { color: colors.textMuted }]}>{t.active}</Text>
            </View>
          </View>
          <View style={styles.snapshotRow}>
            <View style={[styles.snapshotCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={styles.snapshotValue}>{formatCount(farmStats.inactive, compactCount)}</Text>
              <Text style={[styles.snapshotLabel, { color: colors.textMuted }]}>{t.inactive}</Text>
            </View>
            <View style={[styles.snapshotCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={styles.snapshotValue}>{formatCount(farmStats.speciesCount, compactCount)}</Text>
              <Text style={[styles.snapshotLabel, { color: colors.textMuted }]}>{t.speciesCount}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{t.account}</Text>

          <TouchableOpacity style={[styles.menuItem, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setActiveModal('notifications')}>
            <Ionicons name="notifications-outline" size={20} color="#0ea5e9" />
            <Text style={[styles.menuText, { color: colors.textSubtle }]}>{t.notificationSettings}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setActiveModal('security')}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#16a34a" />
            <Text style={[styles.menuText, { color: colors.textSubtle }]}>{t.securityPassword}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.signOutButton,
              { backgroundColor: colors.signOutBackground, borderColor: colors.signOutBorder },
            ]}
            onPress={handleSignOut}
          >
            <Ionicons name="log-out-outline" size={20} color="#dc2626" />
            <Text style={[styles.signOutText, { color: colors.signOutText }]}>{t.signOut}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{t.dataTools}</Text>

          <TouchableOpacity style={[styles.menuItem, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => openReportRangePicker('pdf')}>
            <Ionicons name="document-text-outline" size={20} color="#0d9488" />
            <Text style={[styles.menuText, { color: colors.textSubtle }]}>Export PDF</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{t.helpCenter}</Text>
          <TouchableOpacity style={[styles.menuItem, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setActiveModal('help')}>
            <Ionicons name="help-circle-outline" size={20} color="#f59e0b" />
            <Text style={[styles.menuText, { color: colors.textSubtle }]}>{t.searchFaqReportIssue}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.menuItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => Alert.alert('AquaPin Mobile', 'Version 2.0.0 (Production Build)\nAll systems operational.')}
          >
            <Ionicons name="information-circle-outline" size={20} color="#0284c7" />
            <Text style={[styles.menuText, { color: colors.textSubtle }]}>App Version</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#0284c7' }}>v2.0.0</Text>
          </TouchableOpacity>
        </View>

        {actionLoading && (
          <View style={[styles.loadingBanner, { borderColor: colors.loadingBorder, backgroundColor: colors.loadingBackground }]}>
            <ActivityIndicator size="small" color="#0369a1" />
            <Text style={[styles.loadingBannerText, { color: colors.loadingText }]}>{loadingBannerCopy}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 18,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarText: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '700',
  },
  email: {
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '600',
  },
  roleBadge: {
    marginTop: 8,
    backgroundColor: '#e0f2fe',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  roleText: {
    color: '#0369a1',
    fontSize: 12,
    fontWeight: '700',
  },
  preferenceHint: {
    marginTop: 8,
    color: '#64748b',
    fontSize: 12,
  },
  section: {
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    marginBottom: 8,
    marginLeft: 4,
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  syncCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  syncHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  syncStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  syncStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  syncNowButton: {
    backgroundColor: '#0284c7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 84,
    alignItems: 'center',
  },
  syncNowText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  syncStatsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  syncStatBox: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
  },
  syncStatValue: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '700',
  },
  syncStatLabel: {
    marginTop: 4,
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  snapshotRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  snapshotCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    paddingVertical: 12,
  },
  snapshotValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0369a1',
  },
  snapshotLabel: {
    marginTop: 4,
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
    gap: 10,
  },
  menuText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  warningItem: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  warningText: {
    flex: 1,
    color: '#92400e',
    fontSize: 15,
    fontWeight: '700',
  },
  dangerItem: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  dangerText: {
    flex: 1,
    color: '#991b1b',
    fontSize: 15,
    fontWeight: '700',
  },
  signOutButton: {
    backgroundColor: '#fee2e2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 2,
  },
  signOutText: {
    color: '#dc2626',
    fontSize: 15,
    fontWeight: '800',
  },
  loadingBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#ecfeff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingBannerText: {
    fontSize: 12,
    color: '#0c4a6e',
    fontWeight: '700',
  },
  version: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '84%',
    minHeight: '45%',
    paddingBottom: 10,
  },
  modalCard: {
    marginHorizontal: 18,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  reportActionLabel: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reportActionHint: {
    marginTop: 6,
    marginBottom: 14,
    fontSize: 13,
    lineHeight: 19,
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  settingInfo: {
    flex: 1,
    paddingRight: 12,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  settingDesc: {
    marginTop: 3,
    fontSize: 12,
    color: '#64748b',
  },
  input: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  primaryActionButton: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: '#0284c7',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  primaryActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryActionButton: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 10,
    backgroundColor: '#f0f9ff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
  },
  secondaryActionText: {
    color: '#0369a1',
    fontSize: 13,
    fontWeight: '700',
  },
  pondAlertCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
  },
  pondAlertName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
  },
  pondAlertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  pondAlertLabel: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
    flex: 1,
    paddingRight: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
  },
  choiceChip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  choiceChipActive: {
    borderColor: '#0284c7',
    backgroundColor: '#e0f2fe',
  },
  choiceChipText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  choiceChipTextActive: {
    color: '#0369a1',
  },
  faqItem: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    backgroundColor: '#fff',
    padding: 10,
  },
  faqQuestion: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '700',
  },
  faqAnswer: {
    marginTop: 3,
    color: '#475569',
    fontSize: 12,
    lineHeight: 18,
  },
  logText: {
    marginHorizontal: 16,
    marginBottom: 6,
    fontSize: 11,
    color: '#64748b',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.68)',
    justifyContent: 'center',
    paddingHorizontal: 18,
    zIndex: 1000,
  },
  lockCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
  },
  lockTitle: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  lockSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 10,
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  modalGhostButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  modalGhostText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
  modalDangerButton: {
    flex: 1,
    backgroundColor: '#0284c7',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  modalDangerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 13,
    marginHorizontal: 16,
    marginTop: 8,
  },
});
