import { NextResponse } from 'next/server';
import {
  DepartureOffsetMinutes,
  DepartureRecommendationRequest,
  DepartureRecommendationResponse,
  RouteData,
} from '@/lib/routing';
import { buildDepartureRecommendation } from '@/lib/server/departureRecommendation';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<DepartureRecommendationRequest>;
    const {
      route,
      candidateOffsets = [0, 15, 30, 60],
    } = body;

    if (!isRouteData(route) || !isValidOffsets(candidateOffsets)) {
      return NextResponse.json(
        {
          status: 'error',
          error: {
            code: 'invalid_input',
            message: 'Route or candidate offsets are invalid.',
          },
        } satisfies DepartureRecommendationResponse,
        { status: 400 }
      );
    }

    const recommendation = await buildDepartureRecommendation({
      route,
      candidateOffsets,
    });

    return NextResponse.json({
      status: 'success',
      data: recommendation,
    } satisfies DepartureRecommendationResponse);
  } catch (error) {
    console.error('Error building departure recommendation:', error);

    return NextResponse.json(
      {
        status: 'error',
        error: {
          code: 'unknown',
          message: 'Failed to build departure recommendation.',
        },
      } satisfies DepartureRecommendationResponse,
      { status: 500 }
    );
  }
}

function isRouteData(value: unknown): value is RouteData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'provider' in value &&
    'profile' in value &&
    'distanceMeters' in value &&
    'durationSeconds' in value &&
    'geometry' in value &&
    'bbox' in value
  );
}

function isDepartureOffset(value: unknown): value is DepartureOffsetMinutes {
  return value === 0 || value === 15 || value === 30 || value === 60;
}

function isValidOffsets(value: unknown): value is DepartureOffsetMinutes[] {
  return Array.isArray(value) && value.length > 0 && value.every(isDepartureOffset);
}
