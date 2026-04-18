import {
  ApiError,
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

const GRAPH_HOPPER_PROFILES: Record<RouteProfile, string> = {
  car: 'car',
  bike: 'bike',
  walk: 'foot',
};

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

  const url = buildGraphHopperUrl({
    origin: params.origin,
    destination: params.destination,
    profile: params.profile,
    includeSteps: params.includeSteps,
    apiKey,
  });

  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = (await response.json()) as GraphHopperResponse;
  if (!response.ok) {
    throw mapGraphHopperError(response.status, payload);
  }

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
  // GraphHopper returns [minLon, minLat, maxLon, maxLat] — already the correct order
  return bbox;
}

function normalizeInstructions(instructions: GraphHopperInstruction[] | undefined): RouteStep[] {
  return (instructions || []).map((instruction) => ({
    instruction: instruction.text || 'Continue',
    distanceMeters: Math.round(instruction.distance || 0),
    durationSeconds: instruction.time != null ? Math.round(instruction.time / 1000) : undefined,
    streetName: instruction.street_name || undefined,
  }));
}
