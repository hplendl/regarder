import CSVLayer from "@arcgis/core/layers/CSVLayer.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer.js";
import GroupLayer from "@arcgis/core/layers/GroupLayer.js";
import MapImageLayer from "@arcgis/core/layers/MapImageLayer.js";
import VectorTileLayer from "@arcgis/core/layers/VectorTileLayer.js";
import WebMap from "@arcgis/core/WebMap.js";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol.js";
import SimpleRenderer from "@arcgis/core/renderers/SimpleRenderer.js";
import SizeVariable from "@arcgis/core/renderers/visualVariables/SizeVariable.js";
import type { RegarderConfig, LayerConfig, PointStyleConfig } from "../config/types.ts";
import { messageOf } from "../util.ts";
import { buildPopupTemplate } from "./popup.ts";

export type QueryLayer = FeatureLayer | GeoJSONLayer | CSVLayer;

export interface QueryableEntry {
  id: string;
  title: string;
  layer: QueryLayer;
  config: LayerConfig;
}

export async function addConfiguredLayers(
  map: __esri.Map,
  config: RegarderConfig,
): Promise<{ entries: QueryableEntry[]; errors: string[] }> {
  const entries: QueryableEntry[] = [];
  const errors: string[] = [];
  for (const layerConfig of config.layers) {
    try {
      const layer = await createLayer(layerConfig, config.portalUrl ?? "https://www.arcgis.com");
      map.add(layer);
      entries.push(...collectQueryable(layer, layerConfig));
    } catch (error) {
      errors.push(`${layerConfig.title}: ${messageOf(error)}`);
    }
  }
  return { entries, errors };
}

async function createLayer(config: LayerConfig, portalUrl: string): Promise<__esri.Layer> {
  switch (config.type) {
    case "feature":
      return finishQueryable(
        new FeatureLayer({
          url: config.url,
          title: config.title,
          visible: config.visible,
          opacity: config.opacity,
          definitionExpression: config.definitionExpression,
          minScale: config.minScale,
          maxScale: config.maxScale,
          outFields: ["*"],
          copyright: config.copyright,
        }),
        config,
      );
    case "geojson":
      return finishQueryable(
        new GeoJSONLayer({
          url: config.url,
          title: config.title,
          visible: config.visible,
          opacity: config.opacity,
          definitionExpression: config.definitionExpression,
          minScale: config.minScale,
          maxScale: config.maxScale,
          copyright: config.copyright,
        }),
        config,
      );
    case "csv":
      return finishQueryable(
        new CSVLayer({
          url: config.url,
          title: config.title,
          visible: config.visible,
          opacity: config.opacity,
          definitionExpression: config.definitionExpression,
          latitudeField: config.latitudeField,
          longitudeField: config.longitudeField,
          delimiter: config.delimiter,
          copyright: config.copyright,
        }),
        config,
      );
    case "map-image": {
      const layer = new MapImageLayer({
        url: config.url,
        title: config.title,
        visible: config.visible,
        opacity: config.opacity,
        minScale: config.minScale,
        maxScale: config.maxScale,
      });
      await layer.load();
      for (const sublayerConfig of config.sublayers ?? []) {
        const sublayer = layer.findSublayerById(sublayerConfig.id);
        if (!sublayer) continue;
        if (sublayerConfig.title) sublayer.title = sublayerConfig.title;
        if (sublayerConfig.visible !== undefined) sublayer.visible = sublayerConfig.visible;
        if (sublayerConfig.opacity !== undefined) sublayer.opacity = sublayerConfig.opacity;
        if (sublayerConfig.definitionExpression) {
          sublayer.definitionExpression = sublayerConfig.definitionExpression;
        }
      }
      return layer;
    }
    case "vector-tile":
      return new VectorTileLayer({
        url: config.url,
        title: config.title,
        visible: config.visible,
        opacity: config.opacity,
        minScale: config.minScale,
        maxScale: config.maxScale,
      });
    case "webmap":
      return loadWebMapGroup(config, portalUrl);
  }
}

async function finishQueryable(layer: QueryLayer, config: LayerConfig): Promise<QueryLayer> {
  if (config.popupFields?.length) {
    layer.popupTemplate = buildPopupTemplate(config.title, config.popupFields);
  }
  if (config.pointStyle) layer.renderer = pointRenderer(config.pointStyle);
  await layer.load();
  if (!layer.popupTemplate) {
    const fields = layer.fields
      .filter(
        (field) => field.type !== "geometry" && field.type !== "oid" && field.type !== "global-id",
      )
      .slice(0, 8)
      .map((field) => ({ field: field.name, label: field.alias || field.name }));
    if (fields.length > 0) layer.popupTemplate = buildPopupTemplate(config.title, fields);
  }
  return layer;
}

async function loadWebMapGroup(config: LayerConfig, portalUrl: string): Promise<GroupLayer> {
  const webMap = new WebMap({
    portalItem: {
      id: config.itemId,
      portal: { url: portalUrl },
    },
  });
  await webMap.loadAll();
  const children = webMap.layers.toArray();
  webMap.layers.removeAll();
  for (const child of children) {
    if (config.popupFields?.length && isQueryLayer(child)) {
      child.popupTemplate = buildPopupTemplate(child.title || config.title, config.popupFields);
    }
  }
  return new GroupLayer({
    title: config.title,
    visible: config.visible,
    opacity: config.opacity,
    layers: children,
  });
}

function collectQueryable(layer: __esri.Layer, config: LayerConfig): QueryableEntry[] {
  if (layer.type === "group") {
    const group = layer as GroupLayer;
    return group.layers.toArray().flatMap((child, index) =>
      collectQueryable(child, {
        ...config,
        id: `${config.id}-${index}`,
        title: child.title || config.title,
      }),
    );
  }
  if (!isQueryLayer(layer) || !config.selectable) return [];
  return [{ id: config.id, title: layer.title || config.title, layer, config }];
}

function isQueryLayer(layer: __esri.Layer): layer is QueryLayer {
  return layer.type === "feature" || layer.type === "geojson" || layer.type === "csv";
}

function pointRenderer(style: PointStyleConfig): SimpleRenderer {
  const renderer = new SimpleRenderer({
    symbol: new SimpleMarkerSymbol({
      color: style.color ?? "#8a5a2b",
      size: style.size ?? 8,
      outline: { color: style.outlineColor ?? "#ffffff", width: 0.75 },
    }),
  });
  if (style.sizeField) {
    renderer.visualVariables = [
      new SizeVariable({
        field: style.sizeField,
        minDataValue: style.minDataValue ?? 0,
        maxDataValue: style.maxDataValue ?? 10,
        minSize: style.minSize ?? 4,
        maxSize: style.maxSize ?? 28,
      }),
    ];
  }
  return renderer;
}
