import { NextResponse } from 'next/server';
import { passengerRoutes, variantRoutes, canonicalStop, routePoints } from '@/lib/network.mjs';

export async function GET() {
  const routes = [...passengerRoutes, ...variantRoutes].map(route => ({
    ...route,
    stops: (route.stops || []).map(canonicalStop),
    points: routePoints[route.id] ?? []
  }));

  return NextResponse.json(routes, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
