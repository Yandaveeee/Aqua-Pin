import React, { useEffect, useRef, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../hooks/useOfflineData';
const labels: Record<string, string> = { pond_created: 'Pond added', pond_updated: 'Pond information updated', pond_archived: 'Pond archived', location_marked: 'Pond location marked', location_updated: 'Pond location updated', boundary_created: 'Polygon created', boundary_updated: 'Pond boundary updated', stocking: 'Stocking added', mortality: 'Mortality added', harvest: 'Harvest added', synchronized: 'Record synchronized' };
export default function PondActivities({ pondId, name, history }: { pondId: string; name: string; history: any[] }) {
  const { user } = useAuth();
  const { queueSnapshot } = useSync();
  const [cutoff, setCutoff] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [clearing, setClearing] = useState(false);
  const lock = useRef(false);
  const key = `@aquapin_activity_hidden:${user?.id}:${pondId}`;
  useEffect(() => {
    let active = true; setCutoff(null); setShowAll(false);
    AsyncStorage.getItem(key).then(raw => { if (active) setCutoff(Number(raw) || 0); }).catch(() => { if (active) { setCutoff(0); Alert.alert('Activities', 'Unable to restore activity display settings.'); } });
    return () => { active = false; };
  }, [key]);
  const visible = cutoff === null ? [] : history.filter(e => Number(e.createdAt) > cutoff);
  const clear = () => Alert.alert('Clear Activities', 'Are you sure you want to clear these activities? This only hides activity history on this device. Pond records are kept.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Clear', style: 'destructive', onPress: async () => {
      if (lock.current) return;
      lock.current = true; setClearing(true);
      const next = Math.max(...history.map(e => Number(e.createdAt)), 0);
      try { await AsyncStorage.setItem(key, String(next)); setCutoff(next); }
      catch { Alert.alert('Unable to clear', 'Please try again. Your records are safe.'); }
      finally { lock.current = false; setClearing(false); }
    } },
  ]);
  return <View style={{ gap: 12 }}>
    <Text style={{ fontSize: 18, fontWeight: '700' }}>Recent Activities</Text>
    {visible.slice(0, showAll ? undefined : 5).map(event => {
      const queued = queueSnapshot.items.find(item => item.entity === 'pond_history' && item.localId === event.id);
      let details: any = {}; try { details = typeof event.eventData === 'string' ? JSON.parse(event.eventData) : event.eventData || {}; } catch {}
      return <View key={event.id} style={{ borderLeftWidth: 3, borderColor: '#007bff', paddingLeft: 12, paddingVertical: 6 }}>
        <Text style={{ fontWeight: '700' }}>{labels[event.eventType] || event.eventType.replace(/_/g, ' ')}</Text>
        <Text>{name}{details.quantity != null ? ` · ${details.quantity} fish` : ''}{details.yieldKg != null ? ` · ${details.yieldKg} kg` : ''}</Text>
        <Text>{new Date(Number(event.createdAt)).toLocaleString()} · {event.recordedBy === user?.id ? 'You' : event.recordedBy || 'Unknown user'}</Text>
        <Text>{queued && queued.status !== 'synced' ? queued.status === 'failed' || queued.status === 'blocked' || queued.status === 'conflict' ? 'Sync needs attention' : 'Pending Sync' : queued?.status === 'synced' ? 'Synced' : 'Recorded'}</Text>
      </View>;
    })}
    {cutoff !== null && !visible.length && <Text>No recent activities to display.</Text>}
    {visible.length > 5 && <TouchableOpacity style={{ padding: 12 }} onPress={() => setShowAll(!showAll)}><Text>{showAll ? 'Show Less' : 'See All Activities'}</Text></TouchableOpacity>}
    {!!visible.length && <TouchableOpacity disabled={clearing} onPress={clear} style={{ padding: 12 }}><Text>{clearing ? 'Clearing...' : 'Clear Activities'}</Text></TouchableOpacity>}
  </View>;
}
