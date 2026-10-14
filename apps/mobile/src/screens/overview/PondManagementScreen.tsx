import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { aquapinColors } from '../../theme/aquapin';

export default function PondManagementScreen() {
  const navigation = useNavigation<any>();

  const openMap = (initialMode: 'view' | 'point' | 'polygon') => {
    navigation.getParent()?.navigate('PondMap', { initialMode, requestKey: Date.now() });
  };

  const modules = [
    {
      key: 'gps',
      title: 'GPS Pond Mapping',
      subtitle: 'Track ponds with precise geolocation.',
      icon: 'navigate-outline' as const,
      onPress: () => openMap('view'),
    },
    {
      key: 'polygon',
      title: 'Polygon Creation',
      subtitle: 'Draw exact pond boundaries on the map.',
      icon: 'shapes-outline' as const,
      onPress: () => openMap('polygon'),
    },
    {
      key: 'details',
      title: 'Pond Details',
      subtitle: 'View stock, species, and status summaries.',
      icon: 'albums-outline' as const,
      onPress: () => navigation.getParent()?.navigate('PondWorkspace'),
    },
    {
      key: 'history',
      title: 'History Tracking',
      subtitle: 'Review pond activity and recent records.',
      icon: 'time-outline' as const,
      onPress: () => navigation.getParent()?.navigate('PondWorkspace'),
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.eyebrow}>Aquapin 2.0</Text>
            <Text style={styles.title}>Pond Management</Text>
            <Text style={styles.subtitle}>GPS mapping, polygon creation, and complete pond monitoring.</Text>
          </View>
        </View>

        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionTitle}>Management Modules</Text>
        </View>

        <View style={styles.moduleGrid}>
          {modules.map((module) => (
            <TouchableOpacity
              key={module.key}
              style={styles.moduleCard}
              activeOpacity={0.92}
              onPress={module.onPress}
            >
              <View style={styles.moduleIcon}>
                <Ionicons name={module.icon} size={22} color={aquapinColors.blue} />
              </View>
              <Text style={styles.moduleTitle}>{module.title}</Text>
              <Text style={styles.moduleSubtitle}>{module.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>
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
    marginBottom: 20,
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
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    marginTop: 4,
  },
  sectionTitle: {
    color: aquapinColors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  moduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },
  moduleCard: {
    width: '48%',
    backgroundColor: aquapinColors.surface,
    borderRadius: 24,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.92)',
    padding: 16,
    minHeight: 154,
    shadowColor: '#16335c',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  moduleIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: aquapinColors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  moduleTitle: {
    color: aquapinColors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  moduleSubtitle: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
});
