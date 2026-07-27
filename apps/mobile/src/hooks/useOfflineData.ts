import { useEffect, useState, useCallback, useRef } from 'react';
import { database, mockDatabase } from '../db';
import { Pond, MortalityLog, Harvest, StockingLog, PondHistory } from '../db/models';
import { recomputePondState } from '../db/pondState';
import { syncData, runSyncPreflight, SyncMetrics, SyncProgress } from '../db/sync';
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
const pondChangeListeners = new Set<() => void>();

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

function notifyPondChange() {
  pondChangeListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.warn('Pond change listener failed:', error);
    }
  });
}

function subscribeToPondChanges(listener: () => void) {
  pondChangeListeners.add(listener);
  return () => {
    pondChangeListeners.delete(listener);
  };
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

async function triggerImmediateSyncIfOnline(reason: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const [netInfo, settings] = await Promise.all([NetInfo.fetch(), loadSyncSettings()]);
    const connected = !!netInfo.isConnected;
    const reachable =
      netInfo.isInternetReachable === null || netInfo.isInternetReachable === undefined
        ? connected
        : !!netInfo.isInternetReachable;
    const wifi = netInfo.type === 'wifi';

    if (!connected || !reachable) {
      return;
    }

    if (settings.wifiOnly && !wifi) {
      return;
    }

    await syncData().catch((error) => {
      console.warn(`${reason} saved locally, but sync push failed:`, error);
    });
  } catch (error) {
    console.warn(`${reason} saved locally, but online sync check failed:`, error);
  }
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
  const allStockings = await getCollection('stocking_logs').query().fetch();
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

      await stocking.update((record: any) => {
        record.status = 'harvested';
      });
    }
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

// Hook to fetch all ponds
export function usePonds() {
  const [ponds, setPonds] = useState<Pond[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unmounted = false;
    let mockInterval: ReturnType<typeof setInterval> | null = null;
    let localSubscription: any = null;
    let unsubscribePondChange: (() => void) | null = null;

    const fetchPonds = async () => {
      try {
        const data = await getCollection('ponds').query().fetch();
        if (!unmounted) {
          setPonds(data);
        }
      } catch (error) {
        console.error('Error fetching ponds:', error);
        if (!unmounted) {
          setPonds([]);
        }
      } finally {
        if (!unmounted) {
          setLoading(false);
        }
      }
    };

    fetchPonds();
    unsubscribePondChange = subscribeToPondChanges(() => {
      void fetchPonds();
    });

    // For real WatermelonDB, subscribe to changes
    if (!isMock) {
      localSubscription = db.collections
        .get('ponds')
        .query()
        .observe()
        .subscribe((data: Pond[]) => {
          setPonds(data);
        });
    }

    // Mock mode fallback: refresh frequently for a near real-time list
    if (isMock) {
      mockInterval = setInterval(fetchPonds, 2000);
    }

    return () => {
      unmounted = true;
      if (localSubscription) {
        localSubscription.unsubscribe();
      }
      if (unsubscribePondChange) {
        unsubscribePondChange();
      }
      if (mockInterval) {
        clearInterval(mockInterval);
      }
    };
  }, []);

  return { ponds, loading };
}

// Hook to create a new pond (works offline)
export function useCreatePond() {
  return useCallback(async (data: {
    name: string;
    location: string; // GeoJSON Point string
    createdBy: string;
    boundary?: string; // JSON string of polygon coordinates
  }) => {
    try {
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
      notifyPondChange();
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

      void triggerImmediateSyncIfOnline('Create pond');

      return createdPond;
    } catch (error) {
      console.error('Error creating pond:', error);
      throw error;
    }
  }, []);
}

// Hook to create mortality log (works offline)
export function useCreateMortalityLog() {
  return useCallback(async (data: {
    pondId: string;
    quantity: number;
    notes?: string;
    loggedBy: string;
  }) => {
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
      notifyPondChange();

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

      void triggerImmediateSyncIfOnline('Mortality report');

      return created;
    } catch (error) {
      console.error('Error creating mortality log:', error);
      throw error;
    }
  }, []);
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
  }) => {
    try {
      const createdAtTs = Date.now();
      const created = isMock
        ? await db.collections.harvests.create((harvest: any) => {
            harvest.pondId = data.pondId;
            harvest.yieldKg = data.yieldKg;
            harvest.harvestedBy = data.harvestedBy;
            harvest.createdAt = createdAtTs;
            harvest.species = data.species;
            harvest.isPartial = data.isPartial ?? false;
            harvest.fishCount = data.fishCount;
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
        },
        createdAt: createdAtTs,
        recordedBy: data.harvestedBy,
      });

      await recomputePondState(data.pondId, { queueUpdate: true });
      notifyPondChange();

      await enqueueCreateOperation('harvests', toId((created as any)?.id || (created as any)?._raw?.id), {
        id: toId((created as any)?.id || (created as any)?._raw?.id),
        pondId: data.pondId,
        yieldKg: data.yieldKg,
        harvestedBy: data.harvestedBy,
        createdAt: createdAtTs,
        species: data.species ?? null,
        isPartial: data.isPartial ?? false,
        fishCount: data.fishCount ?? null,
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
        },
        recordedBy: data.harvestedBy,
        createdAt: createdAtTs,
      }, data.pondId);

      void triggerImmediateSyncIfOnline('Harvest');

      return created;
    } catch (error) {
      console.error('Error creating harvest:', error);
      throw error;
    }
  }, []);
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
  }) => {
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
      notifyPondChange();

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

      void triggerImmediateSyncIfOnline('Stocking');

      return created;
    } catch (error) {
      console.error('Error creating stocking log:', error);
      throw error;
    }
  }, []);
}

// Hook to create generic pond history events (feeding, sampling, treatment, etc.)
export function useCreatePondHistoryEvent() {
  return useCallback(async (data: {
    pondId: string;
    eventType: string;
    eventData?: Record<string, any>;
    recordedBy: string;
  }) => {
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

      void triggerImmediateSyncIfOnline(`Pond ${data.eventType}`);

      return created;
    } catch (error) {
      console.error('Error creating pond history event:', error);
      throw error;
    }
  }, []);
}

// Helper function to update pond after stocking
async function updatePondAfterStocking(pondId: string, species: string, quantity: number) {
  try {
    const allStockings = await getCollection('stocking_logs').query().fetch();
    const pondStockings = allStockings.filter((s: any) => s.pondId === pondId && s.status === 'active');
    const totalStock = pondStockings.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0) + quantity;
    
    const allPonds = await getCollection('ponds').query().fetch();
    const pond = allPonds.find((p: any) => p.id === pondId);
    
    if (pond && mockDatabase) {
      await mockDatabase.set(`pond:${pondId}`, {
        ...pond,
        isActive: true,
        currentSpecies: species,
        currentStockCount: totalStock,
      });
    }
  } catch (error) {
    console.error('Error updating pond stock:', error);
  }
}

// Helper function to update pond after harvest
async function updatePondAfterHarvest(pondId: string, isPartial: boolean, fishCount?: number) {
  try {
    const allPonds = await getCollection('ponds').query().fetch();
    const pond = allPonds.find((p: any) => p.id === pondId);
    
    if (!pond) return;
    
    if (isPartial && fishCount && pond.currentStockCount) {
      const newCount = Math.max(0, pond.currentStockCount - fishCount);
      await mockDatabase.set(`pond:${pondId}`, {
        ...pond,
        currentStockCount: newCount,
      });
    } else if (!isPartial) {
      // Full harvest - pond is now inactive
      await mockDatabase.set(`pond:${pondId}`, {
        ...pond,
        isActive: false,
        currentStockCount: 0,
        currentSpecies: undefined,
      });
      
      // Mark all active stocking logs as harvested
      const allStockings = await getCollection('stocking_logs').query().fetch();
      const activeStockings = allStockings.filter((s: any) => s.pondId === pondId && s.status === 'active');
      for (const stocking of activeStockings) {
        await mockDatabase.set(`stocking:${stocking.id}`, { ...stocking, status: 'harvested' });
      }
    }
  } catch (error) {
    console.error('Error updating pond after harvest:', error);
  }
}

// Helper function to update pond stock count after mortality
async function updatePondStockCount(pondId: string) {
  try {
    // Calculate current stock based on stockings minus harvests and mortalities
    const [stockings, harvests, mortalities] = await Promise.all([
      getCollection('stocking_logs').query().fetch(),
      getCollection('harvests').query().fetch(),
      getCollection('mortality_logs').query().fetch(),
    ]);
    
    const pondStockings = stockings.filter((s: any) => s.pondId === pondId && s.status === 'active');
    const totalStocked = pondStockings.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0);
    
    const pondHarvests = harvests.filter((h: any) => h.pondId === pondId);
    const totalHarvested = pondHarvests.reduce((sum: number, h: any) => sum + (h.fishCount || 0), 0);
    
    const pondMortalities = mortalities.filter((m: any) => m.pondId === pondId);
    const totalDead = pondMortalities.reduce((sum: number, m: any) => sum + (m.quantity || 0), 0);
    
    const currentStock = Math.max(0, totalStocked - totalHarvested - totalDead);
    
    const allPonds = await getCollection('ponds').query().fetch();
    const pond = allPonds.find((p: any) => p.id === pondId);
    
    if (pond && mockDatabase) {
      await mockDatabase.set(`pond:${pondId}`, {
        ...pond,
        currentStockCount: currentStock,
        isActive: currentStock > 0,
      });
    }
  } catch (error) {
    console.error('Error updating pond stock count:', error);
  }
}

// Hook to get mortality logs for a specific pond
export function useMortalityLogs(pondId: string) {
  const [logs, setLogs] = useState<MortalityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const allLogs = await getCollection('mortality_logs').query().fetch();
        const filtered = allLogs.filter((log: any) => log.pondId === pondId);
        setLogs(filtered);
      } catch (error) {
        console.error('Error fetching mortality logs:', error);
        setLogs([]);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [pondId]);

  return { logs, loading };
}

// Hook to get harvests for a specific pond
export function useHarvests(pondId: string) {
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHarvests = async () => {
      try {
        const allHarvests = await getCollection('harvests').query().fetch();
        const filtered = allHarvests.filter((h: any) => h.pondId === pondId);
        setHarvests(filtered);
      } catch (error) {
        console.error('Error fetching harvests:', error);
        setHarvests([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHarvests();
  }, [pondId]);

  return { harvests, loading };
}

// Hook to get stocking logs for a specific pond
export function useStockingLogs(pondId: string) {
  const [stockings, setStockings] = useState<StockingLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pondId) {
      setStockings([]);
      setLoading(false);
      return;
    }

    let unmounted = false;
    let mockInterval: ReturnType<typeof setInterval> | null = null;
    let localSubscription: any = null;

    const sortStockings = (items: StockingLog[]) => {
      return [...items].sort((a: any, b: any) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    };

    const fetchStockings = async () => {
      try {
        const allStockings = await getCollection('stocking_logs').query().fetch();
        const filtered = allStockings.filter((s: any) => s.pondId === pondId) as StockingLog[];
        if (!unmounted) {
          setStockings(sortStockings(filtered));
        }
      } catch (error) {
        console.error('Error fetching stocking logs:', error);
        if (!unmounted) {
          setStockings([]);
        }
      } finally {
        if (!unmounted) {
          setLoading(false);
        }
      }
    };

    fetchStockings();

    if (!isMock) {
      localSubscription = db.collections
        .get('stocking_logs')
        .query()
        .observe()
        .subscribe((allStockings: StockingLog[]) => {
          const filtered = allStockings.filter((item: any) => item.pondId === pondId) as StockingLog[];
          setStockings(sortStockings(filtered));
          setLoading(false);
        });
    }

    if (isMock) {
      mockInterval = setInterval(fetchStockings, 2000);
    }

    return () => {
      unmounted = true;
      if (localSubscription) {
        localSubscription.unsubscribe();
      }
      if (mockInterval) {
        clearInterval(mockInterval);
      }
    };
  }, [pondId]);

  return { stockings, loading };
}

// Hook to get pond history (combined events)
export function usePondHistory(pondId: string) {
  const [history, setHistory] = useState<PondHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pondId) {
      setHistory([]);
      setLoading(false);
      return;
    }

    let unmounted = false;
    let mockInterval: ReturnType<typeof setInterval> | null = null;
    let localSubscription: any = null;

    const sortHistory = (items: PondHistory[]) => {
      return [...items].sort((a: any, b: any) => b.createdAt - a.createdAt);
    };

    const fetchHistory = async () => {
      try {
        const allHistory = await getCollection('pond_history').query().fetch();
        const filtered = allHistory.filter((h: any) => h.pondId === pondId) as PondHistory[];
        if (!unmounted) {
          setHistory(sortHistory(filtered));
        }
      } catch (error) {
        console.error('Error fetching pond history:', error);
        if (!unmounted) {
          setHistory([]);
        }
      } finally {
        if (!unmounted) {
          setLoading(false);
        }
      }
    };

    fetchHistory();

    // Real WatermelonDB can observe collection updates in real-time
    if (!isMock) {
      localSubscription = db.collections
        .get('pond_history')
        .query()
        .observe()
        .subscribe((allEvents: PondHistory[]) => {
          const filtered = allEvents.filter((event: any) => event.pondId === pondId) as PondHistory[];
          setHistory(sortHistory(filtered));
          setLoading(false);
        });
    }

    // Mock mode fallback: periodic refresh
    if (isMock) {
      mockInterval = setInterval(fetchHistory, 2000);
    }

    return () => {
      unmounted = true;
      if (localSubscription) {
        localSubscription.unsubscribe();
      }
      if (mockInterval) {
        clearInterval(mockInterval);
      }
    };
  }, [pondId]);

  return { history, loading };
}

// Hook to handle sync with network status, queue, and policy controls
export function useSync() {
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

  const wasOnlineRef = useRef<boolean>(true);

  const refreshSyncState = useCallback(async () => {
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
      const maxSyncTs = Math.max(
        timestamps.lastPushAt || 0,
        timestamps.lastPullAt || 0,
        Number.isFinite(historicalLastSync) ? historicalLastSync : 0
      );
      setLastSync(maxSyncTs > 0 ? new Date(maxSyncTs) : null);
    } catch (error) {
      console.error('Error refreshing sync state:', error);
    }
  }, []);

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
    if (isSyncing) {
      return { success: false, message: 'Sync already in progress.' };
    }

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

    const preflight = await runSyncPreflight();
    setPreflightBlockers(preflight.blockers);
    if (!preflight.ok) {
      return { success: false, message: preflight.blockers[0] || 'Sync preflight failed.' };
    }

    setIsSyncing(true);
    setSyncMessage('Syncing...');
    setSyncProgress(null);

    try {
      const metrics = await syncData({
        onProgress: (progress) => {
          setSyncProgress(progress);
          setSyncMessage(progress.message);
        },
      });

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
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Sync failed. Will retry automatically.';
      setSyncMessage(message);
      await refreshSyncState();
      return { success: false, message };
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshSyncState, syncSettings.wifiOnly]);

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
    if (!syncSettings.autoSync) return;
    if (syncSettings.wifiOnly && !isWifi) return;

    const timer = setTimeout(() => {
      void performSync(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, [isOnline, isWifi, performSync, syncSettings.autoSync, syncSettings.wifiOnly]);

  // Background periodic auto-sync loop.
  useEffect(() => {
    if (!syncSettings.autoSync) return;
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
    isOnline,
    isSyncing,
    isWifi,
    performSync,
    syncSettings.autoSync,
    syncSettings.backgroundIntervalSec,
    syncSettings.wifiOnly,
  ]);

  // Keep queue/pending state fresh even when user doesn't open Sync tab.
  useEffect(() => {
    const interval = setInterval(() => {
      void refreshSyncState();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshSyncState]);

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
