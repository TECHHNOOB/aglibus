import { NextResponse } from 'next/server';
import { passengerRoutes, canonicalStop, stopNames, stopEnglish, planTrips, dutyRouteHints } from '@/lib/network.mjs';
import { fleet } from '@/lib/feeds.mjs';

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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');

  if (!fromParam || !toParam) {
    return NextResponse.json({ error: 'Please provide both "from" and "to" parameters' }, { status: 400 });
  }

  // Find stop ID by matching ID or name
  function resolveStopId(input) {
    if (/^\d+$/.test(input)) return canonicalStop(Number(input));
    const term = input.trim().toLowerCase();
    
    // Exact or partial match in stopEnglish
    for (const [idStr, eng] of Object.entries(stopEnglish)) {
      if (eng && eng.toLowerCase() === term) return canonicalStop(Number(idStr));
    }
    // Exact or partial match in stopNames
    for (let i = 0; i < stopNames.length; i++) {
      if (stopNames[i] && stopNames[i].toLowerCase() === term) return canonicalStop(i);
    }
    for (const [idStr, eng] of Object.entries(stopEnglish)) {
      if (eng && eng.toLowerCase().includes(term)) return canonicalStop(Number(idStr));
    }
    for (let i = 0; i < stopNames.length; i++) {
      if (stopNames[i] && stopNames[i].toLowerCase().includes(term)) return canonicalStop(i);
    }
    return null;
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

  const activeBuses = fleetData.buses || [];
  
  // Sort plans so direct routes (1 leg) are prioritized, then by duration
  const sortedPlans = [...rawPlans].sort((a, b) => {
    if (a.legs.length !== b.legs.length) {
      return a.legs.length - b.legs.length;
    }
    return a.minutes - b.minutes;
  });

  // Deduplicate and enrich
  const seenRouteSignatures = new Set();
  const enriched = [];

  for (const p of sortedPlans) {
    const signature = p.legs.map(l => `${l.route.id}:${l.from}->${l.to}`).join('|');
    if (seenRouteSignatures.has(signature)) continue;
    seenRouteSignatures.add(signature);

    const cleanRouteId = (rId) => String(rId || '').replace(/^PM/i, '');

    enriched.push({
      totalMinutes: p.minutes,
      minutes: p.minutes,
      transferCount: p.legs.length - 1,
      legs: p.legs.map(leg => {
        const fromIdx = leg.route.stops.indexOf(leg.from);
        const toIdx = leg.route.stops.indexOf(leg.to);
        const isReverse = fromIdx > toIdx;

        // Route direction title: e.g. Kanpur ➔ Chetak Bus Stand when traveling reverse!
        const dirTitle = getDirectionalTitle(leg.route.title, isReverse);
        const dirTitleEn = getDirectionalTitle(leg.route.titleEn || leg.route.title, isReverse);

        const rId = String(leg.route.id);
        const rCode = String(leg.route.code || '');
        const rNum = cleanRouteId(rCode) || cleanRouteId(rId);

        // Find active live buses on this route
        const routeBuses = activeBuses.filter(b => {
          const bHint = dutyRouteHints[b.id] ? String(dutyRouteHints[b.id]) : '';
          if (b.routeId === rId || b.routeId === rCode) return true;
          if (bHint && (bHint === rId || bHint === rNum)) return true;
          if (b.assignment && (b.assignment === rId || b.assignment.includes(rId) || b.assignment.includes(rCode))) return true;
          if (b.route && (b.route.includes(rId) || b.route.includes(rCode))) return true;
          return false;
        }).map(b => ({
          id: b.id,
          plate: formatPlate(b.id),
          speed: Math.round(b.speed || 0),
          lat: b.lat,
          lng: b.lng
        }));

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
          liveBuses: routeBuses,
          stopSequence: leg.stops.map(s => ({
            id: s,
            name: stopNames[s] || `Stop #${s}`,
            english: stopEnglish[s] || stopNames[s] || `Stop #${s}`
          }))
        };
      })
    });

    if (enriched.length >= 8) break; // Keep top 8 best options
  }

  return NextResponse.json({
    from: { id: fromId, name: stopNames[fromId], english: stopEnglish[fromId] },
    to: { id: toId, name: stopNames[toId], english: stopEnglish[toId] },
    plans: enriched
  });
}
