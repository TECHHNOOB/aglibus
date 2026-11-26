import { udaipurGTFS } from './udaipur-gtfs.mjs';
import { passengerRoutes, canonicalStop, stopNames, stopEnglish, stopLocations } from './network.mjs';

function gtfsDistance(lat, lng, otherLat, otherLng) {
  return 111320 * Math.hypot(lat - otherLat, (lng - otherLng) * Math.cos(lat * Math.PI / 180));
}

const gtfsStopKey = name => String(name || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '');
const gtfsExisting = [...new Set(passengerRoutes.flatMap(r => r.stops.map(canonicalStop)))];

const gtfsExtraStops = new Map();
const gtfsLocalIds = udaipurGTFS.stops.map(([name, lat, lng], i) => {
  const key = gtfsStopKey(name);
  const choices = gtfsExisting
    .filter(id => stopLocations[id] && gtfsStopKey(stopEnglish[id] || stopNames[id]) === key)
    .map(id => ({ id, d: gtfsDistance(lat, lng, ...stopLocations[id]) }))
    .sort((a, b) => a.d - b.d);
  if (choices[0]?.d <= 180) return choices[0].id;

  const samePlatform = gtfsExisting.filter(id => stopLocations[id] && gtfsDistance(lat, lng, ...stopLocations[id]) <= 18);
  if (samePlatform.length === 1) return samePlatform[0];

  for (const existing of gtfsExtraStops.values()) {
    if (existing.key === key && gtfsDistance(lat, lng, existing.lat, existing.lng) <= 180) {
      return existing.id;
    }
  }
  const id = 10000 + i;
  gtfsExtraStops.set(id, { key, id, name, lat, lng });
  return id;
});

const gtfsPatterns = udaipurGTFS.patterns.map(p => ({
  ...p,
  local: p.stops.map(i => gtfsLocalIds[i])
}));

const gtfsWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function getActiveServicesForDate(dayUTC) {
  const date = dayUTC.toISOString().slice(0, 10).replaceAll('-', '');
  const weekday = gtfsWeek[dayUTC.getUTCDay()];
  const services = new Set(
    udaipurGTFS.calendar
      .filter(c => c.start_date <= date && c.end_date >= date && c[weekday] === '1')
      .map(c => c.service_id)
  );
  for (const e of udaipurGTFS.exceptions.filter(ex => ex.date === date)) {
    if (e.exception_type === '1') services.add(e.service_id);
    else services.delete(e.service_id);
  }
  return services;
}

function findStopIndexInPattern(pattern, targetId, startAfter = 0) {
  const exact = pattern.local.indexOf(targetId, startAfter);
  if (exact >= 0) return exact;
  const targetLoc = stopLocations[targetId];
  if (!targetLoc) return -1;
  let bestIdx = -1;
  let minDist = 650;
  for (let idx = startAfter; idx < pattern.stops.length; idx++) {
    const [, lat, lng] = udaipurGTFS.stops[pattern.stops[idx]];
    const d = gtfsDistance(lat, lng, targetLoc[0], targetLoc[1]);
    if (d < minDist) {
      minDist = d;
      bestIdx = idx;
    }
  }
  return bestIdx;
}

/**
 * Returns upcoming GTFS departures from `fromId` to `toId` within the next 24 hours.
 */
export function gtfsDepartures(fromId, toId, now = Date.now(), lookback = 0, routeCode = null) {
  const india = new Date(now + 19800000);
  const departures = [];
  const patterns = routeCode ? gtfsPatterns.filter(p => p.code === routeCode) : gtfsPatterns;

  for (const shift of [-1, 0, 1]) {
    const day = new Date(Date.UTC(india.getUTCFullYear(), india.getUTCMonth(), india.getUTCDate() + shift));
    const services = getActiveServicesForDate(day);
    if (services.size === 0) continue;

    for (const pattern of patterns) {
      const i = findStopIndexInPattern(pattern, fromId, 0);
      if (i < 0) continue;
      const j = findStopIndexInPattern(pattern, toId, i + 1);
      if (j < 0) continue;

      for (const [service, dep, arr, tripId] of pattern.trips) {
        if (!services.has(service)) continue;
        const start = day.getTime() - 19800000 + dep[i] * 1000;
        const end = day.getTime() - 19800000 + arr[j] * 1000;
        if (start >= now - lookback && start < now + 86400000) {
          departures.push({
            code: pattern.code,
            title: pattern.title,
            tripId,
            start,
            end,
            durationMinutes: Math.max(1, Math.round((end - start) / 60000))
          });
        }
      }
    }
  }

  return departures.sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * Reject a live route leg when GTFS covers both stops on that UCTSL route but only in the opposite direction.
 */
export function gtfsServesLeg(leg) {
  if (leg.route.agency !== 'UCTSL') return true;
  const patterns = gtfsPatterns.filter(p => p.code === leg.route.code);
  const covering = patterns.filter(p => p.local.includes(leg.from) && p.local.includes(leg.to));
  return !covering.length || covering.some(p => p.local.indexOf(leg.from) < p.local.lastIndexOf(leg.to));
}

function formatSecIST(sec) {
  const totalMin = Math.floor(sec / 60) % (24 * 60);
  let h = Math.floor(totalMin / 60);
  const m = (totalMin % 60).toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

/**
 * Returns GTFS schedule summary for a route code (first/last bus, trip count, patterns).
 */
export function gtfsRouteScheduleSummary(routeCode, now = Date.now()) {
  const patterns = gtfsPatterns.filter(p => p.code === routeCode);
  if (!patterns.length) return null;

  const india = new Date(now + 19800000);
  const currentSec = india.getUTCHours() * 3600 + india.getUTCMinutes() * 60 + india.getUTCSeconds();

  let minSec = Infinity;
  let maxSec = -Infinity;
  let totalTrips = 0;
  const upcomingOriginDeps = [];

  for (const p of patterns) {
    for (const [, dep] of p.trips) {
      totalTrips++;
      const firstStopSec = dep[0];
      if (firstStopSec < minSec) minSec = firstStopSec;
      if (firstStopSec > maxSec) maxSec = firstStopSec;
      if (firstStopSec >= currentSec) {
        upcomingOriginDeps.push({ title: p.title, timeSec: firstStopSec, time: formatSecIST(firstStopSec) });
      }
    }
  }

  upcomingOriginDeps.sort((a, b) => a.timeSec - b.timeSec);

  return {
    routeCode,
    hasGtfs: true,
    totalDailyTrips: totalTrips,
    firstBus: Number.isFinite(minSec) ? formatSecIST(minSec) : null,
    lastBus: Number.isFinite(maxSec) ? formatSecIST(maxSec) : null,
    lastBusSec: Number.isFinite(maxSec) ? maxSec : null,
    upcomingOriginDepartures: upcomingOriginDeps.slice(0, 6).map(({ title, time }) => ({ title, time }))
  };
}
