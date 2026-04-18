import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export interface TrafficSegmentHCMC {
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
  street_id: number;
  max_velocity: number;
  street_level: number;
  street_name: string;
  street_type: string;
}

// Cache for nodes data
let nodesCache: Map<number, Node> | null = null;
let segmentsCache: SegmentRaw[] | null = null;

/**
 * Parse CSV line
 */
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

async function readCSV(filename: string): Promise<string> {
  const csvPath = join(process.cwd(), 'public', 'data', filename);
  return readFile(csvPath, 'utf-8');
}

/**
 * Load nodes from CSV (cached)
 */
async function loadNodes(): Promise<Map<number, Node>> {
  if (nodesCache) {
    return nodesCache;
  }

  try {
    const csvContent = await readCSV('nodes.csv');

    const lines = csvContent.split('\n');
    const nodeMap = new Map<number, Node>();

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;

      const values = parseCSVLine(lines[i]);
      if (values.length < 3) continue;

      const node: Node = {
        _id: parseInt(values[0]),
        long: parseFloat(values[1]),
        lat: parseFloat(values[2]),
      };

      nodeMap.set(node._id, node);
    }

    nodesCache = nodeMap;
    console.log(`Loaded ${nodeMap.size} nodes`);
    return nodeMap;
  } catch (error) {
    console.error('Error loading nodes:', error);
    return new Map();
  }
}

/**
 * Load segments from CSV (cached)
 */
async function loadSegmentsRaw(): Promise<SegmentRaw[]> {
  if (segmentsCache) {
    return segmentsCache;
  }

  try {
    const csvContent = await readCSV('segments.csv');

    const lines = csvContent.split('\n');
    const segments: SegmentRaw[] = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;

      const values = parseCSVLine(lines[i]);
      if (values.length < 11) continue;

      segments.push({
        _id: parseInt(values[0]),
        s_node_id: parseInt(values[3]),
        e_node_id: parseInt(values[4]),
        length: parseFloat(values[5]),
        street_id: parseInt(values[6]),
        max_velocity: parseFloat(values[7]),
        street_level: parseInt(values[8]),
        street_name: values[9],
        street_type: values[10],
      });
    }

    segmentsCache = segments;
    console.log(`Loaded ${segments.length} segments`);
    return segments;
  } catch (error) {
    console.error('Error loading segments:', error);
    return [];
  }
}

/**
 * Check if segment is within bounds
 */
function isSegmentInBounds(
  segment: SegmentRaw,
  nodes: Map<number, Node>,
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number }
): boolean {
  const startNode = nodes.get(segment.s_node_id);
  const endNode = nodes.get(segment.e_node_id);

  if (!startNode || !endNode) return false;

  // Check if either node is within bounds
  const startInBounds = startNode.lat >= bounds.minLat && startNode.lat <= bounds.maxLat &&
                       startNode.long >= bounds.minLng && startNode.long <= bounds.maxLng;
  const endInBounds = endNode.lat >= bounds.minLat && endNode.lat <= bounds.maxLat &&
                     endNode.long >= bounds.minLng && endNode.long <= bounds.maxLng;

  return startInBounds || endInBounds;
}

/**
 * GET /api/segments-hcmc
 *
 * Returns traffic segments for HCMC with lazy loading support
 *
 * Query params:
 * - bounds: "minLat,minLng,maxLat,maxLng" - filter by viewport bounds
 * - streetLevel: exact street level
 * - streetLevelMax: upper bound for street level
 * - zoom: current zoom level for diagnostics
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const boundsParam = searchParams.get('bounds');
  const streetLevel = searchParams.get('streetLevel');
  const streetLevelMax = searchParams.get('streetLevelMax');
  const zoom = searchParams.get('zoom');

  try {
    const [nodeMap, segments] = await Promise.all([
      loadNodes(),
      loadSegmentsRaw(),
    ]);

    let filteredSegments = segments;

    // Filter by bounds if provided
    if (boundsParam) {
      const [minLat, minLng, maxLat, maxLng] = boundsParam.split(',').map(parseFloat);

      filteredSegments = segments.filter(seg =>
        isSegmentInBounds(seg, nodeMap, { minLat, minLng, maxLat, maxLng })
      );

      console.log(`Bounds filter: ${minLat},${minLng},${maxLat},${maxLng} -> ${filteredSegments.length} segments`);
    }

    // Filter by exact street level if specified
    if (streetLevel) {
      const level = parseInt(streetLevel);
      filteredSegments = filteredSegments.filter(s => s.street_level === level);
    }

    if (streetLevelMax) {
      const levelMax = parseInt(streetLevelMax);
      filteredSegments = filteredSegments.filter(s => s.street_level <= levelMax);
    }

    const visibleSegments = filteredSegments
      .map((seg) => {
        const startNode = nodeMap.get(seg.s_node_id);
        const endNode = nodeMap.get(seg.e_node_id);

        if (!startNode || !endNode) return null;

        return {
          segment_id: seg._id,
          s_lat: startNode.lat,
          s_lng: startNode.long,
          e_lat: endNode.lat,
          e_lng: endNode.long,
          street_name: seg.street_name,
          street_level: seg.street_level,
          max_velocity: seg.max_velocity,
          length: seg.length,
        };
      })
      .filter((seg): seg is TrafficSegmentHCMC => seg !== null);

    return NextResponse.json({
      segments: visibleSegments,
      total: filteredSegments.length,
      zoom,
    });
  } catch (error) {
    console.error('Error in segments API:', error);
    return NextResponse.json(
      { error: 'Failed to load segments', message: String(error) },
      { status: 500 }
    );
  }
}
