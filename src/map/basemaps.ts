import Basemap from "@arcgis/core/Basemap.js";
import TileLayer from "@arcgis/core/layers/TileLayer.js";
import LocalBasemapsSource from "@arcgis/core/widgets/BasemapGallery/support/LocalBasemapsSource.js";
import type { BasemapConfig } from "../config/types.ts";

export function createBasemap(spec: string | BasemapConfig | undefined): Basemap | string {
  if (!spec) return "topo-vector";
  if (typeof spec === "string") return Basemap.fromId(spec) ?? spec;
  if (spec.url) {
    return new Basemap({
      id: spec.id,
      title: spec.title || "Basemap",
      baseLayers: [new TileLayer({ url: spec.url, title: spec.title || "Basemap" })],
    });
  }
  if (spec.id) return Basemap.fromId(spec.id) ?? spec.id;
  return "topo-vector";
}

export function createBasemapSource(specs: BasemapConfig[]): LocalBasemapsSource {
  const basemaps = specs
    .map((spec) => createBasemap(spec))
    .filter((basemap): basemap is Basemap => basemap instanceof Basemap);
  return new LocalBasemapsSource({ basemaps });
}
