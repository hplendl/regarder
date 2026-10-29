import { EXPORT_ROW_LIMIT } from "../config/defaults.ts";
import { downloadText } from "../export/download.ts";
import { exportFilename } from "../export/fields.ts";
import { toCsv, type ExportFeature } from "../export/csv.ts";
import { toGeoJson } from "../export/geojson.ts";
import type { ArcGisGeometry } from "../export/geometry.ts";
import {
  interpretServiceInfo,
  parseFeatureLayerUrl,
  replicaExtension,
  requestReplica,
  type ReplicaFormat,
  type ServiceExportInfo,
} from "../export/replica.ts";
import { collectPages } from "../query/page.ts";
import { combineWhere, objectIdWhere } from "../query/where.ts";
import { layerPageSize, type SelectionEntry } from "./selection.ts";
import type { QueryLayer } from "../map/layers.ts";

export type ExportFormat = "csv" | "geojson" | ReplicaFormat;

export interface ExportOutcome {
  message: string;
  href?: string;
  hrefLabel?: string;
}

const infoCache = new Map<string, ServiceExportInfo>();

export async function serviceExportInfo(layer: QueryLayer): Promise<ServiceExportInfo> {
  const parts = parseFeatureLayerUrl(layer.url ?? undefined);
  if (!parts) return { supportsReplica: false, formats: [] };
  const cached = infoCache.get(parts.root);
  if (cached) return cached;
  const response = await fetch(`${parts.root}?f=json`);
  const info = interpretServiceInfo(await response.json());
  infoCache.set(parts.root, info);
  return info;
}

export async function runExport(options: {
  layer: QueryLayer;
  title: string;
  format: ExportFormat;
  scope: "selected" | "all";
  selection?: SelectionEntry;
  exportableFields?: string[];
}): Promise<ExportOutcome> {
  const fields = options.exportableFields?.length ? options.exportableFields : undefined;
  if (options.format === "csv" || options.format === "geojson") {
    const features = await fetchFeatures(options);
    if (features.items.length === 0) {
      return { message: "The query returned no features to export." };
    }
    const stamp = new Date();
    if (options.format === "csv") {
      const csv = toCsv(features.items, fields);
      downloadText(
        exportFilename(options.title, options.scope, "csv", stamp),
        csv.csv,
        "text/csv;charset=utf-8",
      );
      return {
        message: exportMessage(
          "CSV",
          features.items.length,
          features.truncated,
          csv.skipped,
          csv.errors,
        ),
      };
    }
    const geojson = toGeoJson(features.items, fields);
    downloadText(
      exportFilename(options.title, options.scope, "geojson", stamp),
      JSON.stringify(geojson.collection, null, 2),
      "application/geo+json",
    );
    return {
      message: exportMessage(
        "GeoJSON",
        geojson.collection.features.length,
        features.truncated,
        geojson.skipped,
        geojson.errors,
      ),
    };
  }

  const parts = parseFeatureLayerUrl(options.layer.url ?? undefined);
  if (!parts) {
    return {
      message:
        "This layer is not a feature service, so file geodatabase and shapefile export are unavailable. Use CSV or GeoJSON.",
    };
  }
  const info = await serviceExportInfo(options.layer);
  if (!info.supportsReplica || !info.formats.includes(options.format)) {
    const offered = info.formats.length ? info.formats.join(", ") : "none";
    return {
      message: `This service does not offer ${formatLabel(options.format)} extracts. Supported service formats: ${offered}. CSV and GeoJSON are still available.`,
    };
  }
  const geometry = replicaGeometry(options);
  if (!geometry) {
    return { message: "The layer has no extent to send to the extract service." };
  }
  const where = replicaWhere(options);
  const outFields = fields ? unique([...(fields ?? []), options.layer.objectIdField]) : undefined;
  const result = await requestReplica(parts.root, {
    replicaName: `Cartouche${Date.now().toString(36)}`,
    layerId: parts.layerId,
    format: options.format,
    geometry: geometry.geometry,
    geometryType: geometry.geometryType,
    inSR: geometry.inSR,
    where,
    outFields,
  });
  return {
    message: `${formatLabel(options.format)} is ready.`,
    href: result.resultUrl,
    hrefLabel: `Download .${replicaExtension(options.format, result.resultUrl)}`,
  };
}

async function fetchFeatures(options: {
  layer: QueryLayer;
  scope: "selected" | "all";
  selection?: SelectionEntry;
  exportableFields?: string[];
}): Promise<{ items: ExportFeature[]; truncated: boolean }> {
  const fields = options.exportableFields?.length
    ? unique([...options.exportableFields, options.layer.objectIdField])
    : ["*"];
  const filter = featureFilter(options);
  const pageSize = layerPageSize(options.layer);
  return collectPages({
    pageSize,
    maxItems: EXPORT_ROW_LIMIT,
    fetchPage: async (offset, count) => {
      const query = options.layer.createQuery();
      query.start = offset;
      query.num = count;
      query.returnGeometry = true;
      query.outFields = fields;
      query.outSpatialReference = { wkid: 4326 };
      if (filter.objectIds) query.objectIds = filter.objectIds;
      if (filter.geometry) {
        query.geometry = filter.geometry;
        query.spatialRelationship = "intersects";
      }
      if (filter.where) query.where = filter.where;
      const result = await options.layer.queryFeatures(query);
      return {
        items: result.features.map(graphicToFeature),
        exceeded: Boolean(result.exceededTransferLimit),
      };
    },
  });
}

function featureFilter(options: {
  layer: QueryLayer;
  scope: "selected" | "all";
  selection?: SelectionEntry;
}): { objectIds?: number[]; geometry?: __esri.Geometry; where?: string } {
  if (options.scope === "all") return { where: "1=1" };
  const selection = options.selection;
  if (!selection) return { objectIds: [-1] };
  if (selection.geometry)
    return {
      geometry: selection.geometry,
      where: selection.where === "1=1" ? undefined : selection.where,
    };
  return { objectIds: selection.objectIds };
}

function replicaWhere(options: {
  layer: QueryLayer;
  scope: "selected" | "all";
  selection?: SelectionEntry;
}): string {
  const base = options.layer.definitionExpression;
  if (options.scope === "all") return combineWhere(base, "1=1");
  const selection = options.selection;
  if (selection?.geometry)
    return combineWhere(base, selection.where === "1=1" ? "1=1" : selection.where);
  if (selection?.objectIds.length) {
    return combineWhere(
      base,
      objectIdWhere(options.layer.objectIdField, selection.objectIds.slice(0, 2000)),
    );
  }
  return "1=0";
}

function replicaGeometry(options: {
  layer: QueryLayer;
  selection?: SelectionEntry;
  scope: "selected" | "all";
}): { geometry: string; geometryType: string; inSR: number } | null {
  const selected = options.scope === "selected" ? options.selection?.geometry : undefined;
  if (selected?.type === "polygon") {
    const polygon = selected as __esri.Polygon;
    const inSR = polygon.spatialReference?.wkid;
    if (!inSR || !polygon.rings) return null;
    return {
      geometry: JSON.stringify({ rings: polygon.rings }),
      geometryType: "esriGeometryPolygon",
      inSR,
    };
  }
  const extent = options.layer.fullExtent;
  const inSR = extent?.spatialReference?.wkid;
  if (!extent || !inSR) return null;
  return {
    geometry: JSON.stringify({
      xmin: extent.xmin,
      ymin: extent.ymin,
      xmax: extent.xmax,
      ymax: extent.ymax,
    }),
    geometryType: "esriGeometryEnvelope",
    inSR,
  };
}

function graphicToFeature(graphic: __esri.Graphic): ExportFeature {
  return {
    attributes: { ...(graphic.attributes ?? {}) },
    geometry: graphic.geometry ? (graphic.geometry.toJSON() as ArcGisGeometry) : null,
  };
}

function exportMessage(
  label: string,
  count: number,
  truncated: boolean,
  skipped: number,
  errors: string[],
): string {
  const parts = [`Downloaded ${count.toLocaleString()} features as ${label}.`];
  if (truncated) parts.push(`The export stopped at ${EXPORT_ROW_LIMIT.toLocaleString()} features.`);
  if (skipped) parts.push(`${skipped.toLocaleString()} features were skipped.`);
  if (errors[0]) parts.push(errors[0]);
  return parts.join(" ");
}

function formatLabel(format: ExportFormat): string {
  if (format === "filegdb") return "file geodatabase";
  if (format === "sqlite") return "mobile geodatabase";
  if (format === "shapefile") return "shapefile";
  return format.toUpperCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
