import { useLanguage } from '../../contexts/LanguageContext';
import React, { useMemo, useState, useEffect } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { aquapinColors } from '../../theme/aquapin';

const TAB_META: Record<string, { label: string; outline: keyof typeof Ionicons.glyphMap; filled: keyof typeof Ionicons.glyphMap }> = {
  Dashboard: { label: 'Dashboard', outline: 'home-outline', filled: 'home' },
  Ponds: { label: 'Ponds', outline: 'layers-outline', filled: 'layers' },
  Records: { label: 'Records', outline: 'document-text-outline', filled: 'document-text' },
  Profile: { label: 'Profile', outline: 'person-outline', filled: 'person' },
};

export default function AquapinTabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [isQuickSheetOpen, setIsQuickSheetOpen] = useState(false);
  const [parentParams, setParentParams] = useState<any>(null);

  useEffect(() => {
    const parentNav = navigation.getParent() as any;
    if (!parentNav) return;

    const handleStateChange = () => {
      const state = parentNav.getState();
      const activeRoute = state?.routes ? state.routes[state.routes.length - 1] : null;
      if (activeRoute?.name === 'RecordsWorkspace') {
        setParentParams(activeRoute.params);
      } else {
        setParentParams(null);
      }
    };

    const unsubscribe = parentNav.addListener('state', handleStateChange);
    handleStateChange();

    return unsubscribe;
  }, [navigation]);

  const activeModuleType = parentParams?.initialType || parentParams?.initialFilterType;

  const leftRoutes = state.routes.slice(0, 2);
  const rightRoutes = state.routes.slice(2);

  const quickActions = useMemo(() => ([
    {
      key: 'stocking',
      label: 'Stocking',
      subtitle: 'Log new stock fast',
      icon: 'add-circle-outline' as const,
      onPress: () => {
        setIsQuickSheetOpen(false);
        navigation.getParent()?.navigate('RecordsWorkspace', {
          initialType: 'stocking',
          initialSegment: 'log',
          requestKey: Date.now(),
        });
      },
    },
    {
      key: 'mortality',
      label: 'Mortality',
      subtitle: 'Record losses quickly',
      icon: 'warning-outline' as const,
      onPress: () => {
        setIsQuickSheetOpen(false);
        navigation.getParent()?.navigate('RecordsWorkspace', {
          initialType: 'mortality',
          initialSegment: 'log',
          requestKey: Date.now(),
        });
      },
    },
    {
      key: 'harvest',
      label: 'Harvest',
      subtitle: 'Save harvest results',
      icon: 'basket-outline' as const,
      onPress: () => {
        setIsQuickSheetOpen(false);
        navigation.getParent()?.navigate('RecordsWorkspace', {
          initialType: 'harvest',
          initialSegment: 'log',
          requestKey: Date.now(),
        });
      },
    },
    {
      key: 'gps-map',
      label: 'GPS Map',
      subtitle: 'Open pond mapping',
      icon: 'map-outline' as const,
      onPress: () => {
        setIsQuickSheetOpen(false);
        navigation.getParent()?.navigate('PondMap', {
          initialMode: 'point',
          requestKey: Date.now(),
        });
      },
    },
    {
      key: 'polygon',
      label: 'Polygon',
      subtitle: 'Trace pond boundary',
      icon: 'shapes-outline' as const,
      onPress: () => {
        setIsQuickSheetOpen(false);
        navigation.getParent()?.navigate('PondMap', {
          initialMode: 'polygon',
          requestKey: Date.now(),
        });
      },
    },
    {
      key: 'sync',
      label: 'Sync Queue',
      subtitle: 'Check offline sync',
      icon: 'cloud-upload-outline' as const,
      onPress: () => {
        setIsQuickSheetOpen(false);
        navigation.getParent()?.navigate('SyncStatus');
      },
    },
  ]), [navigation]);

  const renderTabButton = (route: BottomTabBarProps['state']['routes'][number]) => {
    const routeIndex = state.routes.findIndex((item) => item.key === route.key);
    const isFocused = state.index === routeIndex;
    const meta = TAB_META[route.name];

    return (
      <TouchableOpacity
        key={route.key}
        activeOpacity={0.9}
        onPress={() => navigation.navigate(route.name)}
        style={styles.tabButton}
      >
        <View style={[styles.tabIcon, isFocused && styles.tabIconActive]}>
          <Ionicons
            name={isFocused ? meta.filled : meta.outline}
            size={20}
            color={isFocused ? aquapinColors.green : aquapinColors.textMuted}
          />
        </View>
        <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>{t(meta.label)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <View style={[styles.shell, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <View style={styles.tabBar}>
          <View style={styles.sideGroup}>{leftRoutes.map(renderTabButton)}</View>
          <View style={styles.centerSpace} />
          <View style={styles.sideGroup}>{rightRoutes.map(renderTabButton)}</View>
        </View>

        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => setIsQuickSheetOpen(true)}
          style={[styles.fab, { bottom: Math.max(insets.bottom, 14) + 18 }]}
        >
          <Ionicons name="add" size={30} color="#fff" />
        </TouchableOpacity>
      </View>

      <Modal
        animationType="fade"
        transparent
        visible={isQuickSheetOpen}
        onRequestClose={() => setIsQuickSheetOpen(false)}
      >
        <View style={styles.modalRoot}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setIsQuickSheetOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetEyebrow}>Quick Create</Text>
                <Text style={styles.sheetTitle}>Aquapin 2.0 actions</Text>
              </View>
              <TouchableOpacity onPress={() => setIsQuickSheetOpen(false)} style={styles.closeButton}>
                <Ionicons name="close" size={18} color={aquapinColors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.actionGrid}>
              {quickActions
                .filter((action) => {
                  if (activeModuleType === 'stocking' || activeModuleType === 'harvest' || activeModuleType === 'mortality') {
                    return action.key === activeModuleType;
                  }
                  return true;
                })
                .map((action) => (
                  <TouchableOpacity key={action.key} style={styles.actionCard} activeOpacity={0.92} onPress={action.onPress}>
                    <View style={styles.actionIcon}>
                      <Ionicons name={action.icon} size={22} color={aquapinColors.blue} />
                    </View>
                    <Text style={styles.actionLabel}>{action.label}</Text>
                    <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
                  </TouchableOpacity>
                ))}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: 'transparent',
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: aquapinColors.surface,
    borderRadius: 28,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    shadowColor: '#16335c',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  sideGroup: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  centerSpace: {
    width: 72,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  tabIcon: {
    width: 42,
    height: 34,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconActive: {
    backgroundColor: aquapinColors.greenSoft,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: aquapinColors.textMuted,
  },
  tabLabelActive: {
    color: aquapinColors.green,
  },
  fab: {
    position: 'absolute',
    alignSelf: 'center',
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: aquapinColors.green,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#17335c',
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 25, 48, 0.28)',
  },
  sheet: {
    backgroundColor: aquapinColors.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 56,
    height: 5,
    borderRadius: 999,
    backgroundColor: aquapinColors.border,
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  sheetEyebrow: {
    color: aquapinColors.green,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sheetTitle: {
    color: aquapinColors.text,
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: aquapinColors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },
  actionCard: {
    width: '48%',
    backgroundColor: aquapinColors.surfaceMuted,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: aquapinColors.border,
  },
  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: aquapinColors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionLabel: {
    color: aquapinColors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  actionSubtitle: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
});
