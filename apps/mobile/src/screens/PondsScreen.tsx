import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import PondActivities from '../components/PondActivities';
import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePondHistory, usePonds, useUpdatePond } from '../hooks/useOfflineData';

type PondFilter = 'all' | 'active' | 'inactive';

interface ParsedLocation {
  latitude: number;
  longitude: number;
}

interface PondAlert {
  level: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
}

interface PondAlertSettings {
  mortalitySpike: boolean;
  harvestDue: boolean;
  inactivity: boolean;
}

type PondsViewMode = 'list' | 'clusters';

interface PondCluster {
  id: string;
  center: ParsedLocation;
  pondCount: number;
  activeCount: number;
  inactiveCount: number;
}

interface PondKpis {
  totalStocked: number;
  totalMortality: number;
  totalHarvestKg: number;
  mortality7d: number;
  mortalityPrev7d: number;
  survivalRate: number | null;
  fcrEstimate: number | null;
  projectedHarvestDate: Date | null;
  projectedHarvestValue: number | null;
}

const PROFILE_POND_ALERTS_KEY = '@aquapin_profile_pond_alerts';
const DEFAULT_POND_ALERT_SETTINGS: PondAlertSettings = {
  mortalitySpike: true,
  harvestDue: true,
  inactivity: true,
};

function parseLocation(location: string): ParsedLocation | null {
  const parts = location.split(',').map((value) => parseFloat(value.trim()));
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
    return null;
  }

  return {
    latitude: parts[0],
    longitude: parts[1],
  };
}

function formatDate(value: unknown): string {
  if (!value) return 'Unknown';
  const parsed = typeof value === 'number' ? new Date(value) : new Date(value as any);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return parsed.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getTimestamp(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  const time = new Date(value as any).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function parseEventData(eventData: unknown): any {
  if (typeof eventData !== 'string') return {};
  try {
    return JSON.parse(eventData);
  } catch (_error) {
    return {};
  }
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function calculateDistanceKm(a: ParsedLocation, b: ParsedLocation): number {
  const R = 6371;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function formatDistance(distanceKm: number): string {
  if (!Number.isFinite(distanceKm)) return 'Unknown';
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
  return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km`;
}

function formatCurrencyPhp(value: number): string {
  return `PHP ${Math.round(value).toLocaleString()}`;
}

function getCycleDays(species: string): number {
  const map: Record<string, number> = {
    tilapia: 150,
    'milkfish (bangus)': 165,
    milkfish: 165,
    'catfish (hito)': 130,
    catfish: 130,
    carp: 180,
    'shrimp (sugpo)': 120,
    shrimp: 120,
    seabass: 190,
    grouper: 220,
  };

  return map[(species || '').toLowerCase()] || 150;
}

function getAverageHarvestWeightKg(species: string): number {
  const map: Record<string, number> = {
    tilapia: 0.45,
    'milkfish (bangus)': 0.55,
    milkfish: 0.55,
    'catfish (hito)': 0.6,
    catfish: 0.6,
    carp: 0.8,
    'shrimp (sugpo)': 0.03,
    shrimp: 0.03,
    seabass: 0.9,
    grouper: 1.1,
  };

  return map[(species || '').toLowerCase()] || 0.5;
}

function getPricePerKgPhp(species: string): number {
  const map: Record<string, number> = {
    tilapia: 145,
    'milkfish (bangus)': 180,
    milkfish: 180,
    'catfish (hito)': 165,
    catfish: 165,
    carp: 140,
    'shrimp (sugpo)': 400,
    shrimp: 400,
    seabass: 320,
    grouper: 450,
  };

  return map[(species || '').toLowerCase()] || 160;
}

export default function PondsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const updatePond = useUpdatePond();
  const [editingName, setEditingName] = useState<string | null>(null);
  const [savingPond, setSavingPond] = useState(false);
  const savePondLock = useRef(false);
  const { ponds, loading } = usePonds();
  const [filter, setFilter] = useState<PondFilter>('all');
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<PondsViewMode>('list');
  const [selectedPondId, setSelectedPondId] = useState<string | null>(null);
  useEffect(() => { if (route.params?.pondId) setSelectedPondId(route.params.pondId); }, [route.params?.pondId, route.params?.requestKey]);
  const savePondChanges = async (changes: { name?: string; isActive?: boolean }) => {
    if (!selectedPondId || !user || savePondLock.current) return;
    savePondLock.current = true; setSavingPond(true);
    try { await updatePond(selectedPondId, changes, user.id); setEditingName(null); Alert.alert('Saved', 'Pond changes saved locally and queued for synchronization.'); }
    catch { Alert.alert('Unable to save', 'Please try saving your pond again.'); }
    finally { savePondLock.current = false; setSavingPond(false); }
  };
  const openPondRecords = (type?: string) => {
    setSelectedPondId(null);
    navigation.navigate('RecordsWorkspace', { pondId: selectedPondId, initialType: type, initialSegment: type ? 'log' : 'recent', requestKey: Date.now() });
  };
  useEffect(() => { setEditingName(null); }, [selectedPondId]);
  const [userLocation, setUserLocation] = useState<ParsedLocation | null>(null);
  const [locatingUser, setLocatingUser] = useState(false);
  const [pondAlertSettings, setPondAlertSettings] = useState<Record<string, PondAlertSettings>>({});

  const selectedPond = useMemo(
    () => ponds.find((pond: any) => pond.id === selectedPondId) || null,
    [ponds, selectedPondId]
  );
  const { history: pondHistory, loading: pondHistoryLoading } = usePondHistory(selectedPondId || '');

  useEffect(() => {
    let mounted = true;

    const fetchCurrentLocation = async () => {
      setLocatingUser(true);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const current = await Location.getCurrentPositionAsync({});
        if (!mounted) return;

        setUserLocation({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        });
      } catch (_error) {
        // Ignore location failures; geo features degrade gracefully.
      } finally {
        if (mounted) setLocatingUser(false);
      }
    };

    fetchCurrentLocation();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadAlertSettings = async () => {
      try {
        const raw = await AsyncStorage.getItem(PROFILE_POND_ALERTS_KEY);
        if (!mounted || !raw) return;
        setPondAlertSettings(JSON.parse(raw));
      } catch (_error) {
        // Ignore settings parse errors; defaults will apply.
      }
    };

    loadAlertSettings();

    return () => {
      mounted = false;
    };
  }, []);

  const activeCount = useMemo(() => ponds.filter((pond: any) => pond.isActive).length, [ponds]);
  const inactiveCount = ponds.length - activeCount;

  const filteredPonds = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    const base = ponds.filter((pond: any) => {
      if (filter === 'active' && !pond.isActive) return false;
      if (filter === 'inactive' && pond.isActive) return false;

      if (!normalized) return true;

      const name = (pond.name || '').toLowerCase();
      const species = (pond.currentSpecies || '').toLowerCase();
      return name.includes(normalized) || species.includes(normalized);
    });

    return [...base].sort((a: any, b: any) => {
      const aTime = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt).getTime();
      const bTime = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt).getTime();
      return (bTime || 0) - (aTime || 0);
    });
  }, [filter, ponds, query]);

  const nearestPond = useMemo(() => {
    if (!userLocation || ponds.length === 0) return null;

    let nearest: { pond: any; distanceKm: number } | null = null;

    for (const pond of ponds as any[]) {
      const coords = parseLocation(pond.location || '');
      if (!coords) continue;

      const distanceKm = calculateDistanceKm(userLocation, coords);
      if (!nearest || distanceKm < nearest.distanceKm) {
        nearest = { pond, distanceKm };
      }
    }

    return nearest;
  }, [ponds, userLocation]);

  const clusters = useMemo((): PondCluster[] => {
    const clusterMap = new Map<string, PondCluster>();

    filteredPonds.forEach((pond: any) => {
      const coords = parseLocation(pond.location || '');
      if (!coords) return;

      // ~2km grid clusters
      const latBucket = Math.round(coords.latitude * 50) / 50;
      const lngBucket = Math.round(coords.longitude * 50) / 50;
      const id = `${latBucket.toFixed(2)},${lngBucket.toFixed(2)}`;

      const existing = clusterMap.get(id);
      if (existing) {
        existing.pondCount += 1;
        if (pond.isActive) existing.activeCount += 1;
        else existing.inactiveCount += 1;
      } else {
        clusterMap.set(id, {
          id,
          center: { latitude: latBucket, longitude: lngBucket },
          pondCount: 1,
          activeCount: pond.isActive ? 1 : 0,
          inactiveCount: pond.isActive ? 0 : 1,
        });
      }
    });

    return Array.from(clusterMap.values()).sort((a, b) => b.pondCount - a.pondCount);
  }, [filteredPonds]);

  const selectedPondCoords = useMemo(() => {
    if (!selectedPond) return null;
    return parseLocation((selectedPond as any).location || '');
  }, [selectedPond]);

  const selectedPondAlertSettings = useMemo<PondAlertSettings>(() => {
    if (!selectedPond) return DEFAULT_POND_ALERT_SETTINGS;
    return pondAlertSettings[selectedPond.id] || DEFAULT_POND_ALERT_SETTINGS;
  }, [pondAlertSettings, selectedPond]);

  const renderPondItem = ({ item }: { item: any }) => {
    const coords = parseLocation(item.location || '');
    const hasBoundary = Boolean(item.boundary);

    return (
      <TouchableOpacity style={styles.pondCard} onPress={() => setSelectedPondId(item.id)} activeOpacity={0.85}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="water-outline" size={18} color="#007bff" />
            <Text style={styles.pondName}>{item.name || 'Unnamed Pond'}</Text>
          </View>
          <View style={[styles.statusBadge, item.isActive ? styles.statusActive : styles.statusInactive]}>
            <Text style={[styles.statusText, item.isActive ? styles.statusTextActive : styles.statusTextInactive]}>
              {item.isActive ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <Ionicons name="fish-outline" size={15} color="#4b5563" />
          <Text style={styles.metaText}>
            {item.isActive ? item.currentSpecies || 'Species not set' : 'No active fish stock'}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Ionicons name="analytics-outline" size={15} color="#4b5563" />
          <Text style={styles.metaText}>
            {item.currentStockCount ? `${item.currentStockCount.toLocaleString()} fish estimated` : 'Stock count unavailable'}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Ionicons name={hasBoundary ? 'shapes-outline' : 'pin-outline'} size={15} color="#4b5563" />
          <Text style={styles.metaText}>
            {hasBoundary
              ? 'Boundary mapped'
              : coords
                ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`
                : 'Location unavailable'}
          </Text>
        </View>

        <Text style={styles.createdAtText}>Created {formatDate(item.createdAt)}</Text>
      </TouchableOpacity>
    );
  };

  const openNavigation = useCallback(async (target: ParsedLocation) => {
    const destination = `${target.latitude},${target.longitude}`;
    const androidUrl = `google.navigation:q=${destination}`;
    const iosUrl = `http://maps.apple.com/?daddr=${destination}&dirflg=d`;
    const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;

    const primaryUrl = Platform.OS === 'android' ? androidUrl : iosUrl;
    try {
      const canOpenPrimary = await Linking.canOpenURL(primaryUrl);
      if (canOpenPrimary) {
        await Linking.openURL(primaryUrl);
        return;
      }
      await Linking.openURL(webUrl);
    } catch (_error) {
      await Linking.openURL(webUrl);
    }
  }, []);

  const renderClusterItem = ({ item }: { item: PondCluster }) => (
    <View style={styles.clusterCard}>
      <View style={styles.clusterHeader}>
        <View style={styles.clusterTitleWrap}>
          <Ionicons name="locate-outline" size={17} color="#007bff" />
          <Text style={styles.clusterTitle}>Cluster {item.id}</Text>
        </View>
        <Text style={styles.clusterCount}>{item.pondCount} ponds</Text>
      </View>

      <View style={styles.clusterMetaRow}>
        <Text style={styles.clusterMetaText}>Active: {item.activeCount}</Text>
        <Text style={styles.clusterMetaDivider}>•</Text>
        <Text style={styles.clusterMetaText}>Inactive: {item.inactiveCount}</Text>
      </View>

      <TouchableOpacity style={styles.clusterNavigateBtn} onPress={() => openNavigation(item.center)}>
        <Ionicons name="navigate-outline" size={15} color="#0c4a6e" />
        <Text style={styles.clusterNavigateText}>Navigate to cluster</Text>
      </TouchableOpacity>
    </View>
  );


  const pondKpis = useMemo((): PondKpis | null => {
    if (!selectedPond) return null;

    let totalStocked = 0;
    let totalMortality = 0;
    let totalHarvestKg = 0;
    let totalFeedKg = 0;
    let latestStockingAt = 0;
    let latestStockingSpecies = '';
    const now = Date.now();
    let mortality7d = 0;
    let mortalityPrev7d = 0;

    pondHistory.forEach((event: any) => {
      const data = parseEventData(event.eventData);
      const createdAt = getTimestamp(event.createdAt);

      if (event.eventType === 'stocking') {
        const quantity = Number(data.quantity) || 0;
        totalStocked += quantity;
        if (createdAt > latestStockingAt) {
          latestStockingAt = createdAt;
          latestStockingSpecies = data.species || '';
        }
      } else if (event.eventType === 'mortality') {
        const qty = Number(data.quantity) || 0;
        totalMortality += qty;

        const ageMs = now - createdAt;
        if (createdAt > 0 && ageMs <= 7 * 24 * 60 * 60 * 1000) {
          mortality7d += qty;
        } else if (createdAt > 0 && ageMs <= 14 * 24 * 60 * 60 * 1000) {
          mortalityPrev7d += qty;
        }
      } else if (event.eventType === 'harvest') {
        totalHarvestKg += Number(data.yieldKg) || 0;
      } else if (event.eventType === 'feeding') {
        totalFeedKg += Number(data.quantity) || 0;
      }
    });

    const survivalRate =
      totalStocked > 0 ? Math.max(0, Math.min(100, ((totalStocked - totalMortality) / totalStocked) * 100)) : null;

    const directFcr = totalFeedKg > 0 && totalHarvestKg > 0 ? totalFeedKg / totalHarvestKg : null;
    const mortalityRatio = totalStocked > 0 ? totalMortality / totalStocked : 0;
    const estimatedFcr = directFcr ?? (totalStocked > 0 ? 1.4 + mortalityRatio * 2.5 : null);

    const species = selectedPond.currentSpecies || latestStockingSpecies || '';
    const cycleDays = getCycleDays(species);
    const projectedHarvestDate = latestStockingAt > 0 ? new Date(latestStockingAt + cycleDays * 24 * 60 * 60 * 1000) : null;

    const currentStock = Number(selectedPond.currentStockCount || 0);
    const expectedWeight = getAverageHarvestWeightKg(species);
    const projectedHarvestKg = currentStock > 0 ? currentStock * expectedWeight : 0;
    const projectedHarvestValue = projectedHarvestKg > 0 ? projectedHarvestKg * getPricePerKgPhp(species) : null;

    return {
      totalStocked,
      totalMortality,
      totalHarvestKg,
      mortality7d,
      mortalityPrev7d,
      survivalRate,
      fcrEstimate: estimatedFcr,
      projectedHarvestDate,
      projectedHarvestValue,
    };
  }, [pondHistory, selectedPond]);

  const healthScore = useMemo(() => {
    if (!selectedPond) return null;

    const now = Date.now();
    const latestEventTime = getTimestamp(pondHistory[0]?.createdAt);
    const daysSinceLastEvent = latestEventTime ? Math.floor((now - latestEventTime) / (1000 * 60 * 60 * 24)) : 999;

    let score = 100;

    if (pondKpis?.survivalRate !== null && pondKpis?.survivalRate !== undefined) {
      const mortalityRate = 100 - pondKpis.survivalRate;
      score -= Math.min(35, mortalityRate * 1.1);
    }

    const stockCount = Number(selectedPond.currentStockCount || 0);
    if (selectedPond.isActive && stockCount <= 50) score -= 20;
    else if (selectedPond.isActive && stockCount <= 100) score -= 12;

    if (selectedPond.isActive && daysSinceLastEvent > 7) {
      score -= Math.min(20, (daysSinceLastEvent - 7) * 1.5);
    }

    if (selectedPond.isActive && !selectedPond.currentSpecies) score -= 8;
    if (!selectedPond.isActive && daysSinceLastEvent > 30) score -= 6;

    const latestWaterQuality = pondHistory.find((event: any) => event.eventType === 'water_quality');
    if (latestWaterQuality) {
      const data = parseEventData((latestWaterQuality as any).eventData);
      const ph = Number(data.quantity ?? data.ph ?? 0);
      if (ph > 0 && (ph < 6.5 || ph > 8.5)) {
        score -= 12;
      }
    }

    const normalizedScore = Math.max(20, Math.round(score));

    return {
      value: normalizedScore,
      label: normalizedScore >= 80 ? 'Stable' : normalizedScore >= 60 ? 'Watch' : 'Critical',
      color: normalizedScore >= 80 ? '#15803d' : normalizedScore >= 60 ? '#b45309' : '#b91c1c',
      bgColor: normalizedScore >= 80 ? '#dcfce7' : normalizedScore >= 60 ? '#fef3c7' : '#fee2e2',
    };
  }, [pondHistory, pondKpis, selectedPond]);

  const smartAlerts = useMemo((): PondAlert[] => {
    if (!selectedPond) return [];

    const alerts: PondAlert[] = [];
    const now = Date.now();
    const latestEventTime = getTimestamp(pondHistory[0]?.createdAt);
    const daysSinceLastEvent = latestEventTime ? Math.floor((now - latestEventTime) / (1000 * 60 * 60 * 24)) : null;

    const mortalityLast7Days = pondKpis?.mortality7d || 0;

    const latestStocking = pondHistory.find((event: any) => event.eventType === 'stocking');
    const stockingAgeDays = latestStocking
      ? Math.floor((now - getTimestamp(latestStocking.createdAt)) / (1000 * 60 * 60 * 24))
      : null;

    if (!selectedPond.isActive) {
      alerts.push({
        level: 'info',
        title: 'Pond is inactive',
        message: 'Consider a new stocking cycle when this pond is ready.',
      });
    }

    if (selectedPond.isActive && !selectedPond.currentSpecies) {
      alerts.push({
        level: 'warning',
        title: 'Species not set',
        message: 'Set current species in records for better tracking accuracy.',
      });
    }

    if (selectedPond.isActive && Number(selectedPond.currentStockCount || 0) <= 50) {
      alerts.push({
        level: 'critical',
        title: 'Stock near zero',
        message: 'Estimated stock is very low. Verify pond condition and restocking plan.',
      });
    } else if (selectedPond.isActive && Number(selectedPond.currentStockCount || 0) < 100) {
      alerts.push({
        level: 'warning',
        title: 'Low stock level',
        message: 'Estimated stock is below 100 fish. Check pond status and plan next actions.',
      });
    }

    const mortalityThreshold = Math.max(20, Math.round(Number(selectedPond.currentStockCount || 0) * 0.03));
    if (selectedPondAlertSettings.mortalitySpike && selectedPond.isActive && mortalityLast7Days >= mortalityThreshold) {
      alerts.push({
        level: 'critical',
        title: 'Mortality spike detected',
        message: `${mortalityLast7Days} fish logged in mortality events over the last 7 days.`,
      });
    }

    if (selectedPondAlertSettings.inactivity && selectedPond.isActive && daysSinceLastEvent !== null && daysSinceLastEvent > 7) {
      alerts.push({
        level: 'warning',
        title: 'No recent activity logs',
        message: `No activity recorded for ${daysSinceLastEvent} days.`,
      });
    }

    if (selectedPondAlertSettings.inactivity && !selectedPond.isActive && daysSinceLastEvent !== null && daysSinceLastEvent > 30) {
      alerts.push({
        level: 'warning',
        title: 'Inactive too long',
        message: `Pond has been inactive for ${daysSinceLastEvent} days. Consider maintenance or restocking.`,
      });
    }

    if (selectedPondAlertSettings.harvestDue && selectedPond.isActive && stockingAgeDays !== null && stockingAgeDays > 120) {
      alerts.push({
        level: 'info',
        title: 'Long active cycle',
        message: `Current cycle has been active for about ${stockingAgeDays} days.`,
      });
    }

    if (alerts.length === 0) {
      alerts.push({
        level: 'info',
        title: 'No active alerts',
        message: 'This pond currently looks stable based on recent records.',
      });
    }

    return alerts;
  }, [pondHistory, pondKpis?.mortality7d, selectedPond, selectedPondAlertSettings]);

  const renderAlertCard = (alert: PondAlert, index: number) => (
    <View
      key={`${alert.title}-${index}`}
      style={[
        styles.alertCard,
        alert.level === 'critical'
          ? styles.alertCritical
          : alert.level === 'warning'
            ? styles.alertWarning
            : styles.alertInfo,
      ]}
    >
      <Ionicons
        name={alert.level === 'critical' ? 'alert-circle' : alert.level === 'warning' ? 'warning-outline' : 'information-circle-outline'}
        size={16}
        color={alert.level === 'critical' ? '#7f1d1d' : alert.level === 'warning' ? '#7c2d12' : '#0c4a6e'}
      />
      <View style={styles.alertTextWrap}>
        <Text style={styles.alertTitle}>{alert.title}</Text>
        <Text style={styles.alertMessage}>{alert.message}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <FlatList
        data={viewMode === 'list' ? filteredPonds : clusters}
        keyExtractor={(item: any) => item.id}
        renderItem={viewMode === 'list' ? renderPondItem : (renderClusterItem as any)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Ponds Overview</Text>
                <Text style={styles.subtitle}>Live status of all ponds</Text>
              </View>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>Real-time</Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{ponds.length}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{activeCount}</Text>
                <Text style={styles.statLabel}>Active</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{inactiveCount}</Text>
                <Text style={styles.statLabel}>Inactive</Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{clusters.length}</Text>
                <Text style={styles.statLabel}>Clusters</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {ponds.length > 0 ? Math.round((activeCount / Math.max(ponds.length, 1)) * 100) : 0}%
                </Text>
                <Text style={styles.statLabel}>Active Rate</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {nearestPond ? formatDistance(nearestPond.distanceKm) : locatingUser ? '...' : '--'}
                </Text>
                <Text style={styles.statLabel}>Nearest</Text>
              </View>
            </View>

            {nearestPond && (
              <View style={styles.nearestCard}>
                <View style={styles.nearestInfo}>
                  <Ionicons name="navigate-circle-outline" size={18} color="#0369a1" />
                  <Text style={styles.nearestText}>
                    Nearest pond: {nearestPond.pond.name} ({formatDistance(nearestPond.distanceKm)})
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.nearestAction}
                  onPress={() => {
                    const coords = parseLocation(nearestPond.pond.location || '');
                    if (coords) openNavigation(coords);
                  }}
                >
                  <Text style={styles.nearestActionText}>Navigate</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.searchContainer}>
              <Ionicons name="search" size={18} color="#6b7280" />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search pond or species"
                placeholderTextColor="#9ca3af"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')}>
                  <Ionicons name="close-circle" size={18} color="#9ca3af" />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.filterRow}>
              {(['all', 'active', 'inactive'] as PondFilter[]).map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.filterChip, filter === value && styles.filterChipActive]}
                  onPress={() => setFilter(value)}
                >
                  <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>
                    {value === 'all' ? 'All' : value === 'active' ? 'Active' : 'Inactive'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.viewModeRow}>
              <TouchableOpacity
                style={[styles.viewModeChip, viewMode === 'list' && styles.viewModeChipActive]}
                onPress={() => setViewMode('list')}
              >
                <Ionicons name="list-outline" size={14} color={viewMode === 'list' ? '#007bff' : '#6b7280'} />
                <Text style={[styles.viewModeText, viewMode === 'list' && styles.viewModeTextActive]}>List View</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.viewModeChip, viewMode === 'clusters' && styles.viewModeChipActive]}
                onPress={() => setViewMode('clusters')}
              >
                <Ionicons name="git-network-outline" size={14} color={viewMode === 'clusters' ? '#007bff' : '#6b7280'} />
                <Text style={[styles.viewModeText, viewMode === 'clusters' && styles.viewModeTextActive]}>Cluster View</Text>
              </TouchableOpacity>
            </View>

            {loading && (
              <View style={styles.loadingRow}>
                <Text style={styles.loadingText}>Loading ponds...</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <Ionicons name="water-outline" size={42} color="#9ca3af" />
              <Text style={styles.emptyTitle}>No ponds found</Text>
              <Text style={styles.emptySubtitle}>
                {viewMode === 'list'
                  ? 'Add ponds from the Map tab, then they will appear here with live status.'
                  : 'No location clusters available for the selected filters.'}
              </Text>
            </View>
          ) : null
        }
      />

      <Modal visible={Boolean(selectedPond)} transparent animationType="fade" onRequestClose={() => setSelectedPondId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedPond?.name || 'Pond Details'}</Text>
              <TouchableOpacity onPress={() => setSelectedPondId(null)}>
                <Ionicons name="close" size={22} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <TouchableOpacity style={{ padding: 12, backgroundColor: '#e3f2fd', borderRadius: 12 }} onPress={() => setEditingName(selectedPond?.name || '')}><Text>Edit Pond</Text></TouchableOpacity>
                <TouchableOpacity style={{ padding: 12, backgroundColor: '#e3f2fd', borderRadius: 12 }} onPress={() => { const id = selectedPondId; setSelectedPondId(null); navigation.navigate('PondMap', { pondId: id, requestKey: Date.now() }); }}><Text>View Map / Edit Mapping</Text></TouchableOpacity>
                {['stocking', 'mortality', 'harvest'].map(type => <TouchableOpacity key={type} style={{ padding: 12, backgroundColor: '#e3f2fd', borderRadius: 12 }} onPress={() => openPondRecords(type)}><Text>Add {type[0].toUpperCase() + type.slice(1)}</Text></TouchableOpacity>)}
                <TouchableOpacity style={{ padding: 12 }} onPress={() => openPondRecords()}><Text>View Records</Text></TouchableOpacity>

              </View>
              {editingName !== null && <View style={{ gap: 8, marginBottom: 16 }}>
                <TextInput accessibilityLabel="Pond name" value={editingName} onChangeText={setEditingName} editable={!savingPond} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 12 }} />
                <TouchableOpacity style={{ padding: 12 }} disabled={savingPond || !editingName.trim() || editingName.trim() === selectedPond?.name} onPress={() => savePondChanges({ name: editingName.trim() })}><Text>{savingPond ? 'Saving...' : 'Save Changes'}</Text></TouchableOpacity>
                <TouchableOpacity style={{ padding: 12 }} disabled={savingPond} onPress={() => setEditingName(null)}><Text>Cancel</Text></TouchableOpacity>
              </View>}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Status</Text>
                <Text style={styles.detailValue}>{selectedPond?.isActive ? 'Active' : 'Inactive'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Current Species</Text>
                <Text style={styles.detailValue}>{selectedPond?.currentSpecies || 'Not set'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Estimated Stock</Text>
                <Text style={styles.detailValue}>
                  {selectedPond?.currentStockCount ? `${selectedPond.currentStockCount.toLocaleString()} fish` : 'Unknown'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Boundary</Text>
                <Text style={styles.detailValue}>{selectedPond?.boundary ? 'Mapped' : 'Point only'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Created</Text>
                <Text style={styles.detailValue}>{formatDate(selectedPond?.createdAt)}</Text>
              </View>

              {selectedPondCoords && (
                <TouchableOpacity style={styles.navigateButton} onPress={() => openNavigation(selectedPondCoords)}>
                  <Ionicons name="navigate" size={16} color="#0c4a6e" />
                  <Text style={styles.navigateButtonText}>Navigate to Pond</Text>
                </TouchableOpacity>
              )}

              {healthScore && (
                <>
                  <Text style={styles.sectionHeading}>Health Score</Text>
                  <View style={[styles.healthCard, { backgroundColor: healthScore.bgColor }]}>
                    <View style={styles.healthScoreWrap}>
                      <Text style={[styles.healthScoreValue, { color: healthScore.color }]}>{healthScore.value}</Text>
                      <Text style={[styles.healthScoreLabel, { color: healthScore.color }]}>{healthScore.label}</Text>
                    </View>
                    <Text style={styles.healthHint}>
                      Based on survival trend, stock level, and recent activity logs.
                    </Text>
                  </View>
                </>
              )}

              {pondKpis && (
                <>
                  <Text style={styles.sectionHeading}>Pond KPIs</Text>
                  <View style={styles.kpiGrid}>
                    <View style={styles.kpiCard}>
                      <Text style={styles.kpiLabel}>Survival</Text>
                      <Text style={styles.kpiValue}>
                        {pondKpis.survivalRate !== null ? `${pondKpis.survivalRate.toFixed(1)}%` : '--'}
                      </Text>
                    </View>
                    <View style={styles.kpiCard}>
                      <Text style={styles.kpiLabel}>FCR Est.</Text>
                      <Text style={styles.kpiValue}>
                        {pondKpis.fcrEstimate !== null ? pondKpis.fcrEstimate.toFixed(2) : '--'}
                      </Text>
                    </View>
                    <View style={styles.kpiCard}>
                      <Text style={styles.kpiLabel}>Harvest ETA</Text>
                      <Text style={styles.kpiValue}>
                        {pondKpis.projectedHarvestDate ? formatDate(pondKpis.projectedHarvestDate) : '--'}
                      </Text>
                    </View>
                    <View style={styles.kpiCard}>
                      <Text style={styles.kpiLabel}>Projected Value</Text>
                      <Text style={styles.kpiValue}>
                        {pondKpis.projectedHarvestValue ? formatCurrencyPhp(pondKpis.projectedHarvestValue) : '--'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.trendCard}>
                    <Text style={styles.trendTitle}>Mortality Trend (7d)</Text>
                    <Text style={styles.trendValue}>
                      {pondKpis.mortality7d} fish vs {pondKpis.mortalityPrev7d} fish (previous 7d)
                    </Text>
                  </View>
                </>
              )}

              <Text style={styles.sectionHeading}>Smart Alerts</Text>
              {smartAlerts.map(renderAlertCard)}

              {selectedPond && <PondActivities key={selectedPond.id} pondId={selectedPond.id} name={selectedPond.name} history={pondHistory} />}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e0f2fe',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16a34a',
  },
  liveText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0c4a6e',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#007bff',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  nearestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ecfeff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 8,
  },
  nearestInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 7,
  },
  nearestText: {
    flex: 1,
    fontSize: 12,
    color: '#0c4a6e',
    fontWeight: '600',
  },
  nearestAction: {
    backgroundColor: '#0369a1',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  nearestActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: '#111827',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  filterChipActive: {
    borderColor: '#007bff',
    backgroundColor: '#e3f2fd',
  },
  filterText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#007bff',
  },
  viewModeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  viewModeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  viewModeChipActive: {
    borderColor: '#007bff',
    backgroundColor: '#e3f2fd',
  },
  viewModeText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '700',
  },
  viewModeTextActive: {
    color: '#007bff',
  },
  loadingRow: {
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#6b7280',
  },
  pondCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  pondName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusActive: {
    backgroundColor: '#dcfce7',
  },
  statusInactive: {
    backgroundColor: '#f3f4f6',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusTextActive: {
    color: '#166534',
  },
  statusTextInactive: {
    color: '#4b5563',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  metaText: {
    fontSize: 13,
    color: '#374151',
    flex: 1,
  },
  createdAtText: {
    marginTop: 2,
    fontSize: 12,
    color: '#9ca3af',
  },
  clusterCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbeafe',
    padding: 14,
  },
  clusterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  clusterTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  clusterTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  clusterCount: {
    fontSize: 12,
    color: '#0369a1',
    fontWeight: '700',
  },
  clusterMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
  },
  clusterMetaText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  clusterMetaDivider: {
    marginHorizontal: 6,
    color: '#94a3b8',
  },
  clusterNavigateBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0f9ff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  clusterNavigateText: {
    fontSize: 12,
    color: '#0c4a6e',
    fontWeight: '700',
  },
  emptyState: {
    marginTop: 28,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    maxHeight: '82%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    marginRight: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  detailLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  detailValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
    maxWidth: '65%',
    textAlign: 'right',
  },
  navigateButton: {
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  navigateButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0c4a6e',
  },
  sectionHeading: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#4b5563',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  healthCard: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
  },
  healthScoreWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  healthScoreValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  healthScoreLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  healthHint: {
    marginTop: 4,
    fontSize: 12,
    color: '#334155',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  kpiCard: {
    width: '48.5%',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  kpiLabel: {
    fontSize: 11,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  kpiValue: {
    marginTop: 3,
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '700',
  },
  trendCard: {
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 8,
  },
  trendTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  trendValue: {
    marginTop: 4,
    fontSize: 12,
    color: '#475569',
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 7,
  },
  alertCritical: {
    backgroundColor: '#fee2e2',
  },
  alertWarning: {
    backgroundColor: '#ffedd5',
  },
  alertInfo: {
    backgroundColor: '#e0f2fe',
  },
  alertTextWrap: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  alertMessage: {
    marginTop: 2,
    fontSize: 12,
    color: '#374151',
    lineHeight: 17,
  },
  timelineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  timelineLoadingText: {
    fontSize: 13,
    color: '#6b7280',
  },
  emptyTimelineText: {
    fontSize: 13,
    color: '#6b7280',
    paddingBottom: 6,
  },
  timelineList: {
    gap: 7,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  timelineIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  timelineContent: {
    flex: 1,
  },
  timelineTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  timelineSubtitle: {
    marginTop: 1,
    fontSize: 12,
    color: '#6b7280',
  },
  timelineDate: {
    fontSize: 11,
    color: '#9ca3af',
    marginLeft: 8,
  },
});
