import { NextResponse } from 'next/server';
import { passengerRoutes, canonicalStop, stopNames, stopEnglish, dutyRouteHints, planTrips } from '@/lib/network.mjs';
import { fleet } from '@/lib/feeds.mjs';
import { directedMatches } from '@/lib/matching.mjs';
import { gtfsDepartures, gtfsRouteScheduleSummary } from '@/lib/gtfs.mjs';
import {
  resolveStopLocation,
  getDistanceMeters,
  estimateAccessTravel,
  findNearestStops,
  getRouteSegmentCoords,
  parseCoordParam,
  matchLandmark,
  nominatimSearchUdaipur,
} from '@/lib/udaipur-geo.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function formatClockIST(date) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  let h = ist.getUTCHours();
  const m = ist.getUTCMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return { time: `${h}:${m}`, ampm, full: `${h}:${m} ${ampm}` };
}

function getISTMinutesOfDay(date) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

function formatPlate(id) {
  if (!id) return 'City Bus';
  const m = id.match(/^([A-Z]{2})(\d{2})([A-Z]+)(\d{4})$/);
  if (m) return `${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
  if (id.startsWith('Bus ')) return `UCTSL Bus (${id.slice(4, 9)})`;
  return id;
}

function getDirectionalTitle(title, isReverse) {
  if (!isReverse || !title) return title;
  const parts = title.split(/\s*(?:→|➔|↔)\s*/);
  if (parts.length === 2) {
    return `${parts[1]} ➔ ${parts[0]}`;
  }
  return title;
}

function cleanText(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveStopId(input, { allowFuzzy = true } = {}) {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (/^\d+$/.test(trimmed)) return canonicalStop(Number(trimmed));
  if (/^(?:loc:|@)?-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?/i.test(trimmed)) return null;

  const cleanInput = cleanText(trimmed);
  if (!cleanInput) return null;
  const noSpaceInput = cleanInput.replace(/\s+/g, '').replace(/partap/g, 'pratap');
  const inputWords = cleanInput.split(' ').filter(w => w.length >= 3).map(w => w.replace(/partap/g, 'pratap'));

  if (/(rana|pratap|राणा|प्रताप)/.test(noSpaceInput) && /(station|railway|स्टेशन|रेलवे)/.test(cleanInput)) {
    return 13;
  }
  if (/(city|udaipur|udiyapol|udayapol|सिटी|उदयापोल)/.test(cleanInput) && /(station|railway|स्टेशन|रेलवे)/.test(cleanInput)) {
    return 109;
  }

  for (const [idStr, eng] of Object.entries(stopEnglish)) {
    if (cleanText(eng) === cleanInput) return canonicalStop(Number(idStr));
  }
  for (let i = 0; i < stopNames.length; i++) {
    if (cleanText(stopNames[i]) === cleanInput) return canonicalStop(i);
  }

  if (cleanInput.length >= 4) {
    for (const [idStr, eng] of Object.entries(stopEnglish)) {
      if (cleanText(eng).includes(cleanInput)) return canonicalStop(Number(idStr));
    }
    for (let i = 0; i < stopNames.length; i++) {
      if (cleanText(stopNames[i]).includes(cleanInput)) return canonicalStop(i);
    }

    for (const [idStr, eng] of Object.entries(stopEnglish)) {
      if (cleanText(eng).replace(/\s+/g, '').includes(noSpaceInput)) return canonicalStop(Number(idStr));
    }
    for (let i = 0; i < stopNames.length; i++) {
      if (cleanText(stopNames[i]).replace(/\s+/g, '').includes(noSpaceInput)) return canonicalStop(i);
    }
  }

  if (!allowFuzzy || inputWords.length === 0) return null;

  let bestId = null;
  let maxScore = -1;
  const allEntries = [
    ...Object.entries(stopEnglish).map(([id, text]) => ({ id: Number(id), text })),
    ...stopNames.map((text, id) => ({ id, text })),
  ];

  for (const { id, text } of allEntries) {
    if (!text) continue;
    const targetWords = cleanText(text).split(' ').filter(tw => tw.length >= 3);
    if (targetWords.length === 0) continue;
    let score = 0;
    let matchedWords = 0;
    for (const w of inputWords) {
      if (w === 'udaipur' || w === 'udaypur') continue;
      if (targetWords.some(tw => tw === w)) {
        score += (w === 'rana' || w === 'pratap') ? 5 : 2;
        matchedWords++;
      } else if (targetWords.some(tw => tw.includes(w) || w.includes(tw))) {
        score += 1;
        matchedWords++;
      }
    }
    const meaningfulInputs = inputWords.filter(w => w !== 'udaipur' && w !== 'udaypur');
    if (meaningfulInputs.length > 0 && matchedWords >= Math.min(2, meaningfulInputs.length) && score > maxScore) {
      maxScore = score;
      bestId = id;
    }
  }

  return bestId !== null ? canonicalStop(bestId) : null;
}

async function resolveEndpoint(rawParam) {
  // 1. Direct coordinates (GPS / map pick)
  const parsedCoord = parseCoordParam(rawParam);
  if (parsedCoord) {
    const nearest = findNearestStops(parsedCoord.lat, parsedCoord.lng, { limit: 1, maxDistanceMeters: 120 });
    return {
      stopId: nearest.length > 0 && nearest[0].distanceMeters <= 85 ? nearest[0].id : null,
      exactStopId: null,
      lat: parsedCoord.lat,
      lng: parsedCoord.lng,
      name: parsedCoord.name,
      english: parsedCoord.english,
      isCustomPlace: true,
    };
  }

  // 2. Exact / direct substring transit stop match
  const exactStopId = resolveStopId(rawParam, { allowFuzzy: false });
  if (exactStopId !== null) {
    const coords = resolveStopLocation(exactStopId);
    return {
      stopId: exactStopId,
      exactStopId,
      lat: coords?.[0] ?? null,
      lng: coords?.[1] ?? null,
      name: stopNames[exactStopId] || `Stop #${exactStopId}`,
      english: stopEnglish[exactStopId] || stopNames[exactStopId] || `Stop #${exactStopId}`,
      isCustomPlace: false,
    };
  }

  // 3. Local Udaipur landmark match (checked before loose word overlap so "City Palace" isn't hijacked by stop tokens)
  const landmark = matchLandmark(rawParam);
  if (landmark) {
    return {
      stopId: null,
      exactStopId: null,
      lat: landmark.lat,
      lng: landmark.lng,
      name: landmark.name,
      english: landmark.english,
      isCustomPlace: true,
    };
  }

  // 4. Fuzzy token transit stop match (multi-word stop queries)
  const fuzzyStopId = resolveStopId(rawParam, { allowFuzzy: true });
  if (fuzzyStopId !== null) {
    const coords = resolveStopLocation(fuzzyStopId);
    return {
      stopId: fuzzyStopId,
      exactStopId: fuzzyStopId,
      lat: coords?.[0] ?? null,
      lng: coords?.[1] ?? null,
      name: stopNames[fuzzyStopId] || `Stop #${fuzzyStopId}`,
      english: stopEnglish[fuzzyStopId] || stopNames[fuzzyStopId] || `Stop #${fuzzyStopId}`,
      isCustomPlace: false,
    };
  }

  // 5. OpenStreetMap Nominatim lookup bounded to Udaipur
  const osmHits = await nominatimSearchUdaipur(rawParam, 1);
  if (osmHits.length > 0) {
    const hit = osmHits[0];
    return {
      stopId: null,
      exactStopId: null,
      lat: hit.lat,
      lng: hit.lng,
      name: hit.name,
      english: hit.english,
      sublabel: hit.sublabel,
      isCustomPlace: true,
    };
  }

  return null;
}

const cleanRouteId = (rId) => String(rId || '').replace(/^PM/i, '');

function buildAccessSegment(fromPoint, boardStopId) {
  if (!fromPoint || !Number.isFinite(fromPoint.lat) || !Number.isFinite(fromPoint.lng)) return null;
  const boardCoords = resolveStopLocation(boardStopId);
  if (!boardCoords) return null;
  const dist = getDistanceMeters(fromPoint.lat, fromPoint.lng, boardCoords[0], boardCoords[1]);
  if (!Number.isFinite(dist) || dist < 60) return null;
  const travel = estimateAccessTravel(dist, fromPoint.lat, fromPoint.lng, boardCoords[0], boardCoords[1]);
  return {
    type: 'access',
    from: {
      name: fromPoint.name,
      english: fromPoint.english,
      coordinates: [fromPoint.lat, fromPoint.lng],
    },
    toStop: {
      id: boardStopId,
      name: stopNames[boardStopId] || `Stop #${boardStopId}`,
      english: stopEnglish[boardStopId] || stopNames[boardStopId] || `Stop #${boardStopId}`,
      coordinates: boardCoords,
    },
    ...travel,
  };
}

function buildEgressSegment(alightStopId, toPoint) {
  if (!toPoint || !Number.isFinite(toPoint.lat) || !Number.isFinite(toPoint.lng)) return null;
  const alightCoords = resolveStopLocation(alightStopId);
  if (!alightCoords) return null;
  const dist = getDistanceMeters(alightCoords[0], alightCoords[1], toPoint.lat, toPoint.lng);
  if (!Number.isFinite(dist) || dist < 60) return null;
  const travel = estimateAccessTravel(dist, alightCoords[0], alightCoords[1], toPoint.lat, toPoint.lng);
  return {
    type: 'egress',
    fromStop: {
      id: alightStopId,
      name: stopNames[alightStopId] || `Stop #${alightStopId}`,
      english: stopEnglish[alightStopId] || stopNames[alightStopId] || `Stop #${alightStopId}`,
      coordinates: alightCoords,
    },
    to: {
      name: toPoint.name,
      english: toPoint.english,
      coordinates: [toPoint.lat, toPoint.lng],
    },
    ...travel,
  };
}

function enrichPlan(p, planIdx, { activeBuses, isNightWindow, istMinutesOfDay, now, fromPoint, toPoint }) {
  const transferCount = p.legs.length - 1;
  const firstLegFrom = p.legs[0].from;
  const lastLegTo = p.legs[p.legs.length - 1].to;

  const accessSegment =
    fromPoint && (fromPoint.isCustomPlace || (fromPoint.exactStopId !== null && fromPoint.exactStopId !== firstLegFrom))
      ? buildAccessSegment(fromPoint, firstLegFrom)
      : null;

  const egressSegment =
    toPoint && (toPoint.isCustomPlace || (toPoint.exactStopId !== null && toPoint.exactStopId !== lastLegTo))
      ? buildEgressSegment(lastLegTo, toPoint)
      : null;

  const accessMin = accessSegment
    ? accessSegment.mode === 'auto'
      ? accessSegment.autoMinutes
      : accessSegment.walkMinutes
    : 0;
  const egressMin = egressSegment
    ? egressSegment.mode === 'auto'
      ? egressSegment.autoMinutes
      : egressSegment.walkMinutes
    : 0;

  const busMinutes = p.minutes;
  const totalMinutes = busMinutes + accessMin + egressMin;

  const legs = p.legs.map((leg) => {
    const legPath = leg.route.stops.map(canonicalStop);
    let fromIdx = -1;
    let toIdx = -1;
    const targetLen = (leg.stops?.length || 1) - 1;
    for (let i = 0; i < legPath.length; i++) {
      if (legPath[i] !== leg.from) continue;
      if (targetLen >= 0) {
        if (i + targetLen < legPath.length && legPath[i + targetLen] === leg.to) {
          fromIdx = i;
          toIdx = i + targetLen;
          break;
        }
        if (i - targetLen >= 0 && legPath[i - targetLen] === leg.to) {
          fromIdx = i;
          toIdx = i - targetLen;
          break;
        }
      }
    }
    if (fromIdx < 0 || toIdx < 0) {
      fromIdx = legPath.indexOf(leg.from);
      toIdx = legPath.indexOf(leg.to);
    }
    const isReverse = fromIdx >= 0 && toIdx >= 0 ? fromIdx > toIdx : false;

    const dirTitle = getDirectionalTitle(leg.route.title, isReverse);
    const dirTitleEn = getDirectionalTitle(leg.route.titleEn || leg.route.title, isReverse);

    const rId = String(leg.route.id);
    const rCode = String(leg.route.code || '');
    const rNum = cleanRouteId(rCode) || cleanRouteId(rId);
    const travelDir = Math.sign(toIdx - fromIdx) || 1;

    const matchedBuses = activeBuses.filter(b => {
      if (b.matches?.some(m => m.routeId === rId && m.basis !== 'shared_corridor')) return true;
      const bHint = dutyRouteHints[b.id] ? String(dutyRouteHints[b.id]) : '';
      if (bHint && (bHint === rId || bHint === rNum)) return true;
      if (b.routeId === rId || b.routeId === rCode) return true;
      if (b.assignment && (b.assignment === rId || b.assignment.includes(rId) || b.assignment.includes(rCode))) return true;
      if (b.route && (b.route.includes(rId) || b.route.includes(rCode))) return true;
      return false;
    });

    const upcomingBuses = [];
    const departedBuses = [];

    for (const b of matchedBuses) {
      if (isNightWindow && (!b.speed || b.speed < 2)) continue;

      const dirMatch = b.matches?.find(m => m.routeId === rId && m.basis !== 'shared_corridor');
      if (dirMatch && dirMatch.direction !== 0 && dirMatch.direction !== travelDir) {
        continue;
      }

      let closestStopId = null;
      let closestIdx = -1;
      let minDist = Infinity;

      leg.route.stops.forEach((rawId, idx) => {
        const canId = canonicalStop(rawId);
        const loc = resolveStopLocation(rawId) || resolveStopLocation(canId);
        if (loc) {
          const d = getDistanceMeters(b.lat, b.lng, loc[0], loc[1]);
          if (d < minDist) {
            minDist = d;
            closestStopId = canId;
            closestIdx = idx;
          }
        }
      });

      if (minDist > 3500) continue;

      let isUpcoming = false;
      let isAtStop = false;
      let stopsAway = 0;

      if (dirMatch && Number.isFinite(dirMatch.progress)) {
        const progress = dirMatch.progress;
        const delta = (progress - fromIdx) * travelDir;
        if (Math.abs(delta) <= 0.35 && minDist <= 400) {
          isAtStop = true;
          stopsAway = 0;
        } else if (delta <= 0) {
          isUpcoming = true;
          stopsAway = Math.max(1, Math.round(Math.abs(fromIdx - progress)));
        } else {
          stopsAway = Math.max(1, Math.round(Math.abs(progress - fromIdx)));
        }
      } else if (!isReverse) {
        if (closestIdx < fromIdx) {
          isUpcoming = true;
          stopsAway = fromIdx - closestIdx;
        } else if (closestIdx === fromIdx && minDist <= 400) {
          isAtStop = true;
          stopsAway = 0;
        } else {
          stopsAway = closestIdx - fromIdx;
        }
      } else {
        if (closestIdx > fromIdx) {
          isUpcoming = true;
          stopsAway = closestIdx - fromIdx;
        } else if (closestIdx === fromIdx && minDist <= 400) {
          isAtStop = true;
          stopsAway = 0;
        } else {
          stopsAway = fromIdx - closestIdx;
        }
      }

      const totalRouteStops = Math.max(1, leg.route.stops.length - 1);
      const avgMinPerStop = leg.route.minutes ? (leg.route.minutes / totalRouteStops) : 2.5;
      const etaMinutes = isAtStop ? 1 : Math.max(2, Math.round(stopsAway * avgMinPerStop));
      const nearStopName = stopNames[closestStopId] || '';
      const nearStopEng = stopEnglish[closestStopId] || nearStopName;

      const busData = {
        id: b.id,
        plate: formatPlate(b.id),
        speed: Math.round(b.speed || 0),
        lat: b.lat,
        lng: b.lng,
        direction: dirMatch?.direction || 0,
        directionConfirmed: Boolean(dirMatch && dirMatch.direction === travelDir),
        isUpcoming: isUpcoming || isAtStop,
        isAtStop,
        stopsAway,
        etaMinutes,
        nearStop: { id: closestStopId, name: nearStopName, english: nearStopEng },
        distMeters: Math.round(minDist),
      };

      if (isUpcoming || isAtStop) {
        upcomingBuses.push(busData);
      } else {
        departedBuses.push(busData);
      }
    }

    upcomingBuses.sort((a, b) => a.etaMinutes - b.etaMinutes);
    departedBuses.sort((a, b) => a.stopsAway - b.stopsAway);

    const nextUpcomingBus = upcomingBuses[0] || null;
    const toStopName = stopNames[leg.to] || `Stop #${leg.to}`;
    const toStopEng = stopEnglish[leg.to] || toStopName;

    return {
      id: leg.route.id,
      routeId: leg.route.id,
      code: leg.route.code,
      routeCode: leg.route.code,
      title: dirTitle,
      routeTitle: dirTitle,
      titleEn: dirTitleEn,
      routeTitleEn: dirTitleEn,
      originalTitle: leg.route.title,
      originalTitleEn: leg.route.titleEn || leg.route.title,
      isReverse,
      directionLabel: `${toStopName} की ओर`,
      directionLabelEn: `Towards ${toStopEng}`,
      agency: leg.route.agency,
      headway: leg.route.headway || '15-20',
      minutes: leg.minutes,
      from: stopNames[leg.from] || `Stop #${leg.from}`,
      to: toStopName,
      fromStop: {
        id: leg.from,
        name: stopNames[leg.from] || `Stop #${leg.from}`,
        english: stopEnglish[leg.from] || stopNames[leg.from] || `Stop #${leg.from}`,
        coordinates: resolveStopLocation(leg.from),
      },
      toStop: {
        id: leg.to,
        name: toStopName,
        english: toStopEng,
        coordinates: resolveStopLocation(leg.to),
      },
      stopsCount: leg.stops.length,
      upcomingBuses,
      departedBuses,
      nextUpcomingBus,
      hasUpcomingBus: upcomingBuses.length > 0,
      pathCoords: getRouteSegmentCoords(leg.route.id, fromIdx, toIdx),
      stopSequence: leg.stops.map(s => ({
        id: s,
        name: stopNames[s] || `Stop #${s}`,
        english: stopEnglish[s] || stopNames[s] || `Stop #${s}`,
        coordinates: resolveStopLocation(s),
      })),
    };
  });

  const primaryLeg = legs[0];
  const hasLiveBus = Boolean(primaryLeg?.nextUpcomingBus);
  const primaryCode = primaryLeg?.routeCode || '';
  const gtfsDeps = primaryLeg
    ? gtfsDepartures(primaryLeg.fromStop.id, primaryLeg.toStop.id, now.getTime(), 0, primaryCode || null)
    : [];
  const gtfsSummary = primaryCode ? gtfsRouteScheduleSummary(primaryCode, now.getTime()) : null;

  let isServiceClosed = isNightWindow && !hasLiveBus;
  let departureMinutes;
  let depDate;
  let arrDate;
  let scheduleSource = 'headway';

  if (hasLiveBus) {
    scheduleSource = 'gps';
    departureMinutes = primaryLeg.nextUpcomingBus.etaMinutes;
    depDate = new Date(now.getTime() + departureMinutes * 60000);
    arrDate = new Date(depDate.getTime() + busMinutes * 60000);
  } else if (gtfsDeps.length > 0) {
    scheduleSource = 'gtfs';
    const nextTrip = gtfsDeps[0];
    depDate = new Date(nextTrip.start);
    arrDate = new Date(nextTrip.end);
    departureMinutes = Math.max(1, Math.round((nextTrip.start - now.getTime()) / 60000));
    if (isNightWindow && departureMinutes > 180) {
      isServiceClosed = true;
    } else {
      isServiceClosed = false;
    }
  } else if (isServiceClosed) {
    const targetMorningMin = (6 * 60 + 30) + planIdx * 10;
    const minsUntilMorning = istMinutesOfDay >= (21 * 60 + 30)
      ? (24 * 60 - istMinutesOfDay) + targetMorningMin
      : targetMorningMin - istMinutesOfDay;
    departureMinutes = minsUntilMorning;
    depDate = new Date(now.getTime() + minsUntilMorning * 60000);
    arrDate = new Date(depDate.getTime() + busMinutes * 60000);
  } else {
    const headwayMin = parseInt(String(primaryLeg?.headway || '15'), 10) || 15;
    const minsSinceStart = Math.max(0, istMinutesOfDay - (6 * 60 + 30));
    const rem = minsSinceStart % headwayMin;
    departureMinutes = rem === 0 ? headwayMin : (headwayMin - rem) + (planIdx > 0 ? 3 : 0);
    depDate = new Date(now.getTime() + departureMinutes * 60000);
    arrDate = new Date(depDate.getTime() + busMinutes * 60000);
  }

  const nextScheduledTimes = gtfsDeps.slice(0, 3).map(d => formatClockIST(new Date(d.start)).full);
  const dataStatus = hasLiveBus ? 'live' : 'estimated';
  const viaNearbyStop = Boolean(accessSegment || egressSegment);

  return {
    planKind: transferCount === 0 ? (viaNearbyStop ? 'nearby_direct' : 'direct') : (viaNearbyStop ? 'nearby_transfer' : 'transfer'),
    viaNearbyStop,
    accessSegment,
    egressSegment,
    totalMinutes,
    busMinutes,
    minutes: totalMinutes,
    transferCount,
    departureMinutes,
    departureTime: formatClockIST(depDate),
    arrivalTime: formatClockIST(arrDate),
    scheduleSource,
    dataStatus,
    isEstimated: !hasLiveBus,
    nextScheduledTimes,
    gtfsSummary,
    isServiceClosed,
    hasLiveUpcomingBus: hasLiveBus,
    nextUpcomingBus: primaryLeg?.nextUpcomingBus || null,
    legs,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');

  if (!fromParam || !toParam) {
    return NextResponse.json({ error: 'Please provide both "from" and "to" parameters' }, { status: 400 });
  }

  const [fromPoint, toPoint, fleetData] = await Promise.all([
    resolveEndpoint(fromParam),
    resolveEndpoint(toParam),
    fleet().catch(() => ({ buses: [] })),
  ]);

  if (!fromPoint || !toPoint) {
    return NextResponse.json({
      error: 'Could not locate one or both places in Udaipur. Try picking a stop or area from suggestions.',
      fromMatched: fromPoint || null,
      toMatched: toPoint || null,
    }, { status: 404 });
  }

  const originDestDistanceMeters =
    Number.isFinite(fromPoint.lat) && Number.isFinite(toPoint.lat)
      ? Math.round(getDistanceMeters(fromPoint.lat, fromPoint.lng, toPoint.lat, toPoint.lng))
      : null;

  const isShortWalk = originDestDistanceMeters !== null && originDestDistanceMeters <= 700;

  const checkedAt = fleetData.checkedAt || Date.now();
  const activeBuses = (fleetData.buses || [])
    .filter(b => b.source !== 'last' && b.gpsAt && (checkedAt - b.gpsAt <= 180000))
    .map(b => ({ ...b, matches: directedMatches(b, checkedAt) }));

  // Nearest stops around origin (always helpful for showing where nearby buses depart)
  const nearbyBoardingHubs = Number.isFinite(fromPoint.lat)
    ? findNearestStops(fromPoint.lat, fromPoint.lng, {
      limit: 5,
      maxDistanceMeters: 2500,
      excludeStopId: fromPoint.exactStopId,
    })
    : [];

  const nearbyDestHubs = Number.isFinite(toPoint.lat)
    ? findNearestStops(toPoint.lat, toPoint.lng, {
      limit: 4,
      maxDistanceMeters: 1500,
      excludeStopId: toPoint.exactStopId,
    })
    : [];

  const now = new Date();
  const istMinutesOfDay = getISTMinutesOfDay(now);
  const isNightWindow = istMinutesOfDay >= (21 * 60 + 30) || istMinutesOfDay < (6 * 60 + 15);

  let curatedPlans = [];
  let hasExactDirectBus = false;
  let hasNearbyDirectBus = false;

  // Case A: Standard stop-to-stop search
  if (fromPoint.exactStopId !== null && toPoint.exactStopId !== null) {
    const rawPlans = planTrips(fromPoint.exactStopId, toPoint.exactStopId, passengerRoutes) || [];
    const directPlans = rawPlans.filter(p => p.legs.length === 1);
    const connectingPlans = rawPlans.filter(p => p.legs.length === 2);

    const seenDirectRoutes = new Set();
    const uniqueDirect = [];
    for (const p of directPlans.sort((a, b) => a.minutes - b.minutes)) {
      const rId = String(p.legs[0].route.id);
      if (seenDirectRoutes.has(rId)) continue;
      seenDirectRoutes.add(rId);
      uniqueDirect.push(p);
      if (uniqueDirect.length >= 4) break;
    }

    hasExactDirectBus = uniqueDirect.length > 0;

    if (hasExactDirectBus) {
      const seenTransferPairs = new Set();
      const seenTransferStarts = new Set();
      const uniqueConnecting = [];
      if (uniqueDirect.length < 2) {
        for (const p of connectingPlans.sort((a, b) => a.minutes - b.minutes)) {
          const r1 = String(p.legs[0].route.id);
          const r2 = String(p.legs[1].route.id);
          if (seenDirectRoutes.has(r1) || seenTransferStarts.has(r1)) continue;
          const pairKey = `${r1}-${r2}`;
          if (seenTransferPairs.has(pairKey)) continue;
          seenTransferPairs.add(pairKey);
          seenTransferStarts.add(r1);
          uniqueConnecting.push(p);
          if (uniqueDirect.length + uniqueConnecting.length >= 4) break;
        }
      }
      curatedPlans = [...uniqueDirect, ...uniqueConnecting];
    } else {
      // NO exact direct bus between fromId and toId!
      // 1) Look for Direct Buses available from a nearby stop (<= 2.2 km from origin, prioritizing closest walkable stops!)
      const originCandidates = [
        { id: fromPoint.exactStopId, distanceMeters: 0, walkMinutes: 0 },
        ...findNearestStops(fromPoint.lat, fromPoint.lng, { limit: 12, maxDistanceMeters: 2200, excludeStopId: fromPoint.exactStopId }),
      ];
      const destCandidates = [
        { id: toPoint.exactStopId, distanceMeters: 0, walkMinutes: 0 },
        ...findNearestStops(toPoint.lat, toPoint.lng, { limit: 5, maxDistanceMeters: 900, excludeStopId: toPoint.exactStopId }),
      ];

      const maxAccessBudget = originDestDistanceMeters
        ? Math.min(2400, Math.max(600, originDestDistanceMeters * 0.65))
        : 2200;

      const nearbyDirectCandidates = [];
      for (const bStop of originCandidates) {
        for (const aStop of destCandidates) {
          if (bStop.id === fromPoint.exactStopId && aStop.id === toPoint.exactStopId) continue;
          if (bStop.id === aStop.id) continue;
          const totalAccessMeters = (bStop.distanceMeters || 0) + (aStop.distanceMeters || 0);
          if (totalAccessMeters > maxAccessBudget) continue;

          const subPlans = (planTrips(bStop.id, aStop.id, passengerRoutes) || []).filter(sp => sp.legs.length === 1);
          for (const sp of subPlans) {
            const accessMinEst = bStop.distanceMeters <= 1250
              ? Math.round(bStop.distanceMeters / 75)
              : Math.round(bStop.distanceMeters / 320);
            const egressMinEst = aStop.distanceMeters <= 1250
              ? Math.round(aStop.distanceMeters / 75)
              : Math.round(aStop.distanceMeters / 320);
            nearbyDirectCandidates.push({
              ...sp,
              _score: sp.minutes + accessMinEst + egressMinEst + (totalAccessMeters / 180),
              _accessMeters: totalAccessMeters,
              _routeKey: `${sp.legs[0].route.id}:${bStop.id}`,
              _routeId: String(sp.legs[0].route.id),
            });
          }
        }
      }

      nearbyDirectCandidates.sort((a, b) => a._accessMeters - b._accessMeters || a._score - b._score);
      const seenNearRoutes = new Set();
      const uniqueNearDirect = [];
      for (const nc of nearbyDirectCandidates) {
        if (seenNearRoutes.has(nc._routeId)) continue;
        seenNearRoutes.add(nc._routeId);
        uniqueNearDirect.push(nc);
        if (uniqueNearDirect.length >= 3) break;
      }

      hasNearbyDirectBus = uniqueNearDirect.length > 0;

      // 2) Best 1-Transfer plans starting directly from user's selected stop
      const seenTransferPairs = new Set();
      const seenTransferStarts = new Set();
      const uniqueConnecting = [];
      for (const p of connectingPlans.sort((a, b) => a.minutes - b.minutes)) {
        const r1 = String(p.legs[0].route.id);
        const r2 = String(p.legs[1].route.id);
        if (seenTransferStarts.has(r1)) continue;
        const pairKey = `${r1}-${r2}`;
        if (seenTransferPairs.has(pairKey)) continue;
        seenTransferPairs.add(pairKey);
        seenTransferStarts.add(r1);
        uniqueConnecting.push(p);
        if (uniqueConnecting.length >= 2) break;
      }

      curatedPlans = [...uniqueNearDirect, ...uniqueConnecting].slice(0, 5);
    }
  } else {
    // Case B: Custom Udaipur Place / Landmark / GPS Coordinates on Origin and/or Destination
    const originStops = fromPoint.exactStopId !== null
      ? [{ id: fromPoint.exactStopId, distanceMeters: 0 }]
      : findNearestStops(fromPoint.lat, fromPoint.lng, { limit: 8, maxDistanceMeters: 3500 });

    const destStops = toPoint.exactStopId !== null
      ? [{ id: toPoint.exactStopId, distanceMeters: 0 }]
      : findNearestStops(toPoint.lat, toPoint.lng, { limit: 6, maxDistanceMeters: 2500 });

    const directCandidates = [];
    const transferCandidates = [];

    for (const oStop of originStops) {
      for (const dStop of destStops) {
        if (oStop.id === dStop.id) continue;
        const trips = planTrips(oStop.id, dStop.id, passengerRoutes) || [];
        const accessPenalty = (oStop.distanceMeters || 0) / 140 + (dStop.distanceMeters || 0) / 140;
        for (const t of trips) {
          const item = { ...t, _score: t.minutes + accessPenalty, _accessDist: (oStop.distanceMeters || 0) + (dStop.distanceMeters || 0) };
          if (t.legs.length === 1) directCandidates.push(item);
          else if (t.legs.length === 2) transferCandidates.push(item);
        }
      }
    }

    directCandidates.sort((a, b) => a._score - b._score);
    const seenRoutes = new Set();
    const uniqueDirect = [];
    for (const dc of directCandidates) {
      const rId = String(dc.legs[0].route.id);
      if (seenRoutes.has(rId)) continue;
      seenRoutes.add(rId);
      uniqueDirect.push(dc);
      if (uniqueDirect.length >= 3) break;
    }

    hasNearbyDirectBus = uniqueDirect.length > 0;
    hasExactDirectBus = false;

    const uniqueTransfer = [];
    if (uniqueDirect.length < 2) {
      transferCandidates.sort((a, b) => a._score - b._score);
      const seenPairs = new Set();
      for (const tc of transferCandidates) {
        const pairKey = `${tc.legs[0].route.id}-${tc.legs[1].route.id}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        uniqueTransfer.push(tc);
        if (uniqueDirect.length + uniqueTransfer.length >= 4) break;
      }
    }

    curatedPlans = [...uniqueDirect, ...uniqueTransfer];
  }

  const enriched = curatedPlans.map((p, planIdx) =>
    enrichPlan(p, planIdx, { activeBuses, isNightWindow, istMinutesOfDay, now, fromPoint, toPoint })
  );

  // Clean prioritization:
  // 1) Exact direct buses first (live GPS before estimated)
  // 2) Walkable nearby-direct vs 1-transfer sorted sensibly by door-to-door convenience
  enriched.sort((a, b) => {
    const rankOf = (x) => {
      if (x.planKind === 'direct') return 0;
      if (x.planKind === 'nearby_direct') {
        return (x.accessSegment?.distanceMeters || 0) <= 1050 ? 1 : 2;
      }
      if (x.planKind === 'transfer') return 2;
      return 3;
    };
    const rA = rankOf(a);
    const rB = rankOf(b);
    if (rA !== rB) return rA - rB;
    if (a.hasLiveUpcomingBus !== b.hasLiveUpcomingBus) return a.hasLiveUpcomingBus ? -1 : 1;
    if (a.hasLiveUpcomingBus && a.departureMinutes !== b.departureMinutes) {
      return a.departureMinutes - b.departureMinutes;
    }
    return a.totalMinutes - b.totalMinutes;
  });

  const plannerMode = hasExactDirectBus
    ? 'direct_available'
    : (fromPoint.isCustomPlace || toPoint.isCustomPlace)
      ? 'location_to_nearest_stop'
      : 'no_direct_bus';

  return NextResponse.json({
    from: {
      id: fromPoint.exactStopId,
      name: fromPoint.name,
      english: fromPoint.english,
      coordinates: Number.isFinite(fromPoint.lat) ? [fromPoint.lat, fromPoint.lng] : null,
      isCustomPlace: fromPoint.isCustomPlace,
    },
    to: {
      id: toPoint.exactStopId,
      name: toPoint.name,
      english: toPoint.english,
      coordinates: Number.isFinite(toPoint.lat) ? [toPoint.lat, toPoint.lng] : null,
      isCustomPlace: toPoint.isCustomPlace,
    },
    plannerMode,
    hasDirectBus: hasExactDirectBus,
    hasNearbyDirectBus,
    isShortWalk,
    originDestDistanceMeters,
    nearbyBoardingHubs,
    nearbyDestHubs,
    isServiceClosed: isNightWindow && !enriched.some(p => p.hasLiveUpcomingBus),
    currentTimeIST: formatClockIST(now).full,
    plans: enriched,
  });
}
