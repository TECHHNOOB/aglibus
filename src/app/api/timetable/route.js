import { NextResponse } from 'next/server';
import { passengerRoutes, observedSchedule } from '@/lib/network.mjs';

export async function GET() {
  return NextResponse.json({
    timezone: 'Asia/Kolkata',
    observations: observedSchedule,
    estimates: passengerRoutes.map(({ id, headway, minutes, title, titleEn, km }) => ({
      routeId: id,
      title,
      titleEn,
      km,
      headway,
      travelMinutes: minutes
    }))
  }, {
    headers: {
      'Cache-Control': 'public, max-age=1800',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
