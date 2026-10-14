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
      useNavigation: () => ({ navigate: () => {} }),
    },
    'react-native': {},
    '@react-native-community/netinfo': { fetch: async () => ({ isConnected: true }) },
    '../lib/supabase': { isSupabaseConfigured: () => false },
  });
  return { storage, load };
}

test('harvest transactions save selling price, total revenue, and sold status', async () => {
  const { load } = setup();
  const hooks = load('hooks/useOfflineData.ts');
  const db = load('db/index.ts').mockDatabase;

  const pond = await hooks.useCreatePond()({ name: 'North Pond', location: '14.5,121.0', createdBy: 'user' });

  // 1. Create a sold harvest (50 kg @ ₱180/kg = ₱9,000)
  const soldHarvest = await hooks.useCreateHarvest()({
    pondId: pond.id,
    yieldKg: 50,
    harvestedBy: 'user',
    isPartial: true,
    pricePerKg: 180,
    totalRevenue: 9000,
    isSold: true,
  });

  const storedSold = await db.get(`harvest:${soldHarvest.id}`);
  assert.equal(storedSold.yieldKg, 50);
  assert.equal(storedSold.pricePerKg, 180);
  assert.equal(storedSold.totalRevenue, 9000);
  assert.equal(storedSold.isSold, true);

  // 2. Create an unsold harvest (30 kg not sold)
  const unsoldHarvest = await hooks.useCreateHarvest()({
    pondId: pond.id,
    yieldKg: 30,
    harvestedBy: 'user',
    isPartial: false,
    pricePerKg: 0,
    totalRevenue: 0,
    isSold: false,
  });

  const storedUnsold = await db.get(`harvest:${unsoldHarvest.id}`);
  assert.equal(storedUnsold.yieldKg, 30);
  assert.equal(storedUnsold.isSold, false);
  assert.equal(storedUnsold.totalRevenue, 0);

  // 3. Test calculation logic: only sold harvests contribute to revenue total
  const allHarvests = await db.getAll('harvest:');
  const totalRevenue = allHarvests.reduce((sum, h) => {
    const isSold = h.isSold ?? h.is_sold;
    if (isSold === false) return sum;
    const rev = Number(h.totalRevenue ?? h.total_revenue ?? 0);
    if (rev > 0) return sum + rev;
    const price = Number(h.pricePerKg ?? h.price_per_kg ?? 0);
    const kg = Number(h.yieldKg ?? h.yield_kg ?? 0);
    if (price > 0 && kg > 0) return sum + (price * kg);
    return sum;
  }, 0);

  assert.equal(totalRevenue, 9000, 'Unsold harvests must not be included in revenue total');
});
