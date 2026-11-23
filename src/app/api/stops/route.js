import { NextResponse } from 'next/server';
import { passengerRoutes, canonicalStop, stopNames, stopEnglish, stopLocations } from '@/lib/network.mjs';

export async function GET() {
  const stopIdSet = new Set(passengerRoutes.flatMap(route => (route.stops || []).map(canonicalStop)));
  const stops = [...stopIdSet].map(id => ({
    id,
    name: stopNames[id] || `Stop #${id}`,
    english: stopEnglish[id] ?? null,
    coordinates: stopLocations[id] ?? null
  }));

  return NextResponse.json(stops, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
