import { NextResponse } from 'next/server';
import {
  Coordinate,
  DepartureOffsetMinutes,
  RouteProfile,
  RouteRequest,
  RouteResponse,
} from '@/lib/routing';
import { getGraphHopperRoute, RouteApiError } from '@/lib/server/graphhopper';
import { analyzeRoutePrediction } from '@/lib/server/routePredictionAnalysis';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<RouteRequest>;
    const {
      origin,
      destination,
      profile = 'car',
      departureOffsetMinutes = 0,
      targetHour,
      targetWeekday,
      includeSteps = true,
      includePredictionAnalysis = false,
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
        } satisfies RouteResponse,
        { status: 400 }
      );
    }

    const route = await getGraphHopperRoute({
      origin,
      destination,
      profile,
      includeSteps,
    });

    const predictionAnalysis = includePredictionAnalysis
      ? await analyzeRoutePrediction(route, departureOffsetMinutes, targetHour, targetWeekday)
      : undefined;

    return NextResponse.json({
      status: 'success',
      data: {
        route,
        predictionAnalysis,
      },
    } satisfies RouteResponse);
  } catch (error) {
    console.error('Error building route:', error);

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
        } satisfies RouteResponse,
        { status: statusCode }
      );
    }

    return NextResponse.json(
      {
        status: 'error',
        error: {
          code: 'unknown',
          message: 'Failed to build route.',
        },
      } satisfies RouteResponse,
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
