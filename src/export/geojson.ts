import { pickAttributes } from "./fields.ts";
import { arcgisGeometryToGeoJson, type GeoJsonGeometry } from "./geometry.ts";
import type { ExportFeature } from "./csv.ts";

export interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, unknown>;
    geometry: GeoJsonGeometry | null;
  }>;
}

export interface GeoJsonExport {
  collection: GeoJsonFeatureCollection;
  skipped: number;
  errors: string[];
}

export function toGeoJson(features: ExportFeature[], fields?: string[]): GeoJsonExport {
  const errors: string[] = [];
  let skipped = 0;
  const output: GeoJsonFeatureCollection["features"] = [];
  for (const feature of features) {
    const converted = arcgisGeometryToGeoJson(feature.geometry);
    if ("error" in converted) {
      skipped += 1;
      if (!errors.includes(converted.error)) errors.push(converted.error);
      continue;
    }
    output.push({
      type: "Feature",
      properties: pickAttributes(feature.attributes, fields),
      geometry: "geometry" in converted ? converted.geometry : null,
    });
  }
  return { collection: { type: "FeatureCollection", features: output }, skipped, errors };
}
