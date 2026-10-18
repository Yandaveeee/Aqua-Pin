import { database, mockDatabase } from './index'
import { Pond } from './models'
import { fetchPondRecords } from './queries'
import { enqueueSyncOperation } from './syncQueue'

const isMock = !database

function toId(value: any): string {
  return String(value || '').trim()
}

function toTimestamp(value: any): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

function getPondId(value: any): string {
  return toId(value?.pondId ?? value?.pond_id)
}

function normalizeSpecies(value: any): string {
  return String(value || '').trim()
}

function uniqueSpecies(values: Array<any>): string[] {
  return Array.from(new Set(values.map(normalizeSpecies).filter(Boolean)))
}

function isHarvestPartial(value: any): boolean {
  return Boolean(value?.isPartial ?? value?.is_partial ?? false)
}

function toFiniteInt(value: any): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.round(numeric))
}

function buildPondSyncPayload(pond: any, nextState: DerivedPondState) {
  return {
    id: toId(pond?.id),
    name: pond?.name || 'Unnamed Pond',
    location: pond?.location || '',
    boundary: pond?.boundary ?? null,
    createdBy: pond?.createdBy || pond?.created_by || '',
    createdAt: pond?.createdAt || pond?.created_at || Date.now(),
    isActive: nextState.isActive,
    currentSpecies: nextState.currentSpecies ?? null,
    currentStockCount: nextState.currentStockCount,
  }
}

export interface DerivedPondState {
  isActive: boolean
  currentSpecies?: string
  currentStockCount: number
  activeSpecies: string[]
  cycleStartedAt: number
  latestFullHarvestAt: number
}

export function formatPondSpeciesLabel(species: string[]): string | undefined {
  const unique = uniqueSpecies(species)
  return unique.length > 0 ? unique.join(', ') : undefined
}

export function parsePondSpeciesLabel(value: unknown): string[] {
  if (typeof value !== 'string') return []
  return uniqueSpecies(value.split(',').map((item) => item.trim()))
}

export function derivePondStateFromRecords(
  pondId: string,
  records: {
    stockings: any[]
    harvests: any[]
    mortalities: any[]
  }
): DerivedPondState {
  const pondStockings = records.stockings
    .filter((item) => getPondId(item) === pondId)

  const pondHarvests = records.harvests
    .filter((item) => getPondId(item) === pondId)

  const pondMortalities = records.mortalities
    .filter((item) => getPondId(item) === pondId)

  const latestFullHarvestAt = pondHarvests.reduce((latest, harvest) => {
    if (isHarvestPartial(harvest)) return latest
    return Math.max(latest, toTimestamp(harvest?.createdAt ?? harvest?.created_at))
  }, 0)

  const activeStockings = pondStockings.filter((stocking) => {
    const createdAt = toTimestamp(stocking?.createdAt ?? stocking?.created_at)
    if (createdAt <= latestFullHarvestAt) return false

    const status = String(stocking?.status || 'active').trim().toLowerCase()
    return status !== 'harvested'
  })

  const totalStocked = activeStockings.reduce((sum, item) => sum + toFiniteInt(item?.quantity), 0)

  const totalHarvestedFish = pondHarvests.reduce((sum, item) => {
    const createdAt = toTimestamp(item?.createdAt ?? item?.created_at)
    if (createdAt <= latestFullHarvestAt) return sum
    return sum + toFiniteInt(item?.fishCount ?? item?.fish_count)
  }, 0)

  const totalMortality = pondMortalities.reduce((sum, item) => {
    const createdAt = toTimestamp(item?.createdAt ?? item?.created_at)
    if (createdAt <= latestFullHarvestAt) return sum
    return sum + toFiniteInt(item?.quantity)
  }, 0)

  const currentStockCount = Math.max(0, totalStocked - totalHarvestedFish - totalMortality)
  const activeSpecies = uniqueSpecies(activeStockings.map((item) => item?.species))
  const currentSpecies = currentStockCount > 0 ? formatPondSpeciesLabel(activeSpecies) : undefined
  const cycleStartedAt =
    activeStockings.reduce((earliest, item) => {
      const createdAt = toTimestamp(item?.createdAt ?? item?.created_at)
      if (createdAt === 0) return earliest
      if (earliest === 0) return createdAt
      return Math.min(earliest, createdAt)
    }, 0) || latestFullHarvestAt

  return {
    isActive: currentStockCount > 0,
    currentSpecies,
    currentStockCount,
    activeSpecies,
    cycleStartedAt,
    latestFullHarvestAt,
  }
}

async function loadRecords(pondId?: string) {
  if (pondId) {
    const [pond, stockings, harvests, mortalities] = await Promise.all([
      isMock ? mockDatabase.get(`pond:${pondId}`) : database.collections.get('ponds').find(pondId),
      fetchPondRecords('stocking_logs', pondId),
      fetchPondRecords('harvests', pondId),
      fetchPondRecords('mortality_logs', pondId),
    ])
    return { ponds: pond ? [pond] : [], stockings, harvests, mortalities }
  }
  const [ponds, stockings, harvests, mortalities] = await Promise.all([
    isMock ? mockDatabase.getAll('pond:') : database.collections.get('ponds').query().fetch(),
    isMock ? mockDatabase.getAll('stocking:') : database.collections.get('stocking_logs').query().fetch(),
    isMock ? mockDatabase.getAll('harvest:') : database.collections.get('harvests').query().fetch(),
    isMock ? mockDatabase.getAll('mortality:') : database.collections.get('mortality_logs').query().fetch(),
  ])

  return { ponds, stockings, harvests, mortalities }
}

function pondStateChanged(pond: any, nextState: DerivedPondState): boolean {
  const currentSpecies = normalizeSpecies(pond?.currentSpecies ?? pond?.current_species)
  const nextSpecies = normalizeSpecies(nextState.currentSpecies)
  const currentCount = toFiniteInt(pond?.currentStockCount ?? pond?.current_stock_count)
  const currentActive = Boolean(pond?.isActive ?? pond?.is_active)

  return (
    currentSpecies !== nextSpecies ||
    currentCount !== nextState.currentStockCount ||
    currentActive !== nextState.isActive
  )
}

export async function recomputePondState(
  pondId: string,
  options: { queueUpdate?: boolean } = {}
): Promise<DerivedPondState | null> {
  const normalizedPondId = toId(pondId)
  if (!normalizedPondId) return null

  const { ponds, stockings, harvests, mortalities } = await loadRecords(normalizedPondId)
  const pond = ponds.find((item: any) => toId(item?.id) === normalizedPondId)
  if (!pond) return null

  const nextState = derivePondStateFromRecords(normalizedPondId, { stockings, harvests, mortalities })

  if (!pondStateChanged(pond, nextState)) {
    return nextState
  }

  if (isMock) {
    const nextPond = {
      ...pond,
      isActive: nextState.isActive,
      currentSpecies: nextState.currentSpecies,
      currentStockCount: nextState.currentStockCount,
    }

    await mockDatabase.set(`pond:${normalizedPondId}`, nextPond)

    if (options.queueUpdate) {
      await enqueueSyncOperation({
        entity: 'ponds',
        operation: 'update',
        localId: normalizedPondId,
        payload: buildPondSyncPayload(nextPond, nextState),
      })
    }

    return nextState
  }

  const syncPayload = options.queueUpdate ? buildPondSyncPayload(pond, nextState) : null

  await database.write(async () => {
    await (pond as Pond).update((record: any) => {
      record.isActive = nextState.isActive
      record.currentSpecies = nextState.currentSpecies || ''
      record.currentStockCount = nextState.currentStockCount
    })
  })

  if (syncPayload) {
    await enqueueSyncOperation({
      entity: 'ponds',
      operation: 'update',
      localId: normalizedPondId,
      payload: syncPayload,
    })
  }

  return nextState
}

export async function recomputeAllPondStates(options: { queueUpdate?: boolean } = {}): Promise<void> {
  const { ponds, stockings, harvests, mortalities } = await loadRecords()

  if (ponds.length === 0) {
    return
  }

  // Partition once rather than scanning every transaction for every pond.
  const byPond = new Map<string, { stockings: any[]; harvests: any[]; mortalities: any[] }>()
  for (const [kind, rows] of Object.entries({ stockings, harvests, mortalities })) {
    for (const row of rows as any[]) {
      const id = getPondId(row)
      let records = byPond.get(id)
      if (!records) {
        records = { stockings: [], harvests: [], mortalities: [] }
        byPond.set(id, records)
      }
      records[kind as keyof typeof records].push(row)
    }
  }
  const recordsFor = (id: string) => byPond.get(id) || { stockings: [], harvests: [], mortalities: [] }

  if (isMock) {
    for (const pond of ponds as any[]) {
      const pondId = toId(pond?.id)
      if (!pondId) continue

      const nextState = derivePondStateFromRecords(pondId, recordsFor(pondId))
      if (!pondStateChanged(pond, nextState)) continue

      const nextPond = {
        ...pond,
        isActive: nextState.isActive,
        currentSpecies: nextState.currentSpecies,
        currentStockCount: nextState.currentStockCount,
      }

      await mockDatabase.set(`pond:${pondId}`, nextPond)

      if (options.queueUpdate) {
        await enqueueSyncOperation({
          entity: 'ponds',
          operation: 'update',
          localId: pondId,
          payload: buildPondSyncPayload(nextPond, nextState),
        })
      }
    }

    return
  }

  const queuedUpdates: Array<{ pondId: string; payload: Record<string, any> }> = []

  await database.write(async () => {
    const updates = []
    for (const pond of ponds as Pond[]) {
      const pondId = toId((pond as any)?.id)
      if (!pondId) continue

      const nextState = derivePondStateFromRecords(pondId, recordsFor(pondId))
      if (!pondStateChanged(pond, nextState)) continue

      if (options.queueUpdate) {
        queuedUpdates.push({
          pondId,
          payload: buildPondSyncPayload(pond, nextState),
        })
      }

      updates.push(pond.prepareUpdate((record: any) => {
        record.isActive = nextState.isActive
        record.currentSpecies = nextState.currentSpecies || ''
        record.currentStockCount = nextState.currentStockCount
      }))
    }
    if (updates.length) await database.batch(...updates)
  })

  if (options.queueUpdate) {
    for (const update of queuedUpdates) {
      await enqueueSyncOperation({
        entity: 'ponds',
        operation: 'update',
        localId: update.pondId,
        payload: update.payload,
      })
    }
  }
}
