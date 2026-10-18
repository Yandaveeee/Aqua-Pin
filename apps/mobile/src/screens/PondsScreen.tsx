import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { usePondHistory, usePonds, useUpdatePond } from '../hooks/useOfflineData';
import {
  aquapinColors,
  aquapinRadius,
  formatCurrencyPhp,
  formatPercent,
  formatWholeNumber,
} from '../theme/aquapin';

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

interface PondKpis {
  totalStocked: number;
  totalMortality: number;
  totalHarvestKg: number;
  survivalRate: number | null;
  projectedHarvestDate: Date | null;
  projectedHarvestValue: number | null;
}

function parseLocation(location: string): ParsedLocation | null {
  const parts = (location || '').split(',').map((value) => parseFloat(value.trim()));
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
    return null;
  }
  return { latitude: parts[0], longitude: parts[1] };
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
  const { ponds, loading } = usePonds();

  const [filter, setFilter] = useState<PondFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedPondId, setSelectedPondId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [savingPond, setSavingPond] = useState(false);
  const savePondLock = useRef(false);

  // Sync route params with selected pond
  useEffect(() => {
    if (route.params?.pondId) {
      setSelectedPondId(route.params.pondId);
    }
  }, [route.params?.pondId, route.params?.requestKey]);

  useEffect(() => {
    setEditingName(null);
  }, [selectedPondId]);

  const selectedPond = useMemo(
    () => (ponds as any[]).find((pond) => pond.id === selectedPondId) || null,
    [ponds, selectedPondId]
  );

  const { history: pondHistory } = usePondHistory(selectedPondId || '');

  const isPondActive = (pond: any) => Boolean(pond?.isActive || Number(pond?.currentStockCount) > 0);
  const activeCount = useMemo(() => (ponds as any[]).filter(isPondActive).length, [ponds]);
  const inactiveCount = ponds.length - activeCount;

  const filteredPonds = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    const base = (ponds as any[]).filter((pond) => {
      if (filter === 'active' && !isPondActive(pond)) return false;
      if (filter === 'inactive' && isPondActive(pond)) return false;

      if (!normalized) return true;

      const name = (pond.name || '').toLowerCase();
      const species = (pond.currentSpecies || '').toLowerCase();
      return name.includes(normalized) || species.includes(normalized);
    });

    return [...base].sort((a, b) => {
      const aTime = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt).getTime();
      const bTime = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt).getTime();
      return (bTime || 0) - (aTime || 0);
    });
  }, [filter, ponds, query]);

  const selectedPondCoords = useMemo(() => {
    if (!selectedPond) return null;
    return parseLocation(selectedPond.location || '');
  }, [selectedPond]);

  const savePondChanges = async (changes: { name?: string }) => {
    if (!selectedPondId || !user || savePondLock.current) return;
    savePondLock.current = true;
    setSavingPond(true);
    try {
      await updatePond(selectedPondId, changes, user.id);
      setEditingName(null);
      Alert.alert('Saved', 'Pond changes saved locally and queued for synchronization.');
    } catch {
      Alert.alert('Unable to save', 'Please try saving your pond again.');
    } finally {
      savePondLock.current = false;
      setSavingPond(false);
    }
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

  const openPondRecords = (type?: string) => {
    const currentId = selectedPondId;
    setSelectedPondId(null);
    navigation.navigate('RecordsWorkspace', {
      pondId: currentId,
      initialType: type,
      initialSegment: type ? 'log' : 'recent',
      requestKey: Date.now(),
    });
  };

  const pondKpis = useMemo((): PondKpis | null => {
    if (!selectedPond) return null;

    let totalStocked = 0;
    let totalMortality = 0;
    let totalHarvestKg = 0;
    let latestStockingAt = 0;
    let latestStockingSpecies = '';

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
        totalMortality += Number(data.quantity) || 0;
      } else if (event.eventType === 'harvest') {
        totalHarvestKg += Number(data.yieldKg) || 0;
      }
    });

    const survivalRate =
      totalStocked > 0 ? Math.max(0, Math.min(100, ((totalStocked - totalMortality) / totalStocked) * 100)) : null;

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
      survivalRate,
      projectedHarvestDate,
      projectedHarvestValue,
    };
  }, [pondHistory, selectedPond]);

  const smartAlerts = useMemo((): PondAlert[] => {
    if (!selectedPond) return [];

    const alerts: PondAlert[] = [];
    const stockCount = Number(selectedPond.currentStockCount || 0);

    if (!selectedPond.isActive) {
      alerts.push({
        level: 'info',
        title: 'Pond is Inactive',
        message: 'This pond is currently inactive. Activate it when beginning a new production cycle.',
      });
    }

    if (selectedPond.isActive && !selectedPond.currentSpecies) {
      alerts.push({
        level: 'warning',
        title: 'Species Not Set',
        message: 'Set species in stocking records for accurate yield and harvest forecasting.',
      });
    }

    if (selectedPond.isActive && stockCount <= 50) {
      alerts.push({
        level: 'critical',
        title: 'Low Stock Level',
        message: `Current estimated stock is ${stockCount} fish. Check pond condition and plan next actions.`,
      });
    }

    return alerts;
  }, [selectedPond]);

  const renderPondItem = ({ item }: { item: any }) => {
    const hasBoundary = Boolean(item.boundary);
    const coords = parseLocation(item.location || '');
    const stock = Number(item.currentStockCount || 0);
    const active = isPondActive(item);

    return (
      <TouchableOpacity
        style={styles.pondCard}
        onPress={() => setSelectedPondId(item.id)}
        activeOpacity={0.88}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <View
              style={[
                styles.pondIconWrap,
                { backgroundColor: active ? aquapinColors.blueSoft : aquapinColors.surfaceMuted },
              ]}
            >
              <Ionicons
                name="water"
                size={18}
                color={active ? aquapinColors.blue : aquapinColors.textMuted}
              />
            </View>
            <View style={styles.titleWrap}>
              <Text style={styles.pondName} numberOfLines={1}>{item.name || 'Unnamed Pond'}</Text>
              <Text style={styles.speciesSubtitle}>{item.currentSpecies || 'Species not set'}</Text>
            </View>
          </View>
          <View
            style={[
              styles.statusBadge,
              active ? styles.statusActive : styles.statusInactive,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: active ? aquapinColors.green : aquapinColors.textMuted },
              ]}
            />
            <Text
              style={[
                styles.statusText,
                active ? styles.statusTextActive : styles.statusTextInactive,
              ]}
            >
              {active ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="fish-outline" size={14} color={aquapinColors.textMuted} />
            <Text style={styles.metaText}>
              {stock > 0 ? `${formatWholeNumber(stock)} fish` : 'No stock'}
            </Text>
          </View>

          <View style={styles.metaItem}>
            <Ionicons
              name={hasBoundary ? 'shapes-outline' : 'pin-outline'}
              size={14}
              color={aquapinColors.textMuted}
            />
            <Text style={styles.metaText}>
              {hasBoundary
                ? 'Polygon mapped'
                : coords
                  ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`
                  : 'Location not set'}
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.createdAtText}>Created {formatDate(item.createdAt)}</Text>
          <View style={styles.viewDetailsButton}>
            <Text style={styles.viewDetailsButtonText}>View Details</Text>
            <Ionicons name="chevron-forward" size={13} color="#ffffff" />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <FlatList
        data={filteredPonds}
        keyExtractor={(item: any) => item.id}
        renderItem={renderPondItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* Header with Back Button */}
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.backButton}
                activeOpacity={0.88}
                onPress={() => navigation.goBack()}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Ionicons name="chevron-back" size={22} color={aquapinColors.text} />
              </TouchableOpacity>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>Pond Management</Text>
              </View>
            </View>

            {/* Stats Summary Row */}
            <View style={styles.statsBanner}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{ponds.length}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: aquapinColors.green }]}>{activeCount}</Text>
                <Text style={styles.statLabel}>Active</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: aquapinColors.textMuted }]}>{inactiveCount}</Text>
                <Text style={styles.statLabel}>Inactive</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: aquapinColors.teal }]}>
                  {formatPercent(ponds.length > 0 ? (activeCount / ponds.length) * 100 : 0)}
                </Text>
                <Text style={styles.statLabel}>Active Rate</Text>
              </View>
            </View>

            {/* Search Input */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={18} color={aquapinColors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search pond by name or species..."
                placeholderTextColor={aquapinColors.textMuted}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')}>
                  <Ionicons name="close-circle" size={18} color={aquapinColors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Filter Chips */}
            <View style={styles.filterRow}>
              {(['all', 'active', 'inactive'] as PondFilter[]).map((value) => {
                const isSelected = filter === value;
                return (
                  <TouchableOpacity
                    key={value}
                    style={[styles.filterChip, isSelected && styles.filterChipActive]}
                    onPress={() => setFilter(value)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.filterText, isSelected && styles.filterTextActive]}>
                      {value === 'all' ? 'All Ponds' : value === 'active' ? 'Active Only' : 'Inactive Only'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {loading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={aquapinColors.blue} />
                <Text style={styles.loadingText}>Loading ponds...</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="water-outline" size={36} color={aquapinColors.blue} />
              </View>
              <Text style={styles.emptyTitle}>No ponds found</Text>
              <Text style={styles.emptySubtitle}>
                {query
                  ? 'No ponds match your search term. Try checking for typos or clear filters.'
                  : 'No ponds registered yet. Add a pond from the Map to start managing your farm.'}
              </Text>
            </View>
          ) : null
        }
      />

      {/* Pond Details Modal */}
      <Modal
        visible={Boolean(selectedPond)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedPondId(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleGroup}>
                <View
                  style={[
                    styles.pondIconWrap,
                    { backgroundColor: selectedPond?.isActive ? aquapinColors.blueSoft : aquapinColors.surfaceMuted },
                  ]}
                >
                  <Ionicons
                    name="water"
                    size={20}
                    color={selectedPond?.isActive ? aquapinColors.blue : aquapinColors.textMuted}
                  />
                </View>
                <View style={styles.modalHeaderCopy}>
                  <Text style={styles.modalTitle}>{selectedPond?.name || 'Pond Details'}</Text>
                  <Text style={styles.modalSubtitle}>
                    {selectedPond?.isActive ? 'Active Pond' : 'Inactive Pond'} · {selectedPond?.currentSpecies || 'No species set'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setSelectedPondId(null)}
                accessibilityRole="button"
                accessibilityLabel="Close pond details"
              >
                <Ionicons name="close" size={20} color={aquapinColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
              {/* Quick Actions Grid */}
              <View style={styles.actionGrid}>
                <TouchableOpacity
                  style={styles.actionPill}
                  activeOpacity={0.88}
                  onPress={() => setEditingName(selectedPond?.name || '')}
                >
                  <Ionicons name="create-outline" size={16} color={aquapinColors.blue} />
                  <Text style={styles.actionPillText}>Edit Name</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionPill}
                  activeOpacity={0.88}
                  onPress={() => {
                    const id = selectedPondId;
                    setSelectedPondId(null);
                    navigation.navigate('PondMap', { pondId: id, requestKey: Date.now() });
                  }}
                >
                  <Ionicons name="map-outline" size={16} color={aquapinColors.teal} />
                  <Text style={styles.actionPillText}>Map / Boundary</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionPill}
                  activeOpacity={0.88}
                  onPress={() => openPondRecords('stocking')}
                >
                  <Ionicons name="add-circle-outline" size={16} color={aquapinColors.green} />
                  <Text style={styles.actionPillText}>Log Stocking</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionPill}
                  activeOpacity={0.88}
                  onPress={() => openPondRecords('harvest')}
                >
                  <Ionicons name="basket-outline" size={16} color={aquapinColors.blue} />
                  <Text style={styles.actionPillText}>Log Harvest</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionPill}
                  activeOpacity={0.88}
                  onPress={() => openPondRecords('mortality')}
                >
                  <Ionicons name="skull-outline" size={16} color={aquapinColors.red} />
                  <Text style={styles.actionPillText}>Log Mortality</Text>
                </TouchableOpacity>
              </View>

              {/* Inline Editing Card */}
              {editingName !== null && (
                <View style={styles.editSection}>
                  <Text style={styles.editSectionTitle}>Rename Pond</Text>
                  <TextInput
                    accessibilityLabel="Pond name"
                    value={editingName}
                    onChangeText={setEditingName}
                    editable={!savingPond}
                    style={styles.editInput}
                    placeholder="Enter pond name"
                    placeholderTextColor={aquapinColors.textMuted}
                  />
                  <View style={styles.editButtonRow}>
                    <TouchableOpacity
                      style={[styles.saveBtn, (!editingName.trim() || savingPond) && styles.btnDisabled]}
                      disabled={savingPond || !editingName.trim() || editingName.trim() === selectedPond?.name}
                      onPress={() => savePondChanges({ name: editingName.trim() })}
                    >
                      <Text style={styles.saveBtnText}>{savingPond ? 'Saving...' : 'Save Name'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      disabled={savingPond}
                      onPress={() => setEditingName(null)}
                    >
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Pond Core Information Card */}
              <View style={styles.infoCard}>
                <Text style={styles.cardSectionHeading}>Pond Information</Text>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <Text
                    style={[
                      styles.detailValue,
                      {
                        color: isPondActive(selectedPond)
                          ? aquapinColors.green
                          : aquapinColors.textMuted,
                      },
                    ]}
                  >
                    {isPondActive(selectedPond) ? 'Active' : 'Inactive'}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Current Species</Text>
                  <Text style={styles.detailValue}>{selectedPond?.currentSpecies || 'Not set'}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Estimated Stock</Text>
                  <Text style={styles.detailValue}>
                    {selectedPond?.currentStockCount
                      ? `${formatWholeNumber(selectedPond.currentStockCount)} fish`
                      : '0 fish'}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Boundary / Mapping</Text>
                  <Text style={styles.detailValue}>
                    {selectedPond?.boundary ? 'Polygon Mapped' : selectedPond?.location ? 'GPS Point Only' : 'Unmapped'}
                  </Text>
                </View>

                <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.detailLabel}>Registered On</Text>
                  <Text style={styles.detailValue}>{formatDate(selectedPond?.createdAt)}</Text>
                </View>

                {selectedPondCoords && (
                  <TouchableOpacity
                    style={styles.navigateButton}
                    onPress={() => openNavigation(selectedPondCoords)}
                    activeOpacity={0.88}
                  >
                    <Ionicons name="navigate-outline" size={16} color={aquapinColors.blue} />
                    <Text style={styles.navigateButtonText}>Navigate to Pond (Maps)</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Pond Key Production Metrics */}
              {pondKpis && (
                <View style={styles.infoCard}>
                  <Text style={styles.cardSectionHeading}>Production Metrics</Text>
                  <View style={styles.kpiGrid}>
                    <View style={styles.kpiCard}>
                      <Text style={styles.kpiLabel}>Total Stocked</Text>
                      <Text style={styles.kpiValue}>{formatWholeNumber(pondKpis.totalStocked)}</Text>
                    </View>
                    <View style={styles.kpiCard}>
                      <Text style={styles.kpiLabel}>Total Harvest</Text>
                      <Text style={styles.kpiValue}>
                        {pondKpis.totalHarvestKg > 0 ? `${formatWholeNumber(pondKpis.totalHarvestKg)} kg` : '--'}
                      </Text>
                    </View>
                    <View style={styles.kpiCard}>
                      <Text style={styles.kpiLabel}>Survival Rate</Text>
                      <Text
                        style={[
                          styles.kpiValue,
                          {
                            color:
                              pondKpis.survivalRate !== null && pondKpis.survivalRate >= 80
                                ? aquapinColors.green
                                : pondKpis.survivalRate !== null && pondKpis.survivalRate < 60
                                  ? aquapinColors.red
                                  : aquapinColors.text,
                          },
                        ]}
                      >
                        {pondKpis.survivalRate !== null ? `${pondKpis.survivalRate.toFixed(1)}%` : '--'}
                      </Text>
                    </View>
                    <View style={styles.kpiCard}>
                      <Text style={styles.kpiLabel}>Harvest ETA</Text>
                      <Text style={styles.kpiValue}>
                        {pondKpis.projectedHarvestDate ? formatDate(pondKpis.projectedHarvestDate) : '--'}
                      </Text>
                    </View>
                    {pondKpis.projectedHarvestValue !== null && pondKpis.projectedHarvestValue > 0 && (
                      <View style={[styles.kpiCard, { width: '100%' }]}>
                        <Text style={styles.kpiLabel}>Projected Harvest Value</Text>
                        <Text style={[styles.kpiValue, { color: aquapinColors.green }]}>
                          {formatCurrencyPhp(pondKpis.projectedHarvestValue)}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Smart Alerts */}
              {smartAlerts.length > 0 && (
                <View style={styles.alertsContainer}>
                  <Text style={styles.cardSectionHeading}>Pond Alerts</Text>
                  {smartAlerts.map((alert, index) => {
                    const isCritical = alert.level === 'critical';
                    const isWarning = alert.level === 'warning';
                    return (
                      <View
                        key={`${alert.title}-${index}`}
                        style={[
                          styles.alertCard,
                          isCritical
                            ? styles.alertCritical
                            : isWarning
                              ? styles.alertWarning
                              : styles.alertInfo,
                        ]}
                      >
                        <Ionicons
                          name={
                            isCritical
                              ? 'alert-circle'
                              : isWarning
                                ? 'warning-outline'
                                : 'information-circle-outline'
                          }
                          size={18}
                          color={
                            isCritical
                              ? aquapinColors.red
                              : isWarning
                                ? aquapinColors.amber
                                : aquapinColors.blue
                          }
                        />
                        <View style={styles.alertTextWrap}>
                          <Text style={styles.alertTitle}>{alert.title}</Text>
                          <Text style={styles.alertMessage}>{alert.message}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
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
    backgroundColor: aquapinColors.background,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 40,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: aquapinColors.surface,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#16335c',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: aquapinColors.green,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: aquapinColors.text,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 13,
    color: aquapinColors.textMuted,
    lineHeight: 19,
    marginTop: 4,
  },
  statsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: aquapinColors.surface,
    borderRadius: aquapinRadius.card,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.92)',
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 14,
    shadowColor: '#16335c',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '900',
    color: aquapinColors.blue,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: aquapinColors.textMuted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statDivider: {
    width: 1,
    height: 26,
    backgroundColor: aquapinColors.border,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: aquapinColors.surface,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 14,
    gap: 8,
    marginBottom: 12,
    shadowColor: '#16335c',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: aquapinColors.text,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: aquapinRadius.pill,
    backgroundColor: aquapinColors.surface,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.92)',
  },
  filterChipActive: {
    backgroundColor: aquapinColors.blueSoft,
    borderColor: aquapinColors.blue,
  },
  filterText: {
    fontSize: 12,
    color: aquapinColors.textMuted,
    fontWeight: '700',
  },
  filterTextActive: {
    color: aquapinColors.blue,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: aquapinColors.textMuted,
  },
  pondCard: {
    backgroundColor: aquapinColors.surface,
    borderRadius: 22,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.92)',
    padding: 16,
    shadowColor: '#16335c',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  pondIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
  },
  pondName: {
    fontSize: 16,
    fontWeight: '800',
    color: aquapinColors.text,
  },
  speciesSubtitle: {
    fontSize: 12,
    color: aquapinColors.textMuted,
    marginTop: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: aquapinRadius.pill,
  },
  statusActive: {
    backgroundColor: aquapinColors.greenSoft,
  },
  statusInactive: {
    backgroundColor: aquapinColors.surfaceMuted,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  statusTextActive: {
    color: aquapinColors.green,
  },
  statusTextInactive: {
    color: aquapinColors.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    color: aquapinColors.textMuted,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: aquapinColors.surfaceMuted,
  },
  createdAtText: {
    fontSize: 11,
    color: aquapinColors.textMuted,
  },
  viewDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: aquapinColors.blue,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: aquapinRadius.pill,
    shadowColor: aquapinColors.blue,
    shadowOpacity: 0.28,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  viewDetailsButtonText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  emptyState: {
    marginTop: 36,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: aquapinColors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: aquapinColors.text,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: aquapinColors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: aquapinColors.background,
    borderTopLeftRadius: aquapinRadius.sheet,
    borderTopRightRadius: aquapinRadius.sheet,
    maxHeight: '90%',
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: aquapinColors.surface,
    borderTopLeftRadius: aquapinRadius.sheet,
    borderTopRightRadius: aquapinRadius.sheet,
    borderBottomWidth: 1,
    borderBottomColor: aquapinColors.border,
  },
  modalTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  modalHeaderCopy: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: aquapinColors.text,
  },
  modalSubtitle: {
    fontSize: 12,
    color: aquapinColors.textMuted,
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: aquapinColors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: {
    padding: 16,
    gap: 14,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: aquapinColors.surface,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: aquapinRadius.pill,
    shadowColor: '#16335c',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  actionPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: aquapinColors.text,
  },
  editSection: {
    backgroundColor: aquapinColors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    gap: 10,
  },
  editSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: aquapinColors.text,
  },
  editInput: {
    borderWidth: 1,
    borderColor: aquapinColors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: aquapinColors.text,
    backgroundColor: aquapinColors.surfaceMuted,
  },
  editButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  saveBtn: {
    backgroundColor: aquapinColors.blue,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: aquapinRadius.pill,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  cancelBtnText: {
    color: aquapinColors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  infoCard: {
    backgroundColor: aquapinColors.surface,
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.92)',
    padding: 16,
    shadowColor: '#16335c',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardSectionHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: aquapinColors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: aquapinColors.surfaceMuted,
  },
  detailLabel: {
    fontSize: 13,
    color: aquapinColors.textMuted,
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 14,
    color: aquapinColors.text,
    fontWeight: '700',
  },
  statusToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navigateButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: aquapinColors.blueSoft,
    borderRadius: aquapinRadius.pill,
    paddingVertical: 10,
  },
  navigateButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: aquapinColors.blue,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kpiCard: {
    width: '48.5%',
    backgroundColor: aquapinColors.surfaceMuted,
    borderRadius: 14,
    padding: 12,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: aquapinColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  kpiValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '900',
    color: aquapinColors.text,
  },
  alertsContainer: {
    gap: 8,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 16,
    padding: 12,
  },
  alertCritical: {
    backgroundColor: aquapinColors.redSoft,
  },
  alertWarning: {
    backgroundColor: aquapinColors.amberSoft,
  },
  alertInfo: {
    backgroundColor: aquapinColors.blueSoft,
  },
  alertTextWrap: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: aquapinColors.text,
  },
  alertMessage: {
    marginTop: 2,
    fontSize: 12,
    color: aquapinColors.textMuted,
    lineHeight: 17,
  },
});
