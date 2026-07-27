export const aquapinColors = {
  background: '#eef4fb',
  surface: '#ffffff',
  surfaceMuted: '#f6f9fd',
  border: '#d8e5f1',
  text: '#16335c',
  textMuted: '#6f8298',
  blue: '#1e5aa7',
  blueSoft: '#e5f1ff',
  green: '#66b83f',
  greenSoft: '#eef9e8',
  teal: '#1ea4b8',
  tealSoft: '#e6f8fb',
  red: '#d64545',
  redSoft: '#fff0f0',
  amber: '#d39b20',
  amberSoft: '#fff6df',
  shadow: 'rgba(27, 74, 138, 0.12)',
  tabShadow: 'rgba(17, 49, 92, 0.14)',
};

export const aquapinRadius = {
  card: 22,
  pill: 999,
  sheet: 28,
};

export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-PH', {
    notation: 'compact',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

export function formatWholeNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Math.round(value).toLocaleString('en-PH');
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  return `${Math.round(value)}%`;
}

export function formatCurrencyPhp(value: number): string {
  if (!Number.isFinite(value)) return 'PHP 0';
  return `PHP ${Math.round(value).toLocaleString('en-PH')}`;
}

export function formatRelativeTime(timestamp: number | null | undefined): string {
  if (!timestamp || !Number.isFinite(timestamp)) return 'No updates yet';

  const diffMs = Date.now() - timestamp;
  const diffMin = Math.max(1, Math.round(diffMs / (1000 * 60)));

  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(timestamp).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  });
}
