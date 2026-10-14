import AsyncStorage from '@react-native-async-storage/async-storage'
import { notifySyncStateChanged } from './syncEvents'

export type SyncEntity =
  | 'ponds'
  | 'mortality_logs'
  | 'harvests'
  | 'stocking_logs'
  | 'pond_history'

export type SyncOperation = 'create' | 'update' | 'delete'
export type SyncQueueStatus = 'queued' | 'syncing' | 'failed' | 'synced' | 'conflict' | 'blocked'

export interface SyncConflictRecord {
  strategy: 'last_write_wins'
  resolved: boolean
  resolvedAt?: number
  reason: string
  serverSnapshot?: any
  localSnapshot?: any
}

export interface SyncQueueItem {
  id: string
  entity: SyncEntity
  operation: SyncOperation
  localId: string
  remoteId?: string
  payload: Record<string, any>
  status: SyncQueueStatus
  attempts: number
  maxAttempts: number
  createdAt: number
  updatedAt: number
  lastAttemptAt?: number
  lastError?: string
  dependsOn?: Array<{ entity: SyncEntity; localId: string }>
  conflict?: SyncConflictRecord
}

export interface SyncSettings {
  autoSync: boolean
  wifiOnly: boolean
  backgroundIntervalSec: number
}

export interface SyncQueueSnapshot {
  items: SyncQueueItem[]
  total: number
  queued: number
  syncing: number
  failed: number
  synced: number
  conflict: number
  blocked: number
  pending: number
  waitingByEntity: Record<SyncEntity, number>
  pendingByEntity: Record<SyncEntity, number>
}

const SYNC_QUEUE_KEY = '@aquapin_sync_queue_v2'
const SYNC_SETTINGS_KEY = '@aquapin_sync_settings_v1'
const SYNC_CONFLICT_LOG_KEY = '@aquapin_sync_conflicts_v1'

export const SYNC_LAST_PUSH_AT_KEY = '@aquapin_sync_last_push_at'
export const SYNC_LAST_PULL_AT_KEY = '@aquapin_sync_last_pull_at'

const MAX_QUEUE_ITEM_AGE_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_MAX_ATTEMPTS = 7

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  autoSync: true,
  wifiOnly: false,
  backgroundIntervalSec: 30,
}

function nowTs(): number {
  return Date.now()
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

function randomId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function normalizeInterval(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SYNC_SETTINGS.backgroundIntervalSec
  const rounded = Math.round(value)
  return Math.min(300, Math.max(10, rounded))
}

function parseQueue(raw: string | null): SyncQueueItem[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(Boolean).map((item: any) => ({
      id: String(item.id || randomId('sync')),
      entity: item.entity as SyncEntity,
      operation: item.operation as SyncOperation,
      localId: String(item.localId || ''),
      remoteId: item.remoteId ? String(item.remoteId) : undefined,
      payload: typeof item.payload === 'object' && item.payload ? item.payload : {},
      status: (item.status || 'queued') as SyncQueueStatus,
      attempts: Number(item.attempts || 0),
      maxAttempts: Number(item.maxAttempts || DEFAULT_MAX_ATTEMPTS),
      createdAt: Number(item.createdAt || nowTs()),
      updatedAt: Number(item.updatedAt || nowTs()),
      lastAttemptAt: item.lastAttemptAt ? Number(item.lastAttemptAt) : undefined,
      lastError: item.lastError ? String(item.lastError) : undefined,
      dependsOn: Array.isArray(item.dependsOn) ? item.dependsOn : undefined,
      conflict: item.conflict ? { ...item.conflict } : undefined,
    }))
  } catch (_error) {
    return []
  }
}

// Serialize read/modify/write operations so saves and background sync cannot
// replace one another's queue updates. A failed write does not poison the lock.
let queueWrite: Promise<unknown> = Promise.resolve()
function serializeQueueWrite<T>(work: () => Promise<T>): Promise<T> {
  const result = queueWrite.then(work)
  queueWrite = result.catch(() => undefined)
  return result
}

async function persistQueue(items: SyncQueueItem[]): Promise<void> {
  await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(items))
  notifySyncStateChanged()
}

export async function loadSyncQueue(): Promise<SyncQueueItem[]> {
  const raw = await AsyncStorage.getItem(SYNC_QUEUE_KEY)
  return parseQueue(raw)
}

async function saveSyncQueueUnlocked(items: SyncQueueItem[]): Promise<void> {
  await persistQueue(items)
}

async function clearSyncQueueUnlocked(): Promise<void> {
  await AsyncStorage.removeItem(SYNC_QUEUE_KEY)
  notifySyncStateChanged()
}

async function clearSyncRuntimeStateUnlocked(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys()
  const syncKeys = keys.filter(
    (key) =>
      key === SYNC_QUEUE_KEY ||
      key === SYNC_CONFLICT_LOG_KEY ||
      key === SYNC_LAST_PUSH_AT_KEY ||
      key === SYNC_LAST_PULL_AT_KEY ||
      key.startsWith('@aquapin_sync:')
  )

  if (syncKeys.length > 0) {
    await AsyncStorage.multiRemove(syncKeys)
  }
  notifySyncStateChanged()
}

export function getRetryDelayMs(attempts: number): number {
  const step = Math.max(0, attempts - 1)
  return Math.min(60_000, 2_000 * Math.pow(2, step))
}

export function isQueueItemReadyForRetry(item: SyncQueueItem, at: number = nowTs()): boolean {
  if (item.status === 'queued') return true
  if (item.status === 'syncing') return false
  if (item.status !== 'failed' && item.status !== 'blocked' && item.status !== 'conflict') return false
  if (!item.lastAttemptAt) return true
  const waitMs = getRetryDelayMs(item.attempts)
  return at - item.lastAttemptAt >= waitMs
}

function cleanupQueue(items: SyncQueueItem[]): SyncQueueItem[] {
  const now = nowTs()
  return items.filter((item) => {
    if (!item.localId) return false
    if (item.status === 'synced' && now - item.updatedAt > MAX_QUEUE_ITEM_AGE_MS) return false
    return true
  })
}

function mergeForUpsert(existing: SyncQueueItem, next: SyncQueueItem): SyncQueueItem {
  const mergedPayload = { ...existing.payload, ...next.payload }
  const mergedDependsOn = [...(existing.dependsOn || []), ...(next.dependsOn || [])]
  const uniqueDependsOn = mergedDependsOn.filter((dep, index, arr) => {
    return arr.findIndex((entry) => entry.entity === dep.entity && entry.localId === dep.localId) === index
  })

  return {
    ...existing,
    operation: next.operation,
    payload: mergedPayload,
    dependsOn: uniqueDependsOn.length > 0 ? uniqueDependsOn : undefined,
    remoteId: next.remoteId || existing.remoteId,
    status: 'queued',
    updatedAt: nowTs(),
    lastError: undefined,
    conflict: undefined,
  }
}

async function enqueueSyncOperationUnlocked(input: {
  entity: SyncEntity
  operation: SyncOperation
  localId: string
  payload?: Record<string, any>
  remoteId?: string
  dependsOn?: Array<{ entity: SyncEntity; localId: string }>
  maxAttempts?: number
}): Promise<SyncQueueItem> {
  const localId = String(input.localId || '').trim()
  if (!localId) {
    throw new Error('enqueueSyncOperation requires a localId')
  }

  const queue = await loadSyncQueue()
  const now = nowTs()
  const sameEntityEntries = queue.filter((item) => item.entity === input.entity && item.localId === localId)
  const latest = sameEntityEntries.sort((a, b) => b.updatedAt - a.updatedAt)[0]

  const nextBase: SyncQueueItem = {
    id: randomId('sync'),
    entity: input.entity,
    operation: input.operation,
    localId,
    remoteId: input.remoteId || latest?.remoteId || (input.operation === 'create' ? (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(localId) ? localId : uuid()) : undefined),
    payload: input.payload || {},
    status: 'queued',
    attempts: 0,
    maxAttempts: Number(input.maxAttempts || DEFAULT_MAX_ATTEMPTS),
    createdAt: now,
    updatedAt: now,
    dependsOn: input.dependsOn,
  }

  // Collapse create->update into one create payload.
  if (latest && latest.status !== 'synced' && latest.operation === 'create' && input.operation === 'update') {
    const merged = mergeForUpsert(latest, { ...nextBase, operation: 'create' })
    const replaced = queue.map((item) => (item.id === latest.id ? merged : item))
    const cleaned = cleanupQueue(replaced)
    await persistQueue(cleaned)
    return merged
  }

  // Delete cancels pending create/update for the same record and becomes one delete op.
  if (input.operation === 'delete') {
    const filtered = queue.filter((item) => !(item.entity === input.entity && item.localId === localId))
    const finalItem = { ...nextBase, payload: {} }
    const cleaned = cleanupQueue([...filtered, finalItem])
    await persistQueue(cleaned)
    return finalItem
  }

  // Replace existing queued/failed copy of same operation.
  if (latest && latest.operation === input.operation && latest.status !== 'synced') {
    const merged = mergeForUpsert(latest, nextBase)
    const replaced = queue.map((item) => (item.id === latest.id ? merged : item))
    const cleaned = cleanupQueue(replaced)
    await persistQueue(cleaned)
    return merged
  }

  const finalQueue = cleanupQueue([...queue, nextBase])
  await persistQueue(finalQueue)
  return nextBase
}

async function updateSyncQueueItemUnlocked(
  itemId: string,
  mutator: (item: SyncQueueItem) => SyncQueueItem
): Promise<SyncQueueItem | null> {
  const queue = await loadSyncQueue()
  let updated: SyncQueueItem | null = null
  const next = queue.map((item) => {
    if (item.id !== itemId) return item
    updated = {
      ...mutator(item),
      updatedAt: nowTs(),
    }
    return updated
  })
  if (!updated) return null
  const cleaned = cleanupQueue(next)
  await persistQueue(cleaned)
  return updated
}

export async function markSyncItemStatus(
  itemId: string,
  status: SyncQueueStatus,
  options?: { error?: string; remoteId?: string; conflict?: SyncConflictRecord }
): Promise<SyncQueueItem | null> {
  return updateSyncQueueItem(itemId, (item) => {
    const next: SyncQueueItem = {
      ...item,
      status,
      remoteId: options?.remoteId || item.remoteId,
    }

    if (status === 'syncing') {
      next.lastAttemptAt = nowTs()
      next.attempts = item.attempts + 1
      next.lastError = undefined
    }

    if (status === 'failed' || status === 'blocked' || status === 'conflict') {
      next.lastAttemptAt = nowTs()
      next.attempts = item.attempts + 1
      next.lastError = options?.error || item.lastError || 'Unknown sync error'
      if (options?.conflict) {
        next.conflict = options.conflict
      }
    }

    if (status === 'queued' || status === 'synced') {
      next.lastError = undefined
      if (status === 'synced') {
        next.conflict = options?.conflict
      }
    }

    if (options?.error && status !== 'syncing') {
      next.lastError = options.error
    }

    return next
  })
}

async function markSyncItemsAsSyncedUnlocked(
  itemIds: string[],
  remoteIdsByItemId?: Record<string, string>
): Promise<void> {
  if (itemIds.length === 0) return
  const queue = await loadSyncQueue()
  const now = nowTs()
  const idSet = new Set(itemIds)
  const next = queue.map((item) => {
    if (!idSet.has(item.id)) return item
    return {
      ...item,
      status: 'synced' as const,
      remoteId: remoteIdsByItemId?.[item.id] || item.remoteId,
      updatedAt: now,
      lastError: undefined,
      conflict: item.conflict
        ? {
            ...item.conflict,
            resolved: true,
            resolvedAt: now,
          }
        : undefined,
    }
  })
  await persistQueue(cleanupQueue(next))
}

async function resetQueueItemsToQueuedUnlocked(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return
  const queue = await loadSyncQueue()
  const idSet = new Set(itemIds)
  const next = queue.map((item) => {
    if (!idSet.has(item.id)) return item
    return {
      ...item,
      status: 'queued' as const,
      updatedAt: nowTs(),
      lastError: undefined,
      conflict: undefined,
    }
  })
  await persistQueue(cleanupQueue(next))
}

async function removeSyncedQueueItemsUnlocked(olderThanMs: number = 20_000): Promise<void> {
  const queue = await loadSyncQueue()
  const now = nowTs()
  const next = queue.filter((item) => {
    if (item.status !== 'synced') return true
    return now - item.updatedAt < olderThanMs
  })
  await persistQueue(cleanupQueue(next))
}

export async function getSyncQueueSnapshot(limit = 80): Promise<SyncQueueSnapshot> {
  const queue = await loadSyncQueue()
  const sorted = [...queue].sort((a, b) => b.updatedAt - a.updatedAt)
  const items = sorted.slice(0, Math.max(1, limit))

  const total = queue.length
  const queued = queue.filter((item) => item.status === 'queued').length
  const syncing = queue.filter((item) => item.status === 'syncing').length
  const failed = queue.filter((item) => item.status === 'failed').length
  const synced = queue.filter((item) => item.status === 'synced').length
  const conflict = queue.filter((item) => item.status === 'conflict').length
  const blocked = queue.filter((item) => item.status === 'blocked').length
  const pending = queued + failed + conflict + blocked + syncing
  const waitingStatuses = new Set<SyncQueueStatus>(['queued', 'syncing'])
  const pendingStatuses = new Set<SyncQueueStatus>(['queued', 'syncing', 'failed', 'conflict', 'blocked'])
  const waitingByEntity: Record<SyncEntity, number> = {
    ponds: 0,
    mortality_logs: 0,
    harvests: 0,
    stocking_logs: 0,
    pond_history: 0,
  }
  const pendingByEntity: Record<SyncEntity, number> = {
    ponds: 0,
    mortality_logs: 0,
    harvests: 0,
    stocking_logs: 0,
    pond_history: 0,
  }

  for (const item of queue) {
    if (waitingStatuses.has(item.status)) {
      waitingByEntity[item.entity] += 1
    }
    if (!pendingStatuses.has(item.status)) continue
    pendingByEntity[item.entity] += 1
  }

  return {
    items,
    total,
    queued,
    syncing,
    failed,
    synced,
    conflict,
    blocked,
    pending,
    waitingByEntity,
    pendingByEntity,
  }
}

export async function listSyncConflicts(): Promise<SyncQueueItem[]> {
  const queue = await loadSyncQueue()
  return queue
    .filter((item) => Boolean(item.conflict) || item.status === 'conflict')
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function appendConflictLog(entry: {
  itemId: string
  entity: SyncEntity
  localId: string
  reason: string
  serverSnapshot?: any
  localSnapshot?: any
}): Promise<void> {
  const raw = await AsyncStorage.getItem(SYNC_CONFLICT_LOG_KEY)
  const parsed = raw ? JSON.parse(raw) : []
  const next = [
    {
      ...entry,
      createdAt: nowTs(),
      strategy: 'last_write_wins',
    },
    ...(Array.isArray(parsed) ? parsed : []),
  ].slice(0, 100)
  await AsyncStorage.setItem(SYNC_CONFLICT_LOG_KEY, JSON.stringify(next))
}

export async function getConflictLog(): Promise<any[]> {
  const raw = await AsyncStorage.getItem(SYNC_CONFLICT_LOG_KEY)
  try {
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (_error) {
    return []
  }
}

export async function clearConflictLog(): Promise<void> {
  await AsyncStorage.removeItem(SYNC_CONFLICT_LOG_KEY)
}

export async function loadSyncSettings(): Promise<SyncSettings> {
  const raw = await AsyncStorage.getItem(SYNC_SETTINGS_KEY)
  if (!raw) return DEFAULT_SYNC_SETTINGS

  try {
    const parsed = JSON.parse(raw)
    return {
      autoSync: typeof parsed.autoSync === 'boolean' ? parsed.autoSync : DEFAULT_SYNC_SETTINGS.autoSync,
      wifiOnly: typeof parsed.wifiOnly === 'boolean' ? parsed.wifiOnly : DEFAULT_SYNC_SETTINGS.wifiOnly,
      backgroundIntervalSec: normalizeInterval(
        Number(parsed.backgroundIntervalSec ?? DEFAULT_SYNC_SETTINGS.backgroundIntervalSec)
      ),
    }
  } catch (_error) {
    return DEFAULT_SYNC_SETTINGS
  }
}

export async function saveSyncSettings(partial: Partial<SyncSettings>): Promise<SyncSettings> {
  const current = await loadSyncSettings()
  const next: SyncSettings = {
    autoSync: typeof partial.autoSync === 'boolean' ? partial.autoSync : current.autoSync,
    wifiOnly: typeof partial.wifiOnly === 'boolean' ? partial.wifiOnly : current.wifiOnly,
    backgroundIntervalSec: normalizeInterval(
      Number(partial.backgroundIntervalSec ?? current.backgroundIntervalSec)
    ),
  }
  await AsyncStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(next))
  notifySyncStateChanged()
  return next
}

export async function setLastPushAt(timestamp: number): Promise<void> {
  await AsyncStorage.setItem(SYNC_LAST_PUSH_AT_KEY, String(timestamp))
  notifySyncStateChanged()
}

export async function setLastPullAt(timestamp: number): Promise<void> {
  await AsyncStorage.setItem(SYNC_LAST_PULL_AT_KEY, String(timestamp))
  notifySyncStateChanged()
}

export async function getSyncTimestamps(): Promise<{
  lastPushAt: number | null
  lastPullAt: number | null
}> {
  const [pushRaw, pullRaw] = await Promise.all([
    AsyncStorage.getItem(SYNC_LAST_PUSH_AT_KEY),
    AsyncStorage.getItem(SYNC_LAST_PULL_AT_KEY),
  ])

  const parse = (value: string | null) => {
    if (!value) return null
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  return {
    lastPushAt: parse(pushRaw),
    lastPullAt: parse(pullRaw),
  }
}

export const saveSyncQueue = (...args: Parameters<typeof saveSyncQueueUnlocked>) =>
  serializeQueueWrite(() => saveSyncQueueUnlocked(...args))

export const clearSyncQueue = (...args: Parameters<typeof clearSyncQueueUnlocked>) =>
  serializeQueueWrite(() => clearSyncQueueUnlocked(...args))

export const clearSyncRuntimeState = (...args: Parameters<typeof clearSyncRuntimeStateUnlocked>) =>
  serializeQueueWrite(() => clearSyncRuntimeStateUnlocked(...args))

export const enqueueSyncOperation = (...args: Parameters<typeof enqueueSyncOperationUnlocked>) =>
  serializeQueueWrite(() => enqueueSyncOperationUnlocked(...args))

export const updateSyncQueueItem = (...args: Parameters<typeof updateSyncQueueItemUnlocked>) =>
  serializeQueueWrite(() => updateSyncQueueItemUnlocked(...args))

export const markSyncItemsAsSynced = (...args: Parameters<typeof markSyncItemsAsSyncedUnlocked>) =>
  serializeQueueWrite(() => markSyncItemsAsSyncedUnlocked(...args))

export const resetQueueItemsToQueued = (...args: Parameters<typeof resetQueueItemsToQueuedUnlocked>) =>
  serializeQueueWrite(() => resetQueueItemsToQueuedUnlocked(...args))

export const removeSyncedQueueItems = (...args: Parameters<typeof removeSyncedQueueItemsUnlocked>) =>
  serializeQueueWrite(() => removeSyncedQueueItemsUnlocked(...args))

// Commit only the item this upload processed. A new local revision stays queued,
// while retaining the remote ID returned by a successful create.
export function commitSyncResult(original: SyncQueueItem, result: SyncQueueItem): Promise<void> {
  return serializeQueueWrite(async () => {
    const queue = await loadSyncQueue()
    const next = queue.map(item => {
      if (item.id !== original.id) return item
      if (JSON.stringify(item) === JSON.stringify(original)) return result
      return { ...item, remoteId: result.remoteId || item.remoteId }
    })
    await persistQueue(next)
  })
}
