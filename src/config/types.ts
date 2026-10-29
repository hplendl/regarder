export type AuthMode = "none" | "arcgis-oauth" | "iwa";

export type LayerType = "feature" | "map-image" | "vector-tile" | "webmap" | "geojson" | "csv";

export type FieldFormat = "number" | "number-2" | "date";

export interface PopupFieldConfig {
  field: string;
  label?: string;
  format?: FieldFormat;
}

export interface SublayerConfig {
  id: number;
  title?: string;
  visible?: boolean;
  opacity?: number;
  definitionExpression?: string;
}

export interface PointStyleConfig {
  color?: string;
  size?: number;
  outlineColor?: string;
  sizeField?: string;
  minDataValue?: number;
  maxDataValue?: number;
  minSize?: number;
  maxSize?: number;
}

export interface LayerConfig {
  id: string;
  title: string;
  type: LayerType;
  url?: string;
  itemId?: string;
  visible?: boolean;
  opacity?: number;
  minScale?: number;
  maxScale?: number;
  definitionExpression?: string;
  popupFields?: PopupFieldConfig[];
  selectable?: boolean;
  /**
   * Attribute names included in CSV, GeoJSON, and replica exports.
   * Omit the property to export every attribute. Geometry is always included.
   */
  exportableFields?: string[];
  sublayers?: SublayerConfig[];
  latitudeField?: string;
  longitudeField?: string;
  delimiter?: string;
  copyright?: string;
  pointStyle?: PointStyleConfig;
}

export interface SearchLayerSourceConfig {
  layerId: string;
  searchFields: string[];
  displayField: string;
  placeholder?: string;
}

export interface BasemapConfig {
  title?: string;
  /** Well-known basemap id such as "osm" or "topo-vector". Ignored when url is set. */
  id?: string;
  /** Tile layer URL for a basemap that does not need an API key. */
  url?: string;
}

export interface ExtentConfig {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  wkid?: number;
}

export interface AuthConfig {
  mode?: AuthMode;
  appId?: string;
  popup?: boolean;
  popupCallbackUrl?: string;
  expiration?: number;
  trustedServers?: string[];
}

export interface BrandingConfig {
  /** Wordmark. Defaults to Regarder. */
  name?: string;
  tagline?: string;
  /** Hex color used for the accent, such as #6e4e2e. */
  accent?: string;
}

export interface RegarderConfig {
  title: string;
  description?: string;
  branding?: BrandingConfig;
  theme?: "light" | "dark";
  portalUrl?: string;
  auth?: AuthConfig;
  basemap?: string | BasemapConfig;
  basemapGallery?: BasemapConfig[];
  extent?: ExtentConfig;
  center?: [number, number];
  zoom?: number;
  printServiceUrl?: string;
  /**
   * When set, this web map becomes the map, including its basemap.
   * Layers in `layers` are added on top. An initial extent overrides the web map extent.
   */
  webMapItemId?: string;
  search?: {
    enabled?: boolean;
    includeDefaultSources?: boolean;
    placeholder?: string;
    layerSources?: SearchLayerSourceConfig[];
  };
  ui?: {
    exampleSwitcher?: boolean;
  };
  layers: LayerConfig[];
}

export interface ExampleCatalog {
  default: string;
  examples: { id: string; title: string }[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}
