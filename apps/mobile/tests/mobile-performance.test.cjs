const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLoader, memoryStorage } = require('./helpers/load-mobile.cjs');

function setup() {
  const storage = memoryStorage();
  let networkCalls = 0;
  const load = createLoader({
    '@react-native-async-storage/async-storage': storage,
    '@nozbe/watermelondb': { Q: { where: (column, value) => ({ column, value }) } },
    react: { useCallback: fn => fn, createContext: () => ({}) },
    '@react-navigation/native': {},
    'react-native': {},
    '@react-native-community/netinfo': { fetch() { networkCalls++; return new Promise(() => {}); } },
    '../lib/supabase': { isSupabaseConfigured: () => true },
    '../db/sync': { syncData() { networkCalls++; return new Promise(() => {}); } },
  });
  return { storage, load, networkCalls: () => networkCalls };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
const nextTimer = () => new Promise(resolve => setTimeout(resolve, 5));

test('local transaction saves finish without waiting for a hanging network and preserve stock state', async () => {
  const { load, networkCalls } = setup();
  const hooks = load('hooks/useOfflineData.ts');
  const db = load('db/index.ts').mockDatabase;
  const queue = load('db/syncQueue.ts');
  const events = load('db/syncEvents.ts');
  let syncRequests = 0;
  const unsubscribe = events.subscribeToSyncRequests(() => { syncRequests++; });
  const pond = await hooks.useCreatePond()({ name: 'Test pond', location: '0,0', createdBy: 'user' });
  await hooks.useCreateStockingLog()({ pondId: pond.id, species: 'Tilapia', quantity: 100, stockedBy: 'user' });
  assert.equal((await db.get(`pond:${pond.id}`)).currentStockCount, 100);
  // Give records distinct timestamps so this also checks full-harvest cycle boundaries.
  await nextTimer();
  await hooks.useCreateMortalityLog()({ pondId: pond.id, quantity: 5, loggedBy: 'user' });
  await hooks.useCreateHarvest()({ pondId: pond.id, yieldKg: 10, fishCount: 20, isPartial: true, harvestedBy: 'user' });
  assert.equal((await db.get(`pond:${pond.id}`)).currentStockCount, 75);
  await nextTimer();
  await hooks.useCreateHarvest()({ pondId: pond.id, yieldKg: 30, isPartial: false, harvestedBy: 'user' });
  const finalPond = await db.get(`pond:${pond.id}`);
  assert.equal(finalPond.currentStockCount, 0);
  assert.equal(finalPond.isActive, false);
  assert.equal((await db.getAll('stocking:'))[0].status, 'harvested');
  await hooks.useCreatePondHistoryEvent()({ pondId: pond.id, eventType: 'sampling', recordedBy: 'user' });
  assert.equal((await db.getAll('history:')).length, 7); // Includes pond creation and GPS activity.
  assert.equal((await queue.getSyncQueueSnapshot()).pending, 12);
  assert.equal(networkCalls(), 0, 'the durable local save path must never call the network');
  assert.equal(syncRequests, 6);
  unsubscribe();
});

test('save does not acknowledge success before its queue is durable', async () => {
  const { load, storage } = setup();
  const gate = deferred();
  const originalSet = storage.setItem;
  storage.setItem = async (key, value) => {
    if (key === '@aquapin_sync_queue_v2') await gate.promise;
    return originalSet(key, value);
  };
  let saved = false;
  let requested = false;
  load('db/syncEvents.ts').subscribeToSyncRequests(() => { requested = true; });
  const saving = load('hooks/useOfflineData.ts').useCreatePond()({ name: 'P', location: '', createdBy: 'user' })
    .then(() => { saved = true; });
  await flush();
  assert.equal(saved, false);
  assert.equal(requested, false);
  gate.resolve();
  await saving;
  assert.equal(saved, true);
  assert.equal(requested, true);
});

test('storage failures propagate instead of showing a successful save', async () => {
  const { load, storage } = setup();
  storage.setItem = async () => { throw new Error('Storage full'); };
  await assert.rejects(load('hooks/useOfflineData.ts').useCreatePond()({ name: 'P', location: '', createdBy: 'user' }), /Storage full/);
});

test('concurrent queue writes retain all transactions', async () => {
  const { load } = setup();
  const queue = load('db/syncQueue.ts');
  await Promise.all(Array.from({ length: 40 }, (_, i) => queue.enqueueSyncOperation({
    entity: 'stocking_logs', operation: 'create', localId: `stock-${i}`, payload: { quantity: i + 1 },
  })));
  assert.equal((await queue.loadSyncQueue()).length, 40);
});

test('an upload result preserves new transactions and newer revisions of the same record', async () => {
  const { load } = setup();
  const queue = load('db/syncQueue.ts');
  const original = await queue.enqueueSyncOperation({ entity: 'ponds', operation: 'create', localId: 'p1', payload: { count: 100 } });
  await queue.enqueueSyncOperation({ entity: 'ponds', operation: 'update', localId: 'p1', payload: { count: 90 } });
  await queue.enqueueSyncOperation({ entity: 'mortality_logs', operation: 'create', localId: 'm1', payload: { quantity: 10 } });
  await queue.commitSyncResult(original, { ...original, status: 'synced', remoteId: 'remote-pond' });
  const rows = await queue.loadSyncQueue();
  assert.equal(rows.length, 2);
  const pond = rows.find(row => row.localId === 'p1');
  assert.equal(pond.payload.count, 90);
  assert.equal(pond.status, 'queued');
  assert.equal(pond.remoteId, 'remote-pond');
  await queue.commitSyncResult(pond, { ...pond, status: 'synced' });
  assert.equal((await queue.loadSyncQueue()).find(row => row.localId === 'p1').status, 'synced');
});

test('a failed queue write releases the serialization lock', async () => {
  const { load, storage } = setup();
  const queue = load('db/syncQueue.ts');
  const originalSet = storage.setItem;
  storage.setItem = async () => { throw new Error('Disk failure'); };
  await assert.rejects(queue.enqueueSyncOperation({ entity: 'ponds', operation: 'create', localId: 'bad' }), /Disk failure/);
  storage.setItem = originalSet;
  await queue.enqueueSyncOperation({ entity: 'ponds', operation: 'create', localId: 'good' });
  assert.equal((await queue.loadSyncQueue())[0].localId, 'good');
});

test('native pond queries use the indexed pond_id filter', async () => {
  let query;
  const load = createLoader({
    './index': { database: { collections: { get: table => ({ query: filter => {
      query = { table, filter };
      return { fetch: async () => [{ id: 'stock' }] };
    } }) } } },
    '@nozbe/watermelondb': { Q: { where: (column, value) => ({ column, value }) } },
  });
  const rows = await load('db/queries.ts').fetchPondRecords('stocking_logs', 'pond-2');
  assert.equal(rows.length, 1);
  assert.equal(query.table, 'stocking_logs');
  assert.equal(query.filter.column, 'pond_id');
  assert.equal(query.filter.value, 'pond-2');
});

test('change notifications coalesce, follow up changes during reads, and stop after unsubscribe', async () => {
  const { load } = setup();
  const changes = load('db/changes.ts');
  const queries = load('db/queries.ts');
  let reads = 0;
  const gate = deferred();
  const stop = queries.watchLocalData(['ponds'], async () => { reads++; if (reads === 1) await gate.promise; });
  await nextTimer();
  for (let i = 0; i < 20; i++) changes.notifyLocalChange('ponds');
  assert.equal(reads, 1);
  gate.resolve();
  await nextTimer();
  await nextTimer();
  assert.equal(reads, 2);
  changes.notifyLocalChange('harvests');
  await nextTimer();
  assert.equal(reads, 2);
  stop();
  changes.notifyLocalChange('ponds');
  await nextTimer();
  assert.equal(reads, 2);
});

test('farm-wide recomputation reads each transaction a bounded number of times and batches native updates', async () => {
  let relationReads = 0;
  let batches = 0;
  const ponds = Array.from({ length: 100 }, (_, i) => ({ id: `p${i}`, currentStockCount: 0,
    prepareUpdate(fn) { fn(this); return this; },
  }));
  const stockings = Array.from({ length: 2000 }, (_, i) => ({
    get pondId() { relationReads++; return `p${i % 100}`; },
    species: 'Tilapia', quantity: 10, status: 'active', createdAt: i + 1,
  }));
  const tables = { ponds, stocking_logs: stockings, harvests: [], mortality_logs: [] };
  const native = { collections: { get: name => ({ query: () => ({ fetch: async () => tables[name] }) }) },
    write: fn => fn(), batch: async (...updates) => { batches++; assert.equal(updates.length, 100); },
  };
  const load = createLoader({
    './index': { database: native }, './syncQueue': {}, './queries': {},
  });
  await load('db/pondState.ts').recomputeAllPondStates();
  assert.equal(ponds[0].currentStockCount, 200);
  assert.equal(batches, 1);
  assert.ok(relationReads <= stockings.length * 2, `expected linear scanning, saw ${relationReads} relation reads`);
});

test('a slow cloud pull does not block a full harvest or overwrite its pending local changes', async () => {
  const storage = memoryStorage();
  const pulling = deferred();
  const cloud = deferred();
  const remotePond = { id: 'p1', name: 'Pond', created_by: 'user', created_at: new Date(1).toISOString(), is_active: true, current_species: 'Tilapia', current_stock_count: 100 };
  const remoteStock = { id: 's1', pond_id: 'p1', species: 'Tilapia', quantity: 100, status: 'active', stocked_by: 'user', created_at: new Date(2).toISOString() };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'user', email: 'test@example.com' } } }) },
    from(table) {
      const query = {
        select() { return this; }, eq() { return this; }, order() { return this; }, range() { return this; }, gt() { return this; },
        maybeSingle: async () => ({ data: { id: 'user', role: 'field_staff', status: 'approved' } }),
        async then(resolve, reject) {
          pulling.resolve();
          try {
            await cloud.promise;
            resolve({ data: table === 'ponds' ? [remotePond] : table === 'stocking_logs' ? [remoteStock] : [], error: null });
          } catch (error) { reject(error); }
        },
      };
      return query;
    },
  };
  const load = createLoader({
    '@react-native-async-storage/async-storage': storage,
    '@nozbe/watermelondb': { Q: {} },
    react: { useCallback: fn => fn, createContext: () => ({}) },
    '@react-navigation/native': {},
    'react-native': {}, '@react-native-community/netinfo': {},
    '../lib/supabase': { supabase, isSupabaseConfigured: () => true },
  });
  const db = load('db/index.ts').mockDatabase;
  await db.set('pond:p1', { id: 'p1', name: 'Pond', createdBy: 'user', createdAt: 1, isActive: true, currentSpecies: 'Tilapia', currentStockCount: 100 });
  await db.set('stocking:s1', { id: 's1', pondId: 'p1', species: 'Tilapia', quantity: 100, status: 'active', stockedBy: 'user', createdAt: 2 });
  await storage.setItem('@aquapin_sync:pond:p1', 'p1');
  await storage.setItem('@aquapin_sync:stocking:s1', 's1');
  const syncing = load('db/sync.ts').syncData();
  await pulling.promise;
  await load('hooks/useOfflineData.ts').useCreateHarvest()({ pondId: 'p1', yieldKg: 20, isPartial: false, harvestedBy: 'user' });
  assert.equal((await db.get('stocking:s1')).status, 'harvested');
  cloud.resolve();
  await syncing;
  assert.equal((await db.get('stocking:s1')).status, 'harvested', 'stale pull must not replace the queued update');
  assert.equal((await db.get('pond:p1')).currentStockCount, 0);
  assert.equal((await load('db/syncQueue.ts').getSyncQueueSnapshot()).pending, 4);
});


test('unchanged fallback writes avoid storage work and cache resets do not hide future writes', async () => {
  const { load, storage } = setup();
  const db = load('db/index.ts');
  let writes = 0;
  const originalSet = storage.setItem;
  storage.setItem = async (...args) => { writes++; return originalSet(...args); };
  await db.mockDatabase.set('pond:p1', { id: 'p1', name: 'Pond' });
  await db.mockDatabase.set('pond:p1', { id: 'p1', name: 'Pond' });
  assert.equal(writes, 1);
  await db.clearLocalDatabase();
  await db.mockDatabase.set('pond:p1', { id: 'p1', name: 'Pond' });
  assert.equal(writes, 2);
  assert.equal((await db.mockDatabase.get('pond:p1')).name, 'Pond');
});
