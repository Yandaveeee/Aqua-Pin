export type Coordinate = { latitude: number; longitude: number };
export function validateMapping(location: string, boundary?: string | null) {
  const valid = (p: Coordinate) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;
  const tokens = location.split(',').map(value => value.trim());
  if (tokens.some(value => value === '')) throw new Error('Select a valid GPS location.');
  const parts = tokens.map(Number);
  if (parts.length !== 2 || !location.trim() || !valid({ latitude: parts[0], longitude: parts[1] })) throw new Error('Select a valid GPS location.');
  if (!boundary) return;
  const points: Coordinate[] = JSON.parse(boundary);
  if (!Array.isArray(points) || points.length < 3 || !points.every(valid)) throw new Error('A boundary needs at least three valid points.');
  if (new Set(points.map(p => `${p.latitude},${p.longitude}`)).size !== points.length) throw new Error('Boundary points must be distinct.');
  const area = points.reduce((sum, p, i) => { const next = points[(i + 1) % points.length]; return sum + p.longitude * next.latitude - next.longitude * p.latitude; }, 0);
  if (Math.abs(area) < 1e-12) throw new Error('The boundary must enclose an area.');
  const cross = (a: Coordinate, b: Coordinate, c: Coordinate) => (b.longitude - a.longitude) * (c.latitude - a.latitude) - (b.latitude - a.latitude) * (c.longitude - a.longitude);
  for (let i = 0; i < points.length; i++) for (let j = i + 2; j < points.length; j++) {
    if (i === 0 && j === points.length - 1) continue;
    const a = points[i], b = points[(i + 1) % points.length], c = points[j], d = points[(j + 1) % points.length];
    const overlaps = Math.max(Math.min(a.longitude, b.longitude), Math.min(c.longitude, d.longitude)) <= Math.min(Math.max(a.longitude, b.longitude), Math.max(c.longitude, d.longitude)) && Math.max(Math.min(a.latitude, b.latitude), Math.min(c.latitude, d.latitude)) <= Math.min(Math.max(a.latitude, b.latitude), Math.max(c.latitude, d.latitude));
    if (overlaps && cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0) throw new Error('Boundary edges must not cross.');
  }
}
