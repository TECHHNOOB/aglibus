import { NextResponse } from 'next/server';
import { passengerRoutes, canonicalStop, stopNames, stopEnglish, planTrips } from '@/lib/network.mjs';

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
    
    // Check stopEnglish
    for (const [idStr, eng] of Object.entries(stopEnglish)) {
      if (eng && eng.toLowerCase().includes(term)) {
        return canonicalStop(Number(idStr));
      }
    }
    // Check stopNames
    for (let i = 0; i < stopNames.length; i++) {
      if (stopNames[i] && stopNames[i].toLowerCase().includes(term)) {
        return canonicalStop(i);
      }
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

  const plans = planTrips(fromId, toId, passengerRoutes);
  
  const enriched = plans.map(p => ({
    totalMinutes: p.minutes,
    transferCount: p.legs.length - 1,
    legs: p.legs.map(leg => ({
      routeId: leg.route.id,
      routeCode: leg.route.code,
      routeTitle: leg.route.title,
      routeTitleEn: leg.route.titleEn,
      agency: leg.route.agency,
      minutes: leg.minutes,
      fromStop: {
        id: leg.from,
        name: stopNames[leg.from] || `Stop #${leg.from}`,
        english: stopEnglish[leg.from] || null
      },
      toStop: {
        id: leg.to,
        name: stopNames[leg.to] || `Stop #${leg.to}`,
        english: stopEnglish[leg.to] || null
      },
      stopsCount: leg.stops.length,
      stopSequence: leg.stops.map(s => ({
        id: s,
        name: stopNames[s] || `Stop #${s}`,
        english: stopEnglish[s] || null
      }))
    }))
  }));

  return NextResponse.json({
    from: { id: fromId, name: stopNames[fromId], english: stopEnglish[fromId] },
    to: { id: toId, name: stopNames[toId], english: stopEnglish[toId] },
    plans: enriched
  });
}
