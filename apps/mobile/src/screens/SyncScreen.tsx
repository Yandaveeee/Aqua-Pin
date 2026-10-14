import { useLanguage } from '../contexts/LanguageContext';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSync } from '../hooks/useOfflineData';
import { SyncQueueItem } from '../db/syncQueue';

function formatTime(date: Date | null) {
  if (!date) return 'Never';
  return date.toLocaleString();
}

function entityLabel(entity: string): string {
  switch (entity) {
    case 'ponds':
      return 'Pond';
    case 'mortality_logs':
      return 'Mortality';
    case 'harvests':
      return 'Harvest';
    case 'stocking_logs':
      return 'Stocking';
    case 'pond_history':
      return 'History';
    default:
      return entity;
  }
}

export default function SyncScreen() {
  const { t } = useLanguage();
  const {
    isSyncing,
    lastSync,
    isOnline,
    isInternetReachable,
    isWifi,
    queueSnapshot,
    syncSettings,
    syncMessage,
    preflightBlockers,
    performSync,
    retrySyncItem,
    retryAllFailed,
  } = useSync();
  const [autoSyncNotice, setAutoSyncNotice] = useState<string | null>(null);
  const previousLastSyncRef = useRef<number>(lastSync?.getTime() || 0);
  const manualSyncRef = useRef(false);

  const waitingTotal = queueSnapshot.queued + queueSnapshot.syncing;

  const failedItems = useMemo(() => {
    return queueSnapshot.items.filter((item) => {
      return item.status === 'failed' || item.status === 'blocked' || item.status === 'conflict';
    });
  }, [queueSnapshot.items]);

  const canSyncNow = useMemo(() => {
    if (!isOnline || !isInternetReachable) return false;
    if (syncSettings.wifiOnly && !isWifi) return false;
    return true;
  }, [isInternetReachable, isOnline, isWifi, syncSettings.wifiOnly]);

  const handleSync = useCallback(async () => {
    if (manualSyncRef.current || isSyncing) return;
    manualSyncRef.current = true;
    try {
      const result = await performSync(true);
      Alert.alert(result.success ? 'Synced' : 'Sync Failed', result.message);
    } finally {
      manualSyncRef.current = false;
    }
  }, [performSync, isSyncing]);

  const copyError = useCallback(async (item: SyncQueueItem) => {
    const text = [
      `Entity: ${entityLabel(item.entity)}`,
      `Operation: ${item.operation}`,
      `Local ID: ${item.localId}`,
      `Status: ${item.status}`,
      `Attempts: ${item.attempts}`,
      `Error: ${item.lastError || 'No error message'}`,
    ].join('\n');

    try {
      const dynamicRequire = (globalThis as any).require || ((0, eval)('require') as any);
      const Clipboard = dynamicRequire('expo-clipboard');
      if (Clipboard?.setStringAsync) {
        await Clipboard.setStringAsync(text);
        Alert.alert('Copied', 'Error details copied to clipboard.');
        return;
      }
    } catch (_error) {
      // Clipboard module optional
    }

    await Share.share({
      title: 'Sync Error Details',
      message: text,
    });
  }, []);

  const handleRetryAll = useCallback(async () => {
    if (manualSyncRef.current || isSyncing) return;
    manualSyncRef.current = true;
    try {
      await retryAllFailed();
      const result = await performSync(false);
      Alert.alert(result.success ? 'Synced' : 'Retry Result', result.message);
    } catch { Alert.alert('Unable to retry', 'Please check your connection and try again.'); }
    finally { manualSyncRef.current = false; }
  }, [performSync, retryAllFailed, isSyncing]);

  useEffect(() => {
    const currentLastSync = lastSync?.getTime() || 0;
    if (currentLastSync > previousLastSyncRef.current) {
      previousLastSyncRef.current = currentLastSync;

      if (!manualSyncRef.current && syncSettings.autoSync) {
        setAutoSyncNotice(`Automatic sync completed at ${new Date(currentLastSync).toLocaleTimeString()}.`);
      }
    }
  }, [lastSync, syncSettings.autoSync]);

  useEffect(() => {
    if (!autoSyncNotice) return;
    const timer = setTimeout(() => setAutoSyncNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [autoSyncNotice]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Synchronization</Text>
        <Text style={styles.subtitle}>Status, queue, and automatic cloud sync</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.statusCard, isOnline ? styles.onlineCard : styles.offlineCard]}>
          <View style={styles.statusRow}>
            <Ionicons
              name={isOnline ? 'cloud-done-outline' : 'cloud-offline-outline'}
              size={18}
              color={isOnline ? '#0a6847' : '#7a1f1f'}
            />
            <Text style={[styles.statusText, isOnline ? styles.onlineText : styles.offlineText]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
            <View style={[styles.badge, isWifi ? styles.wifiOn : styles.wifiOff]}>
              <Text style={styles.badgeText}>{isWifi ? 'Wi-Fi' : 'Cellular'}</Text>
            </View>
          </View>
          <Text style={styles.statusDescription}>
            {isOnline
              ? syncSettings.wifiOnly && !isWifi
                ? 'Connected, but sync is limited to Wi-Fi by policy.'
                : syncSettings.autoSync
                  ? 'Connected and reachable. Auto-sync is active.'
                  : 'Connected and reachable. Sync can run now.'
              : 'Offline or internet unreachable. Queue continues locally.'}
          </Text>
          <Text style={styles.statusMeta}>Last sync: {formatTime(lastSync)}</Text>
        </View>

        {(isSyncing || autoSyncNotice) && (
          <View style={[styles.activityCard, isSyncing ? styles.activityCardActive : styles.activityCardDone]}>
            <Ionicons
              name={isSyncing ? 'sync-outline' : 'checkmark-circle-outline'}
              size={18}
              color={isSyncing ? '#1d4ed8' : '#0f766e'}
            />
            <View style={styles.activityCopy}>
              <Text style={[styles.activityTitle, isSyncing ? styles.activityTitleActive : styles.activityTitleDone]}>
                {isSyncing ? 'Synchronizing' : 'Automatic Sync'}
              </Text>
              <Text style={styles.activityText}>
                {isSyncing ? syncMessage || 'Syncing data now...' : autoSyncNotice}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Queue Snapshot</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{waitingTotal}</Text>
              <Text style={styles.statLabel}>Queued</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{queueSnapshot.failed + queueSnapshot.blocked}</Text>
              <Text style={styles.statLabel}>Failed/Blocked</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{queueSnapshot.conflict}</Text>
              <Text style={styles.statLabel}>Conflicts</Text>
            </View>
          </View>

          <View style={styles.entityBreakdown}>
            <View style={styles.entityPill}>
              <Text style={styles.entityPillText}>Ponds {queueSnapshot.waitingByEntity.ponds}</Text>
            </View>
            <View style={styles.entityPill}>
              <Text style={styles.entityPillText}>Stocking {queueSnapshot.waitingByEntity.stocking_logs}</Text>
            </View>
            <View style={styles.entityPill}>
              <Text style={styles.entityPillText}>Mortality {queueSnapshot.waitingByEntity.mortality_logs}</Text>
            </View>
            <View style={styles.entityPill}>
              <Text style={styles.entityPillText}>Harvest {queueSnapshot.waitingByEntity.harvests}</Text>
            </View>
            <View style={styles.entityPill}>
              <Text style={styles.entityPillText}>History {queueSnapshot.waitingByEntity.pond_history}</Text>
            </View>
          </View>
        </View>

        {preflightBlockers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Preflight Blockers</Text>
            <View style={styles.blockerCard}>
              {preflightBlockers.map((blocker, index) => (
                <Text key={`${index}-${blocker}`} style={styles.blockerText}>
                  • {blocker}
                </Text>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.errorHeaderRow}>
            <Text style={styles.sectionTitle}>Failed / Blocked Items</Text>
            <TouchableOpacity style={styles.retryAllButton} onPress={handleRetryAll}>
              <Text style={styles.retryAllText}>Retry All</Text>
            </TouchableOpacity>
          </View>

          {failedItems.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No failed queue items.</Text>
              <Text style={styles.emptySub}>All queued operations are healthy right now.</Text>
            </View>
          ) : (
            failedItems.map((item) => (
              <View key={item.id} style={styles.errorCard}>
                <View style={styles.errorCardTop}>
                  <Text style={styles.errorEntity}>{entityLabel(item.entity)}</Text>
                  <Text style={[styles.errorStatus, item.status === 'conflict' ? styles.errorStatusConflict : styles.errorStatusDefault]}>
                    {item.status.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.errorMeta}>Operation: {item.operation}</Text>
                <Text style={styles.errorMeta}>Attempts: {item.attempts}</Text>
                <Text style={styles.errorMessage}>This record could not synchronize. Check your connection and retry. Use Share Details when contacting support.</Text>
                <View style={styles.errorActions}>
                  <TouchableOpacity
                    style={styles.errorActionBtn}
                    onPress={() => {
                      if (isSyncing) return;
                      void retrySyncItem(item.id).catch(() => Alert.alert('Unable to retry', 'Please try again.'));
                    }}
                  >
                    <Text style={styles.errorActionText}>Retry</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.errorActionBtn}
                    onPress={() => {
                      void copyError(item);
                    }}
                  >
                    <Text style={styles.errorActionText}>Copy Error</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <TouchableOpacity
          style={[styles.syncButton, (!canSyncNow || isSyncing) && styles.syncButtonDisabled]}
          onPress={handleSync}
          disabled={!canSyncNow || isSyncing}
        >
          {isSyncing ? (
            <>
              <ActivityIndicator color="#fff" style={styles.syncIcon} />
              <Text style={styles.syncButtonText}>{t('Syncing...')}</Text>
            </>
          ) : (
            <>
              <Ionicons name="sync-outline" size={20} color="#fff" style={styles.syncIcon} />
              <Text style={styles.syncButtonText}>{canSyncNow ? t('Sync Now') : 'Waiting for network policy'}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6f8',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#f4f6f8',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#4b5563',
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 10,
  },
  statusCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  onlineCard: {
    backgroundColor: '#dcfce7',
  },
  offlineCard: {
    backgroundColor: '#fee2e2',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  statusText: {
    fontSize: 18,
    fontWeight: '700',
  },
  onlineText: {
    color: '#166534',
  },
  offlineText: {
    color: '#991b1b',
  },
  statusDescription: {
    fontSize: 13,
    color: '#374151',
  },
  statusMeta: {
    marginTop: 8,
    fontSize: 12,
    color: '#4b5563',
    fontWeight: '600',
  },
  badge: {
    marginLeft: 'auto',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#111827',
  },
  wifiOn: {
    backgroundColor: '#bfdbfe',
  },
  wifiOff: {
    backgroundColor: '#e5e7eb',
  },
  activityCard: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  activityCardActive: {
    backgroundColor: '#dbeafe',
  },
  activityCardDone: {
    backgroundColor: '#dcfce7',
  },
  activityCopy: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  activityTitleActive: {
    color: '#1d4ed8',
  },
  activityTitleDone: {
    color: '#0f766e',
  },
  activityText: {
    fontSize: 13,
    color: '#1f2937',
    lineHeight: 19,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2563eb',
  },
  statLabel: {
    marginTop: 4,
    fontSize: 12,
    color: '#4b5563',
    textAlign: 'center',
  },
  entityBreakdown: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  entityPill: {
    backgroundColor: '#eef2ff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  entityPillText: {
    fontSize: 12,
    color: '#1e3a8a',
    fontWeight: '500',
  },
  blockerCard: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 12,
  },
  blockerText: {
    fontSize: 12,
    color: '#92400e',
    lineHeight: 18,
  },
  errorHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  retryAllButton: {
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  retryAllText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  emptySub: {
    marginTop: 4,
    fontSize: 12,
    color: '#4b5563',
  },
  errorCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  errorCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  errorEntity: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  errorStatus: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  errorStatusDefault: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
  },
  errorStatusConflict: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  errorMeta: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 2,
  },
  errorMessage: {
    marginTop: 6,
    fontSize: 12,
    color: '#1f2937',
  },
  errorActions: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  errorActionBtn: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  errorActionText: {
    color: '#1d4ed8',
    fontWeight: '600',
    fontSize: 12,
  },
  syncButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  syncButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  syncIcon: {
    marginRight: 8,
  },
  syncButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
