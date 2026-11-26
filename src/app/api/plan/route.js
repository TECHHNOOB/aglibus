import { NextResponse } from 'next/server';
import { passengerRoutes, canonicalStop, stopNames, stopEnglish, stopLocations, planTrips, dutyRouteHints } from '@/lib/network.mjs';
import { fleet } from '@/lib/feeds.mjs';

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

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');

  if (!fromParam || !toParam) {
    return NextResponse.json({ error: 'Please provide both "from" and "to" parameters' }, { status: 400 });
  }

  // Clean text helper for fuzzy matching
  function cleanText(str) {
    return (str || '')
      .toLowerCase()
      .replace(/[^a-z0-9\u0900-\u097F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Find stop ID with smart token & fuzzy matching
  function resolveStopId(input) {
    if (!input) return null;
    if (/^\d+$/.test(input.trim())) return canonicalStop(Number(input.trim()));
    
    const cleanInput = cleanText(input);
    const inputWords = cleanInput.split(' ').filter(w => w.length > 1).map(w => w.replace(/partap/g, 'pratap'));
    
    // 1. Exact match in stopEnglish or stopNames
    for (const [idStr, eng] of Object.entries(stopEnglish)) {
      if (cleanText(eng) === cleanInput) return canonicalStop(Number(idStr));
    }
    for (let i = 0; i < stopNames.length; i++) {
      if (cleanText(stopNames[i]) === cleanInput) return canonicalStop(i);
    }
    
    // 2. Substring match
    for (const [idStr, eng] of Object.entries(stopEnglish)) {
      if (cleanText(eng).includes(cleanInput)) return canonicalStop(Number(idStr));
    }
    for (let i = 0; i < stopNames.length; i++) {
      if (cleanText(stopNames[i]).includes(cleanInput)) return canonicalStop(i);
    }

    // 3. Normalized without spaces (handles "ranapratap" matching "rana pratap")
    const noSpaceInput = cleanInput.replace(/\s+/g, '').replace(/partap/g, 'pratap');
    for (const [idStr, eng] of Object.entries(stopEnglish)) {
      const noSpaceEng = cleanText(eng).replace(/\s+/g, '');
      if (noSpaceEng.includes(noSpaceInput)) return canonicalStop(Number(idStr));
    }
    for (let i = 0; i < stopNames.length; i++) {
      const noSpaceName = cleanText(stopNames[i]).replace(/\s+/g, '');
      if (noSpaceName.includes(noSpaceInput)) return canonicalStop(i);
    }

    // 4. Token overlap scoring with specificity bonus (e.g. "rana" / "pratap" prioritize Rana Pratap Nagar over generic Railway Station)
    let bestId = null;
    let maxScore = -1;
    const allEntries = [
      ...Object.entries(stopEnglish).map(([id, text]) => ({ id: Number(id), text })),
      ...stopNames.map((text, id) => ({ id, text }))
    ];

    for (const { id, text } of allEntries) {
      if (!text) continue;
      const targetWords = cleanText(text).split(' ');
      let score = 0;
      let matchedWords = 0;
      for (const w of inputWords) {
        if (targetWords.some(tw => tw === w)) {
          score += (w === 'rana' || w === 'pratap') ? 5 : 2;
          matchedWords++;
        } else if (targetWords.some(tw => tw.includes(w) || w.includes(tw))) {
          score += 1;
          matchedWords++;
        }
      }
      if (matchedWords >= Math.min(2, inputWords.length) && score > maxScore) {
        maxScore = score;
        bestId = id;
      }
    }

    return bestId !== null ? canonicalStop(bestId) : null;
  }

  const fromId = resolveStopId(fromParam);
  const toId = resolveStopId(toParam);

  if (fromId === null || toId === null) {
    return NextResponse.json({
      error: 'Could not match one or both stops in Udaipur transit network',
      fromMatched: fromId !== null ? { id: fromId, name: stopNames[fromId], english: stopEnglish[fromId] } : null,
      toMatched: toId !== null ? { id: toId, name: stopNames[toId], english: stopEnglish[toId] } : null,
    }, { status: 404 });
  }

  const [rawPlans, fleetData] = await Promise.all([
    Promise.resolve(planTrips(fromId, toId, passengerRoutes) || []),
    fleet().catch(() => ({ buses: [] }))
  ]);

  const checkedAt = fleetData.checkedAt || Date.now();
  // Only consider genuinely live buses (exclude stale 'last' signals and signals older than 3 minutes)
  const activeBuses = (fleetData.buses || []).filter(
    b => b.source !== 'last' && b.gpsAt && (checkedAt - b.gpsAt <= 180000)
  );
  
  // Smart Curation:
  // 1. Prioritize Direct Routes (unique by routeId)
  // 2. Add Best 1-Transfer Routes (unique by route pair, only if needed)
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

  const seenTransferPairs = new Set();
  const uniqueConnecting = [];
  if (uniqueDirect.length < 3) {
    for (const p of connectingPlans.sort((a, b) => a.minutes - b.minutes)) {
      const r1 = String(p.legs[0].route.id);
      const r2 = String(p.legs[1].route.id);
      if (seenDirectRoutes.has(r1)) continue; // Don't transfer if starting route already had direct option
      const pairKey = `${r1}-${r2}`;
      if (seenTransferPairs.has(pairKey)) continue;
      seenTransferPairs.add(pairKey);
      uniqueConnecting.push(p);
      if (uniqueDirect.length + uniqueConnecting.length >= 4) break;
    }
  }

  // Combine direct and connecting plans (max 4 distinct curated options)
  const curatedPlans = [...uniqueDirect, ...uniqueConnecting];
  const cleanRouteId = (rId) => String(rId || '').replace(/^PM/i, '');

  const now = new Date();
  const istMinutesOfDay = getISTMinutesOfDay(now);
  // Udaipur City Buses operate approx 06:30 AM to 09:30 PM IST
  const isNightWindow = istMinutesOfDay >= (21 * 60 + 30) || istMinutesOfDay < (6 * 60 + 15);

  const enriched = curatedPlans.map((p, planIdx) => {
    const totalMinutes = p.minutes;
    const transferCount = p.legs.length - 1;

    const legs = p.legs.map((leg, legIdx) => {
      const fromIdx = leg.route.stops.indexOf(leg.from);
      const toIdx = leg.route.stops.indexOf(leg.to);
      const isReverse = fromIdx > toIdx;

      // Directional title
      const dirTitle = getDirectionalTitle(leg.route.title, isReverse);
      const dirTitleEn = getDirectionalTitle(leg.route.titleEn || leg.route.title, isReverse);

      const rId = String(leg.route.id);
      const rCode = String(leg.route.code || '');
      const rNum = cleanRouteId(rCode) || cleanRouteId(rId);

      // Find all live buses mapped to this route
      const matchedBuses = activeBuses.filter(b => {
        const bHint = dutyRouteHints[b.id] ? String(dutyRouteHints[b.id]) : '';
        if (b.routeId === rId || b.routeId === rCode) return true;
        if (bHint && (bHint === rId || bHint === rNum)) return true;
        if (b.assignment && (b.assignment === rId || b.assignment.includes(rId) || b.assignment.includes(rCode))) return true;
        if (b.route && (b.route.includes(rId) || b.route.includes(rCode))) return true;
        return false;
      });

      // Classify each bus into upcoming or departed relative to boarding stop (leg.from)
      const upcomingBuses = [];
      const departedBuses = [];

      for (const b of matchedBuses) {
        // At night, ignore stationary/parked buses
        if (isNightWindow && (!b.speed || b.speed < 2)) continue;

        let closestStopId = null;
        let closestIdx = -1;
        let minDist = Infinity;

        // Find nearest stop along route
        leg.route.stops.forEach((sId, idx) => {
          const loc = stopLocations[sId];
          if (loc) {
            const d = getDistanceMeters(b.lat, b.lng, loc[0], loc[1]);
            if (d < minDist) {
              minDist = d;
              closestStopId = sId;
              closestIdx = idx;
            }
          }
        });

        // If bus is more than 3.5km away from any stop on this route, it might be off-duty
        if (minDist > 3500) continue;

        let isUpcoming = false;
        let isAtStop = false;
        let stopsAway = 0;

        if (!isReverse) {
          // Forward direction: 0 -> fromIdx -> toIdx -> end
          if (closestIdx < fromIdx) {
            isUpcoming = true;
            stopsAway = fromIdx - closestIdx;
          } else if (closestIdx === fromIdx && minDist <= 400) {
            isAtStop = true;
            stopsAway = 0;
          } else {
            // Bus is past fromIdx!
            stopsAway = closestIdx - fromIdx;
          }
        } else {
          // Reverse direction: end -> fromIdx -> toIdx -> 0
          if (closestIdx > fromIdx) {
            isUpcoming = true;
            stopsAway = closestIdx - fromIdx;
          } else if (closestIdx === fromIdx && minDist <= 400) {
            isAtStop = true;
            stopsAway = 0;
          } else {
            // Bus is past fromIdx!
            stopsAway = fromIdx - closestIdx;
          }
        }

        const etaMinutes = isAtStop ? 1 : Math.max(2, Math.round(stopsAway * 2.5));
        const nearStopName = stopNames[closestStopId] || '';
        const nearStopEng = stopEnglish[closestStopId] || nearStopName;

        const busData = {
          id: b.id,
          plate: formatPlate(b.id),
          speed: Math.round(b.speed || 0),
          lat: b.lat,
          lng: b.lng,
          isUpcoming: isUpcoming || isAtStop,
          isAtStop,
          stopsAway,
          etaMinutes,
          nearStop: { id: closestStopId, name: nearStopName, english: nearStopEng },
          distMeters: Math.round(minDist)
        };

        if (isUpcoming || isAtStop) {
          upcomingBuses.push(busData);
        } else {
          departedBuses.push(busData);
        }
      }

      // Sort upcoming buses by ETA (soonest first)
      upcomingBuses.sort((a, b) => a.etaMinutes - b.etaMinutes);
      // Sort departed buses by how recently they left
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
        minutes: leg.minutes,
        from: stopNames[leg.from] || `Stop #${leg.from}`,
        to: toStopName,
        fromStop: {
          id: leg.from,
          name: stopNames[leg.from] || `Stop #${leg.from}`,
          english: stopEnglish[leg.from] || stopNames[leg.from] || `Stop #${leg.from}`
        },
        toStop: {
          id: leg.to,
          name: toStopName,
          english: toStopEng
        },
        stopsCount: leg.stops.length,
        upcomingBuses,
        departedBuses,
        nextUpcomingBus,
        hasUpcomingBus: upcomingBuses.length > 0,
        stopSequence: leg.stops.map(s => ({
          id: s,
          name: stopNames[s] || `Stop #${s}`,
          english: stopEnglish[s] || stopNames[s] || `Stop #${s}`
        }))
      };
    });

    // Plan-level departure & arrival time calculation in IST
    const primaryLeg = legs[0];
    const hasLiveBus = Boolean(primaryLeg?.nextUpcomingBus);
    const isServiceClosed = isNightWindow && !hasLiveBus;

    let departureMinutes;
    let depDate;

    if (hasLiveBus) {
      departureMinutes = primaryLeg.nextUpcomingBus.etaMinutes;
      depDate = new Date(now.getTime() + departureMinutes * 60000);
    } else if (isServiceClosed) {
      // Next morning first bus at 06:30 AM IST (+ staggered 10 mins per option)
      const targetMorningMin = (6 * 60 + 30) + planIdx * 10;
      const minsUntilMorning = istMinutesOfDay >= (21 * 60 + 30)
        ? (24 * 60 - istMinutesOfDay) + targetMorningMin
        : targetMorningMin - istMinutesOfDay;
      departureMinutes = minsUntilMorning;
      depDate = new Date(now.getTime() + minsUntilMorning * 60000);
    } else {
      departureMinutes = 8 + planIdx * 10;
      depDate = new Date(now.getTime() + departureMinutes * 60000);
    }

    const arrDate = new Date(depDate.getTime() + totalMinutes * 60000);

    return {
      totalMinutes,
      minutes: totalMinutes,
      transferCount,
      departureMinutes,
      departureTime: formatClockIST(depDate),
      arrivalTime: formatClockIST(arrDate),
      isServiceClosed,
      hasLiveUpcomingBus: hasLiveBus,
      nextUpcomingBus: primaryLeg?.nextUpcomingBus || null,
      legs
    };
  });

  // Sort plans: live upcoming buses first, then fewest transfers, then shortest duration
  enriched.sort((a, b) => {
    if (a.hasLiveUpcomingBus !== b.hasLiveUpcomingBus) return a.hasLiveUpcomingBus ? -1 : 1;
    if (a.transferCount !== b.transferCount) return a.transferCount - b.transferCount;
    return a.totalMinutes - b.totalMinutes;
  });

  return NextResponse.json({
    from: { id: fromId, name: stopNames[fromId], english: stopEnglish[fromId] },
    to: { id: toId, name: stopNames[toId], english: stopEnglish[toId] },
    isServiceClosed: isNightWindow && !enriched.some(p => p.hasLiveUpcomingBus),
    currentTimeIST: formatClockIST(now).full,
    plans: enriched
  });
}
