export interface MockPond {
  id: string;
  name: string;
  location: string; // "latitude, longitude"
  coordinates: { lat: number; lng: number };
  boundary: { lat: number; lng: number }[] | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  isActive: boolean;
  currentSpecies: string | null;
  currentStockCount: number;
  areaSqm: number;
}

export interface MockStockingLog {
  id: string;
  pondId: string;
  pondName: string;
  species: string;
  quantity: number;
  averageWeightG: number;
  source: string;
  stockedBy: string;
  createdAt: string;
  status: string;
}

export interface MockMortalityLog {
  id: string;
  pondId: string;
  pondName: string;
  quantity: number;
  notes: string;
  loggedBy: string;
  createdAt: string;
}

export interface MockHarvest {
  id: string;
  pondId: string;
  pondName: string;
  yieldKg: number;
  harvestedBy: string;
  createdAt: string;
  species: string;
  isPartial: boolean;
  fishCount: number;
}

export interface MockFeedLog {
  id: string;
  pondId?: string;
  pondName?: string;
  type: 'purchase' | 'consumption' | 'adjustment';
  feedBrand: string;
  quantityBags: number; // + for purchase, - for consumption
  notes: string;
  loggedBy: string;
  createdAt: string;
}

export interface MockVerificationAlert {
  id: string;
  pondId?: string;
  pondName?: string;
  severity: 'info' | 'warning' | 'danger';
  type: 'gps_out_of_bounds' | 'high_mortality' | 'harvest_imbalance' | 'impossible_growth' | 'sync_error';
  message: string;
  detail: string;
  createdAt: string;
}

// 4 realistic ponds in Laguna / Bulacan region, Philippines
export const MOCK_PONDS: MockPond[] = [
  {
    id: "pond-1-laguna-north",
    name: "Laguna North Nursery 1",
    location: "14.6124, 121.0124",
    coordinates: { lat: 14.6124, lng: 121.0124 },
    boundary: [
      { lat: 14.6130, lng: 121.0118 },
      { lat: 14.6130, lng: 121.0130 },
      { lat: 14.6118, lng: 121.0130 },
      { lat: 14.6118, lng: 121.0118 }
    ],
    createdBy: "staff-1-miguel@aquapin.com",
    createdByName: "Miguel Cruz",
    createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    isActive: true,
    currentSpecies: "Tilapia",
    currentStockCount: 15400,
    areaSqm: 14400
  },
  {
    id: "pond-2-laguna-south",
    name: "Laguna South Grow-out 2",
    location: "14.5824, 120.9724",
    coordinates: { lat: 14.5824, lng: 120.9724 },
    boundary: [
      { lat: 14.5832, lng: 120.9715 },
      { lat: 14.5832, lng: 120.9733 },
      { lat: 14.5816, lng: 120.9733 },
      { lat: 14.5816, lng: 120.9715 }
    ],
    createdBy: "staff-2-sarah@aquapin.com",
    createdByName: "Sarah Santos",
    createdAt: new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(),
    isActive: true,
    currentSpecies: "Bangus",
    currentStockCount: 22000,
    areaSqm: 32400
  },
  {
    id: "pond-3-bulacan-delta",
    name: "Bulacan Delta Pond C",
    location: "14.7214, 120.8845",
    coordinates: { lat: 14.7214, lng: 120.8845 },
    boundary: [
      { lat: 14.7225, lng: 120.8835 },
      { lat: 14.7225, lng: 120.8855 },
      { lat: 14.7203, lng: 120.8855 },
      { lat: 14.7203, lng: 120.8835 }
    ],
    createdBy: "staff-1-miguel@aquapin.com",
    createdByName: "Miguel Cruz",
    createdAt: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
    isActive: true,
    currentSpecies: "Shrimp (Penaeus monodon)",
    currentStockCount: 48500,
    areaSqm: 40000
  },
  {
    id: "pond-4-rizal-hillside",
    name: "Rizal Hillside Pond D",
    location: "14.6542, 121.1524",
    coordinates: { lat: 14.6542, lng: 121.1524 },
    boundary: [
      { lat: 14.6548, lng: 121.1518 },
      { lat: 14.6548, lng: 121.1530 },
      { lat: 14.6536, lng: 121.1530 },
      { lat: 14.6536, lng: 121.1518 }
    ],
    createdBy: "staff-3-jose@aquapin.com",
    createdByName: "Jose Rizal",
    createdAt: new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString(),
    isActive: true,
    currentSpecies: "Tilapia",
    currentStockCount: 350, // Low stock warning!
    areaSqm: 14400
  }
];

export const MOCK_STOCKING_LOGS: MockStockingLog[] = [
  {
    id: "stock-1",
    pondId: "pond-1-laguna-north",
    pondName: "Laguna North Nursery 1",
    species: "Tilapia",
    quantity: 16000,
    averageWeightG: 0.5,
    source: "CLSU Freshwater Hatchery",
    stockedBy: "staff-1-miguel@aquapin.com",
    createdAt: new Date(Date.now() - 28 * 24 * 3600 * 1000).toISOString(),
    status: "active"
  },
  {
    id: "stock-2",
    pondId: "pond-2-laguna-south",
    pondName: "Laguna South Grow-out 2",
    species: "Bangus",
    quantity: 24000,
    averageWeightG: 1.2,
    source: "SEAFDEC Iloilo",
    stockedBy: "staff-2-sarah@aquapin.com",
    createdAt: new Date(Date.now() - 58 * 24 * 3600 * 1000).toISOString(),
    status: "active"
  },
  {
    id: "stock-3",
    pondId: "pond-3-bulacan-delta",
    pondName: "Bulacan Delta Pond C",
    species: "Shrimp (Penaeus monodon)",
    quantity: 50000,
    averageWeightG: 0.1,
    source: "Negros Hatchery Corp",
    stockedBy: "staff-1-miguel@aquapin.com",
    createdAt: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
    status: "active"
  },
  {
    id: "stock-4",
    pondId: "pond-4-rizal-hillside",
    pondName: "Rizal Hillside Pond D",
    species: "Tilapia",
    quantity: 8000,
    averageWeightG: 0.4,
    source: "Local Rizal Hatchery",
    stockedBy: "staff-3-jose@aquapin.com",
    createdAt: new Date(Date.now() - 44 * 24 * 3600 * 1000).toISOString(),
    status: "active"
  }
];

export const MOCK_MORTALITY_LOGS: MockMortalityLog[] = [
  {
    id: "mort-1",
    pondId: "pond-1-laguna-north",
    pondName: "Laguna North Nursery 1",
    quantity: 120,
    notes: "High temperature stress afternoon check",
    loggedBy: "staff-1-miguel@aquapin.com",
    createdAt: new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "mort-2",
    pondId: "pond-1-laguna-north",
    pondName: "Laguna North Nursery 1",
    quantity: 80,
    notes: "Regular mortality check",
    loggedBy: "staff-1-miguel@aquapin.com",
    createdAt: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "mort-3",
    pondId: "pond-2-laguna-south",
    pondName: "Laguna South Grow-out 2",
    quantity: 350,
    notes: "Low dissolved oxygen level event",
    loggedBy: "staff-2-sarah@aquapin.com",
    createdAt: new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "mort-4",
    pondId: "pond-2-laguna-south",
    pondName: "Laguna South Grow-out 2",
    quantity: 210,
    notes: "Post heavy rain pH drop check",
    loggedBy: "staff-2-sarah@aquapin.com",
    createdAt: new Date(Date.now() - 39 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "mort-5",
    pondId: "pond-3-bulacan-delta",
    pondName: "Bulacan Delta Pond C",
    quantity: 1500, // Anomaly check trigger!
    notes: "Algae bloom crash event",
    loggedBy: "staff-1-miguel@aquapin.com",
    createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "mort-6",
    pondId: "pond-4-rizal-hillside",
    pondName: "Rizal Hillside Pond D",
    quantity: 7650, // Extreme mortality! Almost wiped out.
    notes: "Sulfide toxicity / water quality crash",
    loggedBy: "staff-3-jose@aquapin.com",
    createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()
  }
];

export const MOCK_HARVESTS: MockHarvest[] = [
  {
    id: "harvest-1",
    pondId: "pond-4-rizal-hillside",
    pondName: "Rizal Hillside Pond D",
    yieldKg: 380,
    harvestedBy: "staff-3-jose@aquapin.com",
    createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    species: "Tilapia",
    isPartial: true,
    fishCount: 1500
  },
  {
    id: "harvest-2",
    pondId: "pond-2-laguna-south",
    pondName: "Laguna South Grow-out 2",
    yieldKg: 4200,
    harvestedBy: "staff-2-sarah@aquapin.com",
    createdAt: new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString(),
    species: "Bangus",
    isPartial: true,
    fishCount: 10000
  }
];

export const MOCK_FEED_LOGS: MockFeedLog[] = [
  {
    id: "feed-log-1",
    type: "purchase",
    feedBrand: "Tateh Tilapia Pre-Starter",
    quantityBags: 50,
    notes: "Bulk delivery from distributor",
    loggedBy: "admin@aquapin.com",
    createdAt: new Date(Date.now() - 29 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "feed-log-2",
    type: "purchase",
    feedBrand: "Sargasso Shrimp Starter",
    quantityBags: 80,
    notes: "Main supplier purchase order #8812",
    loggedBy: "admin@aquapin.com",
    createdAt: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "feed-log-3",
    pondId: "pond-1-laguna-north",
    pondName: "Laguna North Nursery 1",
    type: "consumption",
    feedBrand: "Tateh Tilapia Pre-Starter",
    quantityBags: 3,
    notes: "Week 4 daily feeding schedule",
    loggedBy: "staff-1-miguel@aquapin.com",
    createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "feed-log-4",
    pondId: "pond-2-laguna-south",
    pondName: "Laguna South Grow-out 2",
    type: "consumption",
    feedBrand: "Tateh Tilapia Pre-Starter",
    quantityBags: 5,
    notes: "Morning and afternoon feeding routine",
    loggedBy: "staff-2-sarah@aquapin.com",
    createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "feed-log-5",
    pondId: "pond-3-bulacan-delta",
    pondName: "Bulacan Delta Pond C",
    type: "consumption",
    feedBrand: "Sargasso Shrimp Starter",
    quantityBags: 8,
    notes: "Auto-feeders refills (Pond C)",
    loggedBy: "staff-1-miguel@aquapin.com",
    createdAt: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString()
  }
];

export const MOCK_VERIFICATION_ALERTS: MockVerificationAlert[] = [
  {
    id: "alert-1",
    pondId: "pond-4-rizal-hillside",
    pondName: "Rizal Hillside Pond D",
    severity: "danger",
    type: "high_mortality",
    message: "Extreme Mortality Detected",
    detail: "Jose Rizal logged 7,650 mortalities representing 95.6% of total stocking count in a single event.",
    createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "alert-2",
    pondId: "pond-4-rizal-hillside",
    pondName: "Rizal Hillside Pond D",
    severity: "warning",
    type: "harvest_imbalance",
    message: "Harvest Yield Imbalance",
    detail: "Pond D harvested 380 kg (1500 fish) but the current stock count shows only 350 fish remaining. High likelihood of unaccounted mortality or sync error.",
    createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "alert-3",
    pondId: "pond-3-bulacan-delta",
    pondName: "Bulacan Delta Pond C",
    severity: "warning",
    type: "high_mortality",
    message: "Algae Bloom Crash Warning",
    detail: "Miguel Cruz reported 1,500 shrimp mortalities. Recommended actions: Verify water oxygenation levels and check water transparency.",
    createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: "alert-4",
    severity: "info",
    type: "sync_error",
    message: "Offline Sync Conflict Resolved",
    detail: "Device ID iphone-14-staff1 updated Pond A boundary while offline. Merged using 'admin_overwrite' strategy.",
    createdAt: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString()
  }
];

export const MOCK_FEED_INVENTORY = {
  remainingBags: 114,
  estimatedDays: 14,
  consumptionRateBagsPerDay: 8.1,
  lowStockAlert: true,
  items: [
    { brand: "Tateh Tilapia Pre-Starter", remainingBags: 42, thresholdBags: 15, low: false },
    { brand: "Sargasso Shrimp Starter", remainingBags: 72, thresholdBags: 80, low: true }
  ]
};
