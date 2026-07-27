import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { usePonds } from '../hooks/useOfflineData';

const NOTIFIED_STOCK_LEVELS_KEY = '@aquapin_notified_stock_levels';
const LOW_STOCK_THRESHOLD = 100;
const CRITICAL_STOCK_THRESHOLD = 50;

type StockAlertLevel = 'warning' | 'critical';
type NotifiedStockLevels = Record<string, StockAlertLevel>;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureNotificationPermission() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('pond-alerts', {
      name: 'Pond alerts',
      description: 'Low-stock and critical pond notifications',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 180, 250],
      lightColor: '#0F766E',
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

function getStockAlertLevel(pond: any): StockAlertLevel | null {
  if (!Boolean(pond?.isActive)) return null;

  const stock = Number(pond?.currentStockCount ?? 0);
  if (!Number.isFinite(stock)) return null;
  if (stock <= CRITICAL_STOCK_THRESHOLD) return 'critical';
  if (stock < LOW_STOCK_THRESHOLD) return 'warning';
  return null;
}

export default function PondAlertNotifications() {
  const { ponds, loading } = usePonds();
  const processingRef = useRef(false);

  useEffect(() => {
    if (loading || processingRef.current) return;

    let cancelled = false;
    processingRef.current = true;

    const checkPonds = async () => {
      try {
        const permissionGranted = await ensureNotificationPermission();
        if (!permissionGranted || cancelled) return;

        const stored = await AsyncStorage.getItem(NOTIFIED_STOCK_LEVELS_KEY);
        const previousLevels: NotifiedStockLevels = stored ? JSON.parse(stored) : {};
        const nextLevels: NotifiedStockLevels = {};

        for (const pond of ponds as any[]) {
          const pondId = String(pond?.id || '').trim();
          if (!pondId) continue;

          const level = getStockAlertLevel(pond);
          if (!level) continue;

          nextLevels[pondId] = level;
          if (previousLevels[pondId] === level) continue;

          const stock = Math.max(0, Math.round(Number(pond.currentStockCount ?? 0)));
          const pondName = String(pond.name || 'Pond');
          await Notifications.scheduleNotificationAsync({
            content: {
              title: level === 'critical' ? 'Critical pond stock' : 'Low pond stock',
              body:
                level === 'critical'
                  ? `${pondName} has only ${stock.toLocaleString()} fish remaining. Verify the pond and plan restocking.`
                  : `${pondName} is below ${LOW_STOCK_THRESHOLD} fish. Review its stock and next actions.`,
              sound: true,
              data: {
                type: 'low_stock',
                pondId,
                level,
              },
            },
            trigger: null,
          });
        }

        if (!cancelled) {
          await AsyncStorage.setItem(
            NOTIFIED_STOCK_LEVELS_KEY,
            JSON.stringify(nextLevels)
          );
        }
      } catch (error) {
        console.warn('Unable to process pond notifications:', error);
      } finally {
        processingRef.current = false;
      }
    };

    void checkPonds();

    return () => {
      cancelled = true;
    };
  }, [loading, ponds]);

  return null;
}
