import AsyncStorage from '@react-native-async-storage/async-storage';
import { notifyLocalChange } from './changes';

const TABLE_BY_PREFIX: Record<string, string> = {
  pond: 'ponds', mortality: 'mortality_logs', harvest: 'harvests',
  stocking: 'stocking_logs', history: 'pond_history',
};

// Mock WatermelonDB for Expo Go compatibility
// In production, you should use a custom development build with WatermelonDB native modules

const MOCK_DB_ENABLED = true;
export const LOCAL_DB_STORAGE_PREFIX = '@aquapin_db:';

// Try to import WatermelonDB, fall back to mock if it fails
let database: any = null;
let WatermelonDB: any = null;

try {
  // Dynamic import to prevent crash on module load
  const WatermelonDBModule = require('@nozbe/watermelondb');
  const SQLiteAdapterModule = require('@nozbe/watermelondb/adapters/sqlite');
  
  const { Database } = WatermelonDBModule;
  const SQLiteAdapter = SQLiteAdapterModule.default || SQLiteAdapterModule;
  
  const { schema } = require('./schema');
  const { migrations } = require('./migrations');
  const { Pond, MortalityLog, Harvest, StockingLog, PondHistory } = require('./models');

  const adapter = new SQLiteAdapter({
    schema,
    migrations,
    jsi: false, // Disable JSI for better compatibility
    onSetUpError: (error: any) => {
      console.error("Database setup failed, using mock", error);
    }
  });

  database = new Database({
    adapter,
    modelClasses: [Pond, MortalityLog, Harvest, StockingLog, PondHistory],
  });
  
  WatermelonDB = { Database, SQLiteAdapter };
  console.log('WatermelonDB initialized successfully with models:', 
    ['Pond', 'MortalityLog', 'Harvest', 'StockingLog', 'PondHistory']);
} catch (error) {
  console.warn('WatermelonDB not available, using AsyncStorage fallback:', error);
}

// AsyncStorage-based mock database
class MockDatabase {
  private prefix = LOCAL_DB_STORAGE_PREFIX;
  private persistedValues = new Map<string, string>();

  clearCache() {
    this.persistedValues.clear();
  }

  async get(key: string): Promise<any> {
    try {
      const value = await AsyncStorage.getItem(this.prefix + key);
      return value ? JSON.parse(value) : null;
    } catch (e) {
      console.error('MockDB get error:', e);
      return null;
    }
  }

  async set(key: string, value: any): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (this.persistedValues.get(key) === serialized) return;
      await AsyncStorage.setItem(this.prefix + key, serialized);
      this.persistedValues.delete(key);
      this.persistedValues.set(key, serialized);
      if (this.persistedValues.size > 1000) {
        this.persistedValues.delete(this.persistedValues.keys().next().value!);
      }
      notifyLocalChange(TABLE_BY_PREFIX[key.split(':')[0]] || '*');
    } catch (e) {
      console.error('MockDB set error:', e);
      throw e;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.prefix + key);
      this.persistedValues.delete(key);
      notifyLocalChange(TABLE_BY_PREFIX[key.split(':')[0]] || '*');
    } catch (e) {
      console.error('MockDB remove error:', e);
      throw e;
    }
  }

  async getAll(prefix: string): Promise<any[]> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const matchingKeys = keys.filter(k => k.startsWith(this.prefix + prefix));
      const values = await AsyncStorage.multiGet(matchingKeys);
      return values.map(([_, value]) => value ? JSON.parse(value) : null).filter(Boolean);
    } catch (e) {
      console.error('MockDB getAll error:', e);
      return [];
    }
  }

  // Mock collections
  get collections() {
    return {
      ponds: {
        query: () => ({
          fetch: async () => this.getAll('pond:'),
          observe: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
        }),
        create: async (fn: any) => {
          const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
          const pond: any = { 
            id, 
            name: '', 
            location: '', 
            boundary: undefined,
            createdBy: '',
            createdAt: Date.now(),
            isActive: false,
            currentSpecies: undefined,
            currentStockCount: undefined,
          };
          fn(pond);
          await this.set(`pond:${id}`, pond);
          return pond;
        },
        find: async (id: string) => {
          return await this.get(`pond:${id}`);
        },
      },
      mortality_logs: {
        query: () => ({
          fetch: async () => this.getAll('mortality:'),
        }),
        create: async (fn: any) => {
          const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
          const log: any = { 
            id, 
            pondId: '', 
            quantity: 0, 
            notes: undefined,
            loggedBy: '',
            createdAt: Date.now() 
          };
          fn(log);
          await this.set(`mortality:${id}`, log);
          return log;
        },
      },
      harvests: {
        query: () => ({
          fetch: async () => this.getAll('harvest:'),
        }),
        create: async (fn: any) => {
          const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
          const harvest: any = { 
            id, 
            pondId: '', 
            yieldKg: 0, 
            harvestedBy: '',
            createdAt: Date.now(),
            species: undefined,
            isPartial: false,
            fishCount: undefined,
            pricePerKg: undefined,
            totalRevenue: undefined,
            isSold: true,
          };
          fn(harvest);
          await this.set(`harvest:${id}`, harvest);
          return harvest;
        },
      },
      stocking_logs: {
        query: () => ({
          fetch: async () => this.getAll('stocking:'),
        }),
        create: async (fn: any) => {
          const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
          const stocking: any = { 
            id, 
            pondId: '', 
            species: '', 
            quantity: 0,
            averageWeightG: undefined,
            source: undefined,
            stockedBy: '',
            createdAt: Date.now(),
            status: 'active',
          };
          fn(stocking);
          await this.set(`stocking:${id}`, stocking);
          return stocking;
        },
      },
      pond_history: {
        query: () => ({
          fetch: async () => this.getAll('history:'),
        }),
        create: async (fn: any) => {
          const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
          const history: any = { 
            id, 
            pondId: '', 
            eventType: '', 
            eventData: '',
            createdAt: Date.now(),
            recordedBy: '',
          };
          fn(history);
          await this.set(`history:${id}`, history);
          return history;
        },
      },
    };
  }

  // Mock actions
  async write<T>(fn: () => Promise<T>): Promise<T> {
    return await fn();
  }

  async batch(...operations: any[]): Promise<void> {
    // Mock batch operations
    console.log('Mock batch:', operations);
  }
}

export async function clearLocalDatabase(): Promise<void> {
  mockDatabase.clearCache();
  if (database && typeof (database as any).unsafeResetDatabase === 'function') {
    await (database as any).write(async () => {
      await (database as any).unsafeResetDatabase();
    });
  }

  const keys = await AsyncStorage.getAllKeys();
  const appKeys = keys.filter((key) => key.startsWith(LOCAL_DB_STORAGE_PREFIX) || key.startsWith('@aquapin_pond_edit:'));
  if (appKeys.length > 0) {
    await AsyncStorage.multiRemove(appKeys);
  }
  notifyLocalChange('*');
}

// Export either real database or mock
export const mockDatabase = new MockDatabase();
export { database };

// Default export for compatibility
export default database || mockDatabase;
