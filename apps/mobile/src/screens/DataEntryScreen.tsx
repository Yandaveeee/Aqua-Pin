import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  FlatList,
  Keyboard,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  usePonds,
  useCreateMortalityLog,
  useCreateHarvest,
  useCreateStockingLog,
  usePondHistory,
  useStockingLogs,
  useSync,
} from '../hooks/useOfflineData';
import { useAuth } from '../contexts/AuthContext';
import { parsePondSpeciesLabel } from '../db/pondState';
import { aquapinColors, aquapinRadius } from '../theme/aquapin';

const ENTRY_TYPES = [
  { id: 'mortality', label: 'Mortality', icon: 'skull', color: aquapinColors.red, unit: 'fish' },
  { id: 'harvest', label: 'Harvest', icon: 'basket', color: aquapinColors.blue, unit: 'kg' },
  { id: 'stocking', label: 'Stocking', icon: 'add-circle', color: aquapinColors.green, unit: 'fingerlings' },
] as const;

type EntryType = (typeof ENTRY_TYPES)[number]['id'];
type DataSegment = 'log' | 'recent' | 'history' | 'queue';
type DateFilter = 'all' | 'today' | '7d' | '30d';
type QueueStatus = 'queued' | 'synced' | 'failed';
type HistoryStatus = 'active' | 'harvested' | 'logged';
type FilterStatus = QueueStatus | HistoryStatus | 'all';
type ToastType = 'success' | 'error' | 'info';

const FISH_SPECIES = [
  'Tilapia',
  'Milkfish (Bangus)',
  'Catfish (Hito)',
  'Carp',
  'Shrimp (Sugpo)',
  'Seabass (Apahap)',
  'Grouper (Lapu-lapu)',
  'Other',
];

const SEGMENTS: Array<{ id: DataSegment; label: string; icon: string }> = [
  { id: 'log', label: 'Report', icon: 'create-outline' },
  { id: 'recent', label: 'Recent', icon: 'time-outline' },
  { id: 'history', label: 'History', icon: 'library-outline' },
  { id: 'queue', label: 'Queue', icon: 'cloud-upload-outline' },
];

interface ToastState {
  type: ToastType;
  message: string;
}

interface RecentEntry {
  id: string;
  type: EntryType;
  pondId: string;
  pondName: string;
  quantityValue: number;
  unit: string;
  createdAt: number;
  notes?: string;
  species?: string;
  status: QueueStatus;
  revenue?: number;
  pricePerKg?: number;
  isSold?: boolean;
}

interface HistoryRow {
  id: string;
  type: EntryType;
  pondId: string;
  pondName: string;
  title: string;
  subtitle: string;
  createdAt: number;
  status: HistoryStatus;
}

interface CycleOption<T extends string> {
  id: T;
  label: string;
}

const DATE_OPTIONS: CycleOption<DateFilter>[] = [
  { id: 'all', label: 'Any Date' },
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7d' },
  { id: '30d', label: 'Last 30d' },
];

const QUEUE_STATUS_OPTIONS: CycleOption<FilterStatus>[] = [
  { id: 'all', label: 'Any Status' },
  { id: 'queued', label: 'Queued' },
  { id: 'synced', label: 'Synced' },
  { id: 'failed', label: 'Failed' },
];

const HISTORY_STATUS_OPTIONS: CycleOption<FilterStatus>[] = [
  { id: 'all', label: 'Any Status' },
  { id: 'active', label: 'Active' },
  { id: 'harvested', label: 'Harvested' },
  { id: 'logged', label: 'Logged' },
];

const TYPE_FILTER_OPTIONS: CycleOption<EntryType | 'all'>[] = [
  { id: 'all', label: 'All Types' },
  ...ENTRY_TYPES.map((item) => ({ id: item.id, label: item.label })),
];

const HISTORY_TYPE_SET = new Set<string>(ENTRY_TYPES.map((item) => item.id));

function getEntryTypeMeta(type: EntryType | 'all') {
  if (type === 'all') {
    return { label: 'All Types', icon: 'funnel-outline', color: '#6c757d', unit: '' };
  }

  return ENTRY_TYPES.find((item) => item.id === type) || ENTRY_TYPES[0];
}

function formatBadgeDate(value: Date): string {
  return value.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  });
}

function formatEventDate(ts: number): string {
  return new Date(ts).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isMatchingDateFilter(ts: number, filter: DateFilter): boolean {
  if (filter === 'all') return true;

  const now = new Date();
  const eventDate = new Date(ts);

  if (filter === 'today') {
    return eventDate.toDateString() === now.toDateString();
  }

  const days = filter === '7d' ? 7 : 30;
  const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return eventDate >= threshold;
}

function getDateGroupLabel(ts: number): 'Today' | 'Yesterday' | 'Earlier' {
  const now = new Date();
  const eventDate = new Date(ts);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;

  if (eventDate.getTime() >= startOfToday) return 'Today';
  if (eventDate.getTime() >= startOfYesterday) return 'Yesterday';
  return 'Earlier';
}

function parseJsonField(value: unknown): Record<string, any> {
  if (typeof value !== 'string') return {};
  try {
    return JSON.parse(value);
  } catch (_error) {
    return {};
  }
}

function cycleNext<T extends string>(current: T, options: T[]): T {
  const index = options.indexOf(current);
  if (index < 0 || index === options.length - 1) return options[0];
  return options[index + 1];
}

function getUnitLabel(selectedType: EntryType): string {
  switch (selectedType) {
    case 'mortality':
      return 'Number of dead fish';
    case 'harvest':
      return 'Weight harvested (kg)';
    case 'stocking':
      return 'Number of fingerlings';
    default:
      return 'Quantity';
  }
}

function getQuickAddValues(selectedType: EntryType): string[] {
  switch (selectedType) {
    case 'mortality':
      return ['1', '2', '5', '10'];
    case 'harvest':
      return ['10', '25', '50', '100'];
    case 'stocking':
      return ['100', '500', '1000', '5000'];
    default:
      return ['1', '5', '10', '50'];
  }
}

function formatQuantity(value: number, unit: string): string {
  return `${value.toLocaleString()} ${unit}`;
}

type WorkspaceRow =
  | { id: string; kind: 'group'; group: 'Today' | 'Yesterday' | 'Earlier'; count: number }
  | { id: string; kind: 'entry'; entry: RecentEntry }
  | { id: string; kind: 'history'; entry: HistoryRow };

export default function DataEntryScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollViewRef = useRef<FlatList<WorkspaceRow>>(null);
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const isHistoryOnlyMode = route.params?.historyOnly === true;

  const initialTypeParam = route.params?.initialType as EntryType | undefined;
  const initialFilterTypeParam = route.params?.initialFilterType as EntryType | 'all' | undefined;
  const activeModuleType = initialTypeParam || initialFilterTypeParam;
  const isSpecificModule = activeModuleType === 'stocking' || activeModuleType === 'harvest' || activeModuleType === 'mortality';

  const [activeSegment, setActiveSegment] = useState<DataSegment>(() => isHistoryOnlyMode ? 'recent' : SEGMENTS.some(item => item.id === route.params?.initialSegment) ? route.params.initialSegment : 'log');

  const [selectedType, setSelectedType] = useState<EntryType>(() => ENTRY_TYPES.some(item => item.id === initialTypeParam) ? initialTypeParam! : 'stocking');
  const [selectedPondId, setSelectedPondId] = useState<string>('');

  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [species, setSpecies] = useState('');
  const [averageWeight, setAverageWeight] = useState('');
  const [source, setSource] = useState('');
  const [isPartialHarvest, setIsPartialHarvest] = useState(true);
  const [fishCount, setFishCount] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [isSold, setIsSold] = useState(true);

  const parsedHarvestWeight = parseFloat(quantity) || 0;
  const parsedSellingPrice = parseFloat(sellingPrice) || 0;
  const calculatedTotalRevenue = isSold && parsedHarvestWeight > 0 && parsedSellingPrice > 0
    ? parsedHarvestWeight * parsedSellingPrice
    : 0;

  const [loading, setLoading] = useState(false);
  const savingRef = useRef(false);
  const [showPondSelector, setShowPondSelector] = useState(false);
  const [showSpeciesSelector, setShowSpeciesSelector] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recordQuery, setRecordQuery] = useState('');
  const [oldestFirst, setOldestFirst] = useState(false);

  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);

  const [filterPondId, setFilterPondId] = useState<string>('all');
  const [filterType, setFilterType] = useState<EntryType | 'all'>(() => ENTRY_TYPES.some(item => item.id === initialFilterTypeParam) ? initialFilterTypeParam! : 'all');
  const [filterDate, setFilterDate] = useState<DateFilter>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');

  const [collapsedGroups, setCollapsedGroups] = useState<Record<'Today' | 'Yesterday' | 'Earlier', boolean>>({
    Today: true,
    Yesterday: true,
    Earlier: true,
  });

  const [toast, setToast] = useState<ToastState | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (route.params?.pondId) { setSelectedPondId(route.params.pondId); setFilterPondId(route.params.pondId); }
    const initialType = route.params?.initialType as EntryType | undefined;
    const initialSegment = route.params?.initialSegment as DataSegment | undefined;
    const initialFilterType = route.params?.initialFilterType as EntryType | 'all' | undefined;

    if (initialType && ENTRY_TYPES.some((item) => item.id === initialType)) {
      setSelectedType(initialType);
    }

    if (initialSegment && SEGMENTS.some((item) => item.id === initialSegment)) {
      setActiveSegment(initialSegment);
    }

    if (route.params?.historyOnly === true) {
      setActiveSegment('recent');
    }

    if (
      initialFilterType &&
      (initialFilterType === 'all' || ENTRY_TYPES.some((item) => item.id === initialFilterType))
    ) {
      setFilterType(initialFilterType);
    }
  }, [route.params?.pondId, route.params?.historyOnly, route.params?.initialFilterType, route.params?.initialType, route.params?.initialSegment, route.params?.requestKey]);

  const [fieldLayouts, setFieldLayouts] = useState<Record<string, number>>({});

  const { ponds, loading: pondsLoading } = usePonds();
  const { user } = useAuth();
  const createMortalityLog = useCreateMortalityLog();
  const createHarvest = useCreateHarvest();
  const createStockingLog = useCreateStockingLog();
  const { history, loading: historyLoading } = usePondHistory(selectedPondId);
  const { stockings, loading: stockingsLoading } = useStockingLogs(selectedPondId);
  const { isSyncing, pendingChanges, lastSync, performSync } = useSync();

  const selectedPond = useMemo(
    () => ponds.find((item: any) => item.id === selectedPondId),
    [ponds, selectedPondId]
  );

  const currentType = useMemo(() => getEntryTypeMeta(selectedType), [selectedType]);

  const harvestSpeciesOptions = useMemo(() => {
    if (selectedType !== 'harvest') return [] as string[];
    if (!(selectedPond as any)?.isActive) return [] as string[];

    const fromPond = parsePondSpeciesLabel((selectedPond as any)?.currentSpecies);
    if (fromPond.length > 0) {
      return fromPond;
    }

    return Array.from(
      new Set(
        (stockings as any[])
          .filter((item) => String(item?.status || 'active').toLowerCase() !== 'harvested')
          .map((item) => String(item?.species || '').trim())
          .filter(Boolean)
      )
    );
  }, [selectedPond?.isActive, selectedPond?.currentSpecies, selectedType, stockings]);

  const visibleSpeciesOptions = useMemo(() => {
    if (selectedType === 'harvest') {
      return harvestSpeciesOptions;
    }

    return FISH_SPECIES;
  }, [harvestSpeciesOptions, selectedType]);

  const isHarvestSpeciesUnavailable = selectedType === 'harvest' && harvestSpeciesOptions.length === 0;
  const isHarvestSpeciesLocked = selectedType === 'harvest' && harvestSpeciesOptions.length === 1;
  const speciesFieldValue = isHarvestSpeciesLocked ? harvestSpeciesOptions[0] : isHarvestSpeciesUnavailable ? '' : species;
  const speciesPlaceholderText =
    selectedType === 'harvest'
      ? isHarvestSpeciesUnavailable
        ? 'No stocked species to harvest'
        : harvestSpeciesOptions.length > 1
          ? 'Select harvested species'
          : 'Harvest species detected automatically'
      : 'Select species';

  const filteredPonds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (ponds as any[]).filter((pond) => (pond.name || '').toLowerCase().includes(q));
  }, [ponds, searchQuery]);

  const isHistoryBusy = historyLoading || stockingsLoading;

  const queuePendingCount = pendingChanges.entries + pendingChanges.ponds;

  const pondFilterOptions = useMemo(() => ['all', ...(ponds as any[]).map((pond) => pond.id)], [ponds]);

  const statusOptions = useMemo(
    () => (activeSegment === 'history' ? HISTORY_STATUS_OPTIONS : QUEUE_STATUS_OPTIONS),
    [activeSegment]
  );

  const statusCycleValues = useMemo(() => statusOptions.map((item) => item.id), [statusOptions]);

  const showToast = useCallback((type: ToastType, message: string) => {
    setToast({ type, message });

    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }

    toastTimer.current = setTimeout(() => {
      setToast(null);
    }, 2600);
  }, []);

  useEffect(() => {
    setSpecies('');
    setAverageWeight('');
    setSource('');
    setFishCount('');
    setIsPartialHarvest(true);
  }, [selectedType]);

  useEffect(() => {
    if (selectedType !== 'harvest') return;

    if (harvestSpeciesOptions.length === 1) {
      setSpecies((prev) => (prev === harvestSpeciesOptions[0] ? prev : harvestSpeciesOptions[0]));
      return;
    }

    if (harvestSpeciesOptions.length > 1) {
      setSpecies((prev) => (harvestSpeciesOptions.includes(prev) ? prev : ''));
      return;
    }

    setSpecies((prev) => (prev === '' ? prev : ''));
  }, [harvestSpeciesOptions, selectedType]);



  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!lastSync) return;
    if (pendingChanges.entries > 0) return;

    setRecentEntries((prev) =>
      prev.map((entry) => (entry.status === 'queued' ? { ...entry, status: 'synced' } : entry))
    );
  }, [lastSync, pendingChanges.entries]);

  useEffect(() => {
    if (pondsLoading) return;
    if (!pondFilterOptions.includes(filterPondId)) {
      setFilterPondId('all');
    }
  }, [pondFilterOptions, filterPondId, pondsLoading]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
      if (focusTimer.current) {
        clearTimeout(focusTimer.current);
      }
    };
  }, []);

  const registerFieldLayout = useCallback((field: string, y: number) => {
    setFieldLayouts((prev) => {
      if (prev[field] === y) return prev;
      return { ...prev, [field]: y };
    });
  }, []);

  const focusField = useCallback(
    (field: string) => {
      if (activeSegment !== 'log') return;
      const y = fieldLayouts[field];
      if (typeof y !== 'number' && field !== 'notes') return;

      if (focusTimer.current) {
        clearTimeout(focusTimer.current);
      }

      // Wait for keyboard animation, then move focused field into view.
      focusTimer.current = setTimeout(() => {
        const targetY = field === 'notes' ? (fieldLayouts.notes ?? y) : y;
        scrollViewRef.current?.scrollToOffset({
          offset: Math.max(0, (targetY || 0) - 24),
          animated: true,
        });
      }, Platform.OS === 'ios' ? 120 : 180);
    },
    [activeSegment, fieldLayouts]
  );

  const resetFormFields = useCallback(() => {
    setQuantity('');
    setNotes('');
    setSpecies('');
    setAverageWeight('');
    setSource('');
    setFishCount('');
    setIsPartialHarvest(true);
    setSellingPrice('');
    setIsSold(true);
  }, []);

  const submitEntry = useCallback(
    async (mode: 'save' | 'save_add') => {
      if (savingRef.current) return;
      if (!user?.id) {
        showToast('error', 'You must be signed in to save entries.');
        return;
      }

      if (!selectedPondId) {
        showToast('error', 'Select a pond before saving.');
        return;
      }

      if (!quantity.trim()) {
        showToast('error', `Enter ${getUnitLabel(selectedType).toLowerCase()}.`);
        return;
      }

      const normalizedSpecies = species.trim();

      if (selectedType === 'stocking' && !normalizedSpecies) {
        showToast('error', 'Select fish species for stocking.');
        return;
      }

      const pond = (ponds as any[]).find((item) => item.id === selectedPondId);
      if (!pond) {
        showToast('error', 'Selected pond was not found.');
        return;
      }

      if (selectedType === 'harvest' && (!Boolean((pond as any).isActive) || harvestSpeciesOptions.length === 0)) {
        showToast('error', 'This pond has no active stocked species to harvest.');
        return;
      }

      const quantityValue = Number(quantity);
      if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
        showToast('error', 'Enter a valid quantity greater than zero.');
        return;
      }

      const resolvedHarvestSpecies =
        selectedType === 'harvest'
          ? harvestSpeciesOptions.length === 1
            ? harvestSpeciesOptions[0]
            : normalizedSpecies || parsePondSpeciesLabel((pond as any).currentSpecies)[0] || ''
          : '';

      if (selectedType === 'harvest' && harvestSpeciesOptions.length > 1 && !resolvedHarvestSpecies) {
        showToast('error', 'Select which pond species was harvested.');
        return;
      }

      savingRef.current = true;
      setLoading(true);

      try {
        if (selectedType === 'mortality') {
          await createMortalityLog({
            pondId: selectedPondId,
            quantity: Math.round(quantityValue),
            notes: notes.trim(),
            loggedBy: user.id,
          });
        } else if (selectedType === 'harvest') {
          const priceValue = isSold ? parseFloat(sellingPrice) : 0;
          if (isSold && (!sellingPrice.trim() || Number.isNaN(priceValue) || priceValue <= 0)) {
            showToast('error', 'Enter a valid selling price per kilogram (₱).');
            return;
          }

          const revenueValue = isSold && priceValue > 0 ? quantityValue * priceValue : 0;

          await createHarvest({
            pondId: selectedPondId,
            yieldKg: quantityValue,
            harvestedBy: user.id,
            species: resolvedHarvestSpecies || (pond as any).currentSpecies,
            isPartial: isPartialHarvest,
            fishCount: fishCount ? parseInt(fishCount, 10) : undefined,
            pricePerKg: isSold ? priceValue : 0,
            totalRevenue: revenueValue,
            isSold,
          });
        } else if (selectedType === 'stocking') {
          await createStockingLog({
            pondId: selectedPondId,
            species: normalizedSpecies,
            quantity: Math.round(quantityValue),
            averageWeightG: averageWeight ? Number(averageWeight) : undefined,
            source: source.trim() || undefined,
            stockedBy: user.id,
          });
        } else {
          showToast('error', 'Only Mortality, Harvest, and Stocking reports are supported.');
          setLoading(false);
          return;
        }

        const harvestPriceValue = isSold ? parseFloat(sellingPrice) : 0;
        const harvestRevenueValue = isSold && harvestPriceValue > 0 ? quantityValue * harvestPriceValue : 0;

        const recentEntry: RecentEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: selectedType,
          pondId: selectedPondId,
          pondName: pond.name || 'Unnamed Pond',
          quantityValue,
          unit: currentType.unit,
          createdAt: Date.now(),
          notes: notes.trim() || undefined,
          species:
            selectedType === 'harvest'
              ? resolvedHarvestSpecies || undefined
              : normalizedSpecies || undefined,
          status: 'queued',
          revenue: selectedType === 'harvest' && isSold ? harvestRevenueValue : undefined,
          pricePerKg: selectedType === 'harvest' && isSold ? harvestPriceValue : undefined,
          isSold: selectedType === 'harvest' ? isSold : undefined,
        };

        setRecentEntries((prev) => [recentEntry, ...prev].slice(0, 250));

        resetFormFields();

        if (mode === 'save') {
          setActiveSegment('recent');
        }

        showToast('success', `${currentType.label} saved.`);
      } catch (error: any) {
        const message =
          typeof error?.message === 'string' && error.message.length > 0
            ? error.message
            : 'Failed to save entry.';

        const harvestPriceValue = isSold ? parseFloat(sellingPrice) : 0;
        const harvestRevenueValue = isSold && harvestPriceValue > 0 ? quantityValue * harvestPriceValue : 0;

        const failedEntry: RecentEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: selectedType,
          pondId: selectedPondId,
          pondName: pond.name || 'Unnamed Pond',
          quantityValue,
          unit: currentType.unit,
          createdAt: Date.now(),
          notes: notes.trim() || undefined,
          species:
            selectedType === 'harvest'
              ? resolvedHarvestSpecies || undefined
              : normalizedSpecies || undefined,
          status: 'failed',
          revenue: selectedType === 'harvest' && isSold ? harvestRevenueValue : undefined,
          pricePerKg: selectedType === 'harvest' && isSold ? harvestPriceValue : undefined,
          isSold: selectedType === 'harvest' ? isSold : undefined,
        };

        setRecentEntries((prev) => [failedEntry, ...prev].slice(0, 250));
        showToast('error', message);
      } finally {
        savingRef.current = false;
        setLoading(false);
      }
    },
    [
      user?.id,
      selectedPondId,
      quantity,
      selectedType,
      species,
      ponds,
      notes,
      createMortalityLog,
      createHarvest,
      createStockingLog,
      harvestSpeciesOptions,
      averageWeight,
      source,
      fishCount,
      isPartialHarvest,
      sellingPrice,
      isSold,
      currentType.unit,
      currentType.label,
      resetFormFields,
      showToast,
    ]
  );

  const handleEditEntry = useCallback((entry: RecentEntry) => {
    setSelectedPondId(entry.pondId);
    setSelectedType(entry.type);
    setQuantity(String(entry.quantityValue));
    setNotes(entry.notes || '');
    setSpecies(entry.species || '');
    setActiveSegment('log');
    showToast('info', 'Entry loaded for edit.');
  }, [showToast]);

  const handleDuplicateEntry = useCallback((entry: RecentEntry) => {
    setSelectedPondId(entry.pondId);
    setSelectedType(entry.type);
    setQuantity(String(entry.quantityValue));
    setNotes(entry.notes || '');
    setSpecies(entry.species || '');
    setActiveSegment('log');
    showToast('info', 'Entry duplicated to form.');
  }, [showToast]);

  const handleDeleteEntry = useCallback((entryId: string) => {
    setRecentEntries((prev) => prev.filter((entry) => entry.id !== entryId));
    showToast('success', 'Entry removed.');
  }, [showToast]);

  const handleRetrySync = useCallback(async () => {
    const result = await performSync(true);
    if (result.success) {
      showToast('success', 'Queue synced successfully.');
    } else {
      showToast('error', result.message || 'Sync failed.');
    }
  }, [performSync, showToast]);

  const historyRows = useMemo(() => {
    if (!selectedPondId) return [] as HistoryRow[];

    const pondName = (selectedPond as any)?.name || 'Selected Pond';

    const stockingRows: HistoryRow[] = (stockings as any[]).map((item) => ({
      id: `stocking-${item.id}`,
      type: 'stocking',
      pondId: selectedPondId,
      pondName,
      title: `Stocking • ${item.species || 'Unknown species'}`,
      subtitle: `${(item.quantity || 0).toLocaleString()} fingerlings${item.averageWeightG ? ` • ${item.averageWeightG}g avg` : ''
        }`,
      createdAt: Number(item.createdAt || Date.now()),
      status: item.status === 'active' ? 'active' : 'harvested',
    }));

    const eventRows: HistoryRow[] = (history as any[])
      .filter((item) => HISTORY_TYPE_SET.has(String(item.eventType || '').toLowerCase()))
      .map((item) => {
        const type = String(item.eventType || '').toLowerCase() as EntryType;
        const meta = getEntryTypeMeta(type);
        const data = parseJsonField(item.eventData);
        const quantityValue = Number(data.quantity || data.yieldKg || 0);

        let subtitle = data.notes || 'Activity logged';
        if (type === 'harvest') {
          const yieldKg = Number(data.yieldKg || quantityValue || 0);
          const rev = Number(data.totalRevenue ?? (data.isSold ? (yieldKg * Number(data.pricePerKg || 0)) : 0));
          const sold = data.isSold ?? (rev > 0);
          const revenueText = sold && rev > 0
            ? ` • ₱${Math.round(rev).toLocaleString('en-PH')}`
            : (data.isSold === false ? ' • Not sold' : '');
          subtitle = `${yieldKg.toLocaleString()} kg harvested${revenueText}`;
        } else if (type === 'mortality') {
          subtitle = `${Math.round(Number(data.quantity || 0)).toLocaleString()} fish recorded`;
        } else if (quantityValue > 0) {
          subtitle = `${quantityValue.toLocaleString()} ${meta.unit}`;
        }

        return {
          id: `history-${item.id}`,
          type,
          pondId: selectedPondId,
          pondName,
          title: meta.label,
          subtitle,
          createdAt: Number(item.createdAt || Date.now()),
          status: 'logged',
        } as HistoryRow;
      });

    return [...stockingRows, ...eventRows].sort((a, b) => b.createdAt - a.createdAt);
  }, [history, selectedPond, selectedPondId, stockings]);

  const matchesSharedFilters = useCallback(
    (pondId: string, type: EntryType, ts: number, status: string) => {
      if (filterPondId !== 'all' && pondId !== filterPondId) return false;
      if (filterType !== 'all' && type !== filterType) return false;
      if (!isMatchingDateFilter(ts, filterDate)) return false;
      if (filterStatus !== 'all' && status !== filterStatus) return false;
      return true;
    },
    [filterDate, filterPondId, filterStatus, filterType]
  );

  const filteredRecentEntries = useMemo(() => {
    const query = recordQuery.trim().toLocaleLowerCase();
    return recentEntries
      .filter(entry => matchesSharedFilters(entry.pondId, entry.type, entry.createdAt, entry.status))
      .filter(entry => !query || [entry.pondName, entry.type, entry.species, entry.notes, entry.quantityValue].join(' ').toLocaleLowerCase().includes(query))
      .sort((a, b) => oldestFirst ? a.createdAt - b.createdAt : b.createdAt - a.createdAt);
  }, [recentEntries, matchesSharedFilters, recordQuery, oldestFirst]);

  const filteredHistoryRows = useMemo(() => {
    const query = recordQuery.trim().toLocaleLowerCase();
    return historyRows
      .filter(entry => matchesSharedFilters(entry.pondId, entry.type, entry.createdAt, entry.status))
      .filter(entry => !query || [entry.pondName, entry.type, entry.title, entry.subtitle].join(' ').toLocaleLowerCase().includes(query))
      .sort((a, b) => oldestFirst ? a.createdAt - b.createdAt : b.createdAt - a.createdAt);
  }, [historyRows, matchesSharedFilters, recordQuery, oldestFirst]);

  const queueEntries = useMemo(() => {
    return filteredRecentEntries.filter((entry) => entry.status !== 'synced');
  }, [filteredRecentEntries]);

  const groupedRecentEntries = useMemo(() => {
    const grouped: Record<'Today' | 'Yesterday' | 'Earlier', RecentEntry[]> = {
      Today: [],
      Yesterday: [],
      Earlier: [],
    };

    filteredRecentEntries.forEach((entry) => {
      grouped[getDateGroupLabel(entry.createdAt)].push(entry);
    });

    return grouped;
  }, [filteredRecentEntries]);

  const composerBottom = useMemo(() => {
    if (keyboardHeight > 0) {
      return Math.max(8, keyboardHeight + 8);
    }
    return Math.max(16, insets.bottom + 16);
  }, [insets.bottom, keyboardHeight]);

  const contentBottomPadding = useMemo(() => {
    if (activeSegment !== 'log') return 28 + insets.bottom;
    const basePadding = 188 + insets.bottom;
    if (keyboardHeight <= 0) return basePadding;
    return basePadding + Math.max(0, keyboardHeight - 64);
  }, [activeSegment, keyboardHeight, insets.bottom]);

  const hasFormData = Boolean(quantity || notes || species || averageWeight || source || fishCount);

  const pondFilterLabel =
    filterPondId === 'all'
      ? 'All ponds'
      : (ponds as any[]).find((pond) => pond.id === filterPondId)?.name || 'Selected pond';

  const typeFilterLabel = TYPE_FILTER_OPTIONS.find((item) => item.id === filterType)?.label || 'All Types';
  const dateFilterLabel = DATE_OPTIONS.find((item) => item.id === filterDate)?.label || 'Any Date';
  const statusFilterLabel = statusOptions.find((item) => item.id === filterStatus)?.label || 'Any Status';
  const visibleSegment = isHistoryOnlyMode ? 'recent' : activeSegment;
  const activeSegmentMeta = isHistoryOnlyMode
    ? { id: 'recent' as DataSegment, label: 'History', icon: 'time-outline' }
    : SEGMENTS.find((item) => item.id === activeSegment) || SEGMENTS[0];
  const workspaceBadgeLabel = visibleSegment === 'log' ? currentType.label : typeFilterLabel;
  const workspaceTitle =
    isHistoryOnlyMode
      ? `${typeFilterLabel} History`
      : activeSegment === 'log'
      ? `${currentType.label} Workflow`
      : activeSegment === 'queue'
        ? 'Sync Queue Monitor'
        : `${activeSegmentMeta.label} Records`;
  const workspaceSubtitle =
    isHistoryOnlyMode
      ? 'Recent record history for the selected module.'
      : activeSegment === 'log'
      ? 'Create new pond records with the upgraded Aquapin 2.0 capture flow.'
      : activeSegment === 'recent'
        ? 'Review filtered record entries with the same updated Aquapin workspace style.'
        : activeSegment === 'history'
          ? 'Trace pond changes and lifecycle history in the upgraded records module.'
          : 'Track pending offline entries, failed sync items, and queue health in one view.';
  const workspacePondLabel = selectedPond ? String((selectedPond as any).name || 'Selected pond') : pondFilterLabel;
  const workspaceAccentColor =
    visibleSegment === 'queue' ? aquapinColors.blue : filterType !== 'all' || visibleSegment === 'log' ? currentType.color : aquapinColors.blue;

  const renderSkeletonList = (count: number) => (
    <View>
      {Array.from({ length: count }).map((_, index) => (
        <View key={`skeleton-${index}`} style={styles.skeletonCard}>
          <View style={styles.skeletonAvatar} />
          <View style={styles.skeletonTextWrap}>
            <View style={styles.skeletonLineShort} />
            <View style={styles.skeletonLineLong} />
          </View>
        </View>
      ))}
    </View>
  );

  const renderPondStatus = () => {
    if (!selectedPond) return null;

    const isActive = Boolean((selectedPond as any).isActive);
    const pondSpecies = (selectedPond as any).currentSpecies;
    const count = Number((selectedPond as any).currentStockCount || 0);

    return (
      <View style={styles.pondStatusCard}>
        <View style={styles.statusHeader}>
          <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusInactive]}>
            <Ionicons
              name={isActive ? 'checkmark-circle' : 'ellipse-outline'}
              size={14}
              color={isActive ? '#17803d' : '#6c757d'}
            />
            <Text style={[styles.statusText, isActive ? styles.statusActiveText : styles.statusInactiveText]}>
              {isActive ? 'Active' : 'Inactive'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => {
              setFilterPondId(selectedPondId || 'all');
              setActiveSegment('history');
            }}
          >
            <Ionicons name="time-outline" size={15} color="#0b6cd4" />
            <Text style={styles.historyButtonText}>Open History</Text>
          </TouchableOpacity>
        </View>

        {isActive ? (
          <View style={styles.stockInfo}>
            <View style={styles.stockRow}>
              <Ionicons name="fish-outline" size={16} color="#0b6cd4" />
              <Text style={styles.speciesText}>{pondSpecies || 'Species not set'}</Text>
            </View>
            <View style={styles.stockRow}>
              <Ionicons name="stats-chart-outline" size={16} color="#17803d" />
              <Text style={styles.countText}>{count > 0 ? `~${count.toLocaleString()} fish` : 'Stock count unknown'}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.inactiveHint}>Inactive pond. Add stocking entry to activate cycle tracking.</Text>
        )}
      </View>
    );
  };

  const renderPondSelector = () => (
    <Modal
      visible={showPondSelector}
      animationType="slide"
      transparent
      onRequestClose={() => setShowPondSelector(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Pond</Text>
            <TouchableOpacity onPress={() => setShowPondSelector(false)}>
              <Ionicons name="close" size={22} color={aquapinColors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color="#98a2b3" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search ponds"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#98a2b3" />
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={filteredPonds}
            keyExtractor={(item: any) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }: { item: any }) => {
              const isSelected = selectedPondId === item.id;
              return (
                <TouchableOpacity
                  style={[styles.pondListItem, isSelected && styles.pondListItemSelected]}
                  onPress={() => {
                    setSelectedPondId(item.id);
                    setShowPondSelector(false);
                  }}
                >
                  <View style={[styles.pondIconContainer, isSelected && styles.pondIconContainerSelected]}>
                    <Ionicons name="water" size={21} color={isSelected ? '#0b6cd4' : '#667085'} />
                  </View>
                  <View style={styles.pondInfo}>
                    <Text style={[styles.pondListName, isSelected && styles.pondListNameSelected]}>{item.name}</Text>
                    <Text style={styles.pondListLocation} numberOfLines={1}>
                      {item.location}
                    </Text>
                  </View>
                  {isSelected && <Ionicons name="checkmark-circle" size={22} color="#0b6cd4" />}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={42} color="#c4c7cc" />
                <Text style={styles.emptyStateText}>No ponds found</Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );

  const renderSpeciesSelector = () => (
    <Modal
      visible={showSpeciesSelector}
      animationType="slide"
      transparent
      onRequestClose={() => setShowSpeciesSelector(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {selectedType === 'harvest' ? 'Select Harvest Species' : 'Select Species'}
            </Text>
            <TouchableOpacity onPress={() => setShowSpeciesSelector(false)}>
              <Ionicons name="close" size={22} color={aquapinColors.textMuted} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={visibleSpeciesOptions}
            keyExtractor={(item) => item}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="fish-outline" size={42} color="#c4c7cc" />
                <Text style={styles.emptyStateText}>No active species available</Text>
              </View>
            }
            renderItem={({ item }) => {
              const isSelected = species === item;
              return (
                <TouchableOpacity
                  style={[styles.speciesItem, isSelected && styles.speciesItemSelected]}
                  onPress={() => {
                    setSpecies(item);
                    setShowSpeciesSelector(false);
                  }}
                >
                  <Ionicons name="fish" size={22} color={isSelected ? '#20c997' : '#667085'} />
                  <Text style={[styles.speciesListText, isSelected && styles.speciesListTextSelected]}>{item}</Text>
                  {isSelected && <Ionicons name="checkmark" size={20} color="#20c997" />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );

  const renderCompactFilters = () => (
    <View style={styles.filterShell}>
      <TextInput accessibilityLabel="Search records" placeholder="Search records by pond, species or notes" value={recordQuery} onChangeText={setRecordQuery} style={{ padding: 12, borderWidth: 1, borderColor: '#dbe5ef', borderRadius: 12, marginBottom: 8 }} />
      <TouchableOpacity accessibilityRole="button" style={{ padding: 12 }} onPress={() => setOldestFirst(!oldestFirst)}><Text>Sort: {oldestFirst ? 'Oldest First' : 'Newest First'}</Text></TouchableOpacity>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={styles.filterChip}
          onPress={() => setFilterPondId((prev) => cycleNext(prev, pondFilterOptions))}
        >
          <Ionicons name="water-outline" size={15} color={aquapinColors.blue} />
          <Text style={styles.filterChipLabel}>Pond</Text>
          <Text style={styles.filterChipValue} numberOfLines={1}>{pondFilterLabel}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.filterChip}
          onPress={() => setFilterType((prev) => cycleNext(prev, TYPE_FILTER_OPTIONS.map((item) => item.id)))}
        >
          <Ionicons name="funnel-outline" size={15} color={aquapinColors.green} />
          <Text style={styles.filterChipLabel}>Type</Text>
          <Text style={styles.filterChipValue} numberOfLines={1}>{typeFilterLabel}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.filterChip}
          onPress={() => setFilterDate((prev) => cycleNext(prev, DATE_OPTIONS.map((item) => item.id)))}
        >
          <Ionicons name="calendar-outline" size={15} color={aquapinColors.blue} />
          <Text style={styles.filterChipLabel}>Date</Text>
          <Text style={styles.filterChipValue} numberOfLines={1}>{dateFilterLabel}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.filterChip}
          onPress={() => setFilterStatus((prev) => cycleNext(prev, statusCycleValues))}
        >
          <Ionicons name="checkbox-outline" size={15} color={aquapinColors.amber} />
          <Text style={styles.filterChipLabel}>Status</Text>
          <Text style={styles.filterChipValue} numberOfLines={1}>{statusFilterLabel}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  const rowCardWidth = Math.max(240, width - 32);

  const renderSwipeEntryRow = (entry: RecentEntry) => {
    const typeMeta = getEntryTypeMeta(entry.type);

    return (
      <View key={entry.id} style={styles.swipeRowContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          directionalLockEnabled
        >
          <View style={[styles.entryCard, { width: rowCardWidth, borderLeftColor: typeMeta.color }]}>
            <View style={[styles.entryIconWrap, { backgroundColor: `${typeMeta.color}20` }]}>
              <Ionicons name={typeMeta.icon as any} size={16} color={typeMeta.color} />
            </View>

            <View style={styles.entryInfo}>
              <Text style={styles.entryTypeText}>{typeMeta.label}</Text>
              <Text style={styles.entrySubText} numberOfLines={1}>
                {entry.pondName} • {formatQuantity(entry.quantityValue, entry.unit)}
                {entry.revenue !== undefined && entry.revenue > 0 ? ` • ₱${Math.round(entry.revenue).toLocaleString('en-PH')}` : (entry.isSold === false ? ' • Not sold' : '')}
              </Text>
              <Text style={styles.entryTimeText}>{formatEventDate(entry.createdAt)}</Text>
            </View>

            <View style={styles.entryStatusWrap}>
              <View
                style={[
                  styles.statusPill,
                  entry.status === 'queued'
                    ? styles.statusQueued
                    : entry.status === 'failed'
                      ? styles.statusFailed
                      : styles.statusSynced,
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    entry.status === 'queued'
                      ? styles.statusQueuedText
                      : entry.status === 'failed'
                        ? styles.statusFailedText
                        : styles.statusSyncedText,
                  ]}
                >
                  {entry.status}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.swipeActions}>
            <TouchableOpacity style={[styles.swipeActionButton, styles.editAction]} onPress={() => Alert.alert('Record Details', `${entry.pondName}\n${entry.type} · ${entry.quantityValue} ${entry.unit}${entry.revenue !== undefined && entry.revenue > 0 ? `\nTotal Revenue: ₱${Math.round(entry.revenue).toLocaleString('en-PH')}` : (entry.isSold === false ? '\nStatus: Not sold' : '')}\n${new Date(entry.createdAt).toLocaleString()}\nStatus: ${entry.status}${entry.species ? '\nSpecies: ' + entry.species : ''}${entry.notes ? '\nNotes: ' + entry.notes : ''}`)}><Text style={styles.swipeActionText}>View Details</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.swipeActionButton, styles.editAction]} onPress={() => handleEditEntry(entry)}>
              <Ionicons name="create-outline" size={16} color="#fff" />
              <Text style={styles.swipeActionText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.swipeActionButton, styles.duplicateAction]}
              onPress={() => handleDuplicateEntry(entry)}
            >
              <Ionicons name="copy-outline" size={16} color="#fff" />
              <Text style={styles.swipeActionText}>Duplicate</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.swipeActionButton, styles.deleteAction]} onPress={() => handleDeleteEntry(entry.id)}>
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text style={styles.swipeActionText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  };

  const renderLogSegment = () => (
    <View>
      {!isSpecificModule && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Report Type</Text>
          <View style={styles.typeGrid}>
            {ENTRY_TYPES.map((type) => {
              const isSelected = selectedType === type.id;
              return (
                <TouchableOpacity
                  key={type.id}
                  style={[
                    styles.typeButton,
                    isSelected && {
                      backgroundColor: `${type.color}14`,
                      borderColor: type.color,
                    },
                  ]}
                  onPress={() => setSelectedType(type.id)}
                >
                  <View style={[styles.typeIconContainer, isSelected && { backgroundColor: `${type.color}25` }]}>
                    <Ionicons name={type.icon as any} size={20} color={isSelected ? type.color : '#667085'} />
                  </View>
                  <Text style={[styles.typeLabel, isSelected && { color: type.color, fontWeight: '700' }]}>{type.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pond</Text>
        {ponds.length === 0 ? (
          <View style={styles.emptyPonds}>
            <Ionicons name="water-outline" size={36} color="#c4c7cc" />
            <Text style={styles.emptyText}>No ponds available</Text>
            <Text style={styles.emptySubtext}>Create ponds in Map tab first.</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.pondSelectorCard} onPress={() => setShowPondSelector(true)}>
            {selectedPond ? (
              <>
                <View style={styles.selectedPondIcon}>
                  <Ionicons name="water" size={24} color="#0b6cd4" />
                </View>
                <View style={styles.selectedPondInfo}>
                  <Text style={styles.selectedPondName}>{(selectedPond as any).name}</Text>
                  <Text style={styles.selectedPondLocation} numberOfLines={1}>
                    {(selectedPond as any).location}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#98a2b3" />
              </>
            ) : (
              <>
                <View style={styles.selectPondIcon}>
                  <Ionicons name="add-circle-outline" size={24} color="#0b6cd4" />
                </View>
                <Text style={styles.selectPondText}>Select a pond</Text>
                <Ionicons name="chevron-forward" size={18} color="#98a2b3" />
              </>
            )}
          </TouchableOpacity>
        )}

        {selectedPond && renderPondStatus()}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Details</Text>
        <View style={styles.readinessRow}>
          <View style={[styles.readinessChip, selectedPondId ? styles.readinessChipDone : styles.readinessChipPending]}>
            <Ionicons
              name={selectedPondId ? 'checkmark-circle' : 'ellipse-outline'}
              size={13}
              color={selectedPondId ? '#17803d' : '#667085'}
            />
            <Text style={[styles.readinessText, selectedPondId ? styles.readinessTextDone : styles.readinessTextPending]}>
              Pond
            </Text>
          </View>

          <View style={[styles.readinessChip, quantity ? styles.readinessChipDone : styles.readinessChipPending]}>
            <Ionicons
              name={quantity ? 'checkmark-circle' : 'ellipse-outline'}
              size={13}
              color={quantity ? '#17803d' : '#667085'}
            />
            <Text style={[styles.readinessText, quantity ? styles.readinessTextDone : styles.readinessTextPending]}>
              Quantity
            </Text>
          </View>
        </View>

        {(selectedType === 'stocking' || selectedType === 'harvest') && (
          <View
            style={styles.inputGroup}
            onLayout={(event) => registerFieldLayout('species', event.nativeEvent.layout.y)}
          >
            <Text style={styles.label}>Fish Species</Text>
            <TouchableOpacity
              style={[
                styles.speciesSelector,
                (isHarvestSpeciesLocked || isHarvestSpeciesUnavailable) && styles.speciesSelectorDisabled,
              ]}
              onPress={() => setShowSpeciesSelector(true)}
              disabled={isHarvestSpeciesLocked || isHarvestSpeciesUnavailable}
            >
              <Ionicons name="fish-outline" size={18} color="#667085" />
              <Text style={[styles.speciesSelectorText, !speciesFieldValue && styles.speciesPlaceholder]}>
                {speciesFieldValue || speciesPlaceholderText}
              </Text>
              <Ionicons
                name={
                  isHarvestSpeciesUnavailable
                    ? 'ban-outline'
                    : isHarvestSpeciesLocked
                      ? 'checkmark-circle'
                      : 'chevron-down'
                }
                size={18}
                color={
                  isHarvestSpeciesUnavailable
                    ? '#98a2b3'
                    : isHarvestSpeciesLocked
                      ? '#17803d'
                      : '#98a2b3'
                }
              />
            </TouchableOpacity>
            {isHarvestSpeciesUnavailable ? (
              <Text style={styles.fieldHint}>This pond has no active stocked species. Stock fish first or select another pond.</Text>
            ) : null}
            {selectedType === 'harvest' && harvestSpeciesOptions.length > 1 ? (
              <Text style={styles.fieldHint}>Choose from the species currently stocked in this pond.</Text>
            ) : null}
            {isHarvestSpeciesLocked ? (
              <Text style={styles.fieldHint}>Detected automatically from this pond's active stock.</Text>
            ) : null}
          </View>
        )}

        <View
          style={styles.inputGroup}
          onLayout={(event) => registerFieldLayout('quantity', event.nativeEvent.layout.y)}
        >
          <Text style={styles.label}>{getUnitLabel(selectedType)}</Text>
          <TextInput
            style={styles.input}
            value={quantity}
            onChangeText={setQuantity}
            placeholder="Enter amount"
            keyboardType="numeric"
            placeholderTextColor="#98a2b3"
            onFocus={() => focusField('quantity')}
          />

          <View style={styles.quickAddContainer}>
            {getQuickAddValues(selectedType).map((value) => (
              <TouchableOpacity key={value} style={styles.quickAddButton} onPress={() => setQuantity(value)}>
                <Text style={styles.quickAddText}>{value}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {selectedType === 'stocking' && (
          <>
            <View
              style={styles.inputGroup}
              onLayout={(event) => registerFieldLayout('averageWeight', event.nativeEvent.layout.y)}
            >
              <View style={styles.labelRow}>
                <Text style={styles.label}>Average Weight</Text>
                <Text style={styles.optionalLabel}>Optional (g)</Text>
              </View>
              <TextInput
                style={styles.input}
                value={averageWeight}
                onChangeText={setAverageWeight}
                placeholder="e.g. 5"
                keyboardType="numeric"
                placeholderTextColor="#98a2b3"
                onFocus={() => focusField('averageWeight')}
              />
            </View>

            <View
              style={styles.inputGroup}
              onLayout={(event) => registerFieldLayout('source', event.nativeEvent.layout.y)}
            >
              <View style={styles.labelRow}>
                <Text style={styles.label}>Source</Text>
                <Text style={styles.optionalLabel}>Optional</Text>
              </View>
              <TextInput
                style={styles.input}
                value={source}
                onChangeText={setSource}
                placeholder="Hatchery or supplier"
                placeholderTextColor="#98a2b3"
                onFocus={() => focusField('source')}
              />
            </View>
          </>
        )}

        {selectedType === 'harvest' && (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Harvest Type</Text>
              <View style={styles.harvestTypeContainer}>
                <TouchableOpacity
                  style={[styles.harvestTypeButton, isPartialHarvest && styles.harvestTypeButtonActive]}
                  onPress={() => setIsPartialHarvest(true)}
                >
                  <Text style={[styles.harvestTypeText, isPartialHarvest && styles.harvestTypeTextActive]}>Partial</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.harvestTypeButton, !isPartialHarvest && styles.harvestTypeButtonActive]}
                  onPress={() => setIsPartialHarvest(false)}
                >
                  <Text style={[styles.harvestTypeText, !isPartialHarvest && styles.harvestTypeTextActive]}>Full</Text>
                </TouchableOpacity>
              </View>

              {isPartialHarvest && (
                <View style={{ marginTop: 10 }}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Fish Count</Text>
                    <Text style={styles.optionalLabel}>Optional</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    value={fishCount}
                    onChangeText={setFishCount}
                    placeholder="Enter fish count"
                    keyboardType="numeric"
                    placeholderTextColor="#98a2b3"
                    onFocus={() => focusField('fishCount')}
                  />
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Sale Status</Text>
              <View style={styles.harvestTypeContainer}>
                <TouchableOpacity
                  style={[styles.harvestTypeButton, isSold && styles.harvestTypeButtonActive]}
                  onPress={() => setIsSold(true)}
                >
                  <Text style={[styles.harvestTypeText, isSold && styles.harvestTypeTextActive]}>Sold</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.harvestTypeButton, !isSold && styles.harvestTypeButtonActive]}
                  onPress={() => {
                    setIsSold(false);
                    setSellingPrice('');
                  }}
                >
                  <Text style={[styles.harvestTypeText, !isSold && styles.harvestTypeTextActive]}>Not Sold</Text>
                </TouchableOpacity>
              </View>
            </View>

            {isSold ? (
              <>
                <View
                  style={styles.inputGroup}
                  onLayout={(event) => registerFieldLayout('sellingPrice', event.nativeEvent.layout.y)}
                >
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Selling Price per Kilogram (₱)</Text>
                    <Text style={styles.requiredIndicator}>*</Text>
                  </View>
                  <View style={styles.currencyInputContainer}>
                    <Text style={styles.currencyPrefix}>₱</Text>
                    <TextInput
                      style={styles.currencyInput}
                      value={sellingPrice}
                      onChangeText={setSellingPrice}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      placeholderTextColor="#98a2b3"
                      onFocus={() => focusField('sellingPrice')}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Total Revenue (₱)</Text>
                    <Text style={styles.optionalLabel}>Auto-calculated</Text>
                  </View>
                  <View style={styles.calculatedRevenueCard}>
                    <View style={styles.calculatedRevenueHeader}>
                      <View style={styles.calculatedRevenueIconCircle}>
                        <Ionicons name="cash-outline" size={18} color={aquapinColors.green} />
                      </View>
                      <Text style={styles.calculatedRevenueValue}>
                        {`₱${calculatedTotalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </Text>
                    </View>
                    <Text style={styles.calculatedRevenueHint}>
                      {parsedHarvestWeight > 0 && parsedSellingPrice > 0
                        ? `${parsedHarvestWeight.toLocaleString('en-PH')} kg × ₱${parsedSellingPrice.toFixed(2)}/kg`
                        : 'Calculated from harvested weight multiplied by selling price'}
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Total Revenue (₱)</Text>
                  <Text style={styles.optionalLabel}>Not Sold</Text>
                </View>
                <View style={[styles.calculatedRevenueCard, styles.calculatedRevenueCardUnsold]}>
                  <View style={styles.calculatedRevenueHeader}>
                    <View style={[styles.calculatedRevenueIconCircle, styles.calculatedRevenueIconCircleUnsold]}>
                      <Ionicons name="ban-outline" size={18} color={aquapinColors.textMuted} />
                    </View>
                    <Text style={[styles.calculatedRevenueValue, { color: aquapinColors.textMuted }]}>
                      ₱0.00
                    </Text>
                  </View>
                  <Text style={styles.calculatedRevenueHint}>
                    Harvest is not sold (excluded from Dashboard revenue total)
                  </Text>
                </View>
              </View>
            )}
          </>
        )}

        <View
          style={styles.inputGroup}
          onLayout={(event) => registerFieldLayout('notes', event.nativeEvent.layout.y)}
        >
          <View style={styles.labelRow}>
            <Text style={styles.label}>Notes</Text>
            <Text style={styles.optionalLabel}>Optional</Text>
          </View>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Observations, weather, behavior..."
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholderTextColor="#98a2b3"
            onFocus={() => focusField('notes')}
          />
        </View>
      </View>
    </View>
  );

  const listRows = useMemo<WorkspaceRow[]>(() => {
    if (visibleSegment === 'history') {
      return !selectedPondId || isHistoryBusy ? [] : filteredHistoryRows.map(entry => ({ id: `history:${entry.id}`, kind: 'history', entry }));
    }
    if (visibleSegment === 'queue') {
      return queueEntries.map(entry => ({ id: `queue:${entry.id}`, kind: 'entry', entry }));
    }
    if (visibleSegment !== 'recent') return [];
    const rows: WorkspaceRow[] = [];
    const groups = oldestFirst ? ['Earlier', 'Yesterday', 'Today'] as const : ['Today', 'Yesterday', 'Earlier'] as const;
    for (const group of groups) {
      const entries = groupedRecentEntries[group];
      if (!entries.length) continue;
      rows.push({ id: `group:${group}`, kind: 'group', group, count: entries.length });
      if (collapsedGroups[group]) {
        rows.push(...entries.map(entry => ({ id: `recent:${entry.id}`, kind: 'entry' as const, entry })));
      }
    }
    return rows;
  }, [visibleSegment, selectedPondId, isHistoryBusy, filteredHistoryRows, queueEntries, groupedRecentEntries, collapsedGroups, oldestFirst]);

  const renderTransactionRow = ({ item: row }: { item: WorkspaceRow }) => {
    if (row.kind === 'entry') return renderSwipeEntryRow(row.entry);
    if (row.kind === 'group') {
      return (
        <TouchableOpacity style={styles.groupHeader}
          onPress={() => setCollapsedGroups(prev => ({ ...prev, [row.group]: !prev[row.group] }))}>
          <Text style={styles.groupTitle}>{row.group}</Text>
          <View style={styles.groupCountWrap}>
            <Text style={styles.groupCountText}>{row.count}</Text>
            <Ionicons name={collapsedGroups[row.group] ? 'chevron-up' : 'chevron-down'} size={16} color="#667085" />
          </View>
        </TouchableOpacity>
      );
    }
    const item = row.entry;
    const meta = getEntryTypeMeta(item.type);
    return (
      <View key={item.id} style={[styles.historyCard, { borderLeftColor: meta.color }]}>
        <View style={[styles.historyIconContainer, { backgroundColor: `${meta.color}20` }]}>
          <Ionicons name={meta.icon as any} size={16} color={meta.color} />
        </View>
        <View style={styles.historyInfo}>
          <Text style={styles.historyTitle}>{item.title}</Text>
          <Text style={styles.historySubtitle}>{item.subtitle}</Text>
          <Text style={styles.historyDate}>{formatEventDate(item.createdAt)}</Text>
        </View>
        <View style={[styles.statusPill, item.status === 'active' ? styles.statusActiveLite : item.status === 'harvested' ? styles.statusHarvestedLite : styles.statusLoggedLite]}>
          <Text style={styles.statusPillMiniText}>{item.status}</Text>
        </View>
      </View>
    );
  };

  const renderListHeader = () => (
    <View>
      {renderCompactFilters()}
      {visibleSegment === 'history' && !selectedPondId && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>Pick a pond to view history</Text>
          <TouchableOpacity style={styles.pickPondButton} onPress={() => setShowPondSelector(true)}>
            <Text style={styles.pickPondButtonText}>Select Pond</Text>
          </TouchableOpacity>
        </View>
      )}
      {visibleSegment === 'history' && selectedPondId && isHistoryBusy ? renderSkeletonList(5) : null}
      {visibleSegment === 'queue' && (
        <View style={styles.queueSummaryCard}>
          <View>
            <Text style={styles.queueSummaryTitle}>Sync Queue</Text>
            <Text style={styles.queueSummarySub}>Local unresolved: {queuePendingCount}</Text>
            <Text style={styles.queueSummarySub}>Last sync: {lastSync ? formatEventDate(lastSync.getTime()) : 'Never'}</Text>
          </View>
          <TouchableOpacity style={styles.queueSyncButton} onPress={handleRetrySync} disabled={isSyncing}>
            {isSyncing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.queueSyncButtonText}>Sync Now</Text>}
          </TouchableOpacity>
        </View>
      )}
      {listRows.length === 0 && (visibleSegment !== 'history' || (selectedPondId && !isHistoryBusy)) && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            {visibleSegment === 'recent' ? 'No recent entries' : visibleSegment === 'queue' ? 'Queue is clear' : 'No matching history'}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {toast && (
        <View
          style={[
            styles.toast,
            toast.type === 'success' ? styles.toastSuccess : toast.type === 'error' ? styles.toastError : styles.toastInfo,
          ]}
        >
          <Ionicons
            name={toast.type === 'success' ? 'checkmark-circle' : toast.type === 'error' ? 'alert-circle' : 'information-circle'}
            size={18}
            color="#fff"
          />
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      )}

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} activeOpacity={0.9} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={aquapinColors.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Aquapin 2.0</Text>
          <Text style={styles.title}>{isHistoryOnlyMode ? 'Record History' : 'Records Workspace'}</Text>
          <Text style={styles.subtitle}>
            {isHistoryOnlyMode
              ? 'Filtered recent history for the selected records module.'
              : 'Capture, review, and sync pond records in the upgraded Aquapin interface.'}
          </Text>
        </View>
      </View>

      {!isHistoryOnlyMode && (
        <View style={styles.segmentBar}>
          {SEGMENTS.map((segment) => {
            const active = activeSegment === segment.id;
            return (
              <TouchableOpacity
                key={segment.id}
                style={[styles.segmentButton, active && styles.segmentButtonActive]}
                onPress={() => {
                  setActiveSegment(segment.id);
                  setFilterStatus('all');
                }}
              >
                <Ionicons name={segment.icon as any} size={14} color={active ? '#0b6cd4' : '#667085'} />
                <Text style={[styles.segmentButtonText, active && styles.segmentButtonTextActive]}>{segment.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <FlatList
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={{ padding: 16, paddingBottom: contentBottomPadding }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        data={listRows}
        keyExtractor={item => item.id}
        renderItem={renderTransactionRow}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
        ListHeaderComponent={<>
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={[styles.heroBadge, { backgroundColor: `${workspaceAccentColor}18` }]}>
              <Ionicons
                name={(visibleSegment === 'queue' ? 'cloud-upload-outline' : currentType.icon) as any}
                size={16}
                color={workspaceAccentColor}
              />
              <Text
                style={[
                  styles.heroBadgeText,
                  { color: workspaceAccentColor },
                ]}
              >
                {workspaceBadgeLabel}
              </Text>
            </View>

            <View style={styles.heroPill}>
              <Ionicons name={activeSegmentMeta.icon as any} size={14} color={aquapinColors.blue} />
              <Text style={styles.heroPillText}>{activeSegmentMeta.label}</Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>{workspaceTitle}</Text>
          <Text style={styles.heroSubtitle}>{workspaceSubtitle}</Text>

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatLabel}>Pond</Text>
              <Text style={styles.heroStatValue} numberOfLines={1}>{workspacePondLabel}</Text>
            </View>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatLabel}>{isHistoryOnlyMode ? 'Records' : 'Pending'}</Text>
              <Text style={styles.heroStatValue}>{isHistoryOnlyMode ? filteredRecentEntries.length : queuePendingCount}</Text>
            </View>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatLabel}>Date</Text>
              <Text style={styles.heroStatValue}>{formatBadgeDate(new Date())}</Text>
            </View>
          </View>
        </View>

        {visibleSegment === 'log' && renderLogSegment()}
        {visibleSegment !== 'log' && renderListHeader()}
        </>}
      />

      {visibleSegment === 'log' && (
        <View style={[styles.stickyComposer, { bottom: composerBottom }]}>
          <TouchableOpacity
            style={[
              styles.saveButton,
              styles.saveButtonSecondary,
              (!selectedPondId || !quantity || loading) && styles.saveButtonDisabled,
            ]}
            onPress={() => submitEntry('save')}
            disabled={!selectedPondId || !quantity || loading}
          >
            {loading ? <ActivityIndicator size="small" color="#0b6cd4" /> : <Text style={styles.saveButtonSecondaryText}>Save</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: currentType.color },
              (!selectedPondId || !quantity || loading) && styles.saveButtonDisabled,
            ]}
            onPress={() => submitEntry('save_add')}
            disabled={!selectedPondId || !quantity || loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save & Add Another</Text>
            )}
          </TouchableOpacity>

          {hasFormData && !loading && (
            <TouchableOpacity style={styles.resetInlineButton} onPress={resetFormFields}>
              <Ionicons name="refresh-outline" size={15} color="#475467" />
              <Text style={styles.resetInlineText}>Reset</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {renderPondSelector()}
      {renderSpeciesSelector()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: aquapinColors.background,
  },
  toast: {
    position: 'absolute',
    top: 54,
    left: 16,
    right: 16,
    zIndex: 1000,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#16335c',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 6,
  },
  toastSuccess: {
    backgroundColor: aquapinColors.green,
  },
  toastError: {
    backgroundColor: aquapinColors.red,
  },
  toastInfo: {
    backgroundColor: aquapinColors.blue,
  },
  toastText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: aquapinColors.surface,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: aquapinColors.green,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: aquapinColors.text,
    marginTop: 6,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
    color: aquapinColors.textMuted,
    maxWidth: 280,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: aquapinColors.surface,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: aquapinColors.border,
  },
  dateBadgeText: {
    color: aquapinColors.blue,
    fontSize: 12,
    fontWeight: '800',
  },
  segmentBar: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 8,
    backgroundColor: aquapinColors.surface,
    borderRadius: aquapinRadius.sheet,
    shadowColor: '#16335c',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  segmentButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 18,
    backgroundColor: aquapinColors.surfaceMuted,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  segmentButtonActive: {
    backgroundColor: aquapinColors.blueSoft,
  },
  segmentButtonText: {
    fontSize: 11,
    color: aquapinColors.textMuted,
    fontWeight: '700',
  },
  segmentButtonTextActive: {
    color: aquapinColors.blue,
  },
  scrollView: {
    flex: 1,
  },
  heroCard: {
    backgroundColor: aquapinColors.surface,
    borderRadius: aquapinRadius.sheet,
    padding: 20,
    marginBottom: 18,
    shadowColor: '#16335c',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: aquapinRadius.pill,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: aquapinColors.blueSoft,
    borderRadius: aquapinRadius.pill,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  heroPillText: {
    color: aquapinColors.blue,
    fontSize: 12,
    fontWeight: '800',
  },
  heroTitle: {
    fontSize: 23,
    fontWeight: '900',
    color: aquapinColors.text,
    marginTop: 16,
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
    color: aquapinColors.textMuted,
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  heroStatCard: {
    flex: 1,
    backgroundColor: aquapinColors.surfaceMuted,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  heroStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: aquapinColors.textMuted,
    textTransform: 'uppercase',
  },
  heroStatValue: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '800',
    color: aquapinColors.text,
  },
  section: {
    marginBottom: 18,
    backgroundColor: aquapinColors.surface,
    borderRadius: aquapinRadius.sheet,
    padding: 18,
    shadowColor: '#16335c',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: aquapinColors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 12,
    letterSpacing: 0.4,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeButton: {
    width: '31.8%',
    backgroundColor: aquapinColors.surfaceMuted,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  typeIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#edf4fb',
    marginBottom: 8,
  },
  typeLabel: {
    fontSize: 11,
    color: aquapinColors.textMuted,
    textAlign: 'center',
    fontWeight: '700',
  },
  pondSelectorCard: {
    backgroundColor: aquapinColors.surfaceMuted,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedPondIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: aquapinColors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectPondIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: aquapinColors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedPondInfo: {
    flex: 1,
    marginLeft: 12,
  },
  selectedPondName: {
    fontSize: 15,
    color: aquapinColors.text,
    fontWeight: '800',
  },
  selectedPondLocation: {
    marginTop: 4,
    fontSize: 12,
    color: aquapinColors.textMuted,
  },
  selectPondText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: aquapinColors.blue,
    fontWeight: '800',
  },
  emptyPonds: {
    backgroundColor: aquapinColors.surfaceMuted,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    paddingVertical: 26,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: aquapinColors.textMuted,
    fontWeight: '700',
  },
  emptySubtext: {
    marginTop: 2,
    fontSize: 12,
    color: aquapinColors.textMuted,
  },
  pondStatusCard: {
    marginTop: 10,
    backgroundColor: aquapinColors.surfaceMuted,
    borderRadius: 24,
    padding: 16,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: aquapinRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  statusActive: {
    backgroundColor: aquapinColors.greenSoft,
  },
  statusInactive: {
    backgroundColor: aquapinColors.surface,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statusActiveText: {
    color: aquapinColors.green,
  },
  statusInactiveText: {
    color: aquapinColors.textMuted,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: aquapinColors.blueSoft,
    borderRadius: aquapinRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  historyButtonText: {
    fontSize: 11,
    color: aquapinColors.blue,
    fontWeight: '800',
  },
  stockInfo: {
    gap: 8,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  speciesText: {
    fontSize: 13,
    color: aquapinColors.text,
    fontWeight: '700',
  },
  countText: {
    fontSize: 12,
    color: aquapinColors.textMuted,
  },
  inactiveHint: {
    fontSize: 12,
    color: aquapinColors.textMuted,
  },
  readinessRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  readinessChip: {
    borderRadius: aquapinRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  readinessChipDone: {
    backgroundColor: aquapinColors.greenSoft,
  },
  readinessChipPending: {
    backgroundColor: aquapinColors.surfaceMuted,
  },
  readinessText: {
    fontSize: 11,
    fontWeight: '800',
  },
  readinessTextDone: {
    color: aquapinColors.green,
  },
  readinessTextPending: {
    color: aquapinColors.textMuted,
  },
  inputGroup: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 13,
    color: aquapinColors.text,
    fontWeight: '800',
    marginBottom: 8,
  },
  optionalLabel: {
    fontSize: 11,
    color: aquapinColors.textMuted,
  },
  input: {
    backgroundColor: aquapinColors.surfaceMuted,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: aquapinColors.text,
    fontSize: 15,
  },
  textArea: {
    minHeight: 96,
  },
  quickAddContainer: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  quickAddButton: {
    backgroundColor: aquapinColors.greenSoft,
    borderColor: '#d5efc7',
    borderWidth: 1,
    borderRadius: aquapinRadius.pill,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  quickAddText: {
    color: aquapinColors.green,
    fontSize: 12,
    fontWeight: '800',
  },
  speciesSelector: {
    backgroundColor: aquapinColors.surfaceMuted,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  speciesSelectorDisabled: {
    backgroundColor: '#f5f8fc',
  },
  speciesSelectorText: {
    flex: 1,
    color: aquapinColors.text,
    fontSize: 14,
  },
  speciesPlaceholder: {
    color: aquapinColors.textMuted,
  },
  fieldHint: {
    marginTop: 6,
    fontSize: 12,
    color: aquapinColors.textMuted,
  },
  harvestTypeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  harvestTypeButton: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    backgroundColor: aquapinColors.surfaceMuted,
    alignItems: 'center',
    paddingVertical: 12,
  },
  harvestTypeButtonActive: {
    backgroundColor: aquapinColors.green,
    borderColor: aquapinColors.green,
  },
  harvestTypeText: {
    color: aquapinColors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  harvestTypeTextActive: {
    color: '#fff',
  },
  requiredIndicator: {
    color: aquapinColors.red,
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 4,
  },
  currencyInputContainer: {
    backgroundColor: aquapinColors.surfaceMuted,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyPrefix: {
    fontSize: 16,
    fontWeight: '800',
    color: aquapinColors.blue,
    marginRight: 6,
  },
  currencyInput: {
    flex: 1,
    paddingVertical: 14,
    color: aquapinColors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  calculatedRevenueCard: {
    backgroundColor: aquapinColors.greenSoft,
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: '#c6e8b4',
    padding: 14,
  },
  calculatedRevenueCardUnsold: {
    backgroundColor: aquapinColors.surfaceMuted,
    borderColor: aquapinColors.border,
  },
  calculatedRevenueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  calculatedRevenueIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(102, 184, 63, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calculatedRevenueIconCircleUnsold: {
    backgroundColor: 'rgba(111, 130, 152, 0.14)',
  },
  calculatedRevenueValue: {
    fontSize: 20,
    fontWeight: '900',
    color: aquapinColors.green,
  },
  calculatedRevenueHint: {
    fontSize: 11.5,
    color: aquapinColors.textMuted,
    marginTop: 6,
    lineHeight: 16,
  },
  filterShell: {
    backgroundColor: aquapinColors.surface,
    borderRadius: aquapinRadius.sheet,
    paddingVertical: 8,
    marginBottom: 16,
    shadowColor: '#16335c',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  filterRow: {
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  filterChip: {
    minWidth: 118,
    maxWidth: 170,
    backgroundColor: aquapinColors.surfaceMuted,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 1,
  },
  filterChipLabel: {
    fontSize: 10,
    color: aquapinColors.textMuted,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  filterChipValue: {
    fontSize: 12,
    color: aquapinColors.text,
    fontWeight: '700',
  },
  groupSection: {
    marginBottom: 16,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: aquapinColors.text,
  },
  groupCountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: aquapinColors.surface,
    borderRadius: aquapinRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  groupCountText: {
    fontSize: 12,
    color: aquapinColors.textMuted,
    fontWeight: '700',
  },
  swipeRowContainer: {
    marginBottom: 10,
  },
  entryCard: {
    backgroundColor: aquapinColors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    borderLeftWidth: 4,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#16335c',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  entryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryInfo: {
    flex: 1,
    marginLeft: 12,
  },
  entryTypeText: {
    fontSize: 13,
    color: aquapinColors.text,
    fontWeight: '800',
  },
  entrySubText: {
    marginTop: 2,
    fontSize: 12,
    color: aquapinColors.textMuted,
  },
  entryTimeText: {
    marginTop: 4,
    fontSize: 11,
    color: aquapinColors.textMuted,
  },
  entryStatusWrap: {
    marginLeft: 6,
  },
  statusPill: {
    borderRadius: aquapinRadius.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusQueued: {
    backgroundColor: aquapinColors.amberSoft,
  },
  statusSynced: {
    backgroundColor: aquapinColors.greenSoft,
  },
  statusFailed: {
    backgroundColor: aquapinColors.redSoft,
  },
  statusQueuedText: {
    color: aquapinColors.amber,
  },
  statusSyncedText: {
    color: aquapinColors.green,
  },
  statusFailedText: {
    color: aquapinColors.red,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginLeft: 8,
    borderRadius: 22,
    overflow: 'hidden',
    height: 68,
    alignSelf: 'center',
  },
  swipeActionButton: {
    width: 78,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  editAction: {
    backgroundColor: aquapinColors.blue,
  },
  duplicateAction: {
    backgroundColor: aquapinColors.teal,
  },
  deleteAction: {
    backgroundColor: aquapinColors.red,
  },
  swipeActionText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  historyCard: {
    backgroundColor: aquapinColors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    borderLeftWidth: 4,
    marginBottom: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#16335c',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  historyIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyInfo: {
    flex: 1,
    marginLeft: 12,
  },
  historyTitle: {
    fontSize: 13,
    color: aquapinColors.text,
    fontWeight: '800',
  },
  historySubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: aquapinColors.textMuted,
  },
  historyDate: {
    marginTop: 4,
    fontSize: 11,
    color: aquapinColors.textMuted,
  },
  statusPillMiniText: {
    fontSize: 10,
    color: aquapinColors.text,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statusActiveLite: {
    backgroundColor: aquapinColors.greenSoft,
  },
  statusHarvestedLite: {
    backgroundColor: aquapinColors.surfaceMuted,
  },
  statusLoggedLite: {
    backgroundColor: aquapinColors.blueSoft,
  },
  queueSummaryCard: {
    backgroundColor: aquapinColors.surface,
    borderRadius: aquapinRadius.sheet,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    padding: 18,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    shadowColor: '#16335c',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  queueSummaryTitle: {
    fontSize: 16,
    color: aquapinColors.text,
    fontWeight: '900',
  },
  queueSummarySub: {
    marginTop: 4,
    fontSize: 12,
    color: aquapinColors.textMuted,
    fontWeight: '600',
  },
  queueSyncButton: {
    borderRadius: 18,
    backgroundColor: aquapinColors.blue,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 102,
    alignItems: 'center',
  },
  queueSyncButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  skeletonCard: {
    backgroundColor: aquapinColors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#e3ecf5',
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: aquapinColors.surfaceMuted,
  },
  skeletonTextWrap: {
    flex: 1,
    marginLeft: 12,
    gap: 6,
  },
  skeletonLineShort: {
    width: '36%',
    height: 8,
    borderRadius: 4,
    backgroundColor: aquapinColors.surfaceMuted,
  },
  skeletonLineLong: {
    width: '76%',
    height: 8,
    borderRadius: 4,
    backgroundColor: aquapinColors.surfaceMuted,
  },
  stickyComposer: {
    position: 'absolute',
    left: 10,
    right: 10,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#16335c',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  saveButton: {
    flex: 1,
    borderRadius: 18,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonSecondary: {
    backgroundColor: aquapinColors.blueSoft,
    borderWidth: 1,
    borderColor: '#cfe1fb',
    flex: 0.7,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  saveButtonSecondaryText: {
    color: aquapinColors.blue,
    fontSize: 13,
    fontWeight: '800',
  },
  saveButtonDisabled: {
    opacity: 0.45,
  },
  resetInlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    backgroundColor: aquapinColors.surfaceMuted,
  },
  resetInlineText: {
    color: aquapinColors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(8, 18, 32, 0.34)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: aquapinColors.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    maxHeight: '75%',
    minHeight: '52%',
  },
  modalHandle: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: aquapinColors.border,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#edf3f8',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: aquapinColors.text,
  },
  searchContainer: {
    margin: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    backgroundColor: aquapinColors.surfaceMuted,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    color: aquapinColors.text,
    fontSize: 14,
  },
  pondListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#edf3f8',
  },
  pondListItemSelected: {
    backgroundColor: aquapinColors.blueSoft,
  },
  pondIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: aquapinColors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pondIconContainerSelected: {
    backgroundColor: '#d9eaff',
  },
  pondInfo: {
    flex: 1,
    marginLeft: 12,
  },
  pondListName: {
    fontSize: 14,
    color: aquapinColors.text,
    fontWeight: '800',
  },
  pondListNameSelected: {
    color: aquapinColors.blue,
  },
  pondListLocation: {
    marginTop: 4,
    fontSize: 12,
    color: aquapinColors.textMuted,
  },
  speciesItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#edf3f8',
  },
  speciesItemSelected: {
    backgroundColor: aquapinColors.greenSoft,
  },
  speciesListText: {
    flex: 1,
    fontSize: 14,
    color: aquapinColors.text,
    fontWeight: '700',
  },
  speciesListTextSelected: {
    color: aquapinColors.green,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyStateText: {
    marginTop: 10,
    fontSize: 15,
    color: aquapinColors.textMuted,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyStateSubtext: {
    marginTop: 4,
    fontSize: 12,
    color: aquapinColors.textMuted,
    textAlign: 'center',
  },
  pickPondButton: {
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: aquapinColors.blue,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  pickPondButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
});
