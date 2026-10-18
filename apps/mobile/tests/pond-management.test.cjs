const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLoader, memoryStorage } = require('./helpers/load-mobile.cjs');

function setup() {
  const storage = memoryStorage();
  const load = createLoader({
    '@react-native-async-storage/async-storage': storage,
    '@nozbe/watermelondb': { Q: { where: (column, value) => ({ column, value }) } },
    react: {
      useCallback: (fn) => fn,
      createContext: () => ({}),
      useState: (initial) => [initial, () => {}],
      useEffect: () => {},
      useMemo: (fn) => fn(),
      useRef: (val) => ({ current: val }),
    },
    '@react-navigation/native': {
      useFocusEffect: (fn) => fn(),
      useNavigation: () => ({ navigate: () => {}, goBack: () => {}, canGoBack: () => true }),
      useRoute: () => ({ params: {} }),
    },
    'react-native': {},
    '@react-native-community/netinfo': { fetch: async () => ({ isConnected: true }) },
    '../lib/supabase': { isSupabaseConfigured: () => false },
  });
  return { storage, load };
}

test('pond management preserves registered pond operations and automatically activates when stocked', async () => {
  const { load } = setup();
  const hooks = load('hooks/useOfflineData.ts');
  const db = load('db/index.ts').mockDatabase;

  // Create a new registered pond (starts unstocked, inactive)
  const pond = await hooks.useCreatePond()({
    name: 'Tilapia Pond 1',
    location: '14.5995,120.9842',
    createdBy: 'user-123',
  });

  assert.ok(pond.id);
  assert.equal(pond.name, 'Tilapia Pond 1');
  assert.equal(pond.isActive, false);

  // Update pond name
  const updatePond = hooks.useUpdatePond();
  await updatePond(pond.id, { name: 'Tilapia Nursery A' }, 'user-123');

  const updated = await db.get(`pond:${pond.id}`);
  assert.equal(updated.name, 'Tilapia Nursery A');

  // Stock the pond with fish -> must automatically become active
  const createStocking = hooks.useCreateStockingLog();
  await createStocking({
    pondId: pond.id,
    species: 'Tilapia',
    quantity: 1200,
    stockedBy: 'user-123',
  });

  const stockedPond = await db.get(`pond:${pond.id}`);
  assert.equal(stockedPond.isActive, true);
  assert.equal(stockedPond.currentStockCount, 1200);
  assert.equal(stockedPond.currentSpecies, 'Tilapia');
});
