import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useFarmOverview, useSync, usePonds } from '../../hooks';
import MapView, { Marker, Polygon, UrlTile, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from 'react-native-maps';
import { LeafletMapView, MappedPond } from '../../components/LeafletMapView';
import * as Location from 'expo-location';
import {
  aquapinColors,
  formatCompactNumber,
  formatCurrencyPhp,
  formatPercent,
  formatRelativeTime,
  formatWholeNumber,
} from '../../theme/aquapin';

function parseLocation(location: string): { latitude: number; longitude: number } | null {
  const parts = String(location || '').split(',').map((item) => parseFloat(item.trim()));
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
  return { latitude: parts[0], longitude: parts[1] };
}

type MarkerPoint = {
  id: string;
  name: string;
  currentStockCount: number;
  isActive: boolean;
  top: number;
  left: number;
};

function getActivityTone(type: 'stocking' | 'mortality' | 'harvest') {
  switch (type) {
    case 'stocking':
      return { bg: aquapinColors.greenSoft, fg: aquapinColors.green, icon: 'add-circle-outline' as const };
    case 'mortality':
      return { bg: aquapinColors.redSoft, fg: aquapinColors.red, icon: 'warning-outline' as const };
    case 'harvest':
      return { bg: aquapinColors.blueSoft, fg: aquapinColors.blue, icon: 'basket-outline' as const };
    default:
      return { bg: aquapinColors.surfaceMuted, fg: aquapinColors.textMuted, icon: 'ellipse-outline' as const };
  }
}

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const overview = useFarmOverview();
  const { queueSnapshot, lastSync } = useSync();
  const [showAiIntro, setShowAiIntro] = useState(false);
  const aiButtonScale = useRef(new Animated.Value(1)).current;
  const aiBubbleOpacity = useRef(new Animated.Value(0)).current;
  const aiBubbleScale = useRef(new Animated.Value(0.96)).current;

  const { ponds } = usePonds();
  const mapRef = useRef<MapView | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const initialRegion = {
    latitude: 14.5995,
    longitude: 120.9842,
    latitudeDelta: 0.009,
    longitudeDelta: 0.009,
  };

  const mapProvider = PROVIDER_DEFAULT;

  const centerOnMyLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const location = await Location.getCurrentPositionAsync({});
      mapRef.current?.animateToRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.004,
        longitudeDelta: 0.004,
      }, 600);
    } catch (e) {
      console.warn('Failed to get location:', e);
    }
  };

  // Auto-fit all ponds within the visible screen once map is ready and ponds are loaded
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    if (ponds.length === 0) {
      centerOnMyLocation();
      return;
    }

    const coords: { latitude: number; longitude: number }[] = [];
    ponds.forEach((pond) => {
      const center = parseLocation(pond.location);
      if (center) {
        coords.push(center);
      }

      const pondAny = pond as any;
      if (pondAny.boundary) {
        try {
          const boundaryCoords = JSON.parse(pondAny.boundary);
          if (Array.isArray(boundaryCoords)) {
            boundaryCoords.forEach((coord) => {
              if (typeof coord.latitude === 'number' && typeof coord.longitude === 'number') {
                coords.push({ latitude: coord.latitude, longitude: coord.longitude });
              }
            });
          }
        } catch (e) {
          // Ignore invalid boundary JSON
        }
      }
    });

    if (coords.length > 0) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
        animated: true,
      });
    } else {
      centerOnMyLocation();
    }
  }, [mapReady, ponds]);

  const openStackScreen = (name: string, params?: Record<string, any>) => {
    navigation.getParent()?.navigate(name, params);
  };

  useEffect(() => {
    let isMounted = true;

    setShowAiIntro(true);
    aiButtonScale.setValue(0.96);
    aiBubbleOpacity.setValue(0);
    aiBubbleScale.setValue(0.96);

    Animated.parallel([
      Animated.sequence([
        Animated.timing(aiButtonScale, {
          toValue: 1.08,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(aiButtonScale, {
          toValue: 1,
          friction: 5,
          tension: 90,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(aiBubbleOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(aiBubbleScale, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const hideTimer = setTimeout(() => {
      Animated.timing(aiBubbleOpacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && isMounted) {
          setShowAiIntro(false);
        }
      });
    }, 3000);

    return () => {
      isMounted = false;
      clearTimeout(hideTimer);
    };
  }, [aiBubbleOpacity, aiBubbleScale, aiButtonScale]);



  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const userNotifications = useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      message: string;
      icon: string;
      toneBg: string;
      toneFg: string;
      time?: string;
      tag?: string;
    }> = [];

    // 1. Pond alerts based on live pond stock and cycle states
    ponds.forEach((pond: any) => {
      const stock = Number(pond.currentStockCount || 0);
      if (pond.isActive) {
        if (stock <= 50) {
          list.push({
            id: `alert-stock-critical-${pond.id}`,
            title: 'Critical Stock Alert',
            message: `${pond.name || 'Pond'} stock is critically low (${stock} fish). Restocking recommended.`,
            icon: 'alert-circle-outline',
            toneBg: aquapinColors.redSoft,
            toneFg: aquapinColors.red,
            tag: pond.name || 'Pond',
          });
        } else if (stock < 100) {
          list.push({
            id: `alert-stock-low-${pond.id}`,
            title: 'Low Stock Level',
            message: `${pond.name || 'Pond'} estimated stock is below 100 fish (${stock} fish).`,
            icon: 'warning-outline',
            toneBg: aquapinColors.amberSoft,
            toneFg: aquapinColors.amber,
            tag: pond.name || 'Pond',
          });
        }

        if (!pond.currentSpecies) {
          list.push({
            id: `alert-species-${pond.id}`,
            title: 'Species Reminder',
            message: `Set the active species in ${pond.name || 'Pond'} to improve tracking accuracy.`,
            icon: 'fish-outline',
            toneBg: aquapinColors.blueSoft,
            toneFg: aquapinColors.blue,
            tag: pond.name || 'Pond',
          });
        }
      } else {
        list.push({
          id: `alert-inactive-${pond.id}`,
          title: 'Pond Inactive',
          message: `${pond.name || 'Pond'} is currently idle. Ready for pond prep or restocking.`,
          icon: 'pause-circle-outline',
          toneBg: aquapinColors.surfaceMuted,
          toneFg: aquapinColors.textMuted,
          tag: pond.name || 'Pond',
        });
      }
    });

    // 2. Recent pond activity updates
    overview.recentActivities.slice(0, 4).forEach((act) => {
      let icon = 'notifications-outline';
      let toneBg = aquapinColors.blueSoft;
      let toneFg = aquapinColors.blue;
      let title = act.title;

      if (act.type === 'harvest') {
        icon = 'basket-outline';
        toneBg = aquapinColors.blueSoft;
        toneFg = aquapinColors.blue;
        title = 'Harvest Activity';
      } else if (act.type === 'stocking') {
        icon = 'add-circle-outline';
        toneBg = aquapinColors.greenSoft;
        toneFg = aquapinColors.green;
        title = 'Stocking Activity';
      } else if (act.type === 'mortality') {
        icon = 'warning-outline';
        toneBg = aquapinColors.redSoft;
        toneFg = aquapinColors.red;
        title = 'Mortality Logged';
      }

      list.push({
        id: `act-${act.id}`,
        title,
        message: `${act.subtitle}: ${act.amount}`,
        icon,
        toneBg,
        toneFg,
        time: formatRelativeTime(act.createdAt),
        tag: 'Activity',
      });
    });

    // 3. System readiness notice
    list.push({
      id: 'system-ready',
      title: 'Background Sync Active',
      message: 'Automatic data synchronization is working silently in the background.',
      icon: 'shield-checkmark-outline',
      toneBg: aquapinColors.greenSoft,
      toneFg: aquapinColors.green,
      tag: 'System',
    });

    return list;
  }, [ponds, overview.recentActivities]);

  const alertCount = useMemo(
    () => userNotifications.filter((n) => n.toneFg === aquapinColors.red || n.toneFg === aquapinColors.amber).length,
    [userNotifications]
  );

  const topActivity = overview.recentActivities[0];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* User Notifications Modal (reserved for alerts, updates, activity reminders) */}
      <Modal
        visible={notificationsOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setNotificationsOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <View style={styles.modalIconBadge}>
                  <Ionicons name="notifications" size={18} color={aquapinColors.blue} />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Notifications</Text>
                  <Text style={styles.modalSubtitle}>Pond alerts, updates & activity reminders</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setNotificationsOpen(false)}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={18} color={aquapinColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.notificationList}
              showsVerticalScrollIndicator={false}
            >
              {userNotifications.length > 0 ? (
                userNotifications.map((notification, idx) => (
                  <View key={notification.id || `notif-${idx}`} style={styles.notificationCard}>
                    <View style={[styles.notificationIconWrap, { backgroundColor: notification.toneBg }]}>
                      <Ionicons name={notification.icon as any} size={20} color={notification.toneFg} />
                    </View>
                    <View style={styles.notificationCopy}>
                      <View style={styles.notificationHeader}>
                        <Text style={styles.notificationItemTitle}>{notification.title}</Text>
                        {notification.time ? (
                          <Text style={styles.notificationTime}>{notification.time}</Text>
                        ) : null}
                      </View>
                      <Text style={styles.notificationMessage}>{notification.message}</Text>
                      {notification.tag ? (
                        <View style={styles.notificationTagPill}>
                          <Text style={styles.notificationTagText}>{notification.tag}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyNotificationCard}>
                  <Ionicons name="checkmark-done-circle-outline" size={48} color={aquapinColors.green} />
                  <Text style={styles.emptyNotificationTitle}>All caught up!</Text>
                  <Text style={styles.emptyNotificationSubtitle}>No active pond alerts or pending reminders right now.</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        scrollEnabled={scrollEnabled}
      >
        <View style={styles.headerRow}>
          {/* AI Assistant (Top Left) - Sparkling icon and recognizable label */}
          <View style={styles.aiEntryWrap}>
            <Animated.View style={{ transform: [{ scale: aiButtonScale }] }}>
              <TouchableOpacity
                style={styles.aiButton}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="AI Assistant"
                onPress={() => openStackScreen('AiAssistant')}
              >
                <View style={styles.aiIconBadge}>
                  <Ionicons name="sparkles" size={14} color="#ffffff" />
                </View>
                <Text style={styles.aiButtonLabel}>AI Assistant</Text>
              </TouchableOpacity>
            </Animated.View>
            {showAiIntro ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.aiIntroBubble,
                  {
                    opacity: aiBubbleOpacity,
                    transform: [{ scale: aiBubbleScale }],
                  },
                ]}
              >
                <View style={styles.aiTooltipContent}>
                  <Ionicons name="sparkles" size={12} color={aquapinColors.blue} />
                  <Text style={styles.aiIntroText}>AI Assistant • Smart pond insights</Text>
                </View>
              </Animated.View>
            ) : null}
          </View>
          <View style={styles.brandBlock}>
            <Text style={styles.brandTitle}>
              Aqua<Text style={styles.brandTitleAccent}>pin</Text>
            </Text>
            <Text style={styles.brandSubtitle}>Aquapin Version 2.0</Text>
          </View>
          {/* Top-Right Notification Icon - User alerts & activity reminders */}
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setNotificationsOpen(true)}
            activeOpacity={0.88}
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={22} color={aquapinColors.text} />
            {alertCount > 0 ? (
              <View style={styles.notificationDot} />
            ) : null}
          </TouchableOpacity>
        </View>

        <View style={styles.mapCard}>
          <View style={styles.sectionHeadRow}>
            <Text style={styles.sectionTitle}>Pond Map</Text>
            <TouchableOpacity onPress={() => openStackScreen('PondMap', { requestKey: Date.now(), initialMode: 'view' })}>
              <Text style={styles.linkText}>View All</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.mapCanvas}>
            <LeafletMapView
              initialRegion={initialRegion}
              mappedPonds={ponds.map((pond: any) => {
                const center = parseLocation(pond.location);
                if (!center) return null;
                let boundary: any[] = [];
                if (pond.boundary) {
                  try { boundary = JSON.parse(pond.boundary); } catch (e) {}
                }
                return {
                  id: String(pond.id),
                  name: pond.name || '',
                  location: pond.location || '',
                  center,
                  boundary: Array.isArray(boundary) ? boundary : [],
                  isActive: Boolean(pond.isActive),
                };
              }).filter((p): p is MappedPond => Boolean(p))}
              tileSource="osm"
              style={styles.map}
            />

            <View style={styles.mapInfoCard} pointerEvents="none">
              <Text style={styles.mapInfoTitle}>{topActivity?.pondName || overview.pondPreview[0]?.name || 'Pond 01'}</Text>
              <Text style={styles.mapInfoLine}>GPS Pond Map Active</Text>
              <Text style={styles.mapInfoLine}>Stock: {formatWholeNumber(overview.totalStock)}</Text>
              <Text style={styles.mapInfoLine}>Updated: {formatRelativeTime(overview.latestActivityAt)}</Text>
            </View>

            <TouchableOpacity
              style={styles.locateButton}
              onPress={centerOnMyLocation}
            >
              <Ionicons name="locate-outline" size={18} color={aquapinColors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.mapFooter}>
            <View style={styles.dotsRow}>
              {[0, 1, 2, 3].map((dot) => (
                <View key={dot} style={[styles.dot, dot === 0 && styles.dotActive]} />
              ))}
            </View>
            <View style={styles.mapFooterButtons}>
              <TouchableOpacity style={styles.secondaryPill} onPress={() => navigation.navigate('Ponds')}>
                <Ionicons name="layers-outline" size={16} color={aquapinColors.blue} />
                <Text style={styles.secondaryPillText}>Ponds</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryPill}
                onPress={() => openStackScreen('PondMap', { requestKey: Date.now(), initialMode: 'view' })}
              >
                <Ionicons name="navigate-outline" size={16} color="#fff" />
                <Text style={styles.primaryPillText}>Open Map</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionTitle}>Dashboard</Text>
          <Text style={styles.sectionMeta}>This month</Text>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total Ponds</Text>
            <Text style={styles.metricValue}>{formatWholeNumber(overview.totalPonds)}</Text>
            <View style={[styles.metricIconBadge, { backgroundColor: aquapinColors.blueSoft }]}>
              <Ionicons name="layers-outline" size={20} color={aquapinColors.blue} />
            </View>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total Stock</Text>
            <Text style={styles.metricValue}>{formatCompactNumber(overview.totalStock)}</Text>
            <View style={[styles.metricIconBadge, { backgroundColor: aquapinColors.greenSoft }]}>
              <Ionicons name="fish-outline" size={20} color={aquapinColors.green} />
            </View>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Survival Rate</Text>
            <Text style={styles.metricValue}>{formatPercent(overview.survivalRate)}</Text>
            <View style={[styles.metricIconBadge, { backgroundColor: aquapinColors.blueSoft }]}>
              <Ionicons name="pie-chart-outline" size={20} color={aquapinColors.blue} />
            </View>
          </View>
        </View>

        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <Text style={styles.sectionMeta}>{lastSync ? formatRelativeTime(lastSync.getTime()) : 'Waiting for sync'}</Text>
        </View>

        <View style={styles.analyticsRow}>
          <View style={[styles.analyticsCard, { borderColor: aquapinColors.greenSoft }]}>
            <Text style={styles.analyticsLabel}>Revenue Analytics</Text>
            <Text style={[styles.analyticsValue, { color: aquapinColors.green }]}>{formatCurrencyPhp(overview.estimatedRevenue)}</Text>
            <Text style={styles.analyticsSub}>Harvest value from recorded yields</Text>
          </View>
          <View style={[styles.analyticsCard, { borderColor: aquapinColors.amberSoft }]}>
            <Text style={styles.analyticsLabel}>Sync Queue</Text>
            <Text style={[styles.analyticsValue, { color: aquapinColors.amber }]}>{formatWholeNumber(queueSnapshot.pending)}</Text>
            <Text style={styles.analyticsSub}>Pending offline operations</Text>
          </View>
        </View>


        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionTitle}>Recent Activities</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Records')}>
            <Text style={styles.linkText}>View All</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.activityList}>
          {overview.recentActivities.slice(0, 4).map((activity) => {
            const tone = getActivityTone(activity.type);

            return (
              <TouchableOpacity
                key={`${activity.type}-${activity.id}`}
                style={styles.activityCard}
                activeOpacity={0.9}
                onPress={() => navigation.navigate('Records')}
              >
                <View style={[styles.activityIcon, { backgroundColor: tone.bg }]}>
                  <Ionicons name={tone.icon} size={18} color={tone.fg} />
                </View>
                <View style={styles.activityCopy}>
                  <Text style={styles.activityTitle}>{activity.title}</Text>
                  <Text style={styles.activitySubtitle}>{activity.subtitle}</Text>
                </View>
                <View style={styles.activityMeta}>
                  <Text style={styles.activityAmount}>{activity.amount}</Text>
                  <Text style={styles.activityTime}>{formatRelativeTime(activity.createdAt)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {overview.recentActivities.length === 0 && !overview.loading ? (
            <View style={styles.emptyState}>
              <Ionicons name="sparkles-outline" size={24} color={aquapinColors.textMuted} />
              <Text style={styles.emptyStateTitle}>No recent farm activity yet</Text>
              <Text style={styles.emptyStateText}>Use the center action button to create your first stocking, mortality, or harvest record.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: aquapinColors.background,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 140,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    zIndex: 20,
  },
  aiEntryWrap: {
    position: 'relative',
    zIndex: 20,
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: aquapinColors.surface,
    paddingLeft: 6,
    paddingRight: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.2,
    borderColor: 'rgba(30, 90, 167, 0.22)',
    shadowColor: '#16335c',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    gap: 6,
  },
  aiIconBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: aquapinColors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiButtonLabel: {
    color: aquapinColors.blue,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: aquapinColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: aquapinColors.border,
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: aquapinColors.red,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  aiIntroBubble: {
    position: 'absolute',
    top: 44,
    left: 0,
    borderRadius: 14,
    backgroundColor: aquapinColors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(30, 90, 167, 0.2)',
    shadowColor: '#16335c',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    minWidth: 180,
  },
  aiTooltipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiIntroText: {
    color: aquapinColors.text,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(8, 18, 32, 0.38)',
  },
  modalContent: {
    backgroundColor: aquapinColors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '80%',
    minHeight: '40%',
  },
  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: aquapinColors.border,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#edf3f8',
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: aquapinColors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    color: aquapinColors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  modalSubtitle: {
    color: aquapinColors.textMuted,
    fontSize: 11.5,
    marginTop: 2,
  },
  modalClose: {
    width: 34,
    height: 34,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: aquapinColors.surfaceMuted,
  },
  notificationList: {
    padding: 16,
    gap: 10,
    paddingBottom: 32,
  },
  notificationCard: {
    flexDirection: 'row',
    backgroundColor: aquapinColors.surfaceMuted,
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: '#e2ebf4',
    padding: 14,
    gap: 12,
    alignItems: 'flex-start',
  },
  notificationIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationCopy: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  notificationItemTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: aquapinColors.text,
  },
  notificationTime: {
    fontSize: 11,
    color: aquapinColors.textMuted,
    fontWeight: '600',
  },
  notificationMessage: {
    fontSize: 12,
    color: aquapinColors.textMuted,
    lineHeight: 17,
  },
  notificationTagPill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0eaf3',
  },
  notificationTagText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: aquapinColors.text,
  },
  emptyNotificationCard: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyNotificationTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: aquapinColors.text,
  },
  emptyNotificationSubtitle: {
    fontSize: 12.5,
    color: aquapinColors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  brandBlock: {
    alignItems: 'center',
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: aquapinColors.blue,
  },
  brandTitleAccent: {
    color: aquapinColors.green,
  },
  brandSubtitle: {
    fontSize: 12,
    color: aquapinColors.textMuted,
    marginTop: 2,
  },
  mapCard: {
    backgroundColor: aquapinColors.surface,
    borderRadius: 28,
    padding: 18,
    marginBottom: 20,
    shadowColor: '#18355d',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: aquapinColors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  sectionMeta: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  linkText: {
    color: aquapinColors.blue,
    fontSize: 13,
    fontWeight: '700',
  },
  mapCanvas: {
    height: 210,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#dcefd7',
    position: 'relative',
    marginBottom: 14,
  },
  mapGridOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  gridLineHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  gridLineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  markerWrap: {
    position: 'absolute',
  },
  markerDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  markerDotBlue: {
    backgroundColor: '#2d8cf0',
  },
  markerDotGreen: {
    backgroundColor: aquapinColors.green,
  },
  mapInfoCard: {
    position: 'absolute',
    right: 14,
    top: 18,
    width: 150,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.96)',
    padding: 12,
  },
  mapInfoTitle: {
    color: aquapinColors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  mapInfoLine: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  locateButton: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#d0d9e8',
  },
  dotActive: {
    backgroundColor: aquapinColors.blue,
    width: 18,
  },
  mapFooterButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: aquapinColors.blueSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryPillText: {
    color: aquapinColors.blue,
    fontWeight: '700',
  },
  primaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: aquapinColors.green,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryPillText: {
    color: '#fff',
    fontWeight: '700',
  },
  metricRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  metricCard: {
    flex: 1,
    backgroundColor: aquapinColors.surface,
    borderRadius: 24,
    padding: 14,
    minHeight: 126,
    justifyContent: 'space-between',
  },
  metricLabel: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  metricValue: {
    color: aquapinColors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  metricIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyticsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  analyticsCard: {
    flex: 1,
    backgroundColor: aquapinColors.surface,
    borderRadius: 24,
    borderWidth: 1,
    padding: 14,
  },
  analyticsLabel: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  analyticsValue: {
    fontSize: 24,
    fontWeight: '900',
    marginTop: 10,
  },
  analyticsSub: {
    color: aquapinColors.textMuted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 8,
  },

  activityList: {
    gap: 12,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: aquapinColors.surface,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityCopy: {
    flex: 1,
  },
  activityTitle: {
    color: aquapinColors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  activitySubtitle: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  activityMeta: {
    alignItems: 'flex-end',
  },
  activityAmount: {
    color: aquapinColors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  activityTime: {
    color: aquapinColors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  emptyState: {
    backgroundColor: aquapinColors.surface,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 22,
    alignItems: 'center',
  },
  emptyStateTitle: {
    color: aquapinColors.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 12,
  },
  emptyStateText: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
});
