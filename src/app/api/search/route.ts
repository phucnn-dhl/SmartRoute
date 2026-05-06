import { NextResponse } from 'next/server';
import { createReadStream } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import readline from 'readline';

interface SearchFeature {
  type: 'Feature';
  geometry: { coordinates: [number, number] };
  properties: {
    type: string;
    name: string;
    street?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    country?: string;
    osm_key: string;
    osm_value: string;
    osm_type: string;
    osm_id: string;
  };
}

interface SearchResponse {
  features: SearchFeature[];
  source: 'photon' | 'local';
}

interface LocalStreetEntry {
  streetName: string;
  normalizedName: string;
  lon: number;
  lat: number;
}

let localStreetIndexPromise: Promise<LocalStreetEntry[]> | null = null;

const LOCAL_SEARCH_LIMIT = 8;
const PHOTON_API = 'https://photon.komoot.io/api/';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') || '').trim();
  const lon = searchParams.get('lon');
  const lat = searchParams.get('lat');

  if (!query) {
    return NextResponse.json({ features: [], source: 'local' } satisfies SearchResponse);
  }

  try {
    const photonResults = await fetchPhotonResults(query, lon, lat);
    if (photonResults.length > 0) {
      return NextResponse.json({ features: photonResults, source: 'photon' } satisfies SearchResponse);
    }
  } catch (error) {
    console.error('Photon search failed, falling back to local data:', error);
  }

  const localResults = await searchLocalStreetIndex(query);
  return NextResponse.json({ features: localResults, source: 'local' } satisfies SearchResponse);
}

async function fetchPhotonResults(query: string, lon: string | null, lat: string | null): Promise<SearchFeature[]> {
  const url = new URL(PHOTON_API);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(LOCAL_SEARCH_LIMIT));
  url.searchParams.set('lang', 'default');
  url.searchParams.set('zoom', '12');

  if (lon && lat) {
    url.searchParams.set('lon', lon);
    url.searchParams.set('lat', lat);
  }

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'SmartRoute/1.0',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Photon returned ${res.status}`);
  }

  const data = await res.json();
  return Array.isArray(data?.features) ? data.features : [];
}

async function searchLocalStreetIndex(query: string): Promise<SearchFeature[]> {
  const normalizedQuery = normalizeVietnamese(query);
  if (!normalizedQuery) {
    return [];
  }

  const index = await getLocalStreetIndex();
  const ranked = index
    .map((entry) => ({ entry, score: scoreStreetMatch(entry.normalizedName, normalizedQuery) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.streetName.localeCompare(b.entry.streetName))
    .slice(0, LOCAL_SEARCH_LIMIT);

  return ranked.map(({ entry }, indexPosition) => ({
    type: 'Feature',
    geometry: { coordinates: [entry.lon, entry.lat] },
    properties: {
      type: 'street',
      name: entry.streetName,
      street: entry.streetName,
      city: 'Ho Chi Minh City',
      state: 'Ho Chi Minh City',
      country: 'Vietnam',
      osm_key: 'highway',
      osm_value: 'road',
      osm_type: 'W',
      osm_id: `local-${indexPosition}-${entry.normalizedName}`,
    },
  }));
}

async function getLocalStreetIndex(): Promise<LocalStreetEntry[]> {
  if (!localStreetIndexPromise) {
    localStreetIndexPromise = buildLocalStreetIndex();
  }
  return localStreetIndexPromise;
}

async function buildLocalStreetIndex(): Promise<LocalStreetEntry[]> {
  const csvPath = resolveLocalCsvPath();
  const stream = createReadStream(csvPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const streets = new Map<string, LocalStreetEntry>();

  let isFirstLine = true;
  for await (const line of rl) {
    if (isFirstLine) {
      isFirstLine = false;
      continue;
    }

    const cols = line.split(',');
    if (cols.length < 18) {
      continue;
    }

    const streetName = cols[12]?.trim();
    const lonStart = Number(cols[14]);
    const latStart = Number(cols[15]);
    const lonEnd = Number(cols[16]);
    const latEnd = Number(cols[17]);

    if (!streetName || !Number.isFinite(lonStart) || !Number.isFinite(latStart) || !Number.isFinite(lonEnd) || !Number.isFinite(latEnd)) {
      continue;
    }

    const normalizedName = normalizeVietnamese(streetName);
    if (!normalizedName || streets.has(normalizedName)) {
      continue;
    }

    streets.set(normalizedName, {
      streetName,
      normalizedName,
      lon: (lonStart + lonEnd) / 2,
      lat: (latStart + latEnd) / 2,
    });
  }

  return Array.from(streets.values());
}

function resolveLocalCsvPath() {
  const candidatePaths = [
    path.join(process.cwd(), '..', 'traffic-api', 'data', 'research_train.csv'),
    path.join(process.cwd(), 'public', 'data', 'research_train.csv'),
  ];

  for (const candidate of candidatePaths) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('No local search dataset found');
}

function normalizeVietnamese(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreStreetMatch(candidate: string, query: string) {
  if (candidate === query) return 1000;
  if (candidate.startsWith(query)) return 700 - Math.max(0, candidate.length - query.length);
  if (candidate.includes(query)) return 500 - Math.max(0, candidate.length - query.length);

  const queryParts = query.split(' ').filter(Boolean);
  if (queryParts.length === 0) return 0;

  const matchedParts = queryParts.filter((part) => candidate.includes(part)).length;
  if (matchedParts === queryParts.length) {
    return 300 - Math.max(0, candidate.length - query.length);
  }

  return 0;
}
