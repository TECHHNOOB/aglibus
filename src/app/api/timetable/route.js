import { NextResponse } from 'next/server';
import { passengerRoutes, observedSchedule } from '@/lib/network.mjs';
import { gtfsRouteScheduleSummary } from '@/lib/gtfs.mjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    timezone: 'Asia/Kolkata',
    observations: observedSchedule,
    estimates: passengerRoutes.map(({ id, code, headway, minutes, title, titleEn, km }) => ({
      routeId: id,
      code,
      title,
      titleEn,
      km,
      headway,
      travelMinutes: minutes,
      gtfs: code ? gtfsRouteScheduleSummary(code) : null
    }))
  }, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
