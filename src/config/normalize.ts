import {
  DEFAULT_BASEMAP_GALLERY,
  DEFAULT_PORTAL_URL,
  DEFAULT_PRINT_SERVICE_URL,
  QUERYABLE_LAYER_TYPES,
} from "./defaults.ts";
import type { BasemapConfig, RegarderConfig, LayerConfig } from "./types.ts";

export function normalizeConfig(config: RegarderConfig): RegarderConfig {
  return {
    ...config,
    theme: config.theme ?? "light",
    portalUrl: stripTrailingSlash(config.portalUrl?.trim() || DEFAULT_PORTAL_URL),
    printServiceUrl: config.printServiceUrl?.trim() || DEFAULT_PRINT_SERVICE_URL,
    branding: {
      name: config.branding?.name?.trim() || "Regarder",
      tagline: config.branding?.tagline?.trim() || "To look at",
      accent: config.branding?.accent,
    },
    auth: {
      mode: config.auth?.mode ?? "none",
      popup: config.auth?.popup ?? true,
      appId: config.auth?.appId?.trim(),
      popupCallbackUrl: config.auth?.popupCallbackUrl,
      expiration: config.auth?.expiration,
      trustedServers: config.auth?.trustedServers,
    },
    basemap: config.basemap ?? {
      title: "Topographic",
      url: DEFAULT_BASEMAP_GALLERY[0].url,
    },
    basemapGallery:
      config.basemapGallery && config.basemapGallery.length > 0
        ? config.basemapGallery
        : DEFAULT_BASEMAP_GALLERY.map((basemap) => ({ ...basemap })),
    extent: config.extent ? { ...config.extent, wkid: config.extent.wkid ?? 4326 } : undefined,
    search: {
      enabled: config.search?.enabled !== false,
      includeDefaultSources: config.search?.includeDefaultSources ?? false,
      placeholder: config.search?.placeholder,
      layerSources: config.search?.layerSources ?? [],
    },
    ui: {
      exampleSwitcher: config.ui?.exampleSwitcher ?? false,
    },
    layers: config.layers.map(normalizeLayer),
  };
}

function normalizeLayer(layer: LayerConfig): LayerConfig {
  const queryable = QUERYABLE_LAYER_TYPES.has(layer.type) || layer.type === "webmap";
  const selectable = queryable ? layer.selectable !== false : false;
  return {
    ...layer,
    visible: layer.visible !== false,
    opacity: layer.opacity ?? 1,
    selectable,
    definitionExpression: layer.definitionExpression?.trim() || undefined,
    latitudeField: layer.latitudeField ?? "latitude",
    longitudeField: layer.longitudeField ?? "longitude",
  };
}

export function basemapLabel(basemap: string | BasemapConfig | undefined): string {
  if (!basemap) return "Basemap";
  if (typeof basemap === "string") return basemap;
  return basemap.title || basemap.id || "Basemap";
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}
