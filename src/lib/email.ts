import type { StoredTrip } from './storage';

/**
 * mailto: builder for sending trip summaries to Matt.
 *
 * Pure functions only — nothing here opens windows or makes network calls.
 * iOS Safari PWAs cannot attach files to a mailto: link, so the GPS trace is
 * inlined as CSV inside the message body (spec §4 "Email to Matt").
 */

export const MATT_EMAIL = 'matt@letsboat.club';

export interface BoatLabel {
  id: string;
  label: string;
  engineLabel: string;
}

export interface EmailDraft {
  subject: string;
  body: string;
  mailto: string;
}

// ---------------------------------------------------------------------------
// Tiny date formatters.  We avoid pulling in a date library; en-GB locale
// already gives us "16 May 2026, 14:32" with the right options.
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function fmt(n: number, dp: number): string {
  return Number(n).toFixed(dp);
}

function findBoat(boats: BoatLabel[], boatId: string): BoatLabel {
  const match = boats.find((b) => b.id === boatId);
  if (match) return match;
  return { id: boatId, label: boatId, engineLabel: 'unknown engine' };
}

function buildMailto(subject: string, body: string): string {
  // encodeURIComponent handles spaces, newlines, accents, ampersands etc.
  return `mailto:${MATT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ---------------------------------------------------------------------------
// Single trip email
// ---------------------------------------------------------------------------

export function buildTripEmail(trip: StoredTrip, boat: BoatLabel): EmailDraft {
  const dateStr = formatDate(trip.startedAtIso);
  const subject = `Trip ${dateStr} — ${boat.label} — €${fmt(trip.euros, 2)}`;

  const startDateTime = formatDateTime(trip.startedAtIso);
  const endTime = formatTime(trip.endedAtIso);

  const pointsHeader = 'ts_ms,lat,lng,kt';
  const pointRows = trip.points.map(
    (p) => `${p.tsMs},${p.lat},${p.lng},${fmt(p.kt, 2)}`,
  );

  const body = [
    `Boat: ${boat.label} (${boat.engineLabel})`,
    `Date: ${startDateTime}–${endTime}`,
    `Distance: ${fmt(trip.distanceNm, 1)} NM`,
    `Max speed: ${fmt(trip.maxKt, 1)} kt   Avg speed: ${fmt(trip.avgKt, 1)} kt`,
    `Fuel used: ${fmt(trip.liters, 1)} L`,
    `€ spent: €${fmt(trip.euros, 2)}  (at €${fmt(trip.pricePerLiter, 2)}/L)`,
    '',
    `GPS track (${trip.points.length} points):`,
    pointsHeader,
    ...pointRows,
  ].join('\n');

  return { subject, body, mailto: buildMailto(subject, body) };
}

// ---------------------------------------------------------------------------
// "All trips" email
// ---------------------------------------------------------------------------

const ALL_TRIPS_CSV_COLUMNS = [
  'id',
  'boatId',
  'startedAtIso',
  'endedAtIso',
  'durationSec',
  'distanceNm',
  'maxKt',
  'avgKt',
  'liters',
  'euros',
  'pricePerLiter',
] as const;

function allTripsCsvRow(trip: StoredTrip): string {
  return ALL_TRIPS_CSV_COLUMNS.map((col) => String(trip[col])).join(',');
}

export function buildAllTripsEmail(
  trips: StoredTrip[],
  boats: BoatLabel[],
): EmailDraft {
  const totalEuros = trips.reduce((sum, t) => sum + t.euros, 0);
  const subject = `Let's Boat — All trips (${trips.length} trips, total €${fmt(totalEuros, 2)})`;

  const summaryLines = trips.map((t) => {
    const boat = findBoat(boats, t.boatId);
    return `${formatDate(t.startedAtIso)} — ${boat.label} — ${fmt(t.distanceNm, 1)} NM — ${fmt(t.liters, 1)} L — €${fmt(t.euros, 2)}`;
  });

  const csvHeader = ALL_TRIPS_CSV_COLUMNS.join(',');
  const csvRows = trips.map(allTripsCsvRow);

  const body = [
    `Total trips: ${trips.length}`,
    `Total spent: €${fmt(totalEuros, 2)}`,
    '',
    'Summary:',
    ...summaryLines,
    '',
    'CSV:',
    csvHeader,
    ...csvRows,
  ].join('\n');

  return { subject, body, mailto: buildMailto(subject, body) };
}
