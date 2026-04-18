import { LonLat, PhotonFeature, SearchOption } from './types';

const PHOTON_API = 'https://photon.komoot.io/api/';

let abortController: AbortController | null = null;

/** Fetch geocoding results from Photon API */
export async function fetchPhotonResults(
  query: string,
  mapCenter: LonLat,
): Promise<SearchOption[]> {
  if (abortController) abortController.abort();

  // Shorter debounce for faster feel
  await new Promise((r) => setTimeout(r, 250));

  abortController = new AbortController();

  try {
    const [lon, lat] = mapCenter;
    const url = `${PHOTON_API}?q=${encodeURIComponent(query)}&lon=${lon}&lat=${lat}&zoom=12&lang=default&limit=8`;
    const res = await fetch(url, { signal: abortController.signal });
    if (!res.ok) throw new Error(`Photon: ${res.status}`);

    const data = await res.json();
    return (data.features || []).map((f: PhotonFeature) => ({
      type: 'geocoder' as const,
      feature: f,
      label: f.properties.name || f.properties.street || f.properties.city || 'Unknown',
      sublabel: buildAddress(f.properties),
    }));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return [];
    throw e;
  }
}

/** Parse coordinate input like "10.762, 106.660" */
export function parseCoords(input: string): SearchOption | null {
  const m = input.trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return {
    type: 'coords',
    coords: { center: [lon, lat], label: `${lat.toFixed(4)}, ${lon.toFixed(4)}` },
    label: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    sublabel: 'Tọa độ',
  };
}

/** Build display address */
export function buildAddress(props: PhotonFeature['properties']): string {
  const parts = [props.street, props.district, props.city, props.county, props.state]
    .filter((x) => x && x !== undefined);
  return [...new Set(parts)].join(', ');
}

/** Get district group name */
export function getDistrict(props: PhotonFeature['properties']): string {
  let d = props.district || props.city || props.county || 'Khác';
  if (d.includes('Thành phố')) d = d.replace('Thành phố', 'TP.');
  return d;
}

/** Distance between two points in km */
export function distanceKm(a: LonLat, b: LonLat): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  return R * 2 * Math.asin(Math.sqrt(
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2,
  ));
}

/** Human distance string */
export function humanDist(a: LonLat, b: LonLat): string {
  const km = distanceKm(a, b);
  if (km < 1) return `${Math.round(km * 1000)}m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
