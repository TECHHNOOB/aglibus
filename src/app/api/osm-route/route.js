import { NextResponse } from 'next/server';
import { fetchOsrmGeometry, isWithinUdaipur } from '@/lib/udaipur-geo.mjs';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const profile = body?.profile === 'driving' ? 'driving' : 'foot';
    const points = Array.isArray(body?.points) ? body.points : [];

    const valid = points.filter(
      p => Array.isArray(p) && p.length === 2 && isWithinUdaipur(Number(p[0]), Number(p[1]))
    );
    if (valid.length < 2) {
      return NextResponse.json({ coords: valid, fallback: true });
    }

    const osrm = await fetchOsrmGeometry(valid, profile);
    if (!osrm) {
      return NextResponse.json({ coords: valid, fallback: true });
    }

    return NextResponse.json({
      coords: osrm.coords,
      distanceMeters: osrm.distanceMeters,
      durationSeconds: osrm.durationSeconds,
      fallback: false,
    });
  } catch {
    return NextResponse.json({ coords: [], fallback: true });
  }
}
