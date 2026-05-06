import {
  ApiError,
  AlternativeRouteOptions,
  Coordinate,
  RouteData,
  RouteProfile,
  RouteStep,
} from '@/lib/routing';

interface GraphHopperInstruction {
  text?: string;
  distance?: number;
  time?: number;
  street_name?: string;
}

interface GraphHopperPath {
  distance?: number;
  time?: number;
  bbox?: [number, number, number, number];
  points?: GeoJSON.LineString;
  instructions?: GraphHopperInstruction[];
}

interface GraphHopperResponse {
  paths?: GraphHopperPath[];
  message?: string;
  hints?: { message?: string }[];
}

const GRAPH_HOPPER_BASE_URL = 'https://graphhopper.com/api/1/route';
const ROUTE_CACHE_TTL_MS = 30 * 1000;

const GRAPH_HOPPER_PROFILES: Record<RouteProfile, string> = {
  car: 'car',
  bike: 'bike',
  walk: 'foot',
};

type CachedGraphHopperPayload = {
  expiresAt: number;
  payload: GraphHopperResponse;
};

const routeCache = new Map<string, CachedGraphHopperPayload>();
const inFlightRequests = new Map<string, Promise<GraphHopperResponse>>();

export class RouteApiError extends Error {
  code: ApiError['code'];

  constructor(code: ApiError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export async function getGraphHopperRoute(params: {
  origin: Coordinate;
  destination: Coordinate;
  profile: RouteProfile;
  includeSteps: boolean;
}): Promise<RouteData> {
  const apiKey = process.env.GRAPHHOPPER_API_KEY;
  if (!apiKey) {
    throw new RouteApiError('provider_error', 'Missing GRAPHHOPPER_API_KEY on the server.');
  }

  const payload = await fetchGraphHopperRoute({
    origin: params.origin,
    destination: params.destination,
    profile: params.profile,
    includeSteps: params.includeSteps,
    apiKey,
  });

  const path = payload.paths?.[0];
  if (!path?.points || path.distance == null || path.time == null || !path.bbox) {
    throw new RouteApiError('no_route', 'GraphHopper did not return a usable route.');
  }

  return {
    provider: 'graphhopper',
    profile: params.profile,
    distanceMeters: Math.round(path.distance),
    durationSeconds: Math.round(path.time / 1000),
    geometry: path.points,
    bbox: normalizeBbox(path.bbox),
    steps: params.includeSteps ? normalizeInstructions(path.instructions) : undefined,
  };
}

export async function getGraphHopperAlternativeRoutes(params: {
  origin: Coordinate;
  destination: Coordinate;
  profile: RouteProfile;
  includeSteps: boolean;
  alternativeRoute?: AlternativeRouteOptions;
}): Promise<RouteData[]> {
  const apiKey = process.env.GRAPHHOPPER_API_KEY;
  if (!apiKey) {
    throw new RouteApiError('provider_error', 'Missing GRAPHHOPPER_API_KEY on the server.');
  }

  const payload = await fetchGraphHopperRoute({
    origin: params.origin,
    destination: params.destination,
    profile: params.profile,
    includeSteps: params.includeSteps,
    apiKey,
    alternativeRoute: params.alternativeRoute,
  });

  const routes = (payload.paths || [])
    .map((path) => normalizeGraphHopperPath(path, params.profile, params.includeSteps))
    .filter((route): route is RouteData => route !== null);

  if (routes.length === 0) {
    throw new RouteApiError('no_route', 'GraphHopper did not return a usable route.');
  }

  return routes;
}

function buildGraphHopperUrl(params: {
  origin: Coordinate;
  destination: Coordinate;
  profile: RouteProfile;
  includeSteps: boolean;
  apiKey: string;
}) {
  const searchParams = new URLSearchParams();
  searchParams.append('point', `${params.origin[1]},${params.origin[0]}`);
  searchParams.append('point', `${params.destination[1]},${params.destination[0]}`);
  searchParams.set('vehicle', GRAPH_HOPPER_PROFILES[params.profile]);
  searchParams.set('type', 'json');
  searchParams.set('points_encoded', 'false');
  searchParams.set('instructions', String(params.includeSteps));
  searchParams.set('snap_prevention', 'ferry');
  searchParams.set('key', params.apiKey);

  return `${GRAPH_HOPPER_BASE_URL}?${searchParams.toString()}`;
}

async function fetchGraphHopperRoute(params: {
  origin: Coordinate;
  destination: Coordinate;
  profile: RouteProfile;
  includeSteps: boolean;
  apiKey: string;
  alternativeRoute?: AlternativeRouteOptions;
}) {
  const useAlternatives = params.alternativeRoute?.enabled === true;
  const url = useAlternatives
    ? `${GRAPH_HOPPER_BASE_URL}?key=${encodeURIComponent(params.apiKey)}`
    : buildGraphHopperUrl({
        origin: params.origin,
        destination: params.destination,
        profile: params.profile,
        includeSteps: params.includeSteps,
        apiKey: params.apiKey,
      });
  const cacheKey = buildRouteCacheKey(params, useAlternatives);
  const cachedPayload = getCachedRoutePayload(cacheKey);
  if (cachedPayload) {
    return cachedPayload;
  }

  const existingRequest = inFlightRequests.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }

  const requestPromise = (async () => {
    const response = await fetch(url, {
      method: useAlternatives ? 'POST' : 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(useAlternatives ? { 'Content-Type': 'application/json' } : {}),
      },
      body: useAlternatives
        ? JSON.stringify(buildAlternativeRouteRequestBody(params))
        : undefined,
    });

    const payload = (await response.json()) as GraphHopperResponse;
    if (!response.ok) {
      throw mapGraphHopperError(response.status, payload);
    }

    setCachedRoutePayload(cacheKey, payload);
    return payload;
  })();

  inFlightRequests.set(cacheKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

function buildAlternativeRouteRequestBody(params: {
  origin: Coordinate;
  destination: Coordinate;
  profile: RouteProfile;
  includeSteps: boolean;
  alternativeRoute?: AlternativeRouteOptions;
}) {
  return {
    profile: GRAPH_HOPPER_PROFILES[params.profile],
    points: [
      [params.origin[0], params.origin[1]],
      [params.destination[0], params.destination[1]],
    ],
    instructions: params.includeSteps,
    points_encoded: false,
    snap_preventions: ['ferry'],
    algorithm: 'alternative_route',
    'alternative_route.max_paths': clampAlternativeMaxPaths(params.alternativeRoute?.maxPaths),
    'alternative_route.max_weight_factor': params.alternativeRoute?.maxWeightFactor ?? 1.4,
    'alternative_route.max_share_factor': params.alternativeRoute?.maxShareFactor ?? 0.6,
  };
}

function clampAlternativeMaxPaths(value?: number) {
  if (value == null || Number.isNaN(value)) return 3;
  return Math.max(1, Math.min(3, Math.round(value)));
}

function buildRouteCacheKey(
  params: {
    origin: Coordinate;
    destination: Coordinate;
    profile: RouteProfile;
    includeSteps: boolean;
    alternativeRoute?: AlternativeRouteOptions;
  },
  useAlternatives: boolean,
) {
  const base = [
    useAlternatives ? 'alternatives' : 'route',
    params.profile,
    `${params.origin[0]},${params.origin[1]}`,
    `${params.destination[0]},${params.destination[1]}`,
    params.includeSteps ? 'steps' : 'no-steps',
  ];

  if (!useAlternatives) {
    return base.join('|');
  }

  return [
    ...base,
    String(clampAlternativeMaxPaths(params.alternativeRoute?.maxPaths)),
    String(params.alternativeRoute?.maxWeightFactor ?? 1.4),
    String(params.alternativeRoute?.maxShareFactor ?? 0.6),
  ].join('|');
}

function getCachedRoutePayload(cacheKey: string) {
  const cached = routeCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    routeCache.delete(cacheKey);
    return null;
  }

  return cached.payload;
}

function setCachedRoutePayload(cacheKey: string, payload: GraphHopperResponse) {
  routeCache.set(cacheKey, {
    expiresAt: Date.now() + ROUTE_CACHE_TTL_MS,
    payload,
  });
}

function mapGraphHopperError(status: number, payload: GraphHopperResponse) {
  const message =
    payload.message ||
    payload.hints?.[0]?.message ||
    'Routing provider request failed.';

  if (status === 400 || status === 422) {
    return new RouteApiError('no_route', message);
  }

  if (status === 408 || status === 504) {
    return new RouteApiError('timeout', message);
  }

  return new RouteApiError('provider_error', message);
}

function normalizeBbox(bbox: [number, number, number, number]): [number, number, number, number] {
  return bbox;
}

function normalizeGraphHopperPath(
  path: GraphHopperPath,
  profile: RouteProfile,
  includeSteps: boolean,
): RouteData | null {
  if (!path.points || path.distance == null || path.time == null || !path.bbox) {
    return null;
  }

  return {
    provider: 'graphhopper',
    profile,
    distanceMeters: Math.round(path.distance),
    durationSeconds: Math.round(path.time / 1000),
    geometry: path.points,
    bbox: normalizeBbox(path.bbox),
    steps: includeSteps ? normalizeInstructions(path.instructions) : undefined,
  };
}

function normalizeInstructions(instructions: GraphHopperInstruction[] | undefined): RouteStep[] {
  return (instructions || []).map((instruction) => ({
    instruction: instruction.text || 'Continue',
    distanceMeters: Math.round(instruction.distance || 0),
    durationSeconds: instruction.time != null ? Math.round(instruction.time / 1000) : undefined,
    streetName: instruction.street_name || undefined,
  }));
}
