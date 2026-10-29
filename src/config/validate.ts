import { PLACEHOLDER_APP_ID, QUERYABLE_LAYER_TYPES } from "./defaults.ts";
import type { CartoucheConfig, LayerConfig, ValidationResult } from "./types.ts";

const LAYER_TYPES = new Set(["feature", "map-image", "vector-tile", "webmap", "geojson", "csv"]);
const AUTH_MODES = new Set(["none", "arcgis-oauth", "iwa"]);
const LAYER_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function validateConfig(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: ["Configuration must be a JSON object."], warnings };
  }

  const title = requiredString(input, "title", errors);
  if (title && title.length > 200) errors.push("title must be 200 characters or fewer.");

  if (input.description !== undefined && typeof input.description !== "string") {
    errors.push("description must be a string.");
  }

  if (input.theme !== undefined && input.theme !== "light" && input.theme !== "dark") {
    errors.push('theme must be "light" or "dark".');
  }

  if (input.portalUrl !== undefined) {
    assertUrl(input.portalUrl, "portalUrl", errors, { https: true });
  }

  validateAuth(input.auth, input.portalUrl, errors, warnings);
  validateBasemap(input.basemap, "basemap", errors);
  if (input.basemapGallery !== undefined) {
    if (!Array.isArray(input.basemapGallery)) {
      errors.push("basemapGallery must be an array.");
    } else {
      input.basemapGallery.forEach((entry, index) => {
        validateBasemap(entry, `basemapGallery[${index}]`, errors);
      });
    }
  }

  validateExtent(input.extent, errors, warnings);
  validateCenter(input.center, input.zoom, errors);

  if (input.printServiceUrl !== undefined) {
    assertUrl(input.printServiceUrl, "printServiceUrl", errors, { https: true });
  }

  if (input.webMapItemId !== undefined && !nonEmptyString(input.webMapItemId)) {
    errors.push("webMapItemId must be a non-empty string.");
  }

  validateBranding(input.branding, errors);
  validateUi(input.ui, errors);

  const layers = validateLayers(input.layers, input.webMapItemId, errors, warnings);
  validateSearch(input.search, layers, errors);

  return { ok: errors.length === 0, errors, warnings };
}

export function assertValidConfig(input: unknown): CartoucheConfig {
  const result = validateConfig(input);
  if (!result.ok) {
    throw new Error(result.errors.join("\n"));
  }
  return input as CartoucheConfig;
}

function validateAuth(
  auth: unknown,
  portalUrl: unknown,
  errors: string[],
  warnings: string[],
): void {
  if (auth === undefined) return;
  if (!isRecord(auth)) {
    errors.push("auth must be an object.");
    return;
  }
  if (auth.mode !== undefined && !AUTH_MODES.has(String(auth.mode))) {
    errors.push('auth.mode must be "none", "arcgis-oauth", or "iwa".');
  }
  if (auth.mode === "arcgis-oauth" && !nonEmptyString(auth.appId)) {
    errors.push("auth.appId is required when auth.mode is arcgis-oauth.");
  }
  if (
    auth.mode === "arcgis-oauth" &&
    nonEmptyString(auth.appId) &&
    PLACEHOLDER_APP_ID.test(auth.appId)
  ) {
    warnings.push(
      "auth.appId is still a placeholder. Sign-in stays disabled until it is replaced.",
    );
  }
  if (auth.popup !== undefined && typeof auth.popup !== "boolean") {
    errors.push("auth.popup must be a boolean.");
  }
  if (auth.popupCallbackUrl !== undefined) {
    assertUrl(auth.popupCallbackUrl, "auth.popupCallbackUrl", errors, { https: false });
  }
  if (auth.expiration !== undefined && !isPositiveNumber(auth.expiration)) {
    errors.push("auth.expiration must be a positive number of minutes.");
  }
  if (auth.trustedServers !== undefined) {
    if (!Array.isArray(auth.trustedServers)) {
      errors.push("auth.trustedServers must be an array of URLs.");
    } else {
      auth.trustedServers.forEach((server, index) => {
        assertUrl(server, `auth.trustedServers[${index}]`, errors, { https: true });
      });
    }
  }
  const portal = typeof portalUrl === "string" ? portalUrl : "https://www.arcgis.com";
  if (auth.mode === "iwa" && /arcgis\.com\/?$/i.test(portal)) {
    warnings.push(
      "auth.mode is iwa, but portalUrl points at ArcGIS Online. Integrated Windows Authentication requires ArcGIS Enterprise.",
    );
  }
}

function validateBranding(branding: unknown, errors: string[]): void {
  if (branding === undefined) return;
  if (!isRecord(branding)) {
    errors.push("branding must be an object.");
    return;
  }
  if (branding.name !== undefined && !nonEmptyString(branding.name)) {
    errors.push("branding.name must be a non-empty string.");
  }
  if (branding.tagline !== undefined && typeof branding.tagline !== "string") {
    errors.push("branding.tagline must be a string.");
  }
  if (
    branding.accent !== undefined &&
    (typeof branding.accent !== "string" || !HEX_COLOR.test(branding.accent))
  ) {
    errors.push("branding.accent must be a hex color such as #6e4e2e.");
  }
}

function validateUi(ui: unknown, errors: string[]): void {
  if (ui === undefined) return;
  if (!isRecord(ui)) {
    errors.push("ui must be an object.");
    return;
  }
  if (ui.exampleSwitcher !== undefined && typeof ui.exampleSwitcher !== "boolean") {
    errors.push("ui.exampleSwitcher must be a boolean.");
  }
}

function validateExtent(extent: unknown, errors: string[], warnings: string[]): void {
  if (extent === undefined) return;
  if (!isRecord(extent)) {
    errors.push("extent must be an object.");
    return;
  }
  for (const key of ["xmin", "ymin", "xmax", "ymax"] as const) {
    if (typeof extent[key] !== "number" || !Number.isFinite(extent[key])) {
      errors.push(`extent.${key} must be a finite number.`);
    }
  }
  if (
    typeof extent.xmin === "number" &&
    typeof extent.xmax === "number" &&
    extent.xmin >= extent.xmax
  ) {
    errors.push("extent.xmin must be less than extent.xmax.");
  }
  if (
    typeof extent.ymin === "number" &&
    typeof extent.ymax === "number" &&
    extent.ymin >= extent.ymax
  ) {
    errors.push("extent.ymin must be less than extent.ymax.");
  }
  if (extent.wkid === undefined) {
    warnings.push("extent.wkid is missing and will default to 4326.");
  } else if (!Number.isInteger(extent.wkid) || Number(extent.wkid) <= 0) {
    errors.push("extent.wkid must be a positive integer.");
  }
}

function validateCenter(center: unknown, zoom: unknown, errors: string[]): void {
  if (center !== undefined) {
    if (
      !Array.isArray(center) ||
      center.length !== 2 ||
      !center.every((value) => typeof value === "number" && Number.isFinite(value))
    ) {
      errors.push("center must be a longitude and latitude pair.");
    }
  }
  if (zoom !== undefined && (typeof zoom !== "number" || zoom < 0 || zoom > 23)) {
    errors.push("zoom must be a number from 0 to 23.");
  }
}

function validateBasemap(basemap: unknown, path: string, errors: string[]): void {
  if (basemap === undefined) return;
  if (typeof basemap === "string") {
    if (!basemap.trim()) errors.push(`${path} must not be empty.`);
    return;
  }
  if (!isRecord(basemap)) {
    errors.push(`${path} must be a basemap id or an object with a url or id.`);
    return;
  }
  if (basemap.url === undefined && basemap.id === undefined) {
    errors.push(`${path} needs a url or an id.`);
  }
  if (basemap.url !== undefined) assertUrl(basemap.url, `${path}.url`, errors, { https: true });
  if (basemap.id !== undefined && !nonEmptyString(basemap.id)) {
    errors.push(`${path}.id must be a non-empty string.`);
  }
  if (basemap.title !== undefined && typeof basemap.title !== "string") {
    errors.push(`${path}.title must be a string.`);
  }
}

function validateLayers(
  layers: unknown,
  webMapItemId: unknown,
  errors: string[],
  warnings: string[],
): LayerConfig[] {
  if (!Array.isArray(layers)) {
    errors.push("layers must be an array.");
    return [];
  }
  if (layers.length === 0 && !nonEmptyString(webMapItemId)) {
    errors.push("layers must include at least one layer, or set webMapItemId.");
  }
  const ids = new Set<string>();
  let webMapLayers = 0;
  const parsed: LayerConfig[] = [];

  layers.forEach((layer, index) => {
    const path = `layers[${index}]`;
    if (!isRecord(layer)) {
      errors.push(`${path} must be an object.`);
      return;
    }
    if (!nonEmptyString(layer.id) || !LAYER_ID.test(layer.id)) {
      errors.push(
        `${path}.id must start with a letter and use only letters, numbers, hyphens, and underscores.`,
      );
    } else if (ids.has(layer.id)) {
      errors.push(`${path}.id "${layer.id}" is duplicated.`);
    } else {
      ids.add(layer.id);
    }
    if (!nonEmptyString(layer.title)) errors.push(`${path}.title is required.`);
    if (!LAYER_TYPES.has(String(layer.type))) {
      errors.push(`${path}.type must be feature, map-image, vector-tile, webmap, geojson, or csv.`);
      return;
    }
    if (layer.type === "webmap") {
      webMapLayers += 1;
      if (!nonEmptyString(layer.itemId))
        errors.push(`${path}.itemId is required for a web map layer.`);
    } else if (!isLayerUrl(layer.url)) {
      errors.push(`${path}.url must be an https URL or a relative path such as ./data/sites.csv.`);
    }
    if (layer.visible !== undefined && typeof layer.visible !== "boolean") {
      errors.push(`${path}.visible must be a boolean.`);
    }
    if (layer.opacity !== undefined && !isUnitInterval(layer.opacity)) {
      errors.push(`${path}.opacity must be a number from 0 to 1.`);
    }
    if (layer.minScale !== undefined && !isNonNegative(layer.minScale)) {
      errors.push(`${path}.minScale must be a non-negative number.`);
    }
    if (layer.maxScale !== undefined && !isNonNegative(layer.maxScale)) {
      errors.push(`${path}.maxScale must be a non-negative number.`);
    }
    if (
      layer.definitionExpression !== undefined &&
      typeof layer.definitionExpression !== "string"
    ) {
      errors.push(`${path}.definitionExpression must be a string.`);
    }
    if (
      layer.selectable === true &&
      !QUERYABLE_LAYER_TYPES.has(String(layer.type)) &&
      layer.type !== "webmap"
    ) {
      warnings.push(
        `${path} is marked selectable, but ${String(layer.type)} layers cannot be selected. The flag will be ignored.`,
      );
    }
    validateFieldList(layer.popupFields, `${path}.popupFields`, errors);
    if (layer.exportableFields !== undefined) {
      if (
        !Array.isArray(layer.exportableFields) ||
        layer.exportableFields.some((field) => !nonEmptyString(field))
      ) {
        errors.push(`${path}.exportableFields must be an array of field names.`);
      }
    }
    if (layer.sublayers !== undefined) {
      if (!Array.isArray(layer.sublayers)) {
        errors.push(`${path}.sublayers must be an array.`);
      } else if (layer.type !== "map-image") {
        warnings.push(`${path}.sublayers is only used by map-image layers.`);
      } else {
        layer.sublayers.forEach((sublayer, sublayerIndex) => {
          if (!isRecord(sublayer) || !Number.isInteger(sublayer.id)) {
            errors.push(`${path}.sublayers[${sublayerIndex}].id must be an integer.`);
          }
        });
      }
    }
    if (layer.copyright !== undefined && typeof layer.copyright !== "string") {
      errors.push(`${path}.copyright must be a string.`);
    }
    parsed.push(layer as unknown as LayerConfig);
  });

  if (webMapLayers > 1) errors.push("Only one layer of type webmap is allowed.");
  if (webMapLayers > 0 && nonEmptyString(webMapItemId)) {
    warnings.push(
      "Both webMapItemId and a webmap layer are set. The web map item becomes the map, and the webmap layer's operational layers are added as well.",
    );
  }
  return parsed;
}

function validateFieldList(fields: unknown, path: string, errors: string[]): void {
  if (fields === undefined) return;
  if (!Array.isArray(fields)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  fields.forEach((field, index) => {
    if (!isRecord(field) || !nonEmptyString(field.field)) {
      errors.push(`${path}[${index}].field is required.`);
      return;
    }
    if (
      field.format !== undefined &&
      !["number", "number-2", "date"].includes(String(field.format))
    ) {
      errors.push(`${path}[${index}].format must be number, number-2, or date.`);
    }
  });
}

function validateSearch(search: unknown, layers: LayerConfig[], errors: string[]): void {
  if (search === undefined) return;
  if (!isRecord(search)) {
    errors.push("search must be an object.");
    return;
  }
  if (search.enabled !== undefined && typeof search.enabled !== "boolean") {
    errors.push("search.enabled must be a boolean.");
  }
  if (
    search.includeDefaultSources !== undefined &&
    typeof search.includeDefaultSources !== "boolean"
  ) {
    errors.push("search.includeDefaultSources must be a boolean.");
  }
  if (search.layerSources === undefined) return;
  if (!Array.isArray(search.layerSources)) {
    errors.push("search.layerSources must be an array.");
    return;
  }
  const ids = new Set(layers.map((layer) => layer.id));
  search.layerSources.forEach((source, index) => {
    const path = `search.layerSources[${index}]`;
    if (!isRecord(source)) {
      errors.push(`${path} must be an object.`);
      return;
    }
    if (!nonEmptyString(source.layerId) || !ids.has(source.layerId)) {
      errors.push(`${path}.layerId must match a layer id.`);
    }
    if (
      !Array.isArray(source.searchFields) ||
      source.searchFields.length === 0 ||
      source.searchFields.some((field) => !nonEmptyString(field))
    ) {
      errors.push(`${path}.searchFields must list at least one field name.`);
    }
    if (!nonEmptyString(source.displayField)) errors.push(`${path}.displayField is required.`);
  });
}

function assertUrl(
  value: unknown,
  path: string,
  errors: string[],
  options: { https: boolean },
): void {
  if (typeof value !== "string" || !isAllowedUrl(value, options.https)) {
    errors.push(
      options.https
        ? `${path} must be an https URL.`
        : `${path} must be an http(s) URL or a relative path.`,
    );
  }
}

function isLayerUrl(value: unknown): boolean {
  return typeof value === "string" && isAllowedUrl(value, false);
}

function isAllowedUrl(value: string, httpsOnly: boolean): boolean {
  if (!httpsOnly && (value.startsWith("./") || value.startsWith("../") || value.startsWith("/"))) {
    return !value.includes("..\\") && !/^\/\//.test(value);
  }
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    if (httpsOnly) return false;
    return (
      url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
  errors: string[],
): string | undefined {
  if (!nonEmptyString(record[key])) {
    errors.push(`${key} is required.`);
    return undefined;
  }
  return record[key];
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegative(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isUnitInterval(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
