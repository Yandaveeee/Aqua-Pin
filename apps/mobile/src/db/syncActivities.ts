import AsyncStorage from '@react-native-async-storage/async-storage';
import { database, mockDatabase } from './index';
import { enqueueSyncOperation, SyncQueueItem } from './syncQueue';
import { withLocalMutation } from './localMutation';

// A receipt uses the uploaded queue revision as its identity. Uploading history
// never creates another receipt, so background sync cannot form an activity loop.
export async function recordSyncActivity(item: SyncQueueItem, userId: string) {
  if (item.entity === 'pond_history' || item.operation === 'delete') return;
  const pondId = item.entity === 'ponds' ? item.localId : item.payload.pondId;
  if (!pondId) return;
  const id = `receipt-${item.id}-${item.updatedAt}`;
  await withLocalMutation(async () => {
    if (await AsyncStorage.getItem(`@aquapin_sync:history:${id}`)) return;
    let event = { id, pondId, eventType: 'synchronized', eventData: JSON.stringify({ entity: item.entity, recordId: item.localId }), recordedBy: userId, createdAt: Date.now() };
    if (database) {
      const collection = database.collections.get('pond_history');
      let existing: any;
      try { existing = await collection.find(id); } catch {}
      if (existing) event = { ...event, createdAt: Number(existing.createdAt) };
      else await database.write(() => collection.create((record: any) => { record._raw.id = id; const { id: ignored, ...fields } = event; Object.assign(record, fields); }));
    } else {
      const existing = await mockDatabase.get(`history:${id}`);
      if (existing) event = existing;
      else await mockDatabase.set(`history:${id}`, event);
    }
    await enqueueSyncOperation({ entity: 'pond_history', operation: 'create', localId: id, payload: event, dependsOn: [{ entity: 'ponds', localId: pondId }] });
  });
}
