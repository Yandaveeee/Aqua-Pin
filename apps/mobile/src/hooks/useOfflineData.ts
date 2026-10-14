import { persistPondEdit, recoverPondEdit } from '../db/pondEdits';
import { validateMapping } from '../lib/mapping';
import { createContext, createElement, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { withLocalMutation } from '../db/localMutation';
import { fetchPondRecords, watchLocalData } from '../db/queries';
import { requestBackgroundSync, subscribeToSyncRequests, subscribeToSyncState } from '../db/syncEvents';
import { database, mockDatabase } from '../db';
import { Pond, MortalityLog, Harvest, StockingLog, PondHistory } from '../db/models';
import { recomputePondState } from '../db/pondState';
import { syncData, SyncMetrics, SyncProgress } from '../db/sync';
import NetInfo from '@react-native-community/netinfo';
import { isSupabaseConfigured, getSupabaseConfigError } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_SYNC_SETTINGS,
  enqueueSyncOperation,
  getSyncQueueSnapshot,
  getSyncTimestamps,
  loadSyncSettings,
  loadSyncQueue,
  resetQueueItemsToQueued,
  saveSyncSettings,
  SyncQueueSnapshot,
  SyncSettings,
} from '../db/syncQueue';

// Use real database if available, otherwise use mock
const db = database || mockDatabase;
const isMock = !database;
const getCollection = (name: string) =>
  isMock ? (db.collections as any)[name] : db.collections.get(name);
const LAST_SYNC_AT_KEY = '@aquapin_last_sync_at';

const EMPTY_QUEUE_SNAPSHOT: SyncQueueSnapshot = {
  items: [],
  total: 0,
  queued: 0,
  syncing: 0,
  failed: 0,
  synced: 0,
  conflict: 0,
  blocked: 0,
  pending: 0,
  waitingByEntity: {
    ponds: 0,
    mortality_logs: 0,
    harvests: 0,
    stocking_logs: 0,
    pond_history: 0,
  },
  pendingByEntity: {
    ponds: 0,
    mortality_logs: 0,
    harvests: 0,
    stocking_logs: 0,
    pond_history: 0,
  },
};

function toId(value: any): string {
  return String(value || '').trim();
}

function hasSyncActivity(metrics: SyncMetrics): boolean {
  const hasCounts = (counts: SyncMetrics['pushed']) =>
    Object.values(counts).some((value) => value > 0);

  return (
    metrics.queueBefore > 0 ||
    metrics.queueAfter > 0 ||
    metrics.skipped > 0 ||
    hasCounts(metrics.pushed) ||
    hasCounts(metrics.pulled) ||
    metrics.failed > 0 ||
    metrics.blocked > 0 ||
    metrics.conflict > 0
  );
}

async function enqueueCreateOperation(
  entity: 'ponds' | 'mortality_logs' | 'harvests' | 'stocking_logs' | 'pond_history',
  localId: string,
  payload: Record<string, any>,
  dependsOnPondId?: string
) {
  if (!localId) return;
  await enqueueSyncOperation({
    entity,
    operation: 'create',
    localId,
    payload,
    dependsOn:
      dependsOnPondId && entity !== 'ponds'
        ? [{ entity: 'ponds', localId: dependsOnPondId }]
        : undefined,
  });
}

async function createLocalPondHistoryRecord(data: {
  pondId: string;
  eventType: string;
  eventData?: Record<string, any>;
  createdAt: number;
  recordedBy: string;
}) {
  if (isMock) {
    return await db.collections.pond_history.create((history: any) => {
      history.pondId = data.pondId;
      history.eventType = data.eventType;
      history.eventData = JSON.stringify(data.eventData || {});
      history.createdAt = data.createdAt;
      history.recordedBy = data.recordedBy;
    });
  }

  return await db.write(async () => {
    const collection = db.collections.get('pond_history');
    return await collection.create((history: PondHistory) => {
      history.pondId = data.pondId;
      history.eventType = data.eventType;
      history.eventData = JSON.stringify(data.eventData || {});
      history.createdAt = data.createdAt;
      history.recordedBy = data.recordedBy;
    });
  });
}

async function markLocalStockingsHarvested(pondId: string, options: { queueUpdate?: boolean } = {}) {
  const allStockings = await fetchPondRecords('stocking_logs', pondId);
  const activeStockings = allStockings.filter((stocking: any) => {
    return stocking.pondId === pondId && String(stocking.status || 'active').toLowerCase() !== 'harvested';
  });

  if (activeStockings.length === 0) {
    return;
  }

  if (isMock) {
    for (const stocking of activeStockings) {
      const localId = toId(stocking?.id);
      const nextStocking = { ...stocking, status: 'harvested' };
      await mockDatabase.set(`stocking:${localId}`, nextStocking);

      if (options.queueUpdate) {
        await enqueueSyncOperation({
          entity: 'stocking_logs',
          operation: 'update',
          localId,
          payload: {
            id: localId,
            pondId: nextStocking.pondId,
            species: nextStocking.species,
            quantity: nextStocking.quantity,
            averageWeightG: nextStocking.averageWeightG ?? null,
            source: nextStocking.source ?? null,
            stockedBy: nextStocking.stockedBy,
            createdAt: nextStocking.createdAt,
            status: 'harvested',
          },
          dependsOn: [{ entity: 'ponds', localId: pondId }],
        });
      }
    }

    return;
  }

  const queuedUpdates: Array<{ localId: string; payload: Record<string, any> }> = [];

  await db.write(async () => {
    const updates = [];
    for (const stocking of activeStockings as StockingLog[]) {
      const localId = toId((stocking as any)?.id);
      if (options.queueUpdate && localId) {
        queuedUpdates.push({
          localId,
          payload: {
            id: localId,
            pondId: (stocking as any).pondId,
            species: (stocking as any).species,
            quantity: (stocking as any).quantity,
            averageWeightG: (stocking as any).averageWeightG ?? null,
            source: (stocking as any).source ?? null,
            stockedBy: (stocking as any).stockedBy,
            createdAt: (stocking as any).createdAt,
            status: 'harvested',
          },
        });
      }

      updates.push(stocking.prepareUpdate((record: any) => {
        record.status = 'harvested';
      }));
    }
    await db.batch(...updates);
  });

  if (options.queueUpdate) {
    for (const update of queuedUpdates) {
      await enqueueSyncOperation({
        entity: 'stocking_logs',
        operation: 'update',
        localId: update.localId,
        payload: update.payload,
        dependsOn: [{ entity: 'ponds', localId: pondId }],
      });
    }
  }
}

// Update from durable local writes, without polling or waiting for the cloud.
function useLocalRecords<T>(table: string, pondId?: string) {
  const [state, setState] = useState<{ key: string; records: T[]; loading: boolean }>({
    key: '', records: [], loading: true,
  });
  const key = `${table}:${pondId ?? '*'}`;
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    if (pondId === '') {
      setState({ key, records: [], loading: false });
      return;
    }
    const stop = watchLocalData([table], async () => {
      try {
        const records = pondId === undefined
          ? await getCollection(table).query().fetch()
          : await fetchPondRecords(table, pondId);
        if (pondId !== undefined) records.sort((a: any, b: any) => Number(b.createdAt) - Number(a.createdAt));
        if (!cancelled) setState({ key, records: [...records], loading: false });
      } catch (error) {
        console.error(`Error loading ${table}:`, error);
        if (!cancelled) setState({ key, records: [], loading: false });
      }
    });
    return () => { cancelled = true; stop(); };
  }, [table, pondId, key]));
  return state.key === key ? state : { records: [] as T[], loading: pondId !== '' };
}

export function usePonds() {
  const { records: ponds, loading } = useLocalRecords<Pond>('ponds');
  return { ponds, loading };
}

async function logPondAction(pondId: string, eventType: string, recordedBy: string, eventData: Record<string, any>) {
  const data = { pondId, eventType, recordedBy, eventData, createdAt: Date.now() };
  const history = await createLocalPondHistoryRecord(data);
  await enqueueCreateOperation('pond_history', history.id, { ...data, id: history.id }, pondId);
}

export function useUpdatePond() {
  return useCallback(async (pondId: string, changes: { name?: string; location?: string; boundary?: string | null; isActive?: boolean }, userId: string) => withLocalMutation(async () => {
    await recoverPondEdit(pondId, userId);
    const pond = await getCollection('ponds').find(pondId);
    if (!pond || pond.createdBy !== userId) throw new Error('This pond is unavailable.');
    const payload = Object.fromEntries(['name', 'location', 'boundary', 'createdBy', 'createdAt', 'isActive', 'currentSpecies', 'currentStockCount'].map(key => [key, pond[key] ?? null]));
    Object.assign(payload, changes, { id: pondId });
    if (!String(payload.name || '').trim()) throw new Error('Enter a pond name.');
    if (changes.location !== undefined || changes.boundary !== undefined) validateMapping(payload.location, payload.boundary);
    const changed = Object.keys(changes).some(key => payload[key] !== (pond[key] ?? null));
    if (!changed) return pond;
    const eventType = changes.boundary !== undefined && changes.boundary !== pond.boundary ? (pond.boundary ? 'boundary_updated' : 'boundary_created')
      : changes.location !== undefined && changes.location !== pond.location ? 'location_updated'
      : changes.isActive === false ? 'pond_archived' : 'pond_updated';
    await persistPondEdit(pondId, userId, payload, changes, eventType);
    requestBackgroundSync();
    return payload;
  }), []);
}

// Hook to create a new pond (works offline)
export function useCreatePond() {
  return useCallback(async (data: {
    name: string;
    location: string; // GeoJSON Point string
    createdBy: string;
    boundary?: string; // JSON string of polygon coordinates
  }) => withLocalMutation(async () => {
    try {
      if (data.location || data.boundary) validateMapping(data.location, data.boundary);
      if (!data.name.trim()) throw new Error('Enter a pond name.');
      let createdPond: any

      if (isMock) {
        // Mock implementation
        createdPond = await db.collections.ponds.create((pond: any) => {
          pond.name = data.name;
          pond.location = data.location;
          pond.createdBy = data.createdBy;
          pond.boundary = data.boundary;
          pond.createdAt = Date.now();
          pond.isActive = false;
        });
      } else {
        // Real WatermelonDB implementation
        createdPond = await db.write(async () => {
          const pondsCollection = db.collections.get('ponds');
          return await pondsCollection.create((pond: Pond) => {
            pond.name = data.name;
            pond.location = data.location;
            pond.createdBy = data.createdBy;
            (pond as any).boundary = data.boundary;
            pond.createdAt = Date.now();
            (pond as any).isActive = false;
          });
        });
      }

      const pondId = toId(createdPond?.id || createdPond?._raw?.id);
      await enqueueCreateOperation(
        'ponds',
        pondId,
        {
          id: pondId,
          name: data.name,
          location: data.location,
          boundary: data.boundary ?? null,
          createdBy: data.createdBy,
          createdAt: Date.now(),
          isActive: false,
          currentSpecies: null,
          currentStockCount: 0,
        }
      );

      await logPondAction(pondId, 'pond_created', data.createdBy, { name: data.name });
      if (data.location || data.boundary) await logPondAction(pondId, data.boundary ? 'boundary_created' : 'location_marked', data.createdBy, { name: data.name });
      requestBackgroundSync();

      return createdPond;
    } catch (error) {
      console.error('Error creating pond:', error);
      throw error;
    }
  }), []);
}

// Hook to create mortality log (works offline)
export function useCreateMortalityLog() {
  return useCallback(async (data: {
    pondId: string;
    quantity: number;
    notes?: string;
    loggedBy: string;
  }) => withLocalMutation(async () => {
    try {
      const createdAtTs = Date.now();
      const created = isMock
        ? await db.collections.mortality_logs.create((log: any) => {
            log.pondId = data.pondId;
            log.quantity = data.quantity;
            log.notes = data.notes;
            log.loggedBy = data.loggedBy;
            log.createdAt = createdAtTs;
          })
        : await db.write(async () => {
            const logsCollection = db.collections.get('mortality_logs');
            return await logsCollection.create((log: MortalityLog) => {
              log.pondId = data.pondId;
              log.quantity = data.quantity;
              log.notes = data.notes;
              log.loggedBy = data.loggedBy;
              log.createdAt = createdAtTs;
            });
          });

      const historyEvent = await createLocalPondHistoryRecord({
        pondId: data.pondId,
        eventType: 'mortality',
        eventData: { quantity: data.quantity, notes: data.notes },
        createdAt: createdAtTs,
        recordedBy: data.loggedBy,
      });

      await recomputePondState(data.pondId, { queueUpdate: true });

      await enqueueCreateOperation('mortality_logs', toId((created as any)?.id || (created as any)?._raw?.id), {
        id: toId((created as any)?.id || (created as any)?._raw?.id),
        pondId: data.pondId,
        quantity: data.quantity,
        notes: data.notes ?? null,
        loggedBy: data.loggedBy,
        createdAt: createdAtTs,
      }, data.pondId);

      await enqueueCreateOperation('pond_history', toId((historyEvent as any)?.id || (historyEvent as any)?._raw?.id), {
        id: toId((historyEvent as any)?.id || (historyEvent as any)?._raw?.id),
        pondId: data.pondId,
        eventType: 'mortality',
        eventData: { quantity: data.quantity, notes: data.notes },
        recordedBy: data.loggedBy,
        createdAt: createdAtTs,
      }, data.pondId);

      requestBackgroundSync();

      return created;
    } catch (error) {
      console.error('Error creating mortality log:', error);
      throw error;
    }
  }), []);
}

// Hook to create harvest (works offline)
export function useCreateHarvest() {
  return useCallback(async (data: {
    pondId: string;
    yieldKg: number;
    harvestedBy: string;
    species?: string;
    isPartial?: boolean;
    fishCount?: number;
    pricePerKg?: number;
    totalRevenue?: number;
    isSold?: boolean;
  }) => withLocalMutation(async () => {
    try {
      const createdAtTs = Date.now();
      const isSold = data.isSold ?? (data.totalRevenue !== undefined && data.totalRevenue > 0);
      const pricePerKg = isSold ? (data.pricePerKg ?? (data.totalRevenue && data.yieldKg ? data.totalRevenue / data.yieldKg : 0)) : 0;
      const totalRevenue = isSold ? (data.totalRevenue ?? (pricePerKg * data.yieldKg)) : 0;

      const created = isMock
        ? await db.collections.harvests.create((harvest: any) => {
            harvest.pondId = data.pondId;
            harvest.yieldKg = data.yieldKg;
            harvest.harvestedBy = data.harvestedBy;
            harvest.createdAt = createdAtTs;
            harvest.species = data.species;
            harvest.isPartial = data.isPartial ?? false;
            harvest.fishCount = data.fishCount;
            harvest.pricePerKg = pricePerKg;
            harvest.totalRevenue = totalRevenue;
            harvest.isSold = isSold;
          })
        : await db.write(async () => {
            const harvestsCollection = db.collections.get('harvests');
            return await harvestsCollection.create((harvest: Harvest) => {
              harvest.pondId = data.pondId;
              harvest.yieldKg = data.yieldKg;
              harvest.harvestedBy = data.harvestedBy;
              harvest.createdAt = createdAtTs;
              (harvest as any).species = data.species;
              (harvest as any).isPartial = data.isPartial ?? false;
              (harvest as any).fishCount = data.fishCount;
              (harvest as any).pricePerKg = pricePerKg;
              (harvest as any).totalRevenue = totalRevenue;
              (harvest as any).isSold = isSold;
            });
          });

      if (!(data.isPartial ?? false)) {
        await markLocalStockingsHarvested(data.pondId, { queueUpdate: true });
      }

      const historyEvent = await createLocalPondHistoryRecord({
        pondId: data.pondId,
        eventType: 'harvest',
        eventData: {
          yieldKg: data.yieldKg,
          species: data.species,
          isPartial: data.isPartial,
          fishCount: data.fishCount,
          pricePerKg,
          totalRevenue,
          isSold,
        },
        createdAt: createdAtTs,
        recordedBy: data.harvestedBy,
      });

      await recomputePondState(data.pondId, { queueUpdate: true });

      await enqueueCreateOperation('harvests', toId((created as any)?.id || (created as any)?._raw?.id), {
        id: toId((created as any)?.id || (created as any)?._raw?.id),
        pondId: data.pondId,
        yieldKg: data.yieldKg,
        harvestedBy: data.harvestedBy,
        createdAt: createdAtTs,
        species: data.species ?? null,
        isPartial: data.isPartial ?? false,
        fishCount: data.fishCount ?? null,
        pricePerKg: pricePerKg ?? null,
        totalRevenue: totalRevenue ?? null,
        isSold: isSold ?? false,
      }, data.pondId);

      await enqueueCreateOperation('pond_history', toId((historyEvent as any)?.id || (historyEvent as any)?._raw?.id), {
        id: toId((historyEvent as any)?.id || (historyEvent as any)?._raw?.id),
        pondId: data.pondId,
        eventType: 'harvest',
        eventData: {
          yieldKg: data.yieldKg,
          species: data.species,
          isPartial: data.isPartial,
          fishCount: data.fishCount,
          pricePerKg,
          totalRevenue,
          isSold,
        },
        recordedBy: data.harvestedBy,
        createdAt: createdAtTs,
      }, data.pondId);

      requestBackgroundSync();

      return created;
    } catch (error) {
      console.error('Error creating harvest:', error);
      throw error;
    }
  }), []);
}

// Hook to create stocking log (works offline)
export function useCreateStockingLog() {
  return useCallback(async (data: {
    pondId: string;
    species: string;
    quantity: number;
    averageWeightG?: number;
    source?: string;
    stockedBy: string;
  }) => withLocalMutation(async () => {
    try {
      const createdAtTs = Date.now();
      const created = isMock
        ? await db.collections.stocking_logs.create((stocking: any) => {
            stocking.pondId = data.pondId;
            stocking.species = data.species;
            stocking.quantity = data.quantity;
            stocking.averageWeightG = data.averageWeightG;
            stocking.source = data.source;
            stocking.stockedBy = data.stockedBy;
            stocking.createdAt = createdAtTs;
            stocking.status = 'active';
          })
        : await db.write(async () => {
            const collection = db.collections.get('stocking_logs');
            return await collection.create((stocking: StockingLog) => {
              stocking.pondId = data.pondId;
              stocking.species = data.species;
              stocking.quantity = data.quantity;
              stocking.averageWeightG = data.averageWeightG;
              stocking.source = data.source;
              stocking.stockedBy = data.stockedBy;
              stocking.createdAt = createdAtTs;
              stocking.status = 'active';
            });
          });

      const historyEvent = await createLocalPondHistoryRecord({
        pondId: data.pondId,
        eventType: 'stocking',
        eventData: {
          species: data.species,
          quantity: data.quantity,
          averageWeightG: data.averageWeightG,
          source: data.source,
        },
        createdAt: createdAtTs,
        recordedBy: data.stockedBy,
      });

      await recomputePondState(data.pondId, { queueUpdate: true });

      await enqueueCreateOperation('stocking_logs', toId((created as any)?.id || (created as any)?._raw?.id), {
        id: toId((created as any)?.id || (created as any)?._raw?.id),
        pondId: data.pondId,
        species: data.species,
        quantity: data.quantity,
        averageWeightG: data.averageWeightG ?? null,
        source: data.source ?? null,
        stockedBy: data.stockedBy,
        createdAt: createdAtTs,
        status: 'active',
      }, data.pondId);

      await enqueueCreateOperation('pond_history', toId((historyEvent as any)?.id || (historyEvent as any)?._raw?.id), {
        id: toId((historyEvent as any)?.id || (historyEvent as any)?._raw?.id),
        pondId: data.pondId,
        eventType: 'stocking',
        eventData: {
          species: data.species,
          quantity: data.quantity,
          averageWeightG: data.averageWeightG,
          source: data.source,
        },
        recordedBy: data.stockedBy,
        createdAt: createdAtTs,
      }, data.pondId);

      requestBackgroundSync();

      return created;
    } catch (error) {
      console.error('Error creating stocking log:', error);
      throw error;
    }
  }), []);
}

// Hook to create generic pond history events (feeding, sampling, treatment, etc.)
export function useCreatePondHistoryEvent() {
  return useCallback(async (data: {
    pondId: string;
    eventType: string;
    eventData?: Record<string, any>;
    recordedBy: string;
  }) => withLocalMutation(async () => {
    try {
      const createdAtTs = Date.now();
      if (isMock) {
        const created = await db.collections.pond_history.create((h: any) => {
          h.pondId = data.pondId;
          h.eventType = data.eventType;
          h.eventData = JSON.stringify(data.eventData || {});
          h.createdAt = createdAtTs;
          h.recordedBy = data.recordedBy;
        });

        await enqueueCreateOperation('pond_history', toId(created?.id), {
          id: toId(created?.id),
          pondId: data.pondId,
          eventType: data.eventType,
          eventData: data.eventData || {},
          recordedBy: data.recordedBy,
          createdAt: createdAtTs,
        }, data.pondId);

        requestBackgroundSync();
        return created;
      }

      const created = await db.write(async () => {
        const collection = db.collections.get('pond_history');
        return await collection.create((h: PondHistory) => {
          h.pondId = data.pondId;
          h.eventType = data.eventType;
          h.eventData = JSON.stringify(data.eventData || {});
          h.createdAt = createdAtTs;
          h.recordedBy = data.recordedBy;
        });
      });

      await enqueueCreateOperation('pond_history', toId((created as any)?.id || (created as any)?._raw?.id), {
        id: toId((created as any)?.id || (created as any)?._raw?.id),
        pondId: data.pondId,
        eventType: data.eventType,
        eventData: data.eventData || {},
        recordedBy: data.recordedBy,
        createdAt: createdAtTs,
      }, data.pondId);

      requestBackgroundSync();
      return created;
    } catch (error) {
      console.error('Error creating pond history event:', error);
      throw error;
    }
  }), []);
}

export function useMortalityLogs(pondId: string) {
  const { records: logs, loading } = useLocalRecords<MortalityLog>('mortality_logs', pondId);
  return { logs, loading };
}

export function useHarvests(pondId: string) {
  const { records: harvests, loading } = useLocalRecords<Harvest>('harvests', pondId);
  return { harvests, loading };
}

export function useStockingLogs(pondId: string) {
  const { records: stockings, loading } = useLocalRecords<StockingLog>('stocking_logs', pondId);
  return { stockings, loading };
}

export function usePondHistory(pondId: string) {
  const { records: history, loading } = useLocalRecords<PondHistory>('pond_history', pondId);
  return { history, loading };
}

// Hook to handle sync with network status, queue, and policy controls
function useSyncState(enabled: boolean) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [lastPushAt, setLastPushState] = useState<Date | null>(null);
  const [lastPullAt, setLastPullState] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isInternetReachable, setIsInternetReachable] = useState(true);
  const [isWifi, setIsWifi] = useState(false);
  const [pendingChanges, setPendingChanges] = useState({ ponds: 0, entries: 0 });
  const [queueSnapshot, setQueueSnapshot] = useState<SyncQueueSnapshot>(EMPTY_QUEUE_SNAPSHOT);
  const [syncSettings, setSyncSettings] = useState<SyncSettings>(DEFAULT_SYNC_SETTINGS);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [preflightBlockers, setPreflightBlockers] = useState<string[]>([]);

  const syncInFlight = useRef(false);
  const refreshAgain = useRef(false);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setAppActive(state === 'active'));
    return () => sub.remove();
  }, []);
  const wasOnlineRef = useRef<boolean>(true);

  const refreshSyncState = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    if (refreshInFlight.current) {
      refreshAgain.current = true;
      return refreshInFlight.current;
    }
    refreshInFlight.current = (async () => {
      try {
        const [snapshot, timestamps, settings, storedLastSync] = await Promise.all([
          getSyncQueueSnapshot(120),
          getSyncTimestamps(),
          loadSyncSettings(),
          AsyncStorage.getItem(LAST_SYNC_AT_KEY),
        ]);

        setQueueSnapshot(snapshot);
        setSyncSettings(settings);

        const pendingPonds = snapshot.pendingByEntity.ponds;
        const pendingEntries =
          snapshot.pendingByEntity.mortality_logs +
          snapshot.pendingByEntity.harvests +
          snapshot.pendingByEntity.stocking_logs +
          snapshot.pendingByEntity.pond_history;

        setPendingChanges({
          ponds: pendingPonds,
          entries: pendingEntries,
        });

        if (timestamps.lastPushAt) {
          setLastPushState(new Date(timestamps.lastPushAt));
        }
        if (timestamps.lastPullAt) {
          setLastPullState(new Date(timestamps.lastPullAt));
        }

        const historicalLastSync = storedLastSync ? Number(storedLastSync) : 0;
        setLastSync(Number.isFinite(historicalLastSync) && historicalLastSync > 0 ? new Date(historicalLastSync) : null);
      } catch (error) {
        console.error('Error refreshing sync state:', error);
      }
    })().finally(() => {
      refreshInFlight.current = null;
      if (refreshAgain.current) {
        refreshAgain.current = false;
        void refreshSyncState();
      }
    });
    return refreshInFlight.current;
  }, [enabled]);

  const updateSyncSettings = useCallback(async (partial: Partial<SyncSettings>) => {
    const next = await saveSyncSettings(partial);
    setSyncSettings(next);
    return next;
  }, []);

  const retrySyncItem = useCallback(async (itemId: string) => {
    if (!itemId) return;
    await resetQueueItemsToQueued([itemId]);
    await refreshSyncState();
  }, [refreshSyncState]);

  const retryAllFailed = useCallback(async () => {
    const queue = await loadSyncQueue();
    const retryIds = queue
      .filter((item) => item.status === 'failed' || item.status === 'blocked' || item.status === 'conflict')
      .map((item) => item.id);

    if (retryIds.length === 0) return;
    await resetQueueItemsToQueued(retryIds);
    await refreshSyncState();
  }, [refreshSyncState]);

  const performSync = useCallback(async (showSuccess = false) => {
    if (!enabled || syncInFlight.current) {
      return { success: false, message: 'Sync already in progress.' };
    }

    syncInFlight.current = true;
    setIsSyncing(true);
    try {
      const netInfo = await NetInfo.fetch();
      const connected = !!netInfo.isConnected;
      const reachable = netInfo.isInternetReachable === null ? connected : !!netInfo.isInternetReachable;
      const wifi = netInfo.type === 'wifi';

      setIsOnline(connected && reachable);
      setIsInternetReachable(reachable);
      setIsWifi(wifi);

      if (!connected || !reachable) {
        return { success: false, message: 'No internet connection' };
      }

      if (syncSettings.wifiOnly && !wifi) {
        return { success: false, message: 'Sync is set to Wi-Fi only. Connect to Wi-Fi to continue.' };
      }

      if (!isSupabaseConfigured()) {
        return {
          success: false,
          message: getSupabaseConfigError() || 'Supabase is not configured.',
        };
      }

      setPreflightBlockers([]);
      setSyncMessage('Syncing...');
      setSyncProgress(null);

      const metrics = await syncData({
        onProgress: (progress) => {
          setSyncProgress(progress);
          setSyncMessage(progress.message);
        },
      });

      if (metrics.failed || metrics.blocked || metrics.conflict) {
        await refreshSyncState();
        const message = 'Some records could not synchronize. Open Sync Status and retry failed items.';
        setSyncMessage(message);
        return { success: false, message, metrics };
      }
      const now = new Date();
      setLastSync(now);
      await AsyncStorage.setItem(LAST_SYNC_AT_KEY, String(now.getTime()));
      await refreshSyncState();

      const message = hasSyncActivity(metrics)
        ? (showSuccess ? 'All data synchronized' : 'Sync completed')
        : 'Nothing to sync';
      setSyncMessage(message);
      return { success: true, message, timestamp: now, metrics };
    } catch (error) {
      console.error('Sync failed:', error);
      const message = 'Unable to synchronize records. Check your connection and try again. If this continues, contact your administrator.';
      setSyncMessage(message);
      setPreflightBlockers([message]);
      await refreshSyncState().catch(() => {});
      return { success: false, message };
    } finally {
      syncInFlight.current = false;
      setIsSyncing(false);
    }
  }, [enabled, refreshSyncState, syncSettings.wifiOnly]);

  // Monitor network status with reachability and network type.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = !!state.isConnected;
      const reachable = state.isInternetReachable === null ? connected : !!state.isInternetReachable;
      const online = connected && reachable;
      setIsOnline(online);
      setIsInternetReachable(reachable);
      setIsWifi(state.type === 'wifi');
    });

    return () => unsubscribe();
  }, []);

  // Initial sync state load.
  useEffect(() => {
    refreshSyncState();
  }, [refreshSyncState]);

  // Auto-sync immediately when coming back online (respecting policy).
  useEffect(() => {
    const cameOnline = !wasOnlineRef.current && isOnline;
    wasOnlineRef.current = isOnline;

    if (!cameOnline) return;
    if (!enabled || !appActive || !syncSettings.autoSync) return;
    if (syncSettings.wifiOnly && !isWifi) return;

    const timer = setTimeout(() => {
      void performSync(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, [enabled, appActive, isOnline, isWifi, performSync, syncSettings.autoSync, syncSettings.wifiOnly]);

  // Background periodic auto-sync loop.
  useEffect(() => {
    if (!enabled || !appActive || !syncSettings.autoSync) return;
    if (!isOnline) return;
    if (syncSettings.wifiOnly && !isWifi) return;

    const intervalMs = Math.max(10, syncSettings.backgroundIntervalSec) * 1000;
    const interval = setInterval(() => {
      if (!isSyncing) {
        void performSync(false);
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [
    enabled,
    appActive,
    isOnline,
    isSyncing,
    isWifi,
    performSync,
    syncSettings.autoSync,
    syncSettings.backgroundIntervalSec,
    syncSettings.wifiOnly,
  ]);

  // One shared listener replaces each mounted screen's queue polling loop.
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeToSyncState(() => {
      clearTimeout(timer);
      timer = setTimeout(() => { void refreshSyncState(); }, 50);
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [enabled, refreshSyncState]);

  useEffect(() => {
    if (!enabled || !appActive || !syncSettings.autoSync) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = false;
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      if (syncInFlight.current) {
        timer = setTimeout(() => { void run(); }, 500);
        return;
      }
      pending = false;
      await performSync(false);
      if (pending && !cancelled) timer = setTimeout(() => { void run(); }, 250);
    };
    const unsubscribe = subscribeToSyncRequests(() => {
      pending = true;
      clearTimeout(timer);
      timer = setTimeout(() => { void run(); }, 250);
    });
    return () => { cancelled = true; clearTimeout(timer); unsubscribe(); };
  }, [enabled, appActive, performSync, syncSettings.autoSync]);

  return {
    isSyncing,
    lastSync,
    lastPushAt,
    lastPullAt,
    isOnline,
    isInternetReachable,
    isWifi,
    pendingChanges,
    queueSnapshot,
    syncSettings,
    syncProgress,
    syncMessage,
    preflightBlockers,
    performSync,
    refreshSyncState,
    updateSyncSettings,
    retrySyncItem,
    retryAllFailed,
  };
}

const SyncContext = createContext<ReturnType<typeof useSyncState> | null>(null);

export function SyncProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const value = useSyncState(enabled);
  return createElement(SyncContext.Provider, { value }, children);
}

export function useSync() {
  const value = useContext(SyncContext);
  if (!value) throw new Error('useSync requires SyncProvider');
  return value;
}
