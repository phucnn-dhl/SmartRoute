'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  AlternativeRouteResponse,
  Coordinate,
  DepartureRecommendation,
  DepartureRecommendationResponse,
  DepartureOffsetMinutes,
  PickingMode,
  RankedRoute,
  RouteData,
  PredictionAnalysis,
} from './routing';

interface UseRouteStateResult {
  origin: Coordinate | null;
  destination: Coordinate | null;
  route: RouteData | null;
  predictionAnalysis: PredictionAnalysis | null;
  departureRecommendation: DepartureRecommendation | null;
  alternativeRoutes: RankedRoute[];
  selectedRouteId: string | null;
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
  selectRoute: (id: string) => void;
}

export function useRouteState(): UseRouteStateResult {
  const [origin, setOrigin] = useState<Coordinate | null>(null);
  const [destination, setDestination] = useState<Coordinate | null>(null);
  const [alternativeRoutes, setAlternativeRoutes] = useState<RankedRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [departureRecommendation, setDepartureRecommendation] = useState<DepartureRecommendation | null>(null);
  const [pickingMode, setPickingMode] = useState<PickingMode>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const selectedRoute = useMemo<RankedRoute | null>(() => {
    if (!selectedRouteId || alternativeRoutes.length === 0) return null;
    return alternativeRoutes.find((r) => r.id === selectedRouteId) ?? alternativeRoutes[0] ?? null;
  }, [alternativeRoutes, selectedRouteId]);

  const route = useMemo<RouteData | null>(() => selectedRoute?.route ?? null, [selectedRoute]);
  const predictionAnalysis = useMemo<PredictionAnalysis | null>(() => selectedRoute?.analysis ?? null, [selectedRoute]);

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
    setAlternativeRoutes([]);
    setSelectedRouteId(null);
    setDepartureRecommendation(null);
    setRouteError(null);
  }, []);

  const clearRoute = useCallback(() => {
    setOrigin(null);
    setDestination(null);
    setAlternativeRoutes([]);
    setSelectedRouteId(null);
    setDepartureRecommendation(null);
    setPickingMode(null);
    setRouteLoading(false);
    setRecommendationLoading(false);
    setRouteError(null);
  }, []);

  const requestDepartureRecommendation = useCallback(async (routeData: RouteData) => {
    setDepartureRecommendation(null);
    setRecommendationLoading(true);

    try {
      const response = await fetch('/api/route/recommend-departure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          route: routeData,
          candidateOffsets: [0, 15, 30, 60],
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
  }, []);

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
      const response = await fetch('/api/route/alternatives', {
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
          alternativeRoute: {
            enabled: true,
            maxPaths: 3,
            maxWeightFactor: 1.4,
            maxShareFactor: 0.6,
          },
        }),
      });

      const data = (await response.json()) as AlternativeRouteResponse;
      if (!response.ok || data.status !== 'success') {
        throw new Error(('error' in data ? data.error?.message : null) || 'Failed to build route');
      }

      const routes = data.data.routes;
      setAlternativeRoutes(routes);
      setSelectedRouteId(data.data.recommendedRouteId || routes[0]?.id || null);

      if (routes.length > 0) {
        void requestDepartureRecommendation(routes[0].route);
      }
    } catch (error) {
      setDepartureRecommendation(null);
      setRouteError(error instanceof Error ? error.message : 'Failed to build route');
    } finally {
      setRouteLoading(false);
    }
  }, [destination, origin, requestDepartureRecommendation]);

  const selectRoute = useCallback((id: string) => {
    setSelectedRouteId(id);
  }, []);

  const canRequestRoute = useMemo(() => {
    return Boolean(origin && destination && !routeLoading);
  }, [destination, origin, routeLoading]);

  return {
    origin,
    destination,
    route,
    predictionAnalysis,
    departureRecommendation,
    alternativeRoutes,
    selectedRouteId,
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
    selectRoute,
  };
}
