import { pickAttributes } from "./fields.ts";
import {
  arcgisGeometryToGeoJson,
  geometryToWkt,
  pointLngLat,
  type ArcGisGeometry,
} from "./geometry.ts";

export interface ExportFeature {
  attributes: Record<string, unknown>;
  geometry?: ArcGisGeometry | null;
}

export interface CsvExport {
  csv: string;
  skipped: number;
  errors: string[];
}

export function toCsv(features: ExportFeature[], fields?: string[]): CsvExport {
  const errors: string[] = [];
  let skipped = 0;
  const rows = features.map((feature) => {
    const converted = arcgisGeometryToGeoJson(feature.geometry);
    if ("error" in converted) {
      skipped += 1;
      errors.push(converted.error);
    }
    const geometry = "geometry" in converted ? converted.geometry : undefined;
    const point = pointLngLat(geometry);
    return {
      attributes: pickAttributes(feature.attributes, fields),
      longitude: point.longitude,
      latitude: point.latitude,
      wkt: geometryToWkt(geometry),
    };
  });

  const attributeNames =
    fields && fields.length > 0
      ? fields
      : unique(rows.flatMap((row) => Object.keys(row.attributes)));
  const headers = [...attributeNames, "longitude", "latitude", "wkt"];
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    const values = attributeNames.map((name) => csvCell(row.attributes[name]));
    values.push(csvCell(row.longitude), csvCell(row.latitude), csvCell(row.wkt));
    lines.push(values.join(","));
  }
  return { csv: `\uFEFF${lines.join("\r\n")}`, skipped, errors: unique(errors) };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (typeof value === "string") {
    const formula = /^[=+\-@]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value);
    text = formula ? `'${value}` : value;
  } else if (typeof value === "number" || typeof value === "boolean") {
    text = String(value);
  } else {
    text = JSON.stringify(value);
  }
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
