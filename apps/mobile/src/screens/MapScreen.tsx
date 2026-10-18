import { validateMapping } from '../lib/mapping';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  ActionSheetIOS,
  Platform,
  Keyboard,
  KeyboardEvent,
  ScrollView,
  Dimensions,
  Linking,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Region, MapPressEvent, MapType, Polygon, Polyline, UrlTile, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePonds, useCreatePond, useUpdatePond, usePondHistory } from '../hooks/useOfflineData';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { LeafletMapView, LeafletMapViewRef } from '../components/LeafletMapView';
import { aquapinColors, aquapinRadius, formatCurrencyPhp, formatWholeNumber } from '../theme/aquapin';

// Types
interface Coordinate {
  latitude: number;
  longitude: number;
}

interface PondBoundary {
  coordinates: Coordinate[];
  area: number;
}

interface MappedPond {
  id: string;
  name: string;
  location: string;
  center: Coordinate;
  boundary: Coordinate[];
  isActive: boolean;
}

type MapMode = 'view' | 'point' | 'polygon';
export type MapTileSource = 'osm' | 'google' | 'esri' | 'opentopo';

interface MapOption {
  label: string;
  value: MapType;
  tileSource: MapTileSource;
}

const MIN_BOTTOM_SHEET_SAFE_GAP = 28;
const MODAL_TOP_SAFE_GAP = 24;
const ANDROID_KEYBOARD_CLEARANCE = 8;
const IOS_KEYBOARD_CLEARANCE = 8;

const MAP_OPTIONS: MapOption[] = [
  { label: '🗺️ OpenStreetMap (Standard)', value: 'standard', tileSource: 'osm' },
  { label: '🛰️ Satellite Imagery (Esri)', value: 'satellite', tileSource: 'esri' },
  { label: '🏔️ Topographic / Terrain (OpenTopo)', value: 'terrain', tileSource: 'opentopo' },
  { label: '📍 Google Maps (Standard)', value: 'standard', tileSource: 'google' },
  { label: '🛰️ Google Maps (Satellite)', value: 'satellite', tileSource: 'google' },
  { label: '🗺️ Google Maps (Hybrid)', value: 'hybrid', tileSource: 'google' },
];

function getTileUrl(tileSource: MapTileSource, mapType: MapType): string {
  if (tileSource === 'esri' || (tileSource === 'osm' && (mapType === 'satellite' || mapType === 'hybrid'))) {
    return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  }
  if (tileSource === 'opentopo' || mapType === 'terrain') {
    return 'https://tile.opentopomap.org/{z}/{x}/{y}.png';
  }
  return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
}

// Calculate polygon area using shoelace formula
function calculatePolygonArea(coordinates: Coordinate[]): number {
  if (coordinates.length < 3) return 0;

  let area = 0;
  const n = coordinates.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coordinates[i].longitude * coordinates[j].latitude;
    area -= coordinates[j].longitude * coordinates[i].latitude;
  }

  area = Math.abs(area) * 0.5;
  // Convert to square meters (approximate for small areas)
  return area * 111320 * 111320;
}

function formatArea(areaSqM: number): string {
  if (areaSqM < 10000) {
    return `${Math.round(areaSqM)} m²`;
  }
  const hectares = areaSqM / 10000;
  if (hectares < 100) {
    return `${hectares.toFixed(2)} ha`;
  }
  const sqKm = areaSqM / 1000000;
  return `${sqKm.toFixed(2)} km²`;
}

function parseLocation(location: string): Coordinate | null {
  const parts = String(location || '').split(',').map(p => parseFloat(p.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { latitude: parts[0], longitude: parts[1] };
  }
  return null;
}

function normalizeCoordinate(value: any): Coordinate | null {
  const latitude = typeof value?.latitude === 'number'
    ? value.latitude
    : typeof value?.lat === 'number'
      ? value.lat
      : NaN;
  const longitude = typeof value?.longitude === 'number'
    ? value.longitude
    : typeof value?.lng === 'number'
      ? value.lng
      : NaN;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

function parseBoundary(boundary: unknown): Coordinate[] {
  if (!boundary) return [];

  try {
    const parsed = typeof boundary === 'string' ? JSON.parse(boundary) : boundary;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeCoordinate)
      .filter((coordinate): coordinate is Coordinate => Boolean(coordinate));
  } catch (_error) {
    return [];
  }
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

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const [tileSource, setTileSource] = useState<MapTileSource>('osm');
  const [mapType, setMapType] = useState<MapType>('standard');
  const activeProvider = tileSource === 'google' && Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;
  const leafletRef = useRef<LeafletMapViewRef>(null);
  const mapRef = useRef<MapView | null>(null);

  const [region, setRegion] = useState<Region>({
    latitude: 14.5995,
    longitude: 120.9842,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });
  const [selectedLocation, setSelectedLocation] = useState<Coordinate | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<Coordinate[]>([]);
  const [mapMode, setMapMode] = useState<MapMode>('view');
  const [modalVisible, setModalVisible] = useState(false);
  const [addModeModalVisible, setAddModeModalVisible] = useState(false);
  const [pondName, setPondName] = useState('');
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const { ponds } = usePonds();
  const createPond = useCreatePond();
  const updatePond = useUpdatePond();
  const [selectedMappedId, setSelectedMappedId] = useState<string | null>(null);
  const [detailsPondId, setDetailsPondId] = useState<string | null>(null);
  const [detailsEditingName, setDetailsEditingName] = useState<string | null>(null);
  const [detailsSavingPond, setDetailsSavingPond] = useState(false);
  const detailsSavePondLock = useRef(false);

  const selectedDetailsPond = useMemo(
    () => (ponds as any[]).find((p) => p.id === detailsPondId) || null,
    [ponds, detailsPondId]
  );
  const { history: detailsPondHistory } = usePondHistory(detailsPondId || '');

  useEffect(() => {
    setDetailsEditingName(null);
  }, [detailsPondId]);

  const isDetailsPondActive = Boolean(
    selectedDetailsPond?.isActive || Number(selectedDetailsPond?.currentStockCount) > 0
  );

  const detailsPondCoords = useMemo(() => {
    if (!selectedDetailsPond) return null;
    return parseLocation(selectedDetailsPond.location || '');
  }, [selectedDetailsPond]);

  const saveDetailsPondChanges = async (changes: { name?: string }) => {
    if (!detailsPondId || !user || detailsSavePondLock.current) return;
    detailsSavePondLock.current = true;
    setDetailsSavingPond(true);
    try {
      await updatePond(detailsPondId, changes, user.id);
      setDetailsEditingName(null);
      Alert.alert('Saved', 'Pond name updated successfully.');
    } catch {
      Alert.alert('Unable to save', 'Please try saving again.');
    } finally {
      detailsSavePondLock.current = false;
      setDetailsSavingPond(false);
    }
  };

  const openNavigation = useCallback(async (target: Coordinate) => {
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

  const openDetailsPondRecords = (type?: string) => {
    const currentId = detailsPondId;
    setDetailsPondId(null);
    navigation.navigate('RecordsWorkspace', {
      pondId: currentId,
      initialType: type,
      initialSegment: type ? 'log' : 'recent',
      requestKey: Date.now(),
    });
  };

  const detailsPondKpis = useMemo(() => {
    if (!selectedDetailsPond) return null;

    let totalStocked = 0;
    let totalMortality = 0;
    let totalHarvestKg = 0;
    let latestStockingAt = 0;
    let latestStockingSpecies = '';

    detailsPondHistory.forEach((event: any) => {
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

    const species = selectedDetailsPond.currentSpecies || latestStockingSpecies || '';
    const cycleDays = getCycleDays(species);
    const projectedHarvestDate =
      latestStockingAt > 0 ? new Date(latestStockingAt + cycleDays * 24 * 60 * 60 * 1000) : null;

    const currentStock = Number(selectedDetailsPond.currentStockCount || 0);
    const averageWeight = getAverageHarvestWeightKg(species);
    const pricePerKg = getPricePerKgPhp(species);
    const projectedHarvestValue =
      currentStock > 0 ? currentStock * averageWeight * pricePerKg : null;

    return {
      totalStocked,
      totalMortality,
      totalHarvestKg,
      survivalRate,
      projectedHarvestDate,
      projectedHarvestValue,
    };
  }, [selectedDetailsPond, detailsPondHistory]);

  const detailsSmartAlerts = useMemo(() => {
    if (!selectedDetailsPond) return [];
    const alerts: Array<{ level: 'critical' | 'warning' | 'info'; title: string; message: string }> = [];
    const active = Boolean(selectedDetailsPond.isActive || Number(selectedDetailsPond.currentStockCount) > 0);

    if (!active) {
      alerts.push({
        level: 'info',
        title: 'Pond is Inactive',
        message: 'This pond is currently inactive. Activate it when beginning a new production cycle.',
      });
      return alerts;
    }

    const stockCount = Number(selectedDetailsPond.currentStockCount || 0);
    if (stockCount < 1000) {
      alerts.push({
        level: 'critical',
        title: 'Low Stock Level',
        message: `Current estimated stock is ${stockCount} fish. Check pond condition and plan next actions.`,
      });
    }

    return alerts;
  }, [selectedDetailsPond]);

  const [editingPondId, setEditingPondId] = useState<string | null>(null);
  const saveLock = useRef(false);
  const [movingBoundary, setMovingBoundary] = useState(false);
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);
  const { user } = useAuth();
  const lastPondFitSignatureRef = useRef('');
  const hasMappedPondsRef = useRef(false);
  const restingSheetBottom = Math.max(insets.bottom, MIN_BOTTOM_SHEET_SAFE_GAP);
  const keyboardClearance = Platform.OS === 'android' ? ANDROID_KEYBOARD_CLEARANCE : IOS_KEYBOARD_CLEARANCE;
  const sheetBottom = keyboardOffset > 0
    ? keyboardOffset + keyboardClearance
    : restingSheetBottom;
  const sheetMaxHeight = Math.max(
    280,
    Dimensions.get('window').height - sheetBottom - insets.top - MODAL_TOP_SAFE_GAP
  );

  useEffect(() => {
    if (route.params?.pondId) { setSelectedMappedId(route.params.pondId); setMapMode('view'); return; }
    const initialMode = route.params?.initialMode as MapMode | undefined;
    if (!initialMode || !['view', 'point', 'polygon'].includes(initialMode)) {
      return;
    }

    setMapMode(initialMode);
    setSelectedLocation(null);
    setPolygonPoints([]);
  }, [route.params?.pondId, route.params?.initialMode, route.params?.requestKey]);

  const focusRegion = useCallback((nextRegion: Region, animated = true) => {
    setRegion(nextRegion);
    leafletRef.current?.flyTo(nextRegion.latitude, nextRegion.longitude, 16);
    if (animated) {
      mapRef.current?.animateToRegion(nextRegion, 600);
    }
  }, []);

  const mappedPonds = useMemo<MappedPond[]>(() => {
    return ponds
      .map((pond: any) => {
        const boundary = parseBoundary(pond.boundary);
        const center = parseLocation(pond.location) || (boundary.length >= 3 ? { latitude: boundary.reduce((n, p) => n + p.latitude, 0) / boundary.length, longitude: boundary.reduce((n, p) => n + p.longitude, 0) / boundary.length } : null);
        if (!center) return null;

        return {
          id: String(pond.id),
          name: pond.name || 'Unnamed Pond',
          location: pond.location || '',
          center,
          boundary,
          isActive: Boolean(pond.isActive),
        };
      })
      .filter((pond): pond is MappedPond => Boolean(pond));
  }, [ponds]);

  const mappedCoordinates = useMemo(() => {
    return mappedPonds.flatMap((pond) => (
      pond.boundary.length >= 3 ? [pond.center, ...pond.boundary] : [pond.center]
    ));
  }, [mappedPonds]);

  const mappedPondSignature = useMemo(() => {
    return mappedCoordinates
      .map((coordinate) => `${coordinate.latitude.toFixed(6)},${coordinate.longitude.toFixed(6)}`)
      .join('|');
  }, [mappedCoordinates]);

  useEffect(() => {
    hasMappedPondsRef.current = mappedPonds.length > 0;
  }, [mappedPonds.length]);

  const fitToMarkedPonds = useCallback((animated = true) => {
    if (mappedCoordinates.length === 0) {
      return false;
    }

    leafletRef.current?.fitBounds(mappedCoordinates);

    if (!mapRef.current) {
      return true;
    }

    if (mappedCoordinates.length === 1) {
      const coordinate = mappedCoordinates[0];
      focusRegion({
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        latitudeDelta: 0.0045,
        longitudeDelta: 0.0045,
      }, animated);
      return true;
    }

    mapRef.current.fitToCoordinates(mappedCoordinates, {
      edgePadding: { top: 160, right: 60, bottom: 180, left: 60 },
      animated,
    });

    return true;
  }, [focusRegion, mappedCoordinates]);

  const persistLatestLocation = useCallback(async (location: Location.LocationObject) => {
    if (!user) return;

    try {
      let address: Location.LocationGeocodedAddress | undefined;
      try {
        const addresses = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        address = addresses[0];
      } catch (error) {
        console.warn('Reverse geocoding was unavailable:', error);
      }

      const addressParts = [
        address?.name,
        address?.street,
        address?.district,
        address?.city,
        address?.region,
      ].filter((part, index, values): part is string => Boolean(part) && values.indexOf(part) === index);

      const { error } = await supabase.rpc('update_staff_location', {
        p_latitude: location.coords.latitude,
        p_longitude: location.coords.longitude,
        p_accuracy_m: location.coords.accuracy ?? null,
        p_location_label: addressParts.length > 0 ? addressParts.join(', ') : null,
        p_municipality: address?.city || address?.subregion || null,
        p_barangay: address?.district || null,
        p_region: address?.region || null,
      });

      if (error) {
        console.warn('Failed to persist latest staff location:', error.message);
      }
    } catch (error) {
      console.warn('Failed to prepare latest staff location:', error);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          return;
        }

        const location = await Location.getCurrentPositionAsync({});
        if (cancelled) {
          return;
        }

        void persistLatestLocation(location);

        if (hasMappedPondsRef.current) {
          return;
        }

        focusRegion({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.0045,
          longitudeDelta: 0.0045,
        });
      } catch (error) {
        console.warn('Location initialization failed:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [focusRegion, persistLatestLocation]);

  useEffect(() => {
    if (!mapReady || mapMode !== 'view' || mappedCoordinates.length === 0) {
      return;
    }

    if (lastPondFitSignatureRef.current === mappedPondSignature) {
      return;
    }

    lastPondFitSignatureRef.current = mappedPondSignature;
    const timer = setTimeout(() => {
      fitToMarkedPonds(true);
    }, 300);

    return () => clearTimeout(timer);
  }, [fitToMarkedPonds, mapMode, mapReady, mappedCoordinates.length, mappedPondSignature]);

  useEffect(() => {
    const keyboardShowEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const keyboardHideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const handleKeyboardShow = (event: KeyboardEvent) => {
      const keyboardHeight = Math.max(0, event.endCoordinates?.height || 0);
      const screenHeight = Dimensions.get('screen').height;
      const keyboardTop = event.endCoordinates?.screenY || screenHeight;
      const keyboardOverlap = Math.max(0, screenHeight - keyboardTop);
      const nextOffset = Math.max(0, Math.max(keyboardHeight, keyboardOverlap));
      setKeyboardOffset(nextOffset);
    };

    const handleKeyboardHide = () => {
      setKeyboardOffset(0);
    };

    const showSubscription = Keyboard.addListener(keyboardShowEvent, handleKeyboardShow);
    const hideSubscription = Keyboard.addListener(keyboardHideEvent, handleKeyboardHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom]);

  const applyMapCoordinate = useCallback((coordinate: Coordinate) => {
    if (loading) return;
    if (mapMode === 'point') setSelectedLocation(coordinate);
    else if (mapMode === 'polygon') {
      setPolygonPoints(prev => {
        if (movingBoundary && prev.length) {
          const lat = prev.reduce((n, p) => n + p.latitude, 0) / prev.length;
          const lng = prev.reduce((n, p) => n + p.longitude, 0) / prev.length;
          return prev.map(p => ({ latitude: p.latitude + coordinate.latitude - lat, longitude: p.longitude + coordinate.longitude - lng }));
        }
        return selectedVertex === null ? [...prev, coordinate] : prev.map((p, i) => i === selectedVertex ? coordinate : p);
      });
      setSelectedVertex(null); setMovingBoundary(false);
    }
  }, [mapMode, selectedVertex, movingBoundary, loading]);
  const handleMapPress = useCallback((event: MapPressEvent) => applyMapCoordinate(event.nativeEvent.coordinate), [applyMapCoordinate]);

  const undoLastPoint = () => {
    setSelectedVertex(null);
    setPolygonPoints(prev => prev.slice(0, -1));
  };

  const clearPolygon = () => {
    setPolygonPoints([]);
  };

  const finishPolygon = () => {
    if (polygonPoints.length < 3) {
      Alert.alert('Error', 'Please add at least 3 points to create a pond boundary');
      return;
    }
    setModalVisible(true);
  };

  const handleCreatePond = async () => {
    if (!pondName.trim() || !user || saveLock.current) return;

    const centerPoint = mapMode === 'point'
      ? selectedLocation
      : polygonPoints.length > 0
        ? {
          latitude: polygonPoints.reduce((sum, p) => sum + p.latitude, 0) / polygonPoints.length,
          longitude: polygonPoints.reduce((sum, p) => sum + p.longitude, 0) / polygonPoints.length,
        }
        : null;

    if (!centerPoint) {
      Alert.alert('Error', 'No location selected');
      return;
    }

    saveLock.current = true;
    setLoading(true);
    try {
      await createPond({
        name: pondName.trim(),
        location: `${centerPoint.latitude}, ${centerPoint.longitude}`,
        createdBy: user.id,
        // Store polygon boundary if created with polygon mode
        boundary: mapMode === 'polygon' && polygonPoints.length >= 3
          ? JSON.stringify(polygonPoints)
          : undefined,
      });

      setModalVisible(false);
      setPondName('');
      setSelectedLocation(null);
      setPolygonPoints([]);
      setMapMode('view');
      Alert.alert('Success', 'Pond created successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to create pond');
    } finally {
      saveLock.current = false;
      setLoading(false);
    }
  };

  const showMapTypeSelector = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...MAP_OPTIONS.map(t => t.label), 'Cancel'],
          cancelButtonIndex: MAP_OPTIONS.length,
        },
        (buttonIndex) => {
          if (buttonIndex < MAP_OPTIONS.length) {
            const selected = MAP_OPTIONS[buttonIndex];
            setMapType(selected.value);
            setTileSource(selected.tileSource);
          }
        }
      );
    } else {
      Alert.alert(
        'Map View / Layer',
        'Select map provider & tile style',
        [
          ...MAP_OPTIONS.map((opt) => ({
            text: opt.label,
            onPress: () => {
              setMapType(opt.value);
              setTileSource(opt.tileSource);
            },
          })),
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  const showModeSelector = () => {
    setAddModeModalVisible(true);
  };

  const cancelEditing = () => {
    if (saveLock.current) return;
    setEditingPondId(null); setSelectedVertex(null); setMovingBoundary(false);
    setMapMode('view');
    setSelectedLocation(null);
    setPolygonPoints([]);
  };

  const centerOnMyLocation = useCallback(async () => {
    setLocating(true);
    try {
      const location = await Location.getCurrentPositionAsync({});
      focusRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.0035,
        longitudeDelta: 0.0035,
      });
    } catch (_error) {
      Alert.alert('Location Unavailable', 'Unable to get your current location right now.');
    } finally {
      setLocating(false);
    }
  }, [focusRegion]);

  const pointReadyToSave = mapMode === 'point' && !!selectedLocation;
  const polygonReadyToSave = mapMode === 'polygon' && polygonPoints.length >= 3;
  const canConfirmEdit = pointReadyToSave || polygonReadyToSave;
  const polygonPointsMissing = Math.max(0, 3 - polygonPoints.length);
  const editHintText =
    mapMode === 'point'
      ? selectedLocation
        ? 'Pin placed. Tap Save Pond to continue.'
        : 'Tap anywhere on the map to place your pond pin.'
      : polygonPoints.length >= 3
        ? 'Boundary ready. Tap Finish Boundary to continue.'
        : `Add ${polygonPointsMissing} more point${polygonPointsMissing === 1 ? '' : 's'} to finish the boundary.`;

  const beginMappingEdit = (addBoundary = false) => {
    const source = ponds.find(p => p.id === selectedMappedId);
    if (!source) return;
    const mapped = mappedPonds.find(p => p.id === selectedMappedId);
    const center = mapped?.center || { latitude: region.latitude, longitude: region.longitude };
    const boundary = mapped?.boundary || [];
    setEditingPondId(source.id); setSelectedMappedId(null); setSelectedVertex(null); setMovingBoundary(false);
    setPolygonPoints(boundary.map(p => ({ ...p })));
    setSelectedLocation(mapped ? { ...center } : null);
    setMapMode(addBoundary || boundary.length >= 3 ? 'polygon' : 'point');
    focusRegion({ ...center, latitudeDelta: 0.005, longitudeDelta: 0.005 });
  };
  const saveMapping = () => {
    if (!editingPondId || !user || saveLock.current) return;
    const point = mapMode === 'point' ? selectedLocation : {
      latitude: polygonPoints.reduce((n, p) => n + p.latitude, 0) / polygonPoints.length,
      longitude: polygonPoints.reduce((n, p) => n + p.longitude, 0) / polygonPoints.length,
    };
    if (!point) return;
    const location = `${point.latitude}, ${point.longitude}`;
    const boundary = mapMode === 'polygon' ? JSON.stringify(polygonPoints) : null;
    try { validateMapping(location, boundary); } catch (error) { Alert.alert('Check mapping', error instanceof Error ? error.message : 'Invalid boundary'); return; }
    Alert.alert('Save Mapping', mapMode === 'polygon' ? 'Save changes to this pond boundary?' : 'Save changes to this pond location?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save', onPress: async () => {
        if (saveLock.current) return;
        saveLock.current = true; setLoading(true);
        try {
          await updatePond(editingPondId, { location, boundary }, user.id);
          setEditingPondId(null); setMapMode('view'); setSelectedLocation(null); setPolygonPoints([]);
          Alert.alert('Saved', 'Pond mapping saved locally and queued for synchronization.');
        } catch (error) { Alert.alert('Unable to save', 'Please try saving the pond mapping again.'); }
        finally { saveLock.current = false; setLoading(false); }
      } },
    ]);
  };

  const handleEditConfirm = () => {
    if (editingPondId) { saveMapping(); return; }
    if (pointReadyToSave) {
      setModalVisible(true);
      return;
    }
    if (polygonReadyToSave) {
      finishPolygon();
    }
  };

  return (
    <View style={styles.container}>
      {tileSource !== 'google' ? (
        <LeafletMapView
          ref={leafletRef}
          initialRegion={region}
          mappedPonds={mappedPonds.filter(p => p.id !== editingPondId)}
          onPondPress={id => { if (mapMode === 'view') setSelectedMappedId(id); }}
          onVertexPress={index => setSelectedVertex(index)}
          onVertexMove={(index, point) => setPolygonPoints(prev => prev.map((p, i) => i === index ? point : p))}
          onMarkerMove={setSelectedLocation}
          selectedLocation={selectedLocation}
          polygonPoints={polygonPoints}
          mapMode={mapMode}
          tileSource={tileSource as any}
          onMapPress={applyMapCoordinate}
          style={styles.map}
        />
      ) : (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={region}
          onRegionChangeComplete={setRegion}
          onPress={handleMapPress}
          showsUserLocation
          showsMyLocationButton={false}
          provider={activeProvider}
          mapType={mapType}
          onMapReady={() => setMapReady(true)}
        >
          {mappedPonds.filter(p => p.id !== editingPondId).map((pond) => (
            <React.Fragment key={pond.id}>
              {pond.boundary.length >= 3 && (
                <Polygon
                  tappable
                  onPress={() => { if (mapMode === 'view') setSelectedMappedId(pond.id); }}
                  coordinates={pond.boundary}
                  fillColor={pond.isActive ? 'rgba(0, 123, 255, 0.3)' : 'rgba(22, 163, 74, 0.24)'}
                  strokeColor={pond.isActive ? '#007bff' : '#16a34a'}
                  strokeWidth={2}
                />
              )}
              <Marker
                onPress={(e) => { e.stopPropagation(); if (mapMode === 'view') setSelectedMappedId(pond.id); }}
                coordinate={pond.center}
                title={pond.name}
                description={pond.boundary.length >= 3 ? 'Boundary mapped' : pond.location}
                pinColor={pond.isActive ? '#007bff' : '#16a34a'}
              />
            </React.Fragment>
          ))}

          {selectedLocation && mapMode === 'point' && (
            <Marker
              coordinate={selectedLocation}
              pinColor="#28a745"
              draggable
              onDragEnd={(e) => setSelectedLocation(e.nativeEvent.coordinate)}
            />
          )}

          {polygonPoints.length > 0 && (
            <>
              {polygonPoints.map((point, index) => (
                <Marker key={index} coordinate={point} draggable onDragEnd={e => setPolygonPoints(prev => prev.map((p, i) => i === index ? e.nativeEvent.coordinate : p))} onPress={e => { e.stopPropagation(); setSelectedVertex(index); }} pinColor="#16a34a" title={`Point ${index + 1}`} />
              ))}
              {polygonPoints.length > 1 && (
                <Polyline coordinates={polygonPoints} strokeColor="#16a34a" strokeWidth={4} />
              )}
              {polygonPoints.length >= 2 && (
                <Polygon coordinates={polygonPoints} fillColor="rgba(34, 197, 94, 0.35)" strokeColor="#16a34a" strokeWidth={3} />
              )}
            </>
          )}
        </MapView>
      )}

      {/* Header overlay */}
      <SafeAreaView style={styles.headerContainer} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={22} color="#1a1a1a" />
            </TouchableOpacity>
            <View style={styles.headerTextContainer}>
              <Text style={styles.headerTitle}>Pond Map</Text>
              <Text style={styles.headerSubtitle}>
                {mappedPonds.length} marked / {ponds.length} registered
              </Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.mapTypeButton}
                onPress={showMapTypeSelector}
                accessibilityRole="button"
                accessibilityLabel="Change map type"
              >
                <Ionicons name="layers-outline" size={22} color="#007bff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Map Type + Locate */}
        <View style={styles.mapInfoRow}>
          <View style={styles.mapTypeLabel}>
            <Text style={styles.mapTypeText}>
              {MAP_OPTIONS.find(t => t.value === mapType && t.tileSource === tileSource)?.label || 'OpenStreetMap'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.mapLocateButton}
            onPress={centerOnMyLocation}
            disabled={locating}
            accessibilityRole="button"
            accessibilityLabel="Center map to my location"
          >
            {locating ? (
              <ActivityIndicator size="small" color="#0b6cd4" />
            ) : (
              <Ionicons name="locate-outline" size={18} color="#0b6cd4" />
            )}
          </TouchableOpacity>
          {mappedPonds.length > 0 && (
            <TouchableOpacity
              style={styles.mapLocateButton}
              onPress={() => fitToMarkedPonds(true)}
              accessibilityRole="button"
              accessibilityLabel="Show all marked ponds"
            >
              <Ionicons name="scan-outline" size={18} color="#0b6cd4" />
            </TouchableOpacity>
          )}
        </View>

        {/* Mode indicator */}
        {mapMode !== 'view' && (
          <View style={styles.modeIndicator}>
            <Ionicons name="create" size={16} color="#fff" />
            <Text style={styles.modeText}>
              {mapMode === 'point' ? 'Tap to place pond marker' : `Tap to add boundary points (${polygonPoints.length})`}
            </Text>
          </View>
        )}

        {mapMode === 'view' && ponds.length === 0 && (
          <View style={styles.emptyMapHint}>
            <Ionicons name="information-circle-outline" size={16} color="#0b6aa8" />
            <Text style={styles.emptyMapHintText}>No ponds yet. Tap Add Pond to add your first pond.</Text>
          </View>
        )}

        {mapMode === 'view' && ponds.length > 0 && mappedPonds.length === 0 && (
          <View style={styles.emptyMapHint}>
            <Ionicons name="information-circle-outline" size={16} color="#0b6aa8" />
            <Text style={styles.emptyMapHintText}>No saved pond coordinates found yet.</Text>
          </View>
        )}

        {/* Polygon area */}
        {polygonPoints.length >= 3 && (
          <View style={styles.areaBadge}>
            <Text style={styles.areaText}>
              Area: {formatArea(calculatePolygonArea(polygonPoints))}
            </Text>
          </View>
        )}
      </SafeAreaView>

      {/* Bottom Controls Container */}
      <SafeAreaView
        style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}
        edges={['left', 'right']}
      >
        {/* Add Pond Button (View Mode) */}
        {mapMode === 'view' && (
          <View style={styles.addControls}>
            <View style={styles.addHintCard}>
              <Ionicons name="information-circle-outline" size={16} color="#0b6aa8" />
              <Text style={styles.addHintText}>Tap Add Pond, then choose marker or boundary.</Text>
            </View>

            <TouchableOpacity
              style={styles.addPondButton}
              onPress={showModeSelector}
              accessibilityRole="button"
              accessibilityLabel="Add pond"
            >
              <Ionicons name="add-circle" size={22} color="#fff" />
              <Text style={styles.addPondButtonText}>Add Pond</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Editing Controls */}
        {mapMode !== 'view' && (
          <View style={styles.editControls}>
            <View style={styles.editHintBar}>
              <Ionicons
                name={mapMode === 'point' ? 'pin-outline' : 'shapes-outline'}
                size={15}
                color="#0b6aa8"
              />
              <Text style={styles.editHintText}>{editHintText}</Text>
            </View>

            {mapMode === 'polygon' && (
              <View style={styles.polygonEditBar}>
                <Text style={styles.polygonHelpText}>
                  {movingBoundary
                    ? 'Tap the map to place the boundary center.'
                    : 'Drag a point to move it. Tap the map to add a point.'}
                </Text>
                {polygonPoints.length >= 3 && (
                  <TouchableOpacity
                    style={styles.polygonActionPill}
                    activeOpacity={0.85}
                    onPress={() => {
                      setMovingBoundary(!movingBoundary);
                      setSelectedVertex(null);
                    }}
                  >
                    <Ionicons
                      name={movingBoundary ? 'close-circle-outline' : 'move-outline'}
                      size={15}
                      color={aquapinColors.blue}
                    />
                    <Text style={styles.polygonActionPillText}>
                      {movingBoundary ? 'Cancel Move' : 'Move Whole Boundary'}
                    </Text>
                  </TouchableOpacity>
                )}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.vertexScroll}>
                  {polygonPoints.map((_, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setSelectedVertex(i)}
                      style={[
                        styles.vertexChip,
                        selectedVertex === i && styles.vertexChipActive,
                      ]}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.vertexChipText,
                          selectedVertex === i && styles.vertexChipTextActive,
                        ]}
                      >
                        Point {i + 1}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {selectedVertex !== null && (
                  <View style={styles.vertexActionRow}>
                    <Text style={styles.vertexSelectedHint}>
                      Tap map to move Point {selectedVertex + 1}.
                    </Text>
                    <View style={styles.vertexButtons}>
                      <TouchableOpacity
                        style={styles.vertexDeleteBtn}
                        onPress={() => {
                          setPolygonPoints((prev) => prev.filter((_, i) => i !== selectedVertex));
                          setSelectedVertex(null);
                        }}
                      >
                        <Ionicons name="trash-outline" size={14} color={aquapinColors.red} />
                        <Text style={styles.vertexDeleteBtnText}>Remove</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.vertexAddAfterBtn}
                        onPress={() => {
                          setPolygonPoints((prev) => {
                            const a = prev[selectedVertex];
                            const b = prev[(selectedVertex + 1) % prev.length];
                            if (!a || !b) return prev;
                            return [
                              ...prev.slice(0, selectedVertex + 1),
                              { latitude: (a.latitude + b.latitude) / 2, longitude: (a.longitude + b.longitude) / 2 },
                              ...prev.slice(selectedVertex + 1),
                            ];
                          });
                          setSelectedVertex(null);
                        }}
                      >
                        <Ionicons name="add-circle-outline" size={14} color={aquapinColors.teal} />
                        <Text style={styles.vertexAddAfterBtnText}>Add After</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.vertexDoneBtn}
                        onPress={() => setSelectedVertex(null)}
                      >
                        <Text style={styles.vertexDoneBtnText}>Done</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}
            <View style={styles.editButtonsRow}>
              {mapMode === 'polygon' && polygonPoints.length > 0 && (
                <TouchableOpacity style={styles.undoButton} onPress={undoLastPoint}>
                  <Ionicons name="arrow-undo" size={20} color="#666" />
                  <Text style={styles.undoText}>Undo</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.cancelEditButton} onPress={cancelEditing}>
                <Text style={styles.cancelEditText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, !canConfirmEdit && styles.confirmButtonDisabled]}
                onPress={handleEditConfirm}
                disabled={!canConfirmEdit || loading}
              >
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.confirmButtonText}>
                  {loading ? 'Saving...' : editingPondId ? 'Save Changes' : mapMode === 'point' ? 'Save Pond' : 'Finish Boundary'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>

      {/* Selected Pond Bottom Sheet Modal (Enhanced UI/UX) */}
      <Modal
        visible={Boolean(selectedMappedId)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedMappedId(null)}
      >
        <View style={styles.sheetOverlay}>
          <View style={styles.sheetContainer}>
            {(() => {
              const clickedPond = ponds.find((p) => p.id === selectedMappedId);
              const clickedMapped = mappedPonds.find((p) => p.id === selectedMappedId);
              const isPondActive = clickedPond?.isActive || Number(clickedPond?.currentStockCount) > 0;

              return (
                <>
                  <View style={styles.sheetHeader}>
                    <View style={styles.sheetTitleGroup}>
                      <View
                        style={[
                          styles.sheetIconWrap,
                          {
                            backgroundColor: isPondActive
                              ? aquapinColors.blueSoft
                              : aquapinColors.surfaceMuted,
                          },
                        ]}
                      >
                        <Ionicons
                          name="water"
                          size={22}
                          color={isPondActive ? aquapinColors.blue : aquapinColors.textMuted}
                        />
                      </View>
                      <View style={styles.sheetTitleWrap}>
                        <Text style={styles.sheetPondName} numberOfLines={1}>
                          {clickedPond?.name || 'Pond Details'}
                        </Text>
                        <View style={styles.sheetBadgeRow}>
                          <View
                            style={[
                              styles.sheetStatusBadge,
                              isPondActive
                                ? styles.sheetStatusActive
                                : styles.sheetStatusInactive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.sheetStatusText,
                                isPondActive
                                  ? styles.sheetStatusTextActive
                                  : styles.sheetStatusTextInactive,
                              ]}
                            >
                              {isPondActive ? 'Active' : 'Inactive'}
                            </Text>
                          </View>
                          <View style={styles.sheetMappingBadge}>
                            <Ionicons
                              name={clickedMapped?.boundary?.length ? 'shapes-outline' : 'pin-outline'}
                              size={12}
                              color={aquapinColors.textMuted}
                            />
                            <Text style={styles.sheetMappingText}>
                              {clickedMapped?.boundary?.length
                                ? 'Polygon'
                                : clickedMapped
                                  ? 'GPS Point'
                                  : 'Unmapped'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.sheetCloseButton}
                      onPress={() => setSelectedMappedId(null)}
                      accessibilityRole="button"
                      accessibilityLabel="Close"
                    >
                      <Ionicons name="close" size={20} color={aquapinColors.text} />
                    </TouchableOpacity>
                  </View>

                  {/* Pond Info Summary */}
                  <View style={styles.sheetInfoStrip}>
                    <View style={styles.sheetInfoCol}>
                      <Text style={styles.sheetInfoLabel}>Species</Text>
                      <Text style={styles.sheetInfoValue} numberOfLines={1}>
                        {clickedPond?.currentSpecies || 'None'}
                      </Text>
                    </View>
                    <View style={styles.sheetInfoDivider} />
                    <View style={styles.sheetInfoCol}>
                      <Text style={styles.sheetInfoLabel}>Stock Count</Text>
                      <Text style={styles.sheetInfoValue}>
                        {clickedPond?.currentStockCount
                          ? `${formatWholeNumber(clickedPond.currentStockCount)} fish`
                          : '0 fish'}
                      </Text>
                    </View>
                    <View style={styles.sheetInfoDivider} />
                    <View style={styles.sheetInfoCol}>
                      <Text style={styles.sheetInfoLabel}>Area / Map</Text>
                      <Text style={styles.sheetInfoValue} numberOfLines={1}>
                        {clickedMapped?.boundary?.length
                          ? formatArea(calculatePolygonArea(clickedMapped.boundary))
                          : 'Center Point'}
                      </Text>
                    </View>
                  </View>

                  {/* Clearly Visible & Highly Styled Action Buttons */}
                  <View style={styles.sheetActionContainer}>
                    <TouchableOpacity
                      style={styles.sheetPrimaryButton}
                      activeOpacity={0.88}
                      onPress={() => {
                        const id = selectedMappedId;
                        setSelectedMappedId(null);
                        setDetailsPondId(id);
                      }}
                    >
                      <View style={styles.sheetBtnIconText}>
                        <Ionicons name="document-text-outline" size={18} color="#ffffff" />
                        <Text style={styles.sheetPrimaryButtonText}>View Details & Records</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="#ffffff" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.sheetSecondaryButton}
                      activeOpacity={0.88}
                      onPress={() => beginMappingEdit()}
                    >
                      <View style={styles.sheetBtnIconText}>
                        <Ionicons
                          name={clickedMapped?.boundary?.length ? 'shapes-outline' : 'pin-outline'}
                          size={18}
                          color={aquapinColors.teal}
                        />
                        <Text style={styles.sheetSecondaryButtonText}>
                          {clickedMapped?.boundary?.length ? 'Edit Polygon Boundary' : 'Edit GPS Location'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={aquapinColors.textMuted} />
                    </TouchableOpacity>

                    {!clickedMapped?.boundary?.length && (
                      <TouchableOpacity
                        style={styles.sheetAddBoundaryButton}
                        activeOpacity={0.88}
                        onPress={() => beginMappingEdit(true)}
                      >
                        <View style={styles.sheetBtnIconText}>
                          <Ionicons name="shapes" size={18} color={aquapinColors.teal} />
                          <Text style={styles.sheetAddBoundaryButtonText}>Draw Polygon Boundary</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={aquapinColors.teal} />
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Pond Details Features Modal (Opens in front directly on Map - No Pond Details page in back) */}
      <Modal
        visible={Boolean(selectedDetailsPond)}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailsPondId(null)}
      >
        <View style={styles.detailsModalOverlay}>
          <View style={styles.detailsModalCard}>
            {/* Modal Header */}
            <View style={styles.detailsModalHeader}>
              <View style={styles.detailsModalTitleGroup}>
                <View
                  style={[
                    styles.detailsPondIconWrap,
                    {
                      backgroundColor: isDetailsPondActive
                        ? aquapinColors.blueSoft
                        : aquapinColors.surfaceMuted,
                    },
                  ]}
                >
                  <Ionicons
                    name="water"
                    size={20}
                    color={isDetailsPondActive ? aquapinColors.blue : aquapinColors.textMuted}
                  />
                </View>
                <View style={styles.detailsModalHeaderCopy}>
                  <Text style={styles.detailsModalTitle}>{selectedDetailsPond?.name || 'Pond Details'}</Text>
                  <Text style={styles.detailsModalSubtitle}>
                    {isDetailsPondActive ? 'Active' : 'Inactive'} ·{' '}
                    {selectedDetailsPond?.currentSpecies || 'No species set'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.detailsCloseButton}
                onPress={() => setDetailsPondId(null)}
                accessibilityRole="button"
                accessibilityLabel="Close pond details"
              >
                <Ionicons name="close" size={20} color={aquapinColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailsModalScroll}>
              {/* Quick Actions Grid */}
              <View style={styles.detailsActionGrid}>
                <TouchableOpacity
                  style={styles.detailsActionPill}
                  activeOpacity={0.88}
                  onPress={() => setDetailsEditingName(selectedDetailsPond?.name || '')}
                >
                  <View style={[styles.detailsActionIconBadge, { backgroundColor: aquapinColors.blueSoft }]}>
                    <Ionicons name="create-outline" size={15} color={aquapinColors.blue} />
                  </View>
                  <Text style={styles.detailsActionPillText}>Edit Name</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.detailsActionPill}
                  activeOpacity={0.88}
                  onPress={() => {
                    const id = detailsPondId;
                    setDetailsPondId(null);
                    setSelectedMappedId(id);
                    beginMappingEdit();
                  }}
                >
                  <View style={[styles.detailsActionIconBadge, { backgroundColor: aquapinColors.tealSoft }]}>
                    <Ionicons name="map-outline" size={15} color={aquapinColors.teal} />
                  </View>
                  <Text style={styles.detailsActionPillText}>Map / Boundary</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.detailsActionPill}
                  activeOpacity={0.88}
                  onPress={() => openDetailsPondRecords('stocking')}
                >
                  <View style={[styles.detailsActionIconBadge, { backgroundColor: aquapinColors.greenSoft }]}>
                    <Ionicons name="add-circle-outline" size={15} color={aquapinColors.green} />
                  </View>
                  <Text style={styles.detailsActionPillText}>Log Stocking</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.detailsActionPill}
                  activeOpacity={0.88}
                  onPress={() => openDetailsPondRecords('harvest')}
                >
                  <View style={[styles.detailsActionIconBadge, { backgroundColor: aquapinColors.blueSoft }]}>
                    <Ionicons name="basket-outline" size={15} color={aquapinColors.blue} />
                  </View>
                  <Text style={styles.detailsActionPillText}>Log Harvest</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.detailsActionPill}
                  activeOpacity={0.88}
                  onPress={() => openDetailsPondRecords('mortality')}
                >
                  <View style={[styles.detailsActionIconBadge, { backgroundColor: aquapinColors.redSoft }]}>
                    <Ionicons name="skull-outline" size={15} color={aquapinColors.red} />
                  </View>
                  <Text style={styles.detailsActionPillText}>Log Mortality</Text>
                </TouchableOpacity>
              </View>

              {/* Inline Editing Section */}
              {detailsEditingName !== null && (
                <View style={styles.detailsEditSection}>
                  <Text style={styles.detailsEditSectionTitle}>Rename Pond</Text>
                  <TextInput
                    accessibilityLabel="Pond name"
                    value={detailsEditingName}
                    onChangeText={setDetailsEditingName}
                    editable={!detailsSavingPond}
                    style={styles.detailsEditInput}
                    placeholder="Enter pond name"
                    placeholderTextColor={aquapinColors.textMuted}
                  />
                  <View style={styles.detailsEditButtonRow}>
                    <TouchableOpacity
                      style={[
                        styles.detailsSaveBtn,
                        (!detailsEditingName.trim() || detailsSavingPond) && styles.detailsBtnDisabled,
                      ]}
                      disabled={detailsSavingPond || !detailsEditingName.trim() || detailsEditingName.trim() === selectedDetailsPond?.name}
                      onPress={() => saveDetailsPondChanges({ name: detailsEditingName.trim() })}
                    >
                      <Text style={styles.detailsSaveBtnText}>{detailsSavingPond ? 'Saving...' : 'Save Name'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.detailsCancelBtn}
                      disabled={detailsSavingPond}
                      onPress={() => setDetailsEditingName(null)}
                    >
                      <Text style={styles.detailsCancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Pond Core Information Card */}
              <View style={styles.detailsInfoCard}>
                <Text style={styles.detailsCardSectionHeading}>Pond Information</Text>

                <View style={styles.detailsRow}>
                  <Text style={styles.detailsLabel}>Status</Text>
                  <Text
                    style={[
                      styles.detailsValue,
                      {
                        color: isDetailsPondActive
                          ? aquapinColors.green
                          : aquapinColors.textMuted,
                      },
                    ]}
                  >
                    {isDetailsPondActive ? 'Active' : 'Inactive'}
                  </Text>
                </View>

                <View style={styles.detailsRow}>
                  <Text style={styles.detailsLabel}>Current Species</Text>
                  <Text style={styles.detailsValue}>{selectedDetailsPond?.currentSpecies || 'Not set'}</Text>
                </View>

                <View style={styles.detailsRow}>
                  <Text style={styles.detailsLabel}>Estimated Stock</Text>
                  <Text style={styles.detailsValue}>
                    {selectedDetailsPond?.currentStockCount
                      ? `${formatWholeNumber(selectedDetailsPond.currentStockCount)} fish`
                      : '0 fish'}
                  </Text>
                </View>

                <View style={styles.detailsRow}>
                  <Text style={styles.detailsLabel}>Boundary / Mapping</Text>
                  <Text style={styles.detailsValue}>
                    {selectedDetailsPond?.boundary
                      ? 'Polygon Mapped'
                      : selectedDetailsPond?.location
                        ? 'GPS Point Only'
                        : 'Unmapped'}
                  </Text>
                </View>

                <View style={[styles.detailsRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.detailsLabel}>Registered On</Text>
                  <Text style={styles.detailsValue}>{formatDate(selectedDetailsPond?.createdAt)}</Text>
                </View>

                {detailsPondCoords && (
                  <TouchableOpacity
                    style={styles.detailsNavigateButton}
                    onPress={() => openNavigation(detailsPondCoords)}
                    activeOpacity={0.88}
                  >
                    <Ionicons name="navigate-outline" size={16} color={aquapinColors.blue} />
                    <Text style={styles.detailsNavigateButtonText}>Navigate to Pond (Maps)</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Production Metrics */}
              {detailsPondKpis && (
                <View style={styles.detailsInfoCard}>
                  <Text style={styles.detailsCardSectionHeading}>Production Metrics</Text>
                  <View style={styles.detailsKpiGrid}>
                    <View style={styles.detailsKpiCard}>
                      <Text style={styles.detailsKpiLabel}>Total Stocked</Text>
                      <Text style={styles.detailsKpiValue}>{formatWholeNumber(detailsPondKpis.totalStocked)}</Text>
                    </View>
                    <View style={styles.detailsKpiCard}>
                      <Text style={styles.detailsKpiLabel}>Total Harvest</Text>
                      <Text style={styles.detailsKpiValue}>
                        {detailsPondKpis.totalHarvestKg > 0 ? `${formatWholeNumber(detailsPondKpis.totalHarvestKg)} kg` : '--'}
                      </Text>
                    </View>
                    <View style={styles.detailsKpiCard}>
                      <Text style={styles.detailsKpiLabel}>Survival Rate</Text>
                      <Text
                        style={[
                          styles.detailsKpiValue,
                          {
                            color:
                              detailsPondKpis.survivalRate !== null && detailsPondKpis.survivalRate >= 80
                                ? aquapinColors.green
                                : detailsPondKpis.survivalRate !== null && detailsPondKpis.survivalRate < 60
                                  ? aquapinColors.red
                                  : aquapinColors.text,
                          },
                        ]}
                      >
                        {detailsPondKpis.survivalRate !== null ? `${detailsPondKpis.survivalRate.toFixed(1)}%` : '--'}
                      </Text>
                    </View>
                    <View style={styles.detailsKpiCard}>
                      <Text style={styles.detailsKpiLabel}>Harvest ETA</Text>
                      <Text style={styles.detailsKpiValue}>
                        {detailsPondKpis.projectedHarvestDate ? formatDate(detailsPondKpis.projectedHarvestDate) : '--'}
                      </Text>
                    </View>
                    {detailsPondKpis.projectedHarvestValue !== null && detailsPondKpis.projectedHarvestValue > 0 && (
                      <View style={[styles.detailsKpiCard, { width: '100%' }]}>
                        <Text style={styles.detailsKpiLabel}>Projected Harvest Value</Text>
                        <Text style={[styles.detailsKpiValue, { color: aquapinColors.green }]}>
                          {formatCurrencyPhp(detailsPondKpis.projectedHarvestValue)}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Pond Alerts */}
              {detailsSmartAlerts.length > 0 && (
                <View style={styles.detailsAlertsContainer}>
                  <Text style={styles.detailsCardSectionHeading}>Pond Alerts</Text>
                  {detailsSmartAlerts.map((alert, index) => {
                    const isCritical = alert.level === 'critical';
                    const isWarning = alert.level === 'warning';
                    return (
                      <View
                        key={`${alert.title}-${index}`}
                        style={[
                          styles.detailsAlertCard,
                          isCritical
                            ? styles.detailsAlertCritical
                            : isWarning
                              ? styles.detailsAlertWarning
                              : styles.detailsAlertInfo,
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
                        <View style={styles.detailsAlertTextWrap}>
                          <Text style={styles.detailsAlertTitle}>{alert.title}</Text>
                          <Text style={styles.detailsAlertMessage}>{alert.message}</Text>
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

      {/* Add Pond Mode Selector Modal (Enhanced UI/UX) */}
      <Modal
        visible={addModeModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddModeModalVisible(false)}
      >
        <View style={styles.sheetOverlay}>
          <View style={styles.sheetContainer}>
            <View style={styles.addModeHeader}>
              <View>
                <Text style={styles.addModeTitle}>Add New Pond</Text>
                <Text style={styles.addModeSubtitle}>Choose how you would like to mark this pond</Text>
              </View>
              <TouchableOpacity
                style={styles.sheetCloseButton}
                onPress={() => setAddModeModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={20} color={aquapinColors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.addModeCardsContainer}>
              <TouchableOpacity
                style={styles.addModeCard}
                activeOpacity={0.88}
                onPress={() => {
                  setAddModeModalVisible(false);
                  setMapMode('point');
                  setPolygonPoints([]);
                }}
              >
                <View style={[styles.addModeCardIcon, { backgroundColor: aquapinColors.blueSoft }]}>
                  <Ionicons name="location" size={24} color={aquapinColors.blue} />
                </View>
                <View style={styles.addModeCardCopy}>
                  <Text style={styles.addModeCardTitle}>Single GPS Point</Text>
                  <Text style={styles.addModeCardDesc}>
                    Drop a single marker at the pond center using current location or map tap.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={aquapinColors.blue} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.addModeCard}
                activeOpacity={0.88}
                onPress={() => {
                  setAddModeModalVisible(false);
                  setMapMode('polygon');
                  setSelectedLocation(null);
                }}
              >
                <View style={[styles.addModeCardIcon, { backgroundColor: aquapinColors.tealSoft }]}>
                  <Ionicons name="shapes" size={24} color={aquapinColors.teal} />
                </View>
                <View style={styles.addModeCardCopy}>
                  <Text style={styles.addModeCardTitle}>Draw Pond Boundary</Text>
                  <Text style={styles.addModeCardDesc}>
                    Tap points to trace the pond shape and compute accurate water surface area.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={aquapinColors.teal} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create Pond Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => {
          Keyboard.dismiss();
          setModalVisible(false);
        }}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalSheetContainer,
              {
                bottom: sheetBottom,
                maxHeight: sheetMaxHeight,
              },
            ]}
          >
            <View
              style={[
                styles.modalContent,
                keyboardOffset > 0 && styles.modalContentKeyboard,
              ]}
            >
              <ScrollView
                style={styles.modalBody}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                bounces={false}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                  styles.modalContentInner,
                  keyboardOffset > 0 && styles.modalContentInnerKeyboard,
                ]}
              >
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Create New Pond</Text>
                  <TouchableOpacity
                    onPress={() => {
                      Keyboard.dismiss();
                      setModalVisible(false);
                    }}
                  >
                    <Ionicons name="close" size={24} color="#666" />
                  </TouchableOpacity>
                </View>

                {/* Location/Boundary info */}
                <View style={styles.infoBox}>
                  {mapMode === 'point' && selectedLocation ? (
                    <>
                      <Ionicons name="location" size={16} color="#007bff" />
                      <Text style={styles.coordinateText}>
                        {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
                      </Text>
                    </>
                  ) : polygonPoints.length >= 3 ? (
                    <>
                      <Ionicons name="shapes" size={16} color="#28a745" />
                      <Text style={styles.coordinateText}>
                        {polygonPoints.length} points • {formatArea(calculatePolygonArea(polygonPoints))}
                      </Text>
                    </>
                  ) : null}
                </View>

                <Text style={styles.label}>Pond Name</Text>
                <TextInput
                  style={[
                    styles.input,
                    keyboardOffset > 0 && styles.inputKeyboard,
                  ]}
                  value={pondName}
                  onChangeText={setPondName}
                  placeholder="e.g., Pond A, North Farm Pond 1"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleCreatePond}
                  blurOnSubmit
                />
              </ScrollView>

              <View
                style={[
                  styles.modalButtons,
                  styles.modalFooter,
                  {
                    paddingBottom:
                      keyboardOffset > 0
                        ? 16
                        : restingSheetBottom,
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => {
                    Keyboard.dismiss();
                    setModalVisible(false);
                    setPondName('');
                  }}
                  disabled={loading}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalConfirmButton, !pondName.trim() && styles.buttonDisabled]}
                  onPress={handleCreatePond}
                  disabled={!pondName.trim() || loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <Text style={styles.modalConfirmText}>Create</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  map: {
    flex: 1,
  },
  headerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  header: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  mapTypeButton: {
    width: 44,
    height: 44,
    backgroundColor: '#f0f7ff',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapTypeLabel: {
    backgroundColor: 'rgba(0, 123, 255, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  mapInfoRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  mapLocateButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1,
    borderColor: '#b7d4f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapTypeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  modeIndicator: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(0, 123, 255, 0.9)',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  modeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  emptyMapHint: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(13, 148, 217, 0.18)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  emptyMapHintText: {
    color: '#0b6aa8',
    fontSize: 12,
    fontWeight: '600',
  },
  areaBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(22, 163, 74, 0.95)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 8,
  },
  areaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    alignItems: 'stretch',
  },
  addControls: {
    alignItems: 'flex-end',
  },
  addHintCard: {
    maxWidth: 250,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#c7ddf3',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  addHintText: {
    color: '#0b6aa8',
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  addPondButton: {
    backgroundColor: '#007bff',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    height: 56,
    shadowColor: '#007bff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    marginBottom: 8,
  },
  addPondButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  editControls: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#c8def3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    marginBottom: 8,
  },
  editHintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#edf6ff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  editHintText: {
    color: '#0b6aa8',
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  editButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  undoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  undoText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelEditButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cancelEditText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1.2,
    backgroundColor: '#28a745',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#28a745',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  confirmButtonDisabled: {
    backgroundColor: '#92c9a0',
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalSheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  modalContentKeyboard: {
    flexShrink: 1,
  },
  modalBody: {
    flexShrink: 1,
  },
  modalContentInner: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
  },
  modalContentInnerKeyboard: {
    paddingBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  infoBox: {
    backgroundColor: '#f0f7ff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  coordinateText: {
    fontSize: 14,
    color: '#007bff',
    fontWeight: '500',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e1e4e8',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#1a1a1a',
    marginBottom: 0,
  },
  inputKeyboard: {
    paddingVertical: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalFooter: {
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eef2f7',
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 2,
    backgroundColor: '#007bff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  modalConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: aquapinColors.background,
    borderTopLeftRadius: aquapinRadius.sheet,
    borderTopRightRadius: aquapinRadius.sheet,
    padding: 20,
    paddingBottom: 34,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  sheetIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitleWrap: {
    flex: 1,
  },
  sheetPondName: {
    fontSize: 18,
    fontWeight: '900',
    color: aquapinColors.text,
  },
  sheetBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  sheetStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: aquapinRadius.pill,
  },
  sheetStatusActive: {
    backgroundColor: aquapinColors.greenSoft,
  },
  sheetStatusInactive: {
    backgroundColor: aquapinColors.surfaceMuted,
  },
  sheetStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  sheetStatusTextActive: {
    color: aquapinColors.green,
  },
  sheetStatusTextInactive: {
    color: aquapinColors.textMuted,
  },
  sheetMappingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: aquapinColors.surface,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: aquapinRadius.pill,
    borderWidth: 1,
    borderColor: aquapinColors.border,
  },
  sheetMappingText: {
    fontSize: 11,
    fontWeight: '600',
    color: aquapinColors.textMuted,
  },
  sheetCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: aquapinColors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetInfoStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: aquapinColors.surface,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.92)',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
    shadowColor: '#16335c',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  sheetInfoCol: {
    flex: 1,
    alignItems: 'center',
  },
  sheetInfoLabel: {
    fontSize: 11,
    color: aquapinColors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  sheetInfoValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '800',
    color: aquapinColors.text,
  },
  sheetInfoDivider: {
    width: 1,
    height: 24,
    backgroundColor: aquapinColors.border,
  },
  sheetActionContainer: {
    gap: 10,
  },
  sheetPrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: aquapinColors.blue,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: aquapinColors.blue,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  sheetBtnIconText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sheetPrimaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  sheetSecondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: aquapinColors.surface,
    borderWidth: 1.2,
    borderColor: aquapinColors.border,
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  sheetSecondaryButtonText: {
    color: aquapinColors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  sheetAddBoundaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: aquapinColors.tealSoft,
    borderWidth: 1.2,
    borderColor: aquapinColors.teal,
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  sheetAddBoundaryButtonText: {
    color: aquapinColors.teal,
    fontSize: 14,
    fontWeight: '800',
  },
  addModeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  addModeTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: aquapinColors.text,
  },
  addModeSubtitle: {
    fontSize: 13,
    color: aquapinColors.textMuted,
    marginTop: 2,
  },
  addModeCardsContainer: {
    gap: 12,
  },
  addModeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: aquapinColors.surface,
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.92)',
    padding: 16,
    shadowColor: '#16335c',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  addModeCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  addModeCardCopy: {
    flex: 1,
    marginRight: 10,
  },
  addModeCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: aquapinColors.text,
  },
  addModeCardDesc: {
    fontSize: 12,
    color: aquapinColors.textMuted,
    marginTop: 4,
    lineHeight: 17,
  },
  polygonEditBar: {
    backgroundColor: aquapinColors.surface,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: aquapinColors.border,
  },
  polygonHelpText: {
    fontSize: 12,
    color: aquapinColors.textMuted,
    lineHeight: 17,
    marginBottom: 8,
  },
  polygonActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: aquapinColors.blueSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: aquapinRadius.pill,
    marginBottom: 8,
  },
  polygonActionPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: aquapinColors.blue,
  },
  vertexScroll: {
    marginVertical: 4,
  },
  vertexChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: aquapinRadius.pill,
    backgroundColor: aquapinColors.surfaceMuted,
    marginRight: 6,
    borderWidth: 1,
    borderColor: aquapinColors.border,
  },
  vertexChipActive: {
    backgroundColor: aquapinColors.blueSoft,
    borderColor: aquapinColors.blue,
  },
  vertexChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: aquapinColors.textMuted,
  },
  vertexChipTextActive: {
    color: aquapinColors.blue,
  },
  vertexActionRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: aquapinColors.surfaceMuted,
  },
  vertexSelectedHint: {
    fontSize: 12,
    fontWeight: '600',
    color: aquapinColors.text,
    marginBottom: 6,
  },
  vertexButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  vertexDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: aquapinColors.redSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: aquapinRadius.pill,
  },
  vertexDeleteBtnText: {
    color: aquapinColors.red,
    fontSize: 12,
    fontWeight: '700',
  },
  vertexAddAfterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: aquapinColors.tealSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: aquapinRadius.pill,
  },
  vertexAddAfterBtnText: {
    color: aquapinColors.teal,
    fontSize: 12,
    fontWeight: '700',
  },
  vertexDoneBtn: {
    backgroundColor: aquapinColors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: aquapinRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vertexDoneBtnText: {
    color: aquapinColors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  detailsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  detailsModalCard: {
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
  detailsModalHeader: {
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
  detailsModalTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  detailsPondIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsModalHeaderCopy: {
    flex: 1,
  },
  detailsModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: aquapinColors.text,
  },
  detailsModalSubtitle: {
    fontSize: 12,
    color: aquapinColors.textMuted,
    marginTop: 2,
  },
  detailsCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: aquapinColors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsModalScroll: {
    padding: 16,
    gap: 14,
  },
  detailsActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailsActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: aquapinColors.surface,
    borderWidth: 1.2,
    borderColor: 'rgba(11, 106, 168, 0.16)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: aquapinRadius.pill,
    shadowColor: '#16335c',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  detailsActionIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsActionPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: aquapinColors.text,
  },
  detailsEditSection: {
    backgroundColor: aquapinColors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    gap: 10,
  },
  detailsEditSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: aquapinColors.text,
  },
  detailsEditInput: {
    borderWidth: 1,
    borderColor: aquapinColors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: aquapinColors.text,
    backgroundColor: aquapinColors.surfaceMuted,
  },
  detailsEditButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  detailsSaveBtn: {
    backgroundColor: aquapinColors.blue,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: aquapinRadius.pill,
  },
  detailsSaveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  detailsBtnDisabled: {
    opacity: 0.5,
  },
  detailsCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  detailsCancelBtnText: {
    color: aquapinColors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  detailsInfoCard: {
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
  detailsCardSectionHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: aquapinColors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: aquapinColors.surfaceMuted,
  },
  detailsLabel: {
    fontSize: 13,
    color: aquapinColors.textMuted,
    fontWeight: '600',
  },
  detailsValue: {
    fontSize: 14,
    color: aquapinColors.text,
    fontWeight: '700',
  },
  detailsNavigateButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: aquapinColors.blueSoft,
    borderRadius: aquapinRadius.pill,
    paddingVertical: 10,
  },
  detailsNavigateButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: aquapinColors.blue,
  },
  detailsKpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailsKpiCard: {
    width: '48.5%',
    backgroundColor: aquapinColors.surfaceMuted,
    borderRadius: 14,
    padding: 12,
  },
  detailsKpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: aquapinColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  detailsKpiValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '900',
    color: aquapinColors.text,
  },
  detailsAlertsContainer: {
    gap: 8,
  },
  detailsAlertCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 16,
    padding: 12,
  },
  detailsAlertCritical: {
    backgroundColor: aquapinColors.redSoft,
  },
  detailsAlertWarning: {
    backgroundColor: aquapinColors.amberSoft,
  },
  detailsAlertInfo: {
    backgroundColor: aquapinColors.blueSoft,
  },
  detailsAlertTextWrap: {
    flex: 1,
  },
  detailsAlertTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: aquapinColors.text,
  },
  detailsAlertMessage: {
    marginTop: 2,
    fontSize: 12,
    color: aquapinColors.textMuted,
    lineHeight: 17,
  },
});
