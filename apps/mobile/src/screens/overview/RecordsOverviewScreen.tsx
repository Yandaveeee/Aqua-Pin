import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useFarmOverview } from '../../hooks';
import { aquapinColors, formatRelativeTime } from '../../theme/aquapin';

type RecordType = 'stocking' | 'mortality' | 'harvest';
type RecordsSegment = 'log' | 'recent' | 'history' | 'queue';
type ActivityFilter = 'all' | 'stocking' | 'harvest' | 'mortality';

function getActivityTone(type: 'stocking' | 'mortality' | 'harvest') {
  switch (type) {
    case 'stocking':
      return { bg: aquapinColors.greenSoft, fg: aquapinColors.green, icon: 'add-circle-outline' as const, label: 'Stocking' };
    case 'mortality':
      return { bg: aquapinColors.redSoft, fg: aquapinColors.red, icon: 'warning-outline' as const, label: 'Mortality' };
    case 'harvest':
      return { bg: aquapinColors.blueSoft, fg: aquapinColors.blue, icon: 'basket-outline' as const, label: 'Harvest' };
    default:
      return { bg: aquapinColors.surfaceMuted, fg: aquapinColors.textMuted, icon: 'ellipse-outline' as const, label: 'Activity' };
  }
}

export default function RecordsOverviewScreen() {
  const navigation = useNavigation<any>();
  const overview = useFarmOverview();
  const [selectedFilter, setSelectedFilter] = useState<ActivityFilter>('all');

  const openRecordsWorkspace = (params?: {
    initialType?: RecordType;
    initialSegment?: RecordsSegment;
    initialFilterType?: RecordType | 'all';
    historyOnly?: boolean;
  }) => {
    navigation.getParent()?.navigate('RecordsWorkspace', {
      initialType: params?.initialType,
      initialSegment: params?.initialSegment || 'recent',
      initialFilterType: params?.initialFilterType || 'all',
      historyOnly: params?.historyOnly,
      requestKey: Date.now(),
    });
  };

  const openFilteredRecords = (initialType: RecordType) => {
    openRecordsWorkspace({ initialType, initialSegment: 'recent', initialFilterType: initialType, historyOnly: true });
  };

  const filteredActivities = useMemo(() => {
    if (selectedFilter === 'all') {
      return overview.recentActivities;
    }
    return overview.recentActivities.filter((act) => act.type === selectedFilter);
  }, [overview.recentActivities, selectedFilter]);

  const filterChips: { id: ActivityFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'all', label: 'All', icon: 'list-outline' },
    { id: 'stocking', label: 'Stocking', icon: 'add-circle-outline' },
    { id: 'harvest', label: 'Harvesting', icon: 'basket-outline' },
    { id: 'mortality', label: 'Mortality', icon: 'warning-outline' },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.eyebrow}>Aquapin 2.0</Text>
            <Text style={styles.title}>Records</Text>
            <Text style={styles.subtitle}>Daily pond activities, stocking, harvesting, and logs.</Text>
          </View>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => openRecordsWorkspace({ initialSegment: 'log' })}
            activeOpacity={0.88}
          >
            <Ionicons name="add-circle-outline" size={22} color={aquapinColors.blue} />
          </TouchableOpacity>
        </View>

        {/* Filter Chips for Daily Activities */}
        <View style={styles.filterRow}>
          {filterChips.map((chip) => {
            const isSelected = selectedFilter === chip.id;
            return (
              <TouchableOpacity
                key={chip.id}
                style={[
                  styles.filterChip,
                  isSelected && styles.filterChipActive,
                ]}
                activeOpacity={0.85}
                onPress={() => setSelectedFilter(chip.id)}
              >
                <Ionicons
                  name={chip.icon}
                  size={14}
                  color={isSelected ? '#ffffff' : aquapinColors.textMuted}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    isSelected && styles.filterChipTextActive,
                  ]}
                >
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionTitle}>Daily Activities</Text>
          <TouchableOpacity
            onPress={() => openRecordsWorkspace({ initialSegment: 'recent', initialFilterType: selectedFilter === 'all' ? 'all' : selectedFilter, historyOnly: true })}
            activeOpacity={0.7}
          >
            <Text style={styles.linkText}>View All</Text>
          </TouchableOpacity>
        </View>

        {filteredActivities.length > 0 ? (
          <View style={styles.activityList}>
            {filteredActivities.map((activity) => {
              const tone = getActivityTone(activity.type);

              return (
                <TouchableOpacity
                  key={`${activity.type}-${activity.id}`}
                  style={styles.activityCard}
                  activeOpacity={0.92}
                  onPress={() => openFilteredRecords(activity.type)}
                >
                  <View style={[styles.activityIcon, { backgroundColor: tone.bg }]}>
                    <Ionicons name={tone.icon} size={20} color={tone.fg} />
                  </View>
                  <View style={styles.activityCopy}>
                    <Text style={styles.activityTitle}>{activity.title}</Text>
                    <Text style={styles.activitySubtitle}>{activity.subtitle}</Text>
                  </View>
                  <View style={styles.activityMeta}>
                    <Text style={styles.activityAmount}>{activity.amount}</Text>
                    <Text style={styles.activityTime}>{formatRelativeTime(activity.createdAt)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="document-text-outline" size={32} color={aquapinColors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No daily activities recorded</Text>
            <Text style={styles.emptySubtitle}>
              {selectedFilter === 'all'
                ? 'Record new stocking, harvesting, or mortality events to track operations.'
                : `No ${selectedFilter} records found yet.`}
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              activeOpacity={0.88}
              onPress={() => openRecordsWorkspace({ initialType: selectedFilter === 'all' ? 'stocking' : selectedFilter, initialSegment: 'log' })}
            >
              <Ionicons name="add" size={16} color="#ffffff" />
              <Text style={styles.emptyButtonText}>New Record</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={styles.workspaceButton}
          activeOpacity={0.9}
          onPress={() => openRecordsWorkspace({ initialSegment: 'recent', initialFilterType: 'all', historyOnly: true })}
        >
          <Ionicons name="folder-open-outline" size={18} color={aquapinColors.blue} />
          <Text style={styles.workspaceButtonText}>Open Records Workspace</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: aquapinColors.background,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 140,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  eyebrow: {
    color: aquapinColors.green,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  title: {
    color: aquapinColors.text,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 6,
  },
  subtitle: {
    color: aquapinColors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
    maxWidth: 280,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: aquapinColors.surface,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#16335c',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
    flexWrap: 'wrap',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: aquapinColors.surface,
    borderWidth: 1.2,
    borderColor: 'rgba(215, 230, 245, 0.85)',
  },
  filterChipActive: {
    backgroundColor: aquapinColors.blue,
    borderColor: aquapinColors.blue,
    shadowColor: aquapinColors.blue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  filterChipText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: aquapinColors.textMuted,
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: aquapinColors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  linkText: {
    color: aquapinColors.blue,
    fontSize: 13,
    fontWeight: '700',
  },
  activityList: {
    gap: 10,
    marginBottom: 20,
  },
  activityCard: {
    backgroundColor: aquapinColors.surface,
    borderRadius: 22,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#16335c',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  activityIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityCopy: {
    flex: 1,
  },
  activityTitle: {
    color: aquapinColors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  activitySubtitle: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  activityMeta: {
    alignItems: 'flex-end',
  },
  activityAmount: {
    color: aquapinColors.text,
    fontSize: 13.5,
    fontWeight: '800',
  },
  activityTime: {
    color: aquapinColors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  emptyCard: {
    backgroundColor: aquapinColors.surface,
    borderRadius: 24,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#16335c',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 22,
    backgroundColor: aquapinColors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: aquapinColors.text,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: aquapinColors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    maxWidth: 260,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: aquapinColors.blue,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  emptyButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  workspaceButton: {
    backgroundColor: aquapinColors.blueSoft,
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: 'rgba(2, 132, 199, 0.2)',
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  workspaceButtonText: {
    color: aquapinColors.blue,
    fontSize: 14.5,
    fontWeight: '800',
  },
});
