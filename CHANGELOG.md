# Changelog

All notable changes to Regarder are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-29

First public release.

- Config-driven map viewer for feature layers, map image services, vector tiles, web maps, GeoJSON,
  and CSV.
- Two example configurations that use public ArcGIS sample services and run without a login.
- Sign-in for ArcGIS Online and ArcGIS Enterprise through OAuth 2.0, which is the path portal SAML
  and enterprise logins use, plus an Integrated Windows Authentication option for intranet portals.
- Selection by click, rectangle, lasso, and attribute query, with highlights and a feature table.
- Export of selected or filtered features to CSV and GeoJSON, and to shapefile, file geodatabase, or
  mobile geodatabase when the feature service supports `createReplica`.
- Print layouts and formats against a configurable print service.
- Layer list, legend, layer search, basemap gallery, home, and zoom in a responsive layout.
