import { NextResponse } from 'next/server';
import {
  AlternativeRouteRequest,
  AlternativeRouteResponse,
  Coordinate,
  DepartureOffsetMinutes,
  RouteProfile,
} from '@/lib/routing';
import { RouteApiError } from '@/lib/server/graphhopper';
import { buildRankedAlternativeRoutes } from '@/lib/server/routeAlternatives';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<AlternativeRouteRequest>;
    const {
      origin,
      destination,
      profile = 'car',
      departureOffsetMinutes = 0,
      targetHour,
      targetWeekday,
      includeSteps = true,
      alternativeRoute,
    } = body;

    if (
      !isCoordinate(origin) ||
      !isCoordinate(destination) ||
      !isRouteProfile(profile) ||
      !isDepartureOffset(departureOffsetMinutes)
    ) {
      return NextResponse.json(
        {
          status: 'error',
          error: {
            code: 'invalid_input',
            message: 'Origin, destination, profile, or departure offset is invalid.',
          },
        } satisfies AlternativeRouteResponse,
        { status: 400 },
      );
    }

    const rankedRoutes = await buildRankedAlternativeRoutes({
      origin,
      destination,
      profile,
      includeSteps,
      departureOffsetMinutes,
      targetHour,
      targetWeekday,
      alternativeRoute,
    });

    return NextResponse.json({
      status: 'success',
      data: rankedRoutes,
    } satisfies AlternativeRouteResponse);
  } catch (error) {
    console.error('Error building alternative routes:', error);

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
        } satisfies AlternativeRouteResponse,
        { status: statusCode },
      );
    }

    return NextResponse.json(
      {
        status: 'error',
        error: {
          code: 'unknown',
          message: 'Failed to build alternative routes.',
        },
      } satisfies AlternativeRouteResponse,
      { status: 500 },
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
