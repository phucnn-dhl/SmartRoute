export { SearchBox } from './SearchBox';
export { SearchLocationMarker } from './SearchLocationMarker';
export type { LonLat, SearchOption } from './types';

import type { LonLat } from './types';
export interface RoutePoint {
  coords: LonLat;
  label: string;
}
