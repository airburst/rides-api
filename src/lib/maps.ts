import { XMLParser } from "fast-xml-parser";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import StaticMaps from "staticmaps";

// Map options - height is computed per-route from its aspect ratio
export const MAP_WIDTH = 640;
export const MAP_PADDING_X = 0;
export const MAP_PADDING_Y = 0;
const TARGET_MAP_RATIO = 3 / 2; // width:height target for the inner drawable area
const MARKER_W = 24;
const MARKER_H = 30;
const MARKER_OFFSET_X = 12; // horizontal center
const MARKER_OFFSET_Y = 30; // bottom tip anchors on the coordinate
const MARKER_MIN_SEP = MARKER_W + 8; // min pixel separation between marker anchors
// const TILE_URL =
// "https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.png";
// "https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}@2x.png";

interface Trkpt {
  "@_lat": string;
  "@_lon": string;
}

export function parseGpxCoords(gpxText: string): [number, number][] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  interface ParsedGpx {
    gpx?: {
      trk?: { trkseg?: { trkpt?: Trkpt | Trkpt[] } };
      rte?: { rtept?: Trkpt | Trkpt[] };
    };
  }

  const parsed = parser.parse(gpxText) as ParsedGpx;
  const gpx = parsed.gpx;

  const pts = gpx?.trk?.trkseg?.trkpt ?? gpx?.rte?.rtept ?? [];
  const arr = Array.isArray(pts) ? pts : [pts];

  return arr
    .map(
      (pt) =>
        [parseFloat(pt["@_lon"]), parseFloat(pt["@_lat"])] as [number, number],
    )
    .filter(([lon, lat]) => !isNaN(lon) && !isNaN(lat));
}

export function computeDistanceKm(coords: [number, number][]): number {
  const R = 6371;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1];
    const [lon2, lat2] = coords[i];
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return Math.round(total);
}

function computeBbox(
  coords: [number, number][],
): [number, number, number, number] {
  let minLng = coords[0][0],
    maxLng = coords[0][0];
  let minLat = coords[0][1],
    maxLat = coords[0][1];
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}

// Pads the bbox symmetrically in the short dimension (Mercator-correct) until
// the inner drawable area matches TARGET_MAP_RATIO. This maximises how much of
// the canvas the route polygon fills regardless of route shape.
function padBboxToAspect(
  bbox: [number, number, number, number],
): [number, number, number, number] {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const mercY = (lat: number): number =>
    Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const mercToLat = (my: number): number =>
    (Math.atan(Math.exp(my)) - Math.PI / 4) * (360 / Math.PI);

  const lngSpan = maxLng - minLng;
  const mercSpan = mercY(maxLat) - mercY(minLat);
  const currentRatio = lngSpan / mercSpan;

  if (currentRatio < TARGET_MAP_RATIO) {
    // Route is too tall: expand longitude symmetrically
    const pad = (mercSpan * TARGET_MAP_RATIO - lngSpan) / 2;
    return [minLng - pad, minLat, maxLng + pad, maxLat];
  } else {
    // Route is too wide: expand latitude symmetrically in Mercator space
    const pad = (lngSpan / TARGET_MAP_RATIO - mercSpan) / 2;
    return [
      minLng,
      mercToLat(mercY(minLat) - pad),
      maxLng,
      mercToLat(mercY(maxLat) + pad),
    ];
  }
}

// Compute canvas height so it matches the route's Mercator aspect ratio.
// This ensures both dimensions have similar padding after auto-fit, regardless
// of integer zoom stepping—solving the "huge blank band" problem.
function computeCanvasHeight(bbox: [number, number, number, number]): number {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const mercY = (lat: number): number =>
    Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const routeAspect = (maxLng - minLng) / (mercY(maxLat) - mercY(minLat));
  const innerWidth = MAP_WIDTH - MAP_PADDING_X * 2;
  const innerHeight = Math.round(innerWidth / routeAspect);
  return Math.max(200, Math.min(1200, innerHeight + MAP_PADDING_Y * 2));
}

// Approximate pixel distance between two coords given the bbox and map dimensions.
// Uses the inner drawable area (after padding) so the scale matches what StaticMaps renders.
function approxPixelDist(
  a: [number, number],
  b: [number, number],
  bbox: [number, number, number, number],
  mapWidth: number,
  mapHeight: number,
): number {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const innerW = mapWidth - MAP_PADDING_X * 2;
  const innerH = mapHeight - MAP_PADDING_Y * 2;
  const dx = ((a[0] - b[0]) / (maxLng - minLng || 1e-10)) * innerW;
  const dy = ((a[1] - b[1]) / (maxLat - minLat || 1e-10)) * innerH;
  return Math.sqrt(dx * dx + dy * dy);
}

// Returns the coordinate to place the end marker on, walking back along the route
// if the true end would overlap the start marker. Returns null for exact loops or
// routes too short to separate the markers.
function findEndMarkerCoord(
  coords: [number, number][],
  bbox: [number, number, number, number],
  mapHeight: number,
): [number, number] | null {
  const start = coords[0];
  const end = coords[coords.length - 1];
  if (start[0] === end[0] && start[1] === end[1]) return null;
  for (let i = coords.length - 1; i > 0; i--) {
    if (
      approxPixelDist(start, coords[i], bbox, MAP_WIDTH, mapHeight) >=
      MARKER_MIN_SEP
    ) {
      return coords[i];
    }
  }
  return null;
}

export async function generateMapImage(
  coords: [number, number][],
  id: string,
): Promise<string> {
  const bbox = padBboxToAspect(computeBbox(coords));
  const height = computeCanvasHeight(bbox);
  const map = new StaticMaps({
    width: MAP_WIDTH,
    height,
    paddingX: MAP_PADDING_X,
    paddingY: MAP_PADDING_Y,
    // tileUrl: TILE_URL,
  });
  map.addLine({ coords, color: "#E85D04", width: 4 });

  const assetsDir = join(process.cwd(), "public", "assets");
  const startCoord = coords[0];
  const endMarkerCoord = findEndMarkerCoord(coords, bbox, height);

  map.addMarker({
    img: join(assetsDir, "marker-start.svg"),
    offsetX: MARKER_OFFSET_X,
    offsetY: MARKER_OFFSET_Y,
    width: MARKER_W,
    height: MARKER_H,
    coord: startCoord,
  });

  if (endMarkerCoord) {
    map.addMarker({
      img: join(assetsDir, "marker-end.svg"),
      offsetX: MARKER_OFFSET_X,
      offsetY: MARKER_OFFSET_Y,
      width: MARKER_W,
      height: MARKER_H,
      coord: endMarkerCoord,
    });
  }

  await map.render();
  const mapsDir = join(process.cwd(), "public", "maps");
  await mkdir(mapsDir, { recursive: true });
  const buffer = await map.image.buffer("image/png");
  await writeFile(join(mapsDir, `${id}.png`), buffer);
  return `/maps/${id}.png`;
}
