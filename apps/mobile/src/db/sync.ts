import { clearLocalDatabase, database, mockDatabase } from './index'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  supabase,
  isSupabaseConfigured,
  getSupabaseConfigError,
} from '../lib/supabase'
import {
  appendConflictLog,
  clearSyncRuntimeState,
  enqueueSyncOperation,
  getSyncQueueSnapshot,
  getSyncTimestamps,
  isQueueItemReadyForRetry,
  loadSyncQueue,
  removeSyncedQueueItems,
  saveSyncQueue,
  setLastPullAt,
  setLastPushAt,
  SyncEntity,
  SyncOperation,
  SyncQueueItem,
} from './syncQueue'
import { recomputeAllPondStates } from './pondState'

export { isSupabaseConfigured } from '../lib/supabase'

const LOCAL_KEY_PREFIX: Record<SyncEntity, string> = {
  ponds: '@aquapin_db:pond:',
  mortality_logs: '@aquapin_db:mortality:',
  harvests: '@aquapin_db:harvest:',
  stocking_logs: '@aquapin_db:stocking:',
  pond_history: '@aquapin_db:history:',
}

const SYNC_MARKER_PREFIX: Record<SyncEntity, string> = {
  ponds: '@aquapin_sync:pond:',
  mortality_logs: '@aquapin_sync:mortality:',
  harvests: '@aquapin_sync:harvest:',
  stocking_logs: '@aquapin_sync:stocking:',
  pond_history: '@aquapin_sync:history:',
}

const ENTITY_ORDER: SyncEntity[] = [
  'ponds',
  'stocking_logs',
  'mortality_logs',
  'harvests',
  'pond_history',
]

const BATCH_SIZE = 20
const missingTableLogged = new Set<string>()
let activeSyncRun: Promise<SyncMetrics> | null = null

export type SyncStage = 'preflight' | 'push' | 'pull' | 'done' | 'failed'

export interface SyncEntityCounts {
  ponds: number
  mortality_logs: number
  harvests: number
  stocking_logs: number
  pond_history: number
}

export interface SyncMetrics {
  queueBefore: number
  queueAfter: number
  pushed: SyncEntityCounts
  pulled: SyncEntityCounts
  failed: number
  blocked: number
  conflict: number
  skipped: number
  retries: number
}

export interface SyncProgress {
  stage: SyncStage
  message: string
  percent: number
  metrics: SyncMetrics
}

export interface SyncPreflightResult {
  ok: boolean
  blockers: string[]
  userId: string | null
  profile: { id: string; role: string; status: string } | null
}

export interface SyncDataOptions {
  onProgress?: (progress: SyncProgress) => void
}

function zeroCounts(): SyncEntityCounts {
  return {
    ponds: 0,
    mortality_logs: 0,
    harvests: 0,
    stocking_logs: 0,
    pond_history: 0,
  }
}

function createInitialMetrics(): SyncMetrics {
  return {
    queueBefore: 0,
    queueAfter: 0,
    pushed: zeroCounts(),
    pulled: zeroCounts(),
    failed: 0,
    blocked: 0,
    conflict: 0,
    skipped: 0,
    retries: 0,
  }
}

function reportProgress(options: SyncDataOptions | undefined, update: SyncProgress): void {
  try {
    options?.onProgress?.(update)
  } catch (_error) {
    // No-op: progress callbacks should never break sync
  }
}

function isUuid(value: any): boolean {
  if (typeof value !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function toTimestamp(value: any): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? Date.now() : parsed
}

function toIso(value: any): string {
  return new Date(toTimestamp(value)).toISOString()
}

function toFiniteNumber(value: any, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function safeText(value: any, fallback = ''): string {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function toId(value: any): string {
  return safeText(value).trim()
}

function truncateText(value: string, max = 500): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}...`
}

function parseCoordinatePair(value: any): { latitude: number; longitude: number } | null {
  if (typeof value === 'string') {
    const text = value.trim()

    const wkt = text.match(/^POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)$/i)
    if (wkt) {
      const longitude = Number(wkt[1])
      const latitude = Number(wkt[2])
      if (!Number.isNaN(latitude) && !Number.isNaN(longitude)) {
        return { latitude, longitude }
      }
    }

    const parts = text.split(',').map((part) => Number(part.trim()))
    if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
      return { latitude: parts[0], longitude: parts[1] }
    }
  }

  if (value && Array.isArray(value.coordinates) && value.coordinates.length >= 2) {
    const longitude = Number(value.coordinates[0])
    const latitude = Number(value.coordinates[1])
    if (!Number.isNaN(latitude) && !Number.isNaN(longitude)) {
      return { latitude, longitude }
    }
  }

  return null
}

function toSupabasePointWkt(value: any): string | null {
  const point = parseCoordinatePair(value)
  if (!point) return null
  return `POINT(${point.longitude} ${point.latitude})`
}

function normalizeLocation(value: any): string {
  const point = parseCoordinatePair(value)
  if (point) {
    return `${point.latitude}, ${point.longitude}`
  }
  return typeof value === 'string' ? value : ''
}

function pondSyncSignature(name: any, createdBy: any, createdAt: any): string {
  const normalizedName = safeText(name).trim().toLowerCase()
  const normalizedCreatedBy = safeText(createdBy).trim().toLowerCase()
  const createdAtTs = toTimestamp(createdAt)
  return `${normalizedName}|${normalizedCreatedBy}|${createdAtTs}`
}

function parseJsonField(value: any): any {
  if (value === null || value === undefined) return {}
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return value

  try {
    return JSON.parse(value)
  } catch (_error) {
    return { value }
  }
}

function toReadableErrorText(error: unknown): string {
  if (!error) return 'Unknown sync error'
  if (typeof error === 'string') return error

  if (error instanceof Error) {
    const message =
      typeof (error as any).message === 'string'
        ? (error as any).message
        : JSON.stringify((error as any).message)
    if (message && message !== '[object Object]') return message
  }

  const e = error as any
  const parts: string[] = []

  const pushPart = (value: any, prefix?: string) => {
    if (value === undefined || value === null) return
    const text = typeof value === 'string' ? value.trim() : JSON.stringify(value)
    if (!text || text === '[object Object]') return
    parts.push(prefix ? `${prefix}: ${text}` : text)
  }

  pushPart(e.message)
  pushPart(e.details, 'details')
  pushPart(e.hint, 'hint')
  pushPart(e.code, 'code')
  pushPart(e.error_description)
  pushPart(e.error)

  if (parts.length > 0) {
    return truncateText(parts.join(' | '))
  }

  try {
    return truncateText(JSON.stringify(error))
  } catch (_err) {
    return truncateText(String(error))
  }
}

function normalizeSyncError(error: unknown): Error {
  const rawMessage = toReadableErrorText(error)
  const lower = rawMessage.toLowerCase()

  if (isLocalPondDuplicateErrorText(lower)) {
    return new Error(
      'Local pond duplicate detected during sync. The standalone cache already contains that pond id, so the app needs to refresh the local cache before pulling again.'
    )
  }

  if (lower.includes('row-level security policy') || lower.includes('code: 42501')) {
    return new Error(
      'Sync blocked by Supabase RLS. Verify your public_profiles row exists, your role/status satisfy the live database policies, and created_by/logged_by/harvested_by/stocked_by/recorded_by use your auth user id. If your backend is older, run supabase/step6_profile_repair.sql.'
    )
  }

  if (lower.includes('foreign key') && lower.includes('created_by')) {
    return new Error(
      'Sync blocked: created_by does not match an existing public_profiles user id. Verify your user/profile linkage in Supabase.'
    )
  }

  return error instanceof Error ? error : new Error(rawMessage)
}

function isLocalPondDuplicateErrorText(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    lower.includes('unique constraint failed: ponds.id') ||
    lower.includes('sqlite_constraint_primarykey')
  )
}

function hasAnyEntityCount(counts: SyncEntityCounts): boolean {
  return Object.values(counts).some((value) => value > 0)
}

function hasMeaningfulSyncWork(metrics: SyncMetrics): boolean {
  return (
    metrics.queueBefore > 0 ||
    metrics.queueAfter > 0 ||
    metrics.skipped > 0 ||
    hasAnyEntityCount(metrics.pushed) ||
    hasAnyEntityCount(metrics.pulled)
  )
}

function getUserScopedColumn(table: SyncEntity): string {
  switch (table) {
    case 'ponds':
      return 'created_by'
    case 'mortality_logs':
      return 'logged_by'
    case 'harvests':
      return 'harvested_by'
    case 'stocking_logs':
      return 'stocked_by'
    case 'pond_history':
      return 'recorded_by'
  }
}

function isMissingTableError(table: string, error: unknown): boolean {
  const text = toReadableErrorText(error).toLowerCase()
  const code = String((error as any)?.code || '').toUpperCase()
  const tableLower = table.toLowerCase()

  return (
    code === 'PGRST205' ||
    text.includes('pgrst205') ||
    (text.includes('could not find the table') && text.includes(tableLower)) ||
    (text.includes('schema cache') && text.includes(tableLower))
  )
}

function getMarkerKey(entity: SyncEntity, localId: string): string {
  return `${SYNC_MARKER_PREFIX[entity]}${localId}`
}

async function loadMarkerMap(entity: SyncEntity): Promise<Map<string, string>> {
  const keys = await AsyncStorage.getAllKeys()
  const prefix = SYNC_MARKER_PREFIX[entity]
  const markerKeys = keys.filter((key) => key.startsWith(prefix))
  if (markerKeys.length === 0) return new Map()

  const pairs = await AsyncStorage.multiGet(markerKeys)
  const map = new Map<string, string>()
  for (const [key, value] of pairs) {
    if (!value) continue
    const localId = key.slice(prefix.length)
    if (!localId) continue
    map.set(localId, value)
  }
  return map
}

async function setMarker(entity: SyncEntity, localId: string, remoteId: string): Promise<void> {
  if (!localId || !remoteId) return
  await AsyncStorage.setItem(getMarkerKey(entity, localId), remoteId)
}

async function removeMarker(entity: SyncEntity, localId: string): Promise<void> {
  if (!localId) return
  await AsyncStorage.removeItem(getMarkerKey(entity, localId))
}

async function resolveRemoteEntityId(
  entity: SyncEntity,
  localId: string,
  explicitRemoteId?: string,
  pondMaps?: { localToRemote: Map<string, string> }
): Promise<string> {
  const direct = safeText(explicitRemoteId || '').trim()
  if (direct) return direct

  if (entity === 'ponds') {
    const mapped = safeText(pondMaps?.localToRemote.get(localId) || '').trim()
    if (mapped) return mapped
  }

  const stored = safeText(await AsyncStorage.getItem(getMarkerKey(entity, localId))).trim()
  if (stored) return stored

  return isUuid(localId) ? localId : ''
}

async function ensureQueueSeededFromLocalData(userId: string): Promise<number> {
  const allKeys = await AsyncStorage.getAllKeys()
  const markerKeySet = new Set(
    allKeys.filter((key) => Object.values(SYNC_MARKER_PREFIX).some((prefix) => key.startsWith(prefix)))
  )

  const queue = await loadSyncQueue()
  const unsyncedSet = new Set(
    queue
      .filter((item) => item.status !== 'synced')
      .map((item) => `${item.entity}:${item.localId}`)
  )

  let added = 0

  for (const entity of ENTITY_ORDER) {
    const prefix = LOCAL_KEY_PREFIX[entity]
    const entityKeys = allKeys.filter((key) => key.startsWith(prefix))
    if (entityKeys.length === 0) continue

    const rows = await AsyncStorage.multiGet(entityKeys)

    for (const [key, value] of rows) {
      if (!value) continue

      let parsed: any
      try {
        parsed = JSON.parse(value)
      } catch (_error) {
        continue
      }

      const fallbackId = key.slice(prefix.length)
      const localId = safeText(parsed.id || fallbackId).trim()
      if (!localId) continue

      const markerKey = getMarkerKey(entity, localId)
      if (markerKeySet.has(markerKey)) continue

      const signature = `${entity}:${localId}`
      if (unsyncedSet.has(signature)) continue

      const payload = normalizeLocalPayload(entity, parsed, userId, localId)
      const dependsOn =
        entity === 'ponds'
          ? undefined
          : [{ entity: 'ponds' as const, localId: safeText(parsed.pondId || parsed.pond_id || '').trim() }]

      await enqueueSyncOperation({
        entity,
        operation: 'create',
        localId,
        payload,
        dependsOn,
      })

      unsyncedSet.add(signature)
      added += 1
    }
  }

  return added
}

function normalizeLocalPayload(
  entity: SyncEntity,
  item: Record<string, any>,
  userId: string,
  localId: string
): Record<string, any> {
  if (entity === 'ponds') {
    return {
      id: localId,
      name: safeText(item.name || 'Unnamed Pond'),
      location: normalizeLocation(item.location),
      boundary: item.boundary || null,
      createdBy: safeText(item.createdBy || item.created_by || userId),
      createdAt: toTimestamp(item.createdAt || item.created_at || Date.now()),
      isActive: Boolean(item.isActive ?? item.is_active ?? false),
      currentSpecies: item.currentSpecies ?? item.current_species ?? null,
      currentStockCount: toFiniteNumber(item.currentStockCount ?? item.current_stock_count, 0),
    }
  }

  if (entity === 'mortality_logs') {
    return {
      id: localId,
      pondId: safeText(item.pondId || item.pond_id || ''),
      quantity: Math.max(0, Math.round(toFiniteNumber(item.quantity, 0))),
      notes: item.notes || null,
      loggedBy: safeText(item.loggedBy || item.logged_by || userId),
      createdAt: toTimestamp(item.createdAt || item.created_at || Date.now()),
    }
  }

  if (entity === 'harvests') {
    return {
      id: localId,
      pondId: safeText(item.pondId || item.pond_id || ''),
      yieldKg: toFiniteNumber(item.yieldKg ?? item.yield_kg, 0),
      harvestedBy: safeText(item.harvestedBy || item.harvested_by || userId),
      createdAt: toTimestamp(item.createdAt || item.created_at || Date.now()),
      species: item.species || null,
      isPartial: Boolean(item.isPartial ?? item.is_partial ?? false),
      fishCount:
        item.fishCount === null || item.fishCount === undefined
          ? null
          : Math.max(0, Math.round(toFiniteNumber(item.fishCount ?? item.fish_count, 0))),
    }
  }

  if (entity === 'stocking_logs') {
    return {
      id: localId,
      pondId: safeText(item.pondId || item.pond_id || ''),
      species: safeText(item.species || ''),
      quantity: Math.max(0, Math.round(toFiniteNumber(item.quantity, 0))),
      averageWeightG:
        item.averageWeightG === null || item.averageWeightG === undefined
          ? null
          : toFiniteNumber(item.averageWeightG ?? item.average_weight_g, 0),
      source: item.source || null,
      stockedBy: safeText(item.stockedBy || item.stocked_by || userId),
      createdAt: toTimestamp(item.createdAt || item.created_at || Date.now()),
      status: safeText(item.status || 'active'),
    }
  }

  return {
    id: localId,
    pondId: safeText(item.pondId || item.pond_id || ''),
    eventType: safeText(item.eventType || item.event_type || 'event'),
    eventData: parseJsonField(item.eventData || item.event_data || {}),
    recordedBy: safeText(item.recordedBy || item.recorded_by || userId),
    createdAt: toTimestamp(item.createdAt || item.created_at || Date.now()),
  }
}

async function loadPondIdMaps(): Promise<{
  localToRemote: Map<string, string>
  remoteToLocal: Map<string, string>
}> {
  const markerMap = await loadMarkerMap('ponds')
  const localToRemote = new Map<string, string>()
  const remoteToLocal = new Map<string, string>()

  for (const [localId, remoteId] of markerMap.entries()) {
    if (!remoteId) continue
    localToRemote.set(localId, remoteId)
    remoteToLocal.set(remoteId, localId)
  }

  return { localToRemote, remoteToLocal }
}

function resolvePondRemoteId(
  rawPondId: any,
  pondLocalToRemote: Map<string, string>
): { remoteId: string | null; localId: string | null } {
  const pondId = safeText(rawPondId).trim()
  if (!pondId) return { remoteId: null, localId: null }

  if (pondLocalToRemote.has(pondId)) {
    return {
      remoteId: pondLocalToRemote.get(pondId) || null,
      localId: pondId,
    }
  }

  if (isUuid(pondId)) {
    return {
      remoteId: pondId,
      localId: pondId,
    }
  }

  return { remoteId: null, localId: pondId }
}

function toSyncStatusFromError(error: string): 'failed' | 'blocked' | 'conflict' {
  const lower = error.toLowerCase()
  if (lower.includes('blocked') || lower.includes('waiting for pond')) return 'blocked'
  if (lower.includes('conflict')) return 'conflict'
  return 'failed'
}

function touchAttempt(item: SyncQueueItem): SyncQueueItem {
  return {
    ...item,
    status: 'syncing',
    attempts: item.attempts + 1,
    lastAttemptAt: Date.now(),
    updatedAt: Date.now(),
    lastError: undefined,
  }
}

function markFailed(item: SyncQueueItem, message: string): SyncQueueItem {
  const status = toSyncStatusFromError(message)
  return {
    ...item,
    status,
    lastError: message,
    updatedAt: Date.now(),
    lastAttemptAt: Date.now(),
  }
}

function markSynced(item: SyncQueueItem, remoteId?: string): SyncQueueItem {
  return {
    ...item,
    status: 'synced',
    remoteId: remoteId || item.remoteId,
    lastError: undefined,
    updatedAt: Date.now(),
  }
}

function comparePointLike(left: any, right: any): boolean {
  const leftPoint = parseCoordinatePair(left)
  const rightPoint = parseCoordinatePair(right)
  if (!leftPoint || !rightPoint) return false

  return (
    Math.abs(leftPoint.latitude - rightPoint.latitude) < 0.000001 &&
    Math.abs(leftPoint.longitude - rightPoint.longitude) < 0.000001
  )
}

function rowsEquivalent(entity: SyncEntity, localRow: any, remoteRow: any): boolean {
  if (!remoteRow) return false

  if (entity === 'ponds') {
    return (
      safeText(localRow.name).trim() === safeText(remoteRow.name).trim() &&
      comparePointLike(localRow.location, remoteRow.location) &&
      safeText(localRow.created_by || '').trim() === safeText(remoteRow.created_by || '').trim()
    )
  }

  if (entity === 'mortality_logs') {
    return (
      safeText(localRow.pond_id) === safeText(remoteRow.pond_id) &&
      Number(localRow.quantity || 0) === Number(remoteRow.quantity || 0) &&
      safeText(localRow.logged_by) === safeText(remoteRow.logged_by)
    )
  }

  if (entity === 'harvests') {
    return (
      safeText(localRow.pond_id) === safeText(remoteRow.pond_id) &&
      Number(localRow.yield_kg || 0) === Number(remoteRow.yield_kg || 0) &&
      safeText(localRow.harvested_by) === safeText(remoteRow.harvested_by)
    )
  }

  if (entity === 'stocking_logs') {
    return (
      safeText(localRow.pond_id) === safeText(remoteRow.pond_id) &&
      safeText(localRow.species) === safeText(remoteRow.species) &&
      Number(localRow.quantity || 0) === Number(remoteRow.quantity || 0) &&
      safeText(localRow.stocked_by) === safeText(remoteRow.stocked_by)
    )
  }

  return (
    safeText(localRow.pond_id) === safeText(remoteRow.pond_id) &&
    safeText(localRow.event_type) === safeText(remoteRow.event_type) &&
    safeText(localRow.recorded_by) === safeText(remoteRow.recorded_by)
  )
}

function prepareRowForQueueItem(
  entity: SyncEntity,
  operation: SyncOperation,
  item: SyncQueueItem,
  userId: string,
  pondLocalToRemote: Map<string, string>
): { row: Record<string, any> | null; blockedReason?: string; remotePondId?: string } {
  const payload = item.payload || {}

  if (operation === 'delete') {
    return { row: {} }
  }

  if (entity === 'ponds') {
    const locationWkt = toSupabasePointWkt(payload.location)
    if (!locationWkt) {
      return { row: null, blockedReason: `Failed to sync pond "${safeText(payload.name || item.localId)}": invalid location` }
    }

    const row: Record<string, any> = {
      name: safeText(payload.name || 'Unnamed Pond'),
      location: locationWkt,
      created_by: userId,
      created_at: toIso(payload.createdAt || Date.now()),
      boundary: payload.boundary || null,
      is_active: Boolean(payload.isActive ?? false),
      current_species: payload.currentSpecies ?? null,
      current_stock_count: Math.max(0, Math.round(toFiniteNumber(payload.currentStockCount ?? 0, 0))),
    }

    const preferredId = item.remoteId || payload.id || item.localId
    if (isUuid(preferredId)) {
      row.id = preferredId
    }

    return { row }
  }

  const resolvedPond = resolvePondRemoteId(payload.pondId || payload.pond_id, pondLocalToRemote)
  if (!resolvedPond.remoteId) {
    return {
      row: null,
      blockedReason: `Waiting for pond sync (${safeText(payload.pondId || payload.pond_id || 'unknown')})`,
    }
  }

  if (entity === 'mortality_logs') {
    const row: Record<string, any> = {
      pond_id: resolvedPond.remoteId,
      quantity: Math.max(1, Math.round(toFiniteNumber(payload.quantity || 0, 0))),
      notes: payload.notes || null,
      logged_by: userId,
      created_at: toIso(payload.createdAt || Date.now()),
    }

    const preferredId = item.remoteId || payload.id || item.localId
    if (isUuid(preferredId)) {
      row.id = preferredId
    }

    return { row, remotePondId: resolvedPond.remoteId }
  }

  if (entity === 'harvests') {
    const row: Record<string, any> = {
      pond_id: resolvedPond.remoteId,
      yield_kg: Math.max(0.0001, toFiniteNumber(payload.yieldKg ?? payload.yield_kg, 0)),
      harvested_by: userId,
      created_at: toIso(payload.createdAt || Date.now()),
      species: payload.species || null,
      is_partial: Boolean(payload.isPartial ?? payload.is_partial ?? false),
      fish_count:
        payload.fishCount === null || payload.fishCount === undefined
          ? null
          : Math.max(0, Math.round(toFiniteNumber(payload.fishCount ?? payload.fish_count, 0))),
    }

    const preferredId = item.remoteId || payload.id || item.localId
    if (isUuid(preferredId)) {
      row.id = preferredId
    }

    return { row, remotePondId: resolvedPond.remoteId }
  }

  if (entity === 'stocking_logs') {
    const row: Record<string, any> = {
      pond_id: resolvedPond.remoteId,
      species: safeText(payload.species || '').trim() || 'Unknown',
      quantity: Math.max(1, Math.round(toFiniteNumber(payload.quantity, 0))),
      average_weight_g:
        payload.averageWeightG === null || payload.averageWeightG === undefined
          ? null
          : toFiniteNumber(payload.averageWeightG ?? payload.average_weight_g, 0),
      source: payload.source || null,
      stocked_by: userId,
      created_at: toIso(payload.createdAt || Date.now()),
      status: safeText(payload.status || 'active'),
    }

    const preferredId = item.remoteId || payload.id || item.localId
    if (isUuid(preferredId)) {
      row.id = preferredId
    }

    return { row, remotePondId: resolvedPond.remoteId }
  }

  const row: Record<string, any> = {
    pond_id: resolvedPond.remoteId,
    event_type: safeText(payload.eventType || payload.event_type || 'event'),
    event_data: parseJsonField(payload.eventData || payload.event_data || {}),
    recorded_by: userId,
    created_at: toIso(payload.createdAt || Date.now()),
  }

  const preferredId = item.remoteId || payload.id || item.localId
  if (isUuid(preferredId)) {
    row.id = preferredId
  }

  return { row, remotePondId: resolvedPond.remoteId }
}

async function fetchRemoteById(entity: SyncEntity, id: string): Promise<any | null> {
  if (!id) return null
  const { data, error } = await supabase.from(entity).select('*').eq('id', id).maybeSingle()
  if (error) return null
  return data || null
}

async function findEquivalentRemoteCreate(
  entity: SyncEntity,
  row: Record<string, any>,
  preferredId: string
): Promise<{ remoteId: string; row: any } | null> {
  const exactId = safeText(preferredId).trim()
  if (exactId) {
    const exactMatch = await fetchRemoteById(entity, exactId)
    if (exactMatch) {
      return {
        remoteId: exactId,
        row: exactMatch,
      }
    }
  }

  let query = supabase.from(entity).select('*').limit(10)

  if (entity === 'ponds') {
    query = query
      .eq('created_by', safeText(row.created_by).trim())
      .eq('name', safeText(row.name).trim())
      .eq('created_at', safeText(row.created_at).trim())
  } else if (entity === 'mortality_logs') {
    query = query
      .eq('pond_id', safeText(row.pond_id).trim())
      .eq('logged_by', safeText(row.logged_by).trim())
      .eq('created_at', safeText(row.created_at).trim())
  } else if (entity === 'harvests') {
    query = query
      .eq('pond_id', safeText(row.pond_id).trim())
      .eq('harvested_by', safeText(row.harvested_by).trim())
      .eq('created_at', safeText(row.created_at).trim())
  } else if (entity === 'stocking_logs') {
    query = query
      .eq('pond_id', safeText(row.pond_id).trim())
      .eq('stocked_by', safeText(row.stocked_by).trim())
      .eq('created_at', safeText(row.created_at).trim())
  } else {
    query = query
      .eq('pond_id', safeText(row.pond_id).trim())
      .eq('recorded_by', safeText(row.recorded_by).trim())
      .eq('event_type', safeText(row.event_type).trim())
      .eq('created_at', safeText(row.created_at).trim())
  }

  const { data, error } = await query
  if (error) {
    if (!isMissingTableError(entity, error)) {
      console.warn(`Failed duplicate check for ${entity}:`, toReadableErrorText(error))
    }
    return null
  }

  const match = (data || []).find((candidate) => rowsEquivalent(entity, row, candidate))
  const remoteId = safeText(match?.id).trim()
  if (!match || !remoteId) return null

  return {
    remoteId,
    row: match,
  }
}

async function processSingleQueueItem(
  queue: SyncQueueItem[],
  item: SyncQueueItem,
  userId: string,
  pondMaps: { localToRemote: Map<string, string>; remoteToLocal: Map<string, string> },
  metrics: SyncMetrics
): Promise<{ queue: SyncQueueItem[]; remoteId?: string }> {
  let nextQueue = queue.map((entry) => (entry.id === item.id ? touchAttempt(entry) : entry))

  const processingItem = nextQueue.find((entry) => entry.id === item.id)
  if (!processingItem) {
    return { queue: nextQueue }
  }

  const prepared = prepareRowForQueueItem(
    processingItem.entity,
    processingItem.operation,
    processingItem,
    userId,
    pondMaps.localToRemote
  )

  if (!prepared.row) {
    const message = prepared.blockedReason || 'Sync blocked by unresolved dependency'
    nextQueue = nextQueue.map((entry) => (entry.id === processingItem.id ? markFailed(entry, message) : entry))
    if (toSyncStatusFromError(message) === 'blocked') {
      metrics.blocked += 1
    } else {
      metrics.failed += 1
    }
    return { queue: nextQueue }
  }

  try {
    if (processingItem.operation === 'delete') {
      const preferredId = await resolveRemoteEntityId(
        processingItem.entity,
        processingItem.localId,
        processingItem.remoteId,
        pondMaps
      )

      if (!preferredId) {
        const message = `Cannot delete ${processingItem.entity}: missing remote id mapping`
        nextQueue = nextQueue.map((entry) => (entry.id === processingItem.id ? markFailed(entry, message) : entry))
        metrics.blocked += 1
        return { queue: nextQueue }
      }

      const { error } = await supabase.from(processingItem.entity).delete().eq('id', preferredId)
      if (error) {
        throw error
      }

      await removeMarker(processingItem.entity, processingItem.localId)
      nextQueue = nextQueue.map((entry) =>
        entry.id === processingItem.id ? markSynced(entry, preferredId) : entry
      )
      metrics.pushed[processingItem.entity] += 1
      return { queue: nextQueue, remoteId: preferredId }
    }

    const preferredId =
      safeText(prepared.row.id || '').trim() ||
      (await resolveRemoteEntityId(
        processingItem.entity,
        processingItem.localId,
        processingItem.remoteId,
        pondMaps
      ))

    let responseData: any = null
    if (processingItem.operation === 'update') {
      if (!preferredId) {
        const message = `Cannot update ${processingItem.entity}: missing remote id mapping`
        nextQueue = nextQueue.map((entry) => (entry.id === processingItem.id ? markFailed(entry, message) : entry))
        metrics.blocked += 1
        return { queue: nextQueue }
      }

      const updatePayload = { ...prepared.row }
      delete updatePayload.id

      const serverSnapshot = await fetchRemoteById(processingItem.entity, preferredId)
      if (serverSnapshot && !rowsEquivalent(processingItem.entity, prepared.row, serverSnapshot)) {
        await appendConflictLog({
          itemId: processingItem.id,
          entity: processingItem.entity,
          localId: processingItem.localId,
          reason: 'Remote snapshot differs before update; applying last_write_wins.',
          serverSnapshot,
          localSnapshot: prepared.row,
        })
      }

      const { data, error } = await supabase
        .from(processingItem.entity)
        .update(updatePayload)
        .eq('id', preferredId)
        .select('id')
        .maybeSingle()

      if (error) {
        throw error
      }

      // RLS can hide the target row without returning a database error.
      // Keep the operation retryable instead of discarding an unsaved update.
      if (!data?.id) {
        throw new Error(`Cannot update ${processingItem.entity}: row missing or update permission denied`)
      }

      responseData = data
    } else {
      const useUpsert = Boolean(preferredId)
      const equivalentRemote = await findEquivalentRemoteCreate(
        processingItem.entity,
        prepared.row,
        preferredId
      )

      if (equivalentRemote?.remoteId) {
        const remoteId = equivalentRemote.remoteId

        if (processingItem.entity === 'ponds') {
          pondMaps.localToRemote.set(processingItem.localId, remoteId)
          pondMaps.remoteToLocal.set(remoteId, processingItem.localId)
        }

        await setMarker(processingItem.entity, processingItem.localId, remoteId)
        nextQueue = nextQueue.map((entry) =>
          entry.id === processingItem.id ? markSynced(entry, remoteId) : entry
        )
        metrics.pushed[processingItem.entity] += 1
        return { queue: nextQueue, remoteId }
      }

      if (useUpsert) {
        prepared.row.id = preferredId
        const { data, error } = await supabase
          .from(processingItem.entity)
          .upsert([prepared.row], { onConflict: 'id' })
          .select('id')
          .maybeSingle()

        if (error) {
          throw error
        }

        responseData = data
      } else {
        const { data, error } = await supabase
          .from(processingItem.entity)
          .insert(prepared.row)
          .select('id')
          .maybeSingle()

        if (error) {
          throw error
        }

        responseData = data
      }
    }

    const remoteId = safeText(responseData?.id || preferredId).trim() || processingItem.localId

    if (processingItem.entity === 'ponds') {
      pondMaps.localToRemote.set(processingItem.localId, remoteId)
      pondMaps.remoteToLocal.set(remoteId, processingItem.localId)
    }

    await setMarker(processingItem.entity, processingItem.localId, remoteId)

    nextQueue = nextQueue.map((entry) =>
      entry.id === processingItem.id ? markSynced(entry, remoteId) : entry
    )

    metrics.pushed[processingItem.entity] += 1
    return { queue: nextQueue, remoteId }
  } catch (error) {
    const normalized = normalizeSyncError(error)
    const message = normalized.message

    const low = message.toLowerCase()
    const isDuplicate =
      low.includes('duplicate key') ||
      low.includes('already exists') ||
      low.includes('code: 23505') ||
      String((error as any)?.code || '').toUpperCase() === '23505'

    if (isDuplicate) {
      const preferredId =
        safeText(prepared.row.id || '').trim() ||
        (await resolveRemoteEntityId(
          processingItem.entity,
          processingItem.localId,
          processingItem.remoteId,
          pondMaps
        ))

      if (preferredId) {
        const remote = await fetchRemoteById(processingItem.entity, preferredId)
        if (remote) {
          const equivalent = rowsEquivalent(processingItem.entity, prepared.row, remote)
          if (!equivalent) {
            const conflictReason = 'Conflict detected on duplicate id; could not apply last_write_wins with current RLS.'
            await appendConflictLog({
              itemId: processingItem.id,
              entity: processingItem.entity,
              localId: processingItem.localId,
              reason: conflictReason,
              serverSnapshot: remote,
              localSnapshot: prepared.row,
            })

            nextQueue = nextQueue.map((entry) =>
              entry.id === processingItem.id
                ? {
                    ...markFailed(entry, `Sync conflict: ${conflictReason}`),
                    status: 'conflict',
                    conflict: {
                      strategy: 'last_write_wins',
                      reason: conflictReason,
                      resolved: false,
                      serverSnapshot: remote,
                      localSnapshot: prepared.row,
                    },
                  }
                : entry
            )
            metrics.conflict += 1
            return { queue: nextQueue }
          }

          await setMarker(processingItem.entity, processingItem.localId, preferredId)
          nextQueue = nextQueue.map((entry) =>
            entry.id === processingItem.id ? markSynced(entry, preferredId) : entry
          )
          metrics.pushed[processingItem.entity] += 1
          return { queue: nextQueue, remoteId: preferredId }
        }
      }
    }

    nextQueue = nextQueue.map((entry) => (entry.id === processingItem.id ? markFailed(entry, message) : entry))
    const status = toSyncStatusFromError(message)

    if (status === 'blocked') {
      metrics.blocked += 1
    } else if (status === 'conflict') {
      metrics.conflict += 1
    } else {
      metrics.failed += 1
    }

    return { queue: nextQueue }
  }
}

async function processBatchCreates(
  queue: SyncQueueItem[],
  entity: SyncEntity,
  items: SyncQueueItem[],
  userId: string,
  pondMaps: { localToRemote: Map<string, string>; remoteToLocal: Map<string, string> },
  metrics: SyncMetrics
): Promise<SyncQueueItem[]> {
  let nextQueue = queue

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE)

    const preparedItems: Array<{ item: SyncQueueItem; row: Record<string, any> }> = []
    for (const item of chunk) {
      const prepared = prepareRowForQueueItem(entity, 'create', item, userId, pondMaps.localToRemote)
      if (!prepared.row) {
        const message = prepared.blockedReason || 'Sync blocked by unresolved dependency'
        nextQueue = nextQueue.map((entry) => (entry.id === item.id ? markFailed(entry, message) : entry))
        if (toSyncStatusFromError(message) === 'blocked') {
          metrics.blocked += 1
        } else {
          metrics.failed += 1
        }
        continue
      }

      preparedItems.push({ item, row: prepared.row })
    }

    if (preparedItems.length === 0) continue

    const everyRowHasId = preparedItems.every(({ row }) => typeof row.id === 'string' && row.id.length > 0)

    try {
      let data: any[] | null = null

      if (everyRowHasId) {
        const { data: upserted, error } = await supabase
          .from(entity)
          .upsert(preparedItems.map(({ row }) => row), { onConflict: 'id' })
          .select('id')

        if (error) {
          throw error
        }

        data = upserted || []
      } else {
        const { data: inserted, error } = await supabase
          .from(entity)
          .insert(preparedItems.map(({ row }) => row))
          .select('id')

        if (error) {
          throw error
        }

        data = inserted || []
      }

      for (let idx = 0; idx < preparedItems.length; idx += 1) {
        const { item, row } = preparedItems[idx]
        const responseRow = data[idx]
        const remoteId = safeText(responseRow?.id || row.id || item.remoteId || '').trim() || item.localId

        if (entity === 'ponds') {
          pondMaps.localToRemote.set(item.localId, remoteId)
          pondMaps.remoteToLocal.set(remoteId, item.localId)
        }

        await setMarker(entity, item.localId, remoteId)
        nextQueue = nextQueue.map((entry) => {
          if (entry.id !== item.id) return entry
          const attempted = touchAttempt(entry)
          return markSynced(attempted, remoteId)
        })
        metrics.pushed[entity] += 1
      }
    } catch (_batchError) {
      for (const { item } of preparedItems) {
        const result = await processSingleQueueItem(nextQueue, item, userId, pondMaps, metrics)
        nextQueue = result.queue
      }
    }
  }

  return nextQueue
}

async function syncMockQueueToSupabase(
  userId: string,
  options: SyncDataOptions | undefined,
  metrics: SyncMetrics
): Promise<void> {
  const seededCount = await ensureQueueSeededFromLocalData(userId)
  if (seededCount > 0) {
    console.log(`🧩 Seeded ${seededCount} local records into sync queue`)
  }

  let queue = await loadSyncQueue()
  metrics.queueBefore = queue.filter((item) => item.status !== 'synced').length

  if (metrics.queueBefore === 0) {
    return
  }

  const pondMaps = await loadPondIdMaps()
  const now = Date.now()

  const runnable = queue
    .filter((item) => item.status !== 'synced')
    .filter((item) => item.attempts < item.maxAttempts)
    .filter((item) => isQueueItemReadyForRetry(item, now))

  const runnableIds = new Set(runnable.map((item) => item.id))

  for (const entity of ENTITY_ORDER) {
    const itemsForEntity = queue
      .filter((item) => runnableIds.has(item.id))
      .filter((item) => item.entity === entity)
      .sort((a, b) => a.createdAt - b.createdAt)

    if (itemsForEntity.length === 0) continue

    reportProgress(options, {
      stage: 'push',
      message: `Pushing ${entity.replace('_', ' ')}...`,
      percent: 40,
      metrics,
    })

    const createItems = itemsForEntity.filter((item) => item.operation === 'create')
    const nonCreateItems = itemsForEntity.filter((item) => item.operation !== 'create')

    if (createItems.length > 0) {
      for (const item of createItems) {
        const result = await processSingleQueueItem(queue, item, userId, pondMaps, metrics)
        queue = result.queue
        await saveSyncQueue(queue)
      }
    }

    for (const item of nonCreateItems) {
      const result = await processSingleQueueItem(queue, item, userId, pondMaps, metrics)
      queue = result.queue
      await saveSyncQueue(queue)
    }
  }

  await saveSyncQueue(queue)

  const hasPushes = Object.values(metrics.pushed).some((value) => value > 0)
  if (hasPushes) {
    await setLastPushAt(Date.now())
  }

  metrics.queueAfter = queue.filter((item) => item.status !== 'synced').length
}

async function pullSupabaseTableSince(
  table: SyncEntity,
  sinceIso: string | null,
  userId?: string,
  scopeToUser = false
): Promise<any[]> {
  let offset = 0
  const pageSize = 500
  const rows: any[] = []

  while (true) {
    let query = supabase
      .from(table)
      .select('*')
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (scopeToUser && userId) {
      query = query.eq(getUserScopedColumn(table), userId)
    }

    if (sinceIso) {
      query = query.gt('created_at', sinceIso)
    }

    const { data, error } = await query

    if (error) {
      if (isMissingTableError(table, error)) {
        if (!missingTableLogged.has(table)) {
          console.log(`ℹ️ Supabase table "${table}" not found; skipping until schema is upgraded.`)
          missingTableLogged.add(table)
        }
        return []
      }

      console.warn(`Skipping ${table} pull:`, toReadableErrorText(error))
      return []
    }

    const page = data || []
    rows.push(...page)

    if (page.length < pageSize) {
      break
    }

    offset += pageSize
  }

  return rows
}

function mapRemotePondIdToLocal(remoteId: string, maps: { remoteToLocal: Map<string, string> }): string {
  if (!remoteId) return ''
  return maps.remoteToLocal.get(remoteId) || remoteId
}

function makeSyncedDirtyRaw(id: string, raw: Record<string, any>): Record<string, any> {
  return {
    id,
    _status: 'synced',
    _changed: '',
    ...raw,
  }
}

async function prepareWatermelonUpsert(
  collection: any,
  existingRecord: any,
  dirtyRaw: Record<string, any>
): Promise<any | null> {
  const { prepareCreateFromRaw, prepareUpdateFromRaw } = require('@nozbe/watermelondb/sync/impl/helpers')

  if (existingRecord?._raw) {
    return prepareUpdateFromRaw(existingRecord._raw, dirtyRaw, collection, false)
  }

  return prepareCreateFromRaw(collection, dirtyRaw)
}

async function removeOutOfScopeWatermelonRecords(
  userId: string,
  records: {
    localPonds: any[]
    localMortalities: any[]
    localHarvests: any[]
    localStockings: any[]
    localHistory: any[]
  }
): Promise<number> {
  const ownedPondIds = new Set(
    records.localPonds
      .filter((pond) => toId(pond.createdBy || pond.created_by) === userId)
      .map((pond) => toId(pond.id))
      .filter(Boolean)
  )

  const shouldRemoveLog = (item: any, actorId: any) => {
    const pondId = toId(item.pondId || item.pond_id)
    return toId(actorId) !== userId || (pondId && !ownedPondIds.has(pondId))
  }

  const staleRecords = [
    ...records.localHistory.filter((item) => shouldRemoveLog(item, item.recordedBy || item.recorded_by)),
    ...records.localMortalities.filter((item) => shouldRemoveLog(item, item.loggedBy || item.logged_by)),
    ...records.localHarvests.filter((item) => shouldRemoveLog(item, item.harvestedBy || item.harvested_by)),
    ...records.localStockings.filter((item) => shouldRemoveLog(item, item.stockedBy || item.stocked_by)),
    ...records.localPonds.filter((pond) => toId(pond.createdBy || pond.created_by) !== userId),
  ]

  const operations = staleRecords
    .map((record) =>
      typeof record?.prepareDestroyPermanently === 'function'
        ? record.prepareDestroyPermanently()
        : null
    )
    .filter(Boolean)

  if (operations.length === 0) {
    return 0
  }

  await database.write(async () => {
    await (database as any).batch(...operations)
  })

  for (const item of staleRecords) {
    const id = toId(item.id)
    if (!id) continue

    if (item.constructor?.table === 'ponds' || 'createdBy' in item || 'created_by' in item) {
      await removeMarker('ponds', id)
    } else if (item.constructor?.table === 'mortality_logs' || 'loggedBy' in item || 'logged_by' in item) {
      await removeMarker('mortality_logs', id)
    } else if (item.constructor?.table === 'harvests' || 'harvestedBy' in item || 'harvested_by' in item) {
      await removeMarker('harvests', id)
    } else if (item.constructor?.table === 'stocking_logs' || 'stockedBy' in item || 'stocked_by' in item) {
      await removeMarker('stocking_logs', id)
    } else if (item.constructor?.table === 'pond_history' || 'recordedBy' in item || 'recorded_by' in item) {
      await removeMarker('pond_history', id)
    }
  }

  return operations.length
}

async function syncSupabaseToWatermelon(
  metrics: SyncMetrics,
  userId: string,
  scopeToUser: boolean
): Promise<void> {
  if (!database) return

  const syncTs = await getSyncTimestamps()
  // Field-staff sync is intentionally full-pull and idempotent. This ensures
  // a second device can see older records for the same account and stale
  // cross-account cache from older builds is removed.
  const sinceIso = scopeToUser ? null : syncTs.lastPullAt ? new Date(syncTs.lastPullAt).toISOString() : null

  console.log(`🔄 Pulling Supabase data into local WatermelonDB${sinceIso ? ` since ${sinceIso}` : ' (full)'}...`)

  const [ponds, mortalities, harvests, stockings, history] = await Promise.all([
    pullSupabaseTableSince('ponds', sinceIso, userId, scopeToUser),
    pullSupabaseTableSince('mortality_logs', sinceIso, userId, scopeToUser),
    pullSupabaseTableSince('harvests', sinceIso, userId, scopeToUser),
    pullSupabaseTableSince('stocking_logs', sinceIso, userId, scopeToUser),
    pullSupabaseTableSince('pond_history', sinceIso, userId, scopeToUser),
  ])

  const pondMaps = await loadPondIdMaps()

  const pondsCollection = database.collections.get('ponds')
  const mortalityCollection = database.collections.get('mortality_logs')
  const harvestCollection = database.collections.get('harvests')
  const stockingCollection = database.collections.get('stocking_logs')
  const historyCollection = database.collections.get('pond_history')

  let [localPonds, localMortalities, localHarvests, localStockings, localHistory] = await Promise.all([
    pondsCollection.query().fetch(),
    mortalityCollection.query().fetch(),
    harvestCollection.query().fetch(),
    stockingCollection.query().fetch(),
    historyCollection.query().fetch(),
  ])

  if (scopeToUser) {
    const removed = await removeOutOfScopeWatermelonRecords(
      userId,
      {
        localPonds,
        localMortalities,
        localHarvests,
        localStockings,
        localHistory,
      }
    )

    if (removed > 0) {
      metrics.skipped += removed
      const nextLocalRecords = await Promise.all([
        pondsCollection.query().fetch(),
        mortalityCollection.query().fetch(),
        harvestCollection.query().fetch(),
        stockingCollection.query().fetch(),
        historyCollection.query().fetch(),
      ])
      localPonds = nextLocalRecords[0]
      localMortalities = nextLocalRecords[1]
      localHarvests = nextLocalRecords[2]
      localStockings = nextLocalRecords[3]
      localHistory = nextLocalRecords[4]
    }
  }

  const pondById = new Map(localPonds.map((item: any) => [toId(item?.id), item]))
  const mortalityById = new Map(localMortalities.map((item: any) => [toId(item?.id), item]))
  const harvestById = new Map(localHarvests.map((item: any) => [toId(item?.id), item]))
  const stockingById = new Map(localStockings.map((item: any) => [toId(item?.id), item]))
  const historyById = new Map(localHistory.map((item: any) => [toId(item?.id), item]))

  const localPondBySignature = new Map<string, any>()
  for (const pond of localPonds as any[]) {
    const signature = pondSyncSignature(
      pond.name,
      pond.createdBy || pond.created_by,
      pond.createdAt || pond.created_at
    )
    localPondBySignature.set(signature, pond)
  }

  const operations: any[] = []
  const markerWrites: Array<{ entity: SyncEntity; localId: string; remoteId: string }> = []
  const seenPondLocalIds = new Set<string>()

  for (const row of ponds) {
    const remoteId = safeText(row.id).trim()
    if (!remoteId) continue

    const signature = pondSyncSignature(row.name, row.created_by || row.createdBy, row.created_at || row.createdAt)
    const matchedLocal =
      pondById.get(pondMaps.remoteToLocal.get(remoteId) || '') ||
      localPondBySignature.get(signature) ||
      pondById.get(remoteId)

    const localId = toId(matchedLocal?.id || remoteId)
    if (!localId) continue

    if (seenPondLocalIds.has(localId)) {
      console.warn(`Skipping duplicate pond pull for local id "${localId}" while processing remote pond "${remoteId}".`)
      pondMaps.remoteToLocal.set(remoteId, localId)
      markerWrites.push({ entity: 'ponds', localId, remoteId })
      continue
    }

    seenPondLocalIds.add(localId)

    const dirtyRaw = makeSyncedDirtyRaw(localId, {
      name: row.name || 'Unnamed Pond',
      location: normalizeLocation(row.location),
      boundary: row.boundary ?? null,
      created_by: row.created_by || row.createdBy || '',
      created_at: toTimestamp(row.created_at || row.createdAt),
      is_active: Boolean(row.is_active ?? row.isActive),
      current_species: row.current_species ?? row.currentSpecies ?? null,
      current_stock_count: Math.max(0, Math.round(toFiniteNumber(row.current_stock_count ?? row.currentStockCount, 0))),
    })

    const prepared = await prepareWatermelonUpsert(pondsCollection, matchedLocal, dirtyRaw)
    if (prepared) {
      operations.push(prepared)
    }

    const signatureRecord = {
      id: localId,
      name: dirtyRaw.name,
      createdBy: dirtyRaw.created_by,
      createdAt: dirtyRaw.created_at,
    }
    pondById.set(localId, matchedLocal || signatureRecord)
    localPondBySignature.set(signature, signatureRecord)
    pondMaps.localToRemote.set(localId, remoteId)
    pondMaps.remoteToLocal.set(remoteId, localId)
    markerWrites.push({ entity: 'ponds', localId, remoteId })
  }

  const mortalityMarkerMap = await loadMarkerMap('mortality_logs')
  const mortalityRemoteToLocal = new Map<string, string>()
  for (const [localId, remoteId] of mortalityMarkerMap.entries()) {
    mortalityRemoteToLocal.set(remoteId, localId)
  }

  for (const row of mortalities) {
    const remoteId = safeText(row.id).trim()
    if (!remoteId) continue

    const localId = mortalityRemoteToLocal.get(remoteId) || remoteId
    const existing = mortalityById.get(localId)
    const dirtyRaw = makeSyncedDirtyRaw(localId, {
      pond_id: mapRemotePondIdToLocal(safeText(row.pond_id || row.pondId || ''), pondMaps),
      quantity: Number(row.quantity || 0),
      notes: row.notes ?? null,
      logged_by: String(row.logged_by || row.loggedBy || ''),
      created_at: toTimestamp(row.created_at || row.createdAt),
    })

    const prepared = await prepareWatermelonUpsert(mortalityCollection, existing, dirtyRaw)
    if (prepared) {
      operations.push(prepared)
    }

    mortalityById.set(localId, existing || { id: localId })
    markerWrites.push({ entity: 'mortality_logs', localId, remoteId })
  }

  const harvestMarkerMap = await loadMarkerMap('harvests')
  const harvestRemoteToLocal = new Map<string, string>()
  for (const [localId, remoteId] of harvestMarkerMap.entries()) {
    harvestRemoteToLocal.set(remoteId, localId)
  }

  for (const row of harvests) {
    const remoteId = safeText(row.id).trim()
    if (!remoteId) continue

    const localId = harvestRemoteToLocal.get(remoteId) || remoteId
    const existing = harvestById.get(localId)
    const dirtyRaw = makeSyncedDirtyRaw(localId, {
      pond_id: mapRemotePondIdToLocal(safeText(row.pond_id || row.pondId || ''), pondMaps),
      yield_kg: Number(row.yield_kg ?? row.yieldKg ?? 0),
      harvested_by: String(row.harvested_by || row.harvestedBy || ''),
      created_at: toTimestamp(row.created_at || row.createdAt),
      species: row.species ?? null,
      is_partial: Boolean(row.is_partial ?? row.isPartial),
      fish_count:
        row.fish_count === null || row.fish_count === undefined
          ? null
          : Math.max(0, Math.round(toFiniteNumber(row.fish_count ?? row.fishCount, 0))),
    })

    const prepared = await prepareWatermelonUpsert(harvestCollection, existing, dirtyRaw)
    if (prepared) {
      operations.push(prepared)
    }

    harvestById.set(localId, existing || { id: localId })
    markerWrites.push({ entity: 'harvests', localId, remoteId })
  }

  const stockingMarkerMap = await loadMarkerMap('stocking_logs')
  const stockingRemoteToLocal = new Map<string, string>()
  for (const [localId, remoteId] of stockingMarkerMap.entries()) {
    stockingRemoteToLocal.set(remoteId, localId)
  }

  for (const row of stockings) {
    const remoteId = safeText(row.id).trim()
    if (!remoteId) continue

    const localId = stockingRemoteToLocal.get(remoteId) || remoteId
    const existing = stockingById.get(localId)
    const dirtyRaw = makeSyncedDirtyRaw(localId, {
      pond_id: mapRemotePondIdToLocal(safeText(row.pond_id || row.pondId || ''), pondMaps),
      species: row.species || '',
      quantity: Number(row.quantity || 0),
      average_weight_g:
        row.average_weight_g === null || row.average_weight_g === undefined
          ? null
          : toFiniteNumber(row.average_weight_g ?? row.averageWeightG, 0),
      source: row.source ?? null,
      stocked_by: String(row.stocked_by || row.stockedBy || ''),
      created_at: toTimestamp(row.created_at || row.createdAt),
      status: row.status || 'active',
    })

    const prepared = await prepareWatermelonUpsert(stockingCollection, existing, dirtyRaw)
    if (prepared) {
      operations.push(prepared)
    }

    stockingById.set(localId, existing || { id: localId })
    markerWrites.push({ entity: 'stocking_logs', localId, remoteId })
  }

  const historyMarkerMap = await loadMarkerMap('pond_history')
  const historyRemoteToLocal = new Map<string, string>()
  for (const [localId, remoteId] of historyMarkerMap.entries()) {
    historyRemoteToLocal.set(remoteId, localId)
  }

  for (const row of history) {
    const remoteId = safeText(row.id).trim()
    if (!remoteId) continue

    const localId = historyRemoteToLocal.get(remoteId) || remoteId
    const existing = historyById.get(localId)
    const dirtyRaw = makeSyncedDirtyRaw(localId, {
      pond_id: mapRemotePondIdToLocal(safeText(row.pond_id || row.pondId || ''), pondMaps),
      event_type: row.event_type || row.eventType || '',
      event_data:
        typeof row.event_data === 'string'
          ? row.event_data
          : JSON.stringify(row.event_data || row.eventData || {}),
      created_at: toTimestamp(row.created_at || row.createdAt),
      recorded_by: String(row.recorded_by || row.recordedBy || ''),
    })

    const prepared = await prepareWatermelonUpsert(historyCollection, existing, dirtyRaw)
    if (prepared) {
      operations.push(prepared)
    }

    historyById.set(localId, existing || { id: localId })
    markerWrites.push({ entity: 'pond_history', localId, remoteId })
  }

  if (operations.length > 0) {
    await database.write(async () => {
      await (database as any).batch(...operations)
    })
  }

  for (const marker of markerWrites) {
    await setMarker(marker.entity, marker.localId, marker.remoteId)
  }

  metrics.pulled.ponds += ponds.length
  metrics.pulled.mortality_logs += mortalities.length
  metrics.pulled.harvests += harvests.length
  metrics.pulled.stocking_logs += stockings.length
  metrics.pulled.pond_history += history.length

  await setLastPullAt(Date.now())

  console.log(
    `✅ Pulled ${ponds.length} ponds, ${mortalities.length} mortality logs, ${harvests.length} harvests, ${stockings.length} stockings, ${history.length} history records`
  )
}

async function recoverStandalonePullCacheFromDuplicate(metrics: SyncMetrics): Promise<void> {
  console.warn('Recovering standalone sync cache after local pond duplicate was detected during pull.')
  await clearLocalDatabase()
  await clearSyncRuntimeState()
  metrics.pulled = zeroCounts()
  metrics.queueAfter = 0
}

async function removeOutOfScopeMockRecords(userId: string): Promise<number> {
  if (!mockDatabase) return 0

  const [localPonds, localMortalities, localHarvests, localStockings, localHistory] = await Promise.all([
    mockDatabase.getAll('pond:'),
    mockDatabase.getAll('mortality:'),
    mockDatabase.getAll('harvest:'),
    mockDatabase.getAll('stocking:'),
    mockDatabase.getAll('history:'),
  ])

  const ownedPondIds = new Set(
    localPonds
      .filter((pond: any) => toId(pond.createdBy || pond.created_by) === userId)
      .map((pond: any) => toId(pond.id))
      .filter(Boolean)
  )

  const shouldRemoveLog = (item: any, actorId: any) => {
    const pondId = toId(item.pondId || item.pond_id)
    return toId(actorId) !== userId || (pondId && !ownedPondIds.has(pondId))
  }

  const removals: Array<{ entity: SyncEntity; key: string; id: string }> = [
    ...localPonds
      .filter((pond: any) => toId(pond.createdBy || pond.created_by) !== userId)
      .map((pond: any) => ({ entity: 'ponds' as const, key: `pond:${pond.id}`, id: toId(pond.id) })),
    ...localMortalities
      .filter((item: any) => shouldRemoveLog(item, item.loggedBy || item.logged_by))
      .map((item: any) => ({ entity: 'mortality_logs' as const, key: `mortality:${item.id}`, id: toId(item.id) })),
    ...localHarvests
      .filter((item: any) => shouldRemoveLog(item, item.harvestedBy || item.harvested_by))
      .map((item: any) => ({ entity: 'harvests' as const, key: `harvest:${item.id}`, id: toId(item.id) })),
    ...localStockings
      .filter((item: any) => shouldRemoveLog(item, item.stockedBy || item.stocked_by))
      .map((item: any) => ({ entity: 'stocking_logs' as const, key: `stocking:${item.id}`, id: toId(item.id) })),
    ...localHistory
      .filter((item: any) => shouldRemoveLog(item, item.recordedBy || item.recorded_by))
      .map((item: any) => ({ entity: 'pond_history' as const, key: `history:${item.id}`, id: toId(item.id) })),
  ]

  for (const removal of removals) {
    await mockDatabase.remove(removal.key)
    await removeMarker(removal.entity, removal.id)
  }

  return removals.length
}

async function syncSupabaseToMock(
  metrics: SyncMetrics,
  userId: string,
  scopeToUser: boolean
): Promise<void> {
  if (!mockDatabase) return

  const syncTs = await getSyncTimestamps()
  const sinceIso = scopeToUser ? null : syncTs.lastPullAt ? new Date(syncTs.lastPullAt).toISOString() : null

  console.log(`🔄 Pulling Supabase data into local mock database${sinceIso ? ` since ${sinceIso}` : ' (full)'}...`)

  const [ponds, mortalities, harvests, stockings, history] = await Promise.all([
    pullSupabaseTableSince('ponds', sinceIso, userId, scopeToUser),
    pullSupabaseTableSince('mortality_logs', sinceIso, userId, scopeToUser),
    pullSupabaseTableSince('harvests', sinceIso, userId, scopeToUser),
    pullSupabaseTableSince('stocking_logs', sinceIso, userId, scopeToUser),
    pullSupabaseTableSince('pond_history', sinceIso, userId, scopeToUser),
  ])

  const pondMaps = await loadPondIdMaps()

  if (scopeToUser) {
    const removed = await removeOutOfScopeMockRecords(userId)
    metrics.skipped += removed
  }

  const localPonds = await mockDatabase.getAll('pond:')
  const localPondBySignature = new Map<string, any>()
  for (const pond of localPonds) {
    const signature = pondSyncSignature(
      pond.name,
      pond.createdBy || pond.created_by,
      pond.createdAt || pond.created_at
    )
    localPondBySignature.set(signature, pond)
  }

  for (const row of ponds) {
    const signature = pondSyncSignature(row.name, row.created_by || row.createdBy, row.created_at || row.createdAt)
    const matchedLocal = localPondBySignature.get(signature)
    const localId = safeText(matchedLocal?.id || row.id)

    await mockDatabase.set(`pond:${localId}`, {
      id: localId,
      name: row.name || 'Unnamed Pond',
      location: normalizeLocation(row.location),
      boundary: row.boundary || undefined,
      createdBy: row.created_by || row.createdBy || '',
      createdAt: toTimestamp(row.created_at || row.createdAt),
      isActive: Boolean(row.is_active ?? row.isActive),
      currentSpecies: row.current_species ?? row.currentSpecies ?? undefined,
      currentStockCount: Number(row.current_stock_count ?? row.currentStockCount ?? 0) || undefined,
    })

    if (row.id) {
      pondMaps.localToRemote.set(localId, String(row.id))
      pondMaps.remoteToLocal.set(String(row.id), localId)
      await setMarker('ponds', localId, String(row.id))
    }
  }

  const mortalityMarkerMap = await loadMarkerMap('mortality_logs')
  const mortalityRemoteToLocal = new Map<string, string>()
  for (const [localId, remoteId] of mortalityMarkerMap.entries()) {
    mortalityRemoteToLocal.set(remoteId, localId)
  }

  for (const row of mortalities) {
    const remoteId = safeText(row.id)
    const localId = mortalityRemoteToLocal.get(remoteId) || remoteId
    const pondId = mapRemotePondIdToLocal(safeText(row.pond_id || row.pondId || ''), pondMaps)

    await mockDatabase.set(`mortality:${localId}`, {
      id: localId,
      pondId,
      quantity: Number(row.quantity || 0),
      notes: row.notes || undefined,
      loggedBy: String(row.logged_by || row.loggedBy || ''),
      createdAt: toTimestamp(row.created_at || row.createdAt),
    })

    if (remoteId) {
      await setMarker('mortality_logs', localId, remoteId)
    }
  }

  const harvestMarkerMap = await loadMarkerMap('harvests')
  const harvestRemoteToLocal = new Map<string, string>()
  for (const [localId, remoteId] of harvestMarkerMap.entries()) {
    harvestRemoteToLocal.set(remoteId, localId)
  }

  for (const row of harvests) {
    const remoteId = safeText(row.id)
    const localId = harvestRemoteToLocal.get(remoteId) || remoteId
    const pondId = mapRemotePondIdToLocal(safeText(row.pond_id || row.pondId || ''), pondMaps)

    await mockDatabase.set(`harvest:${localId}`, {
      id: localId,
      pondId,
      yieldKg: Number(row.yield_kg ?? row.yieldKg ?? 0),
      harvestedBy: String(row.harvested_by || row.harvestedBy || ''),
      createdAt: toTimestamp(row.created_at || row.createdAt),
      species: row.species || undefined,
      isPartial: Boolean(row.is_partial ?? row.isPartial),
      fishCount: row.fish_count ?? row.fishCount ?? undefined,
    })

    if (remoteId) {
      await setMarker('harvests', localId, remoteId)
    }
  }

  const stockingMarkerMap = await loadMarkerMap('stocking_logs')
  const stockingRemoteToLocal = new Map<string, string>()
  for (const [localId, remoteId] of stockingMarkerMap.entries()) {
    stockingRemoteToLocal.set(remoteId, localId)
  }

  for (const row of stockings) {
    const remoteId = safeText(row.id)
    const localId = stockingRemoteToLocal.get(remoteId) || remoteId
    const pondId = mapRemotePondIdToLocal(safeText(row.pond_id || row.pondId || ''), pondMaps)

    await mockDatabase.set(`stocking:${localId}`, {
      id: localId,
      pondId,
      species: row.species || '',
      quantity: Number(row.quantity || 0),
      averageWeightG: row.average_weight_g ?? row.averageWeightG ?? undefined,
      source: row.source || undefined,
      stockedBy: String(row.stocked_by || row.stockedBy || ''),
      createdAt: toTimestamp(row.created_at || row.createdAt),
      status: row.status || 'active',
    })

    if (remoteId) {
      await setMarker('stocking_logs', localId, remoteId)
    }
  }

  const historyMarkerMap = await loadMarkerMap('pond_history')
  const historyRemoteToLocal = new Map<string, string>()
  for (const [localId, remoteId] of historyMarkerMap.entries()) {
    historyRemoteToLocal.set(remoteId, localId)
  }

  for (const row of history) {
    const remoteId = safeText(row.id)
    const localId = historyRemoteToLocal.get(remoteId) || remoteId
    const pondId = mapRemotePondIdToLocal(safeText(row.pond_id || row.pondId || ''), pondMaps)

    await mockDatabase.set(`history:${localId}`, {
      id: localId,
      pondId,
      eventType: row.event_type || row.eventType || '',
      eventData:
        typeof row.event_data === 'string'
          ? row.event_data
          : JSON.stringify(row.event_data || row.eventData || {}),
      createdAt: toTimestamp(row.created_at || row.createdAt),
      recordedBy: String(row.recorded_by || row.recordedBy || ''),
    })

    if (remoteId) {
      await setMarker('pond_history', localId, remoteId)
    }
  }

  metrics.pulled.ponds += ponds.length
  metrics.pulled.mortality_logs += mortalities.length
  metrics.pulled.harvests += harvests.length
  metrics.pulled.stocking_logs += stockings.length
  metrics.pulled.pond_history += history.length

  await setLastPullAt(Date.now())

  console.log(
    `✅ Pulled ${ponds.length} ponds, ${mortalities.length} mortality logs, ${harvests.length} harvests, ${stockings.length} stockings, ${history.length} history records`
  )
}

async function syncWatermelonDb(options: SyncDataOptions, metrics: SyncMetrics): Promise<void> {
  try {
    const { synchronize } = await import('@nozbe/watermelondb/sync')

    type SyncTableChangeSet = {
      created: any[]
      updated: any[]
      deleted: string[]
    }

    type CustomChangeSet = {
      ponds: SyncTableChangeSet
      mortality_logs: SyncTableChangeSet
      harvests: SyncTableChangeSet
      stocking_logs: SyncTableChangeSet
      pond_history: SyncTableChangeSet
    }

    const syncOptions: Record<string, any> = {
      database,
      pullChanges: async ({ lastPulledAt }: any) => {
        const timestamp = lastPulledAt ? new Date(lastPulledAt).toISOString() : new Date(0).toISOString()

        const [ponds, mortality, harvests, stockings, history] = await Promise.all([
          supabase.from('ponds').select('*').gt('created_at', timestamp),
          supabase.from('mortality_logs').select('*').gt('created_at', timestamp),
          supabase.from('harvests').select('*').gt('created_at', timestamp),
          supabase.from('stocking_logs').select('*').gt('created_at', timestamp),
          supabase.from('pond_history').select('*').gt('created_at', timestamp),
        ])

        if (ponds.error || mortality.error || harvests.error || stockings.error || history.error) {
          throw new Error('Failed to pull changes from Supabase')
        }

        metrics.pulled.ponds += ponds.data?.length || 0
        metrics.pulled.mortality_logs += mortality.data?.length || 0
        metrics.pulled.harvests += harvests.data?.length || 0
        metrics.pulled.stocking_logs += stockings.data?.length || 0
        metrics.pulled.pond_history += history.data?.length || 0

        const changes: CustomChangeSet = {
          ponds: { created: ponds.data || [], updated: [], deleted: [] },
          mortality_logs: { created: mortality.data || [], updated: [], deleted: [] },
          harvests: { created: harvests.data || [], updated: [], deleted: [] },
          stocking_logs: { created: stockings.data || [], updated: [], deleted: [] },
          pond_history: { created: history.data || [], updated: [], deleted: [] },
        }

        return {
          changes: changes as any,
          timestamp: Date.now(),
        }
      },
      pushChanges: async ({ changes }: any) => {
        const customChanges = changes as unknown as CustomChangeSet

        const pushBatch = async (table: SyncEntity, rows: any[]) => {
          if (!rows || rows.length === 0) return
          const { error } = await supabase.from(table).insert(rows)
          if (error) {
            throw error
          }
          metrics.pushed[table] += rows.length
        }

        await pushBatch('ponds', customChanges.ponds?.created || [])
        await pushBatch('mortality_logs', customChanges.mortality_logs?.created || [])
        await pushBatch('harvests', customChanges.harvests?.created || [])
        await pushBatch('stocking_logs', customChanges.stocking_logs?.created || [])
        await pushBatch('pond_history', customChanges.pond_history?.created || [])
      },
    }

    // Expo Go uses the AsyncStorage mock, while standalone builds use the real
    // SQLite adapter. Only enable migration-aware sync when the adapter was
    // actually initialized with WatermelonDB migrations support.
    if ((database as any)?.adapter?.migrations) {
      syncOptions.migrationsEnabledAtVersion = 2
    }

    await synchronize(syncOptions)
  } catch (error) {
    throw normalizeSyncError(error)
  }

  await recomputeAllPondStates()
  await setLastPushAt(Date.now())
  await setLastPullAt(Date.now())
  reportProgress(options, {
    stage: 'done',
    message: 'WatermelonDB sync completed',
    percent: 100,
    metrics,
  })
}

export async function runSyncPreflight(): Promise<SyncPreflightResult> {
  const blockers: string[] = []

  if (!isSupabaseConfigured()) {
    blockers.push(getSupabaseConfigError() || 'Supabase is not configured.')
    return {
      ok: false,
      blockers,
      userId: null,
      profile: null,
    }
  }

  const auth = await supabase.auth.getUser()
  const userId = auth.data?.user?.id || null

  if (!userId) {
    blockers.push('Sync blocked: no authenticated user session. Please sign in again.')
    return {
      ok: false,
      blockers,
      userId: null,
      profile: null,
    }
  }

  const authUserEmail = safeText(auth.data?.user?.email || '').trim().toLowerCase()

  const { data: initialProfile, error: profileError } = await supabase
    .from('public_profiles')
    .select('id, role, status')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    const normalized = normalizeSyncError(profileError)
    blockers.push(`Profile check failed: ${normalized.message}`)
    return {
      ok: false,
      blockers,
      userId,
      profile: null,
    }
  }

  let profile = initialProfile

  if (!profile) {
    // Self-heal common setup issue: account exists in auth.users but missing in public_profiles.
    const { error: insertError } = await supabase.from('public_profiles').insert({
      id: userId,
      email: authUserEmail || `user-${userId.slice(0, 8)}@unknown.local`,
      role: 'field_staff',
      status: 'approved',
    })

    const insertFailedWithPermission =
      !!insertError &&
      (String((insertError as any)?.code || '').toUpperCase() === '42501' ||
        toReadableErrorText(insertError).toLowerCase().includes('row-level security policy'))

    if (insertError && String((insertError as any)?.code || '').toUpperCase() !== '23505') {
      const normalized = normalizeSyncError(insertError)
      if (insertFailedWithPermission) {
        blockers.push(
          'Sync blocked: no public_profiles row found, and app cannot auto-create it due to RLS policy.'
        )
        blockers.push(
          'Admin action needed: run supabase/step6_profile_repair.sql (or at minimum create trigger on_auth_user_created and backfill missing public_profiles rows).'
        )
      } else {
        blockers.push(`Profile auto-repair failed: ${normalized.message}`)
      }
    }

    const { data: repairedProfile, error: repairReadError } = await supabase
      .from('public_profiles')
      .select('id, role, status')
      .eq('id', userId)
      .maybeSingle()

    if (repairReadError) {
      const normalized = normalizeSyncError(repairReadError)
      blockers.push(`Profile re-check failed: ${normalized.message}`)
      return {
        ok: false,
        blockers,
        userId,
        profile: null,
      }
    }

    profile = repairedProfile

    if (!profile) {
      blockers.push('Sync blocked: no public_profiles row found for this account.')
    }
  }

  if (profile?.role === 'admin' && profile.status !== 'approved') {
    blockers.push(
      `Sync blocked: admin account status is "${profile.status}". Update public_profiles.status to "approved" for this user.`
    )
  }

  if (profile && profile.role !== 'admin' && profile.role !== 'field_staff') {
    blockers.push(`Sync blocked: unsupported role "${profile.role}" for this account.`)
  }

  return {
    ok: blockers.length === 0,
    blockers,
    userId,
    profile: profile
      ? {
          id: String(profile.id),
          role: String(profile.role),
          status: String(profile.status),
        }
      : null,
  }
}

const isMock = !database

/**
 * Syncs local database data with Supabase.
 * Works with both real WatermelonDB and mock AsyncStorage.
 */
export async function syncData(options: SyncDataOptions = {}): Promise<SyncMetrics> {
  if (activeSyncRun) {
    return activeSyncRun
  }

  activeSyncRun = (async () => {
    const metrics = createInitialMetrics()

    reportProgress(options, {
      stage: 'preflight',
      message: 'Running sync preflight checks...',
      percent: 10,
      metrics,
    })

    const preflight = await runSyncPreflight()
    if (!preflight.ok || !preflight.userId) {
      const message = preflight.blockers[0] || 'Sync preflight failed.'
      const error = new Error(message)
      reportProgress(options, {
        stage: 'failed',
        message,
        percent: 100,
        metrics,
      })
      throw error
    }

    reportProgress(options, {
      stage: 'push',
      message: 'Pushing local queue to Supabase...',
      percent: 30,
      metrics,
    })

    await syncMockQueueToSupabase(preflight.userId, options, metrics)
    const scopeToUser = preflight.profile?.role !== 'admin'

    reportProgress(options, {
      stage: 'pull',
      message: 'Pulling latest cloud changes...',
      percent: 70,
      metrics,
    })

    try {
      if (isMock) {
        await syncSupabaseToMock(metrics, preflight.userId, scopeToUser)
      } else {
        await syncSupabaseToWatermelon(metrics, preflight.userId, scopeToUser)
      }
    } catch (error) {
      const normalized = normalizeSyncError(error)
      const canRecoverStandaloneDuplicate = !isMock && metrics.queueBefore === 0 && isLocalPondDuplicateErrorText(normalized.message)

      if (!canRecoverStandaloneDuplicate) {
        throw normalized
      }

      await recoverStandalonePullCacheFromDuplicate(metrics)
      await syncSupabaseToWatermelon(metrics, preflight.userId, scopeToUser)
    }

    await recomputeAllPondStates()

    await removeSyncedQueueItems(15_000)
    const snapshot = await getSyncQueueSnapshot(200)
    metrics.queueAfter = snapshot.pending

    if (metrics.failed > 0 || metrics.blocked > 0 || metrics.conflict > 0) {
      const details: string[] = []
      if (metrics.failed > 0) details.push(`${metrics.failed} failed`)
      if (metrics.blocked > 0) details.push(`${metrics.blocked} blocked`)
      if (metrics.conflict > 0) details.push(`${metrics.conflict} conflicts`)
      const message = `Sync completed with issues: ${details.join(', ')}`

      reportProgress(options, {
        stage: 'failed',
        message,
        percent: 100,
        metrics,
      })

      throw new Error(message)
    }

    reportProgress(options, {
      stage: 'done',
      message: hasMeaningfulSyncWork(metrics) ? 'Sync completed successfully' : 'Nothing to sync',
      percent: 100,
      metrics,
    })

    return metrics
  })()
    .catch((error) => {
      throw normalizeSyncError(error)
    })
    .finally(() => {
      activeSyncRun = null
    })

  return activeSyncRun
}

/**
 * Check if using mock database (WatermelonDB not available)
 */
export function isMockMode(): boolean {
  return isMock
}

/**
 * Debug function to inspect local storage
 */
export async function debugLocalData() {
  const keys = await AsyncStorage.getAllKeys()
  const aquapinKeys = keys.filter((k) => k.startsWith('@aquapin_db:') || k.startsWith('@aquapin_sync:'))

  console.log(`Found ${aquapinKeys.length} AquaPin keys:`)
  aquapinKeys.forEach((k) => console.log('  ', k))

  const data = await AsyncStorage.multiGet(aquapinKeys)
  return data
}

/**
 * Utility to clear sync queue markers for troubleshooting.
 */
export async function resetSyncMarkers() {
  const keys = await AsyncStorage.getAllKeys()
  const markerKeys = keys.filter((key) => key.startsWith('@aquapin_sync:'))
  if (markerKeys.length > 0) {
    await AsyncStorage.multiRemove(markerKeys)
  }
  await saveSyncQueue([])
}
