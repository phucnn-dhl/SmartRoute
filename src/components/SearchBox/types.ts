export type LonLat = [number, number]; // [longitude, latitude]

export interface PhotonProperties {
  type: string;
  place?: string;
  street?: string;
  housenumber?: string;
  streetnumber?: string;
  city?: string;
  district?: string;
  county?: string;
  state?: string;
  locality?: string;
  postcode?: string;
  country?: string;
  countrycode?: string;
  osm_key: string;
  osm_value: string;
  osm_type: string;
  osm_id: string;
  name: string;
  extent?: [number, number, number, number];
}

export interface PhotonFeature {
  type: 'Feature';
  properties: PhotonProperties;
  geometry: { coordinates: LonLat };
}

export interface SearchOption {
  type: 'geocoder' | 'coords' | 'loader';
  feature?: PhotonFeature;
  coords?: { center: LonLat; label: string };
  label: string;
  sublabel: string;
}
