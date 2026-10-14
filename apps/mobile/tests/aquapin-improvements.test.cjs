const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLoader, memoryStorage } = require('./helpers/load-mobile.cjs');
function setup() {
  const storage = memoryStorage();
  const load = createLoader({
    '@react-native-async-storage/async-storage': storage,
    '@nozbe/watermelondb': { Q: { where: (column, value) => ({ column, value }) } },
    react: { useCallback: fn => fn, createContext: () => ({}) },
    '@react-navigation/native': {}, 'react-native': {}, '@react-native-community/netinfo': {},
    '../lib/supabase': { isSupabaseConfigured: () => true }, '../db/sync': {},
  });
  return { storage, load };
}
test('mapping validates distinct non-crossing polygons and GPS bounds', () => {
  const { validateMapping } = setup().load('lib/mapping.ts');
  const polygon = points => JSON.stringify(points.map(([latitude, longitude]) => ({ latitude, longitude })));
  validateMapping('0,0', polygon([[0,0],[0,1],[1,1],[1,0]]));
  assert.throws(() => validateMapping('91,0'));
  assert.throws(() => validateMapping('0,0', polygon([[0,0],[1,1],[0,1],[1,0]])));
  assert.throws(() => validateMapping('0,0', polygon([[0,0],[0,1],[0,1]])));
  assert.throws(() => validateMapping('0,0', polygon([[0,0],[1,1],[2,2]])));
});
test('editing an offline pond preserves ID and merges into its pending create', async () => {
  const { load } = setup();
  const hooks = load('hooks/useOfflineData.ts');
  const pond = await hooks.useCreatePond()({ name: 'Pond', location: '0,0', createdBy: 'owner' });
  const initial = (await load('db/syncQueue.ts').loadSyncQueue()).find(i => i.entity === 'ponds');
  await hooks.useUpdatePond()(pond.id, { name: 'Updated', location: '1,1' }, 'owner');
  const db = load('db/index.ts').mockDatabase;
  const rows = await db.getAll('pond:');
  assert.equal(rows.length, 1); assert.equal(rows[0].id, pond.id); assert.equal(rows[0].location, '1,1');
  const queued = (await load('db/syncQueue.ts').loadSyncQueue()).filter(i => i.entity === 'ponds');
  assert.equal(queued.length, 1); assert.equal(queued[0].operation, 'create');
  assert.equal(queued[0].remoteId, initial.remoteId);
  assert.equal(queued[0].payload.name, 'Updated');
  await assert.rejects(hooks.useUpdatePond()(pond.id, { name: 'Wrong owner' }, 'other'));
});
test('interrupted pond edits replay once without losing the sync operation or duplicating history', async () => {
  const { load, storage } = setup();
  const hooks = load('hooks/useOfflineData.ts');
  const pond = await hooks.useCreatePond()({ name: 'Pond', location: '0,0', createdBy: 'owner' });
  const write = storage.setItem;
  let fail = true;
  storage.setItem = async (key, value) => {
    if (fail && key === '@aquapin_sync_queue_v2') throw new Error('Disk full');
    return write(key, value);
  };
  await assert.rejects(hooks.useUpdatePond()(pond.id, { location: '1,1' }, 'owner'));
  assert.ok([...storage.data.keys()].some(k => k.startsWith('@aquapin_pond_edit:')));
  fail = false;
  await load('db/pondEdits.ts').recoverPondEdits('owner');
  await load('db/pondEdits.ts').recoverPondEdits('owner');
  const events = await load('db/index.ts').mockDatabase.getAll('history:');
  assert.equal(events.filter(e => e.eventType === 'location_updated').length, 1);
  assert.equal((await load('db/syncQueue.ts').loadSyncQueue()).find(i => i.entity === 'ponds').payload.location, '1,1');
  assert.ok(![...storage.data.keys()].some(k => k.startsWith('@aquapin_pond_edit:')));
});
test('updates after successful creation stay updates and retain server identity', async () => {
  const { load } = setup(); const queue = load('db/syncQueue.ts');
  const item = await queue.enqueueSyncOperation({ entity: 'ponds', operation: 'create', localId: 'p', payload: { name: 'P' } });
  await queue.markSyncItemStatus(item.id, 'synced', { remoteId: item.remoteId });
  const update = await queue.enqueueSyncOperation({ entity: 'ponds', operation: 'update', localId: 'p', payload: { name: 'Changed' } });
  assert.equal(update.operation, 'update'); assert.equal(update.remoteId, item.remoteId);
});
test('assistant snapshot excludes other accounts and includes actual offline records', async () => {
  const { load } = setup(); const db = load('db/index.ts').mockDatabase;
  await db.set('pond:p1', { id: 'p1', name: 'My pond', createdBy: 'one', createdAt: 100 });
  await db.set('pond:p2', { id: 'p2', name: 'Private pond', createdBy: 'two', createdAt: 50 });
  await db.set('stocking:s1', { id: 's1', pondId: 'p1', quantity: 123, createdAt: 200 });
  await db.set('stocking:s2', { id: 's2', pondId: 'p2', quantity: 999, createdAt: 200 });
  const snapshot = await load('lib/assistant.ts').assistantSnapshot('one');
  assert.equal(snapshot.ponds.totalAvailable, 1);
  assert.equal(snapshot.stocking_logs.records[0].quantity, 123);
  assert.ok(!JSON.stringify(snapshot).includes('Private pond'));
});
test('conversations restore dates and retain separate sessions and account keys', () => {
  const { readConversations, conversationKey } = setup().load('lib/assistant.ts');
  const chats = readConversations(JSON.stringify([{ id: 'a', title: 'Stocking', messages: [{ role: 'user', content: 'How many?', timestamp: '2026-10-04T00:00:00Z' }] }, { id: 'b', title: 'Mapping', messages: [] }]));
  assert.equal(chats.length, 2); assert.equal(chats[0].messages[0].timestamp.getUTCFullYear(), 2026);
  assert.equal(chats[1].messages.length, 0); assert.notEqual(conversationKey('a'), conversationKey('b'));
});

test('sync receipts are idempotent and never recursively log history uploads', async () => {
  const { load } = setup(); const receipts = load('db/syncActivities.ts');
  const item = { id: 'q1', updatedAt: 10, entity: 'ponds', operation: 'update', localId: 'p1', payload: {} };
  await receipts.recordSyncActivity(item, 'owner');
  await receipts.recordSyncActivity(item, 'owner');
  await receipts.recordSyncActivity({ ...item, entity: 'pond_history' }, 'owner');
  const events = await load('db/index.ts').mockDatabase.getAll('history:');
  assert.equal(events.length, 1); assert.equal(events[0].eventType, 'synchronized');
  assert.equal((await load('db/syncQueue.ts').loadSyncQueue()).length, 1);
});
test('Markdown renders emphasis, headings, lists, code and a horizontally scrollable native table', () => {
  const react = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) };
  const load = createLoader({ react, 'react-native': { ScrollView: 'ScrollView', View: 'View', Text: 'Text', StyleSheet: { create: x => x } } });
  const Markdown = load('components/ChatMarkdown.tsx').default;
  const tree = Markdown({ content: '# Stocking\n**Bold** and *italic*\n- Tilapia\n1. Count\n`stock`\n| Pond | Quantity |\n| --- | ---: |\n| A | 25 |\n```\nvalue\n```' });
  const serialized = JSON.stringify(tree);
  assert.ok(serialized.includes('"accessibilityRole":"header"'));
  assert.ok(serialized.includes('"horizontal":true'));
  assert.ok(serialized.includes('"fontWeight":"700"'));
  assert.ok(serialized.includes('"fontStyle":"italic"'));
  assert.ok(!serialized.includes('**Bold**'));
  assert.ok(serialized.includes('25'));
});
test('stalled native transport times out even if it ignores abort', async () => {
  let timeout; let cleared = false;
  const load = createLoader({}, { AbortController, fetch: () => new Promise(() => {}), setTimeout: fn => { timeout = fn; return 1; }, clearTimeout: () => { cleared = true; } });
  const pending = load('lib/network.ts').fetchWithTimeout('https://local');
  timeout();
  await assert.rejects(pending, /timed out/); assert.equal(cleared, true);
});
test('queue seeding retains an existing UUID instead of allocating a duplicate server identity', async () => {
  const { load } = setup(); const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const item = await load('db/syncQueue.ts').enqueueSyncOperation({ entity: 'ponds', operation: 'create', localId: id, payload: { id } });
  assert.equal(item.remoteId, id);
});
