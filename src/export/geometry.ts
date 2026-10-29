export interface ArcGisGeometry {
  x?: number;
  y?: number;
  points?: number[][];
  paths?: number[][][];
  rings?: number[][][];
  spatialReference?: { wkid?: number; latestWkid?: number };
}

export interface GeoJsonPoint {
  type: "Point";
  coordinates: number[];
}
export interface GeoJsonMultiPoint {
  type: "MultiPoint";
  coordinates: number[][];
}
export interface GeoJsonLineString {
  type: "LineString";
  coordinates: number[][];
}
export interface GeoJsonMultiLineString {
  type: "MultiLineString";
  coordinates: number[][][];
}
export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: number[][][];
}
export type GeoJsonGeometry =
  GeoJsonPoint | GeoJsonMultiPoint | GeoJsonLineString | GeoJsonMultiLineString | GeoJsonPolygon;

const WEB_MERCATOR = new Set([3857, 102100, 102113, 900913]);
const GEOGRAPHIC = new Set([4326, 4269, 4267]);
const EARTH_RADIUS = 6378137;

export function spatialReferenceWkid(
  geometry: ArcGisGeometry | null | undefined,
): number | undefined {
  return geometry?.spatialReference?.latestWkid ?? geometry?.spatialReference?.wkid;
}

export function arcgisGeometryToGeoJson(
  geometry: ArcGisGeometry | null | undefined,
): { geometry: GeoJsonGeometry } | { error: string } | { empty: true } {
  if (!geometry) return { empty: true };
  const wkid = spatialReferenceWkid(geometry);
  if (wkid !== undefined && !WEB_MERCATOR.has(wkid) && !GEOGRAPHIC.has(wkid)) {
    return {
      error: `Spatial reference ${wkid} cannot be written as GeoJSON. Query the layer in WGS84.`,
    };
  }
  const project = (x: number, y: number): [number, number] =>
    wkid !== undefined && WEB_MERCATOR.has(wkid) ? webMercatorToLngLat(x, y) : [x, y];

  if (typeof geometry.x === "number" && typeof geometry.y === "number") {
    return { geometry: { type: "Point", coordinates: roundPair(project(geometry.x, geometry.y)) } };
  }
  if (geometry.points) {
    return {
      geometry: {
        type: "MultiPoint",
        coordinates: geometry.points.map(([x, y]) => roundPair(project(x, y))),
      },
    };
  }
  if (geometry.paths) {
    const paths = geometry.paths.map((path) => path.map(([x, y]) => roundPair(project(x, y))));
    if (paths.length === 1) return { geometry: { type: "LineString", coordinates: paths[0] } };
    return { geometry: { type: "MultiLineString", coordinates: paths } };
  }
  if (geometry.rings) {
    const rings = geometry.rings.map((ring) =>
      closeRing(ring.map(([x, y]) => roundPair(project(x, y)))),
    );
    return { geometry: { type: "Polygon", coordinates: rings } };
  }
  return { empty: true };
}

export function webMercatorToLngLat(x: number, y: number): [number, number] {
  const longitude = (x / EARTH_RADIUS) * (180 / Math.PI);
  const latitude = (Math.atan(Math.exp(y / EARTH_RADIUS)) * 360) / Math.PI - 90;
  return [longitude, latitude];
}

export function geometryToWkt(geometry: GeoJsonGeometry | undefined): string {
  if (!geometry) return "";
  switch (geometry.type) {
    case "Point":
      return `POINT (${pair(geometry.coordinates)})`;
    case "MultiPoint":
      return `MULTIPOINT (${geometry.coordinates.map(pair).join(", ")})`;
    case "LineString":
      return `LINESTRING (${geometry.coordinates.map(pair).join(", ")})`;
    case "MultiLineString":
      return `MULTILINESTRING (${geometry.coordinates.map((line) => `(${line.map(pair).join(", ")})`).join(", ")})`;
    case "Polygon":
      return `POLYGON (${geometry.coordinates.map((ring) => `(${ring.map(pair).join(", ")})`).join(", ")})`;
  }
}

export function pointLngLat(geometry: GeoJsonGeometry | undefined): {
  longitude: string;
  latitude: string;
} {
  if (geometry?.type === "Point") {
    return {
      longitude: String(geometry.coordinates[0]),
      latitude: String(geometry.coordinates[1]),
    };
  }
  return { longitude: "", latitude: "" };
}

function roundPair(pair: [number, number]): [number, number] {
  return [round(pair[0]), round(pair[1])];
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function closeRing(ring: number[][]): number[][] {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  return ring;
}

function pair(coordinates: number[]): string {
  return `${coordinates[0]} ${coordinates[1]}`;
}
