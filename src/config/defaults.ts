export const APP_VERSION = "1.0.0";

export const DEFAULT_PORTAL_URL = "https://www.arcgis.com";

export const DEFAULT_PRINT_SERVICE_URL =
  "https://utility.arcgisonline.com/arcgis/rest/services/Utilities/PrintingTools/GPServer/Export%20Web%20Map%20Task";

export const DEFAULT_BASEMAP_GALLERY = [
  {
    title: "Topographic",
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer",
  },
  {
    title: "Streets",
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer",
  },
  {
    title: "Imagery",
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
  },
  {
    title: "Light gray",
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer",
  },
  {
    title: "Dark gray",
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer",
  },
  {
    title: "Oceans",
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer",
  },
  {
    title: "National Geographic",
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer",
  },
] as const;

export const PLACEHOLDER_APP_ID = /^(your[_-]?client[_-]?id|your[_-]?app[_-]?id)$/i;

export const QUERYABLE_LAYER_TYPES = new Set(["feature", "geojson", "csv"]);

export const TABLE_ROW_LIMIT = 1000;
export const HIGHLIGHT_LIMIT = 2000;
export const EXPORT_ROW_LIMIT = 10000;
