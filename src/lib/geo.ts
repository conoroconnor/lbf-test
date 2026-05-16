/**
 * Geolocation helpers: great-circle distance, unit conversions, and
 * the Puerto Banús marina geofence used by the trip auto-start banner.
 *
 * See docs/superpowers/specs/2026-05-16-letsboat-tracker-design.md §4.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Earth's mean radius in meters (spherical model — good enough for harbor-scale work). */
const EARTH_RADIUS_M = 6_371_000;

/** Meters per nautical mile. */
const METERS_PER_NM = 1852;

/** m/s per knot (1 kt = 1852 m / 3600 s). */
const MPS_PER_KT = 0.514444;

/** Puerto Banús marina center (from spec §4: 36.4843°N, -4.9540°W). */
export const PUERTO_BANUS: LatLng = { lat: 36.4843, lng: -4.954 };

/** Radius (m) used by the auto-start geofence around the marina. */
export const PUERTO_BANUS_RADIUS_M = 500;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two points in meters, computed with the
 * haversine formula. Spherical Earth — sub-meter accuracy is not required
 * for trip distance summation.
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_M * c;
}

/** Convert meters to nautical miles. */
export function metersToNm(m: number): number {
  return m / METERS_PER_NM;
}

/** Convert meters/second to knots. */
export function mpsToKt(mps: number): number {
  return mps / MPS_PER_KT;
}

/** True iff `p` is within `radiusM` meters of `center`. */
export function isInside(p: LatLng, center: LatLng, radiusM: number): boolean {
  return haversineMeters(p, center) <= radiusM;
}

/**
 * Cumulative path length in meters for an ordered list of fixes.
 * Sums the haversine distance between consecutive points.
 * Returns 0 for arrays of length < 2.
 */
export function pathLengthMeters(points: LatLng[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}
