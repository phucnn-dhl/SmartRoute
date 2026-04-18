'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Coordinate,
  DepartureRecommendation,
  DepartureRecommendationResponse,
  DepartureOffsetMinutes,
  PickingMode,
  PredictionAnalysis,
  RouteData,
  RouteResponse,
} from './routing';

interface UseRouteStateResult {
  origin: Coordinate | null;
  destination: Coordinate | null;
  route: RouteData | null;
  predictionAnalysis: PredictionAnalysis | null;
  departureRecommendation: DepartureRecommendation | null;
  pickingMode: PickingMode;
  routeLoading: boolean;
  recommendationLoading: boolean;
  routeError: string | null;
  canRequestRoute: boolean;
  beginPicking: (mode: Exclude<PickingMode, null>) => void;
  cancelPicking: () => void;
  setPoint: (mode: Exclude<PickingMode, null>, coordinate: Coordinate) => void;
  requestRoute: (params: { departureOffsetMinutes: DepartureOffsetMinutes; targetHour?: number; targetWeekday?: number }) => Promise<void>;
  clearRoute: () => void;
}

export function useRouteState(): UseRouteStateResult {
  const [origin, setOrigin] = useState<Coordinate | null>(null);
  const [destination, setDestination] = useState<Coordinate | null>(null);
  const [route, setRoute] = useState<RouteData | null>(null);
  const [predictionAnalysis, setPredictionAnalysis] = useState<PredictionAnalysis | null>(null);
  const [departureRecommendation, setDepartureRecommendation] = useState<DepartureRecommendation | null>(null);
  const [pickingMode, setPickingMode] = useState<PickingMode>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const beginPicking = useCallback((mode: Exclude<PickingMode, null>) => {
    setPickingMode(mode);
    setRouteError(null);
  }, []);

  const cancelPicking = useCallback(() => {
    setPickingMode(null);
  }, []);

  const setPoint = useCallback((mode: Exclude<PickingMode, null>, coordinate: Coordinate) => {
    if (mode === 'origin') {
      setOrigin(coordinate);
    } else {
      setDestination(coordinate);
    }

    setPickingMode(null);
    setRoute(null);
    setPredictionAnalysis(null);
    setDepartureRecommendation(null);
    setRouteError(null);
  }, []);

  const clearRoute = useCallback(() => {
    setOrigin(null);
    setDestination(null);
    setRoute(null);
    setPredictionAnalysis(null);
    setDepartureRecommendation(null);
    setPickingMode(null);
    setRouteLoading(false);
    setRecommendationLoading(false);
    setRouteError(null);
  }, []);

  const requestDepartureRecommendation = useCallback(async () => {
    if (!origin || !destination) {
      return;
    }

    setDepartureRecommendation(null);
    setRecommendationLoading(true);

    try {
      const response = await fetch('/api/route/recommend-departure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          origin,
          destination,
          profile: 'car',
          candidateOffsets: [0, 15, 30, 60],
          includeSteps: true,
        }),
      });

      const data = (await response.json()) as DepartureRecommendationResponse;
      if (!response.ok || data.status !== 'success') {
        throw new Error(('error' in data ? data.error?.message : null) || 'Failed to build departure recommendation');
      }

      setDepartureRecommendation(data.data);
    } catch (error) {
      console.error('Failed to build departure recommendation:', error);
      setDepartureRecommendation(null);
    } finally {
      setRecommendationLoading(false);
    }
  }, [destination, origin]);

  const requestRoute = useCallback(async (params: { departureOffsetMinutes: DepartureOffsetMinutes; targetHour?: number; targetWeekday?: number }) => {
    if (!origin || !destination) {
      setRouteError('Pick both start and end points first.');
      return;
    }

    setRouteLoading(true);
    setDepartureRecommendation(null);
    setRecommendationLoading(false);
    setRouteError(null);

    try {
      const response = await fetch('/api/route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          origin,
          destination,
          profile: 'car',
          departureOffsetMinutes: params.departureOffsetMinutes,
          targetHour: params.targetHour,
          targetWeekday: params.targetWeekday,
          includeSteps: true,
          includePredictionAnalysis: true,
        }),
      });

      const data = (await response.json()) as RouteResponse;
      if (!response.ok || data.status !== 'success') {
        throw new Error(('error' in data ? data.error?.message : null) || 'Failed to build route');
      }

      setRoute(data.data.route);
      setPredictionAnalysis(data.data.predictionAnalysis || null);
      void requestDepartureRecommendation();
    } catch (error) {
      setRoute(null);
      setPredictionAnalysis(null);
      setDepartureRecommendation(null);
      setRouteError(error instanceof Error ? error.message : 'Failed to build route');
    } finally {
      setRouteLoading(false);
    }
  }, [destination, origin, requestDepartureRecommendation]);

  const canRequestRoute = useMemo(() => {
    return Boolean(origin && destination && !routeLoading);
  }, [destination, origin, routeLoading]);

  return {
    origin,
    destination,
    route,
    predictionAnalysis,
    departureRecommendation,
    pickingMode,
    routeLoading,
    recommendationLoading,
    routeError,
    canRequestRoute,
    beginPicking,
    cancelPicking,
    setPoint,
    requestRoute,
    clearRoute,
  };
}
