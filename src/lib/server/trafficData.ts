import { readFile } from 'fs/promises';
import { join } from 'path';

export interface TrafficSegmentRecord {
  segment_id: number;
  s_lat: number;
  s_lng: number;
  e_lat: number;
  e_lng: number;
  street_name: string;
  street_level: number;
  max_velocity: number;
  length: number;
}

interface Node {
  _id: number;
  long: number;
  lat: number;
}

interface SegmentRaw {
  _id: number;
  s_node_id: number;
  e_node_id: number;
  length: number;
  max_velocity: number;
  street_level: number;
  street_name: string;
}

interface Bounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

let nodesCache: Map<number, Node> | null = null;
let segmentsCache: SegmentRaw[] | null = null;

async function readCSV(filename: string): Promise<string> {
  const csvPath = join(process.cwd(), 'public', 'data', filename);
  return readFile(csvPath, 'utf-8');
}

export async function getTrafficSegmentsWithinBounds(bounds: Bounds) {
  const [nodeMap, segments] = await Promise.all([
    loadNodes(),
    loadSegmentsRaw(),
  ]);

  return segments
    .filter((segment) => isSegmentInBounds(segment, nodeMap, bounds))
    .map((segment) => {
      const startNode = nodeMap.get(segment.s_node_id);
      const endNode = nodeMap.get(segment.e_node_id);

      if (!startNode || !endNode) {
        return null;
      }

      return {
        segment_id: segment._id,
        s_lat: startNode.lat,
        s_lng: startNode.long,
        e_lat: endNode.lat,
        e_lng: endNode.long,
        street_name: segment.street_name,
        street_level: segment.street_level,
        max_velocity: segment.max_velocity,
        length: segment.length,
      } satisfies TrafficSegmentRecord;
    })
    .filter((segment): segment is TrafficSegmentRecord => segment !== null);
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

async function loadNodes(): Promise<Map<number, Node>> {
  if (nodesCache) {
    return nodesCache;
  }

  const csvContent = await readCSV('nodes.csv');
  const lines = csvContent.split('\n');
  const nodeMap = new Map<number, Node>();

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const values = parseCSVLine(lines[i]);
    if (values.length < 3) continue;

    nodeMap.set(parseInt(values[0], 10), {
      _id: parseInt(values[0], 10),
      long: parseFloat(values[1]),
      lat: parseFloat(values[2]),
    });
  }

  nodesCache = nodeMap;
  return nodeMap;
}

async function loadSegmentsRaw(): Promise<SegmentRaw[]> {
  if (segmentsCache) {
    return segmentsCache;
  }

  const csvContent = await readCSV('segments.csv');
  const lines = csvContent.split('\n');
  const segments: SegmentRaw[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const values = parseCSVLine(lines[i]);
    if (values.length < 11) continue;

    segments.push({
      _id: parseInt(values[0], 10),
      s_node_id: parseInt(values[3], 10),
      e_node_id: parseInt(values[4], 10),
      length: parseFloat(values[5]),
      max_velocity: parseFloat(values[7]),
      street_level: parseInt(values[8], 10),
      street_name: values[9],
    });
  }

  segmentsCache = segments;
  return segments;
}

function isSegmentInBounds(segment: SegmentRaw, nodes: Map<number, Node>, bounds: Bounds) {
  const startNode = nodes.get(segment.s_node_id);
  const endNode = nodes.get(segment.e_node_id);

  if (!startNode || !endNode) {
    return false;
  }

  const startInBounds =
    startNode.lat >= bounds.minLat &&
    startNode.lat <= bounds.maxLat &&
    startNode.long >= bounds.minLng &&
    startNode.long <= bounds.maxLng;

  const endInBounds =
    endNode.lat >= bounds.minLat &&
    endNode.lat <= bounds.maxLat &&
    endNode.long >= bounds.minLng &&
    endNode.long <= bounds.maxLng;

  return startInBounds || endInBounds;
}
