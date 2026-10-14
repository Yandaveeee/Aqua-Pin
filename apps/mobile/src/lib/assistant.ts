import { database, mockDatabase } from '../db';
import { getSyncQueueSnapshot } from '../db/syncQueue';

export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; timestamp: Date; isError?: boolean };
export type Conversation = { id: string; title: string; messages: ChatMessage[] };
export const conversationKey = (userId: string) => `@aquapin_ai_conversations:${userId}`;
export function readConversations(raw: string | null): Conversation[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Invalid conversation history');
  return parsed.filter(c => typeof c.id === 'string' && typeof c.title === 'string' && Array.isArray(c.messages)).map(c => ({
    ...c, messages: c.messages.filter((m: any) => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })),
  }));
}
export const newConversation = (welcome: ChatMessage): Conversation => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title: 'New Chat', messages: [{ ...welcome, timestamp: new Date() }] });

// Read a fresh, account-scoped local snapshot, including records waiting for sync.
// Explicit fields avoid serializing WatermelonDB internals or unrelated account data.
export async function assistantSnapshot(userId: string) {
  const fields: Record<string, string[]> = {
    ponds: ['id', 'name', 'location', 'boundary', 'isActive', 'currentSpecies', 'currentStockCount', 'createdAt'],
    stocking_logs: ['id', 'pondId', 'species', 'quantity', 'createdAt', 'status'],
    mortality_logs: ['id', 'pondId', 'quantity', 'notes', 'createdAt'],
    harvests: ['id', 'pondId', 'yieldKg', 'fishCount', 'species', 'createdAt', 'isPartial'],
    pond_history: ['id', 'pondId', 'eventType', 'eventData', 'createdAt'],
  };
  const tables = Object.keys(fields);
  const rows = await Promise.all(tables.map(table => database
    ? database.collections.get(table).query().fetch()
    : (mockDatabase.collections as any)[table].query().fetch()));
  const owned = rows[0].filter((p: any) => p.createdBy === userId).sort((a: any, b: any) => Number(a.createdAt) - Number(b.createdAt) || String(a.id).localeCompare(String(b.id)));
  const ids = new Set(owned.map((p: any) => p.id));
  const result: Record<string, any> = { source: 'Local AquaPin records; may include pending offline changes. Pond order is creation date, oldest first.', capturedAt: new Date().toISOString() };
  tables.forEach((table, index) => {
    const available = index === 0 ? owned : rows[index].filter((r: any) => ids.has(r.pondId)).sort((a: any, b: any) => Number(b.createdAt) - Number(a.createdAt));
    result[table] = { totalAvailable: available.length, truncated: available.length > 100, records: available.slice(0, 100).map((row: any) => Object.fromEntries(fields[table].map(field => [field, row[field] ?? null]))) };
  });
  const queue = await getSyncQueueSnapshot();
  result.sync = { pending: queue.pending, failed: queue.failed, blocked: queue.blocked };
  return result;
}

