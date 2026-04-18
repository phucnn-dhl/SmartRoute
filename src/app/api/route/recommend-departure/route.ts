import { NextResponse } from 'next/server';
import {
  Coordinate,
  DepartureOffsetMinutes,
  DepartureRecommendationRequest,
  DepartureRecommendationResponse,
  RouteProfile,
} from '@/lib/routing';
import { getGraphHopperRoute, RouteApiError } from '@/lib/server/graphhopper';
import { buildDepartureRecommendation } from '@/lib/server/departureRecommendation';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<DepartureRecommendationRequest>;
    const {
      origin,
      destination,
      profile = 'car',
      candidateOffsets = [0, 15, 30, 60],
      includeSteps = true,
    } = body;

    if (
      !isCoordinate(origin) ||
      !isCoordinate(destination) ||
      !isRouteProfile(profile) ||
      !isValidOffsets(candidateOffsets)
    ) {
      return NextResponse.json(
        {
          status: 'error',
          error: {
            code: 'invalid_input',
            message: 'Origin, destination, profile, or candidate offsets are invalid.',
          },
        } satisfies DepartureRecommendationResponse,
        { status: 400 }
      );
    }

    const route = await getGraphHopperRoute({
      origin,
      destination,
      profile,
      includeSteps,
    });

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

    if (error instanceof RouteApiError) {
      const statusCode =
        error.code === 'invalid_input' ? 400 :
        error.code === 'no_route' ? 404 :
        error.code === 'timeout' ? 504 :
        502;

      return NextResponse.json(
        {
          status: 'error',
          error: {
            code: error.code,
            message: error.message,
          },
        } satisfies DepartureRecommendationResponse,
        { status: statusCode }
      );
    }

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

function isCoordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  );
}

function isRouteProfile(value: unknown): value is RouteProfile {
  return value === 'car' || value === 'bike' || value === 'walk';
}

function isDepartureOffset(value: unknown): value is DepartureOffsetMinutes {
  return value === 0 || value === 15 || value === 30 || value === 60;
}

function isValidOffsets(value: unknown): value is DepartureOffsetMinutes[] {
  return Array.isArray(value) && value.length > 0 && value.every(isDepartureOffset);
}
