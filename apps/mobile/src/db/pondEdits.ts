import AsyncStorage from '@react-native-async-storage/async-storage';
import { database, mockDatabase } from './index';
import { enqueueSyncOperation } from './syncQueue';
import { withLocalMutation } from './localMutation';

const PREFIX = '@aquapin_pond_edit:';
type Edit = { pondId: string; userId: string; payload: Record<string, any>; changes: Record<string, any>; event: { id: string; pondId: string; eventType: string; eventData: string; recordedBy: string; createdAt: number } };
// A write-ahead journal makes a storage failure between the pond, history and
// queue writes recoverable. Replaying uses the same history and pond IDs.
async function apply(edit: Edit, key: string) {
  if (database) {
    await database.write(async () => {
      const pond = await database.collections.get('ponds').find(edit.pondId);
      if (pond.createdBy !== edit.userId) throw new Error('Pond owner changed');
      await pond.update((record: any) => Object.assign(record, edit.changes));
      const collection = database.collections.get('pond_history');
      let existing: any;
      try { existing = await collection.find(edit.event.id); } catch {}
      if (!existing) await collection.create((record: any) => { record._raw.id = edit.event.id; const { id, ...fields } = edit.event; Object.assign(record, fields); });
    });
  } else {
    const pond = await mockDatabase.get(`pond:${edit.pondId}`);
    if (!pond || pond.createdBy !== edit.userId) throw new Error('Pond unavailable');
    await mockDatabase.set(`pond:${edit.pondId}`, edit.payload);
    await mockDatabase.set(`history:${edit.event.id}`, edit.event);
  }
  await enqueueSyncOperation({ entity: 'ponds', operation: 'update', localId: edit.pondId, payload: edit.payload });
  await enqueueSyncOperation({ entity: 'pond_history', operation: 'create', localId: edit.event.id, payload: edit.event, dependsOn: [{ entity: 'ponds', localId: edit.pondId }] });
  await AsyncStorage.removeItem(key);
}
export async function persistPondEdit(pondId: string, userId: string, payload: Record<string, any>, changes: Record<string, any>, eventType: string) {
  const key = `${PREFIX}${userId}:${pondId}`;
  const event = { id: `edit-${Date.now()}-${Math.random().toString(36).slice(2)}`, pondId, eventType, eventData: JSON.stringify({ name: payload.name }), recordedBy: userId, createdAt: Date.now() };
  const edit: Edit = { pondId, userId, payload, changes, event };
  await AsyncStorage.setItem(key, JSON.stringify(edit));
  await apply(edit, key);
}
// Caller already owns the local mutation lock when recovering one pond.
export async function recoverPondEdit(pondId: string, userId: string) {
  const key = `${PREFIX}${userId}:${pondId}`;
  const raw = await AsyncStorage.getItem(key);
  if (raw) await apply(JSON.parse(raw), key);
}
export async function recoverPondEdits(userId: string) {
  return withLocalMutation(async () => {
    const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(`${PREFIX}${userId}:`));
    for (const key of keys) {
      const raw = await AsyncStorage.getItem(key);
      if (raw) await apply(JSON.parse(raw), key);
    }
  });
}
