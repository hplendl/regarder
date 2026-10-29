import type { ExampleCatalog } from "../config/types.ts";
import { must } from "../util.ts";

export interface Shell {
  root: HTMLElement;
  mapHost: HTMLElement;
  loader: HTMLElement;
  layerListHost: HTMLElement;
  legendHost: HTMLElement;
  printHost: HTMLElement;
  basemapHost: HTMLElement;
  notices: HTMLElement;
  account: HTMLElement;
  exampleSelect: HTMLElement;
  title: HTMLElement;
  description: HTMLElement;
  brandName: HTMLElement;
  brandTagline: HTMLElement;
  selectionMode: HTMLElement;
  addSwitch: HTMLElement;
  queryLayer: HTMLElement;
  queryField: HTMLElement;
  queryOperator: HTMLElement;
  queryValue: HTMLInputElement;
  queryValueWrap: HTMLElement;
  queryCoded: HTMLElement;
  queryButton: HTMLElement;
  clearButton: HTMLElement;
  zoomButton: HTMLElement;
  selectionCount: HTMLElement;
  tableLayer: HTMLElement;
  tableEmpty: HTMLElement;
  tableHost: HTMLElement;
  exportLayer: HTMLElement;
  exportScope: HTMLElement;
  exportFormat: HTMLElement;
  exportButton: HTMLElement;
  exportStatus: HTMLElement;
  exportCapability: HTMLElement;
  about: HTMLElement;
  aboutBody: HTMLElement;
  panelStart: HTMLElement;
  panelEnd: HTMLElement;
}

export function renderShell(): Shell {
  const host = document.querySelector("#app");
  if (!host) throw new Error("Missing #app.");
  const root = document.createElement("div");
  root.className = "app";
  root.dataset.theme = "light";
  root.innerHTML = TEMPLATE;
  host.replaceChildren(root);
  return {
    root,
    mapHost: must(root, "#map-host"),
    loader: must(root, "#map-loader"),
    layerListHost: must(root, "#layer-list"),
    legendHost: must(root, "#legend"),
    printHost: must(root, "#print-host"),
    basemapHost: must(root, "#basemap-host"),
    notices: must(root, "#notices"),
    account: must(root, "#account"),
    exampleSelect: must(root, "#example-select"),
    title: must(root, "#map-title"),
    description: must(root, "#map-description"),
    brandName: must(root, "#brand-name"),
    brandTagline: must(root, "#brand-tagline"),
    selectionMode: must(root, "#selection-mode"),
    addSwitch: must(root, "#add-selection"),
    queryLayer: must(root, "#query-layer"),
    queryField: must(root, "#query-field"),
    queryOperator: must(root, "#query-operator"),
    queryValue: must(root, "#query-value"),
    queryValueWrap: must(root, "#query-value-wrap"),
    queryCoded: must(root, "#query-coded"),
    queryButton: must(root, "#query-button"),
    clearButton: must(root, "#clear-selection"),
    zoomButton: must(root, "#zoom-selection"),
    selectionCount: must(root, "#selection-count"),
    tableLayer: must(root, "#table-layer"),
    tableEmpty: must(root, "#table-empty"),
    tableHost: must(root, "#table-host"),
    exportLayer: must(root, "#export-layer"),
    exportScope: must(root, "#export-scope"),
    exportFormat: must(root, "#export-format"),
    exportButton: must(root, "#export-button"),
    exportStatus: must(root, "#export-status"),
    exportCapability: must(root, "#export-capability"),
    about: must(root, "#about"),
    aboutBody: must(root, "#about-body"),
    panelStart: must(root, "#panel-start"),
    panelEnd: must(root, "#panel-end"),
  };
}

export function renderFatal(title: string, details: string[]): void {
  document.body.classList.add("calcite-mode-light");
  const host = document.querySelector("#app");
  if (!host) return;
  host.replaceChildren();
  const panel = document.createElement("section");
  panel.className = "fatal";
  const heading = document.createElement("h1");
  heading.textContent = "Cartouche could not open this configuration";
  const lead = document.createElement("p");
  lead.textContent = title;
  const list = document.createElement("ul");
  for (const detail of details) {
    const item = document.createElement("li");
    item.textContent = detail;
    list.append(item);
  }
  panel.append(heading, lead, list);
  host.append(panel);
}

export function fillExampleSelect(
  select: HTMLElement,
  catalog: ExampleCatalog | undefined,
  activeId: string | undefined,
  enabled: boolean,
): void {
  const field = select.closest(".switcher");
  if (!enabled || !catalog || catalog.examples.length < 2) {
    field?.setAttribute("hidden", "");
    return;
  }
  field?.removeAttribute("hidden");
  select.replaceChildren();
  for (const example of catalog.examples) {
    const option = document.createElement("calcite-option");
    option.setAttribute("value", example.id);
    option.textContent = example.title;
    if (example.id === activeId) option.setAttribute("selected", "");
    select.append(option);
  }
}

export function showNotice(
  host: HTMLElement,
  kind: "info" | "warning" | "danger" | "success",
  title: string,
  message: string,
): void {
  const notice = document.createElement("calcite-notice");
  notice.setAttribute("open", "");
  notice.setAttribute("kind", kind);
  notice.setAttribute("scale", "s");
  const titleSlot = document.createElement("div");
  titleSlot.slot = "title";
  titleSlot.textContent = title;
  const messageSlot = document.createElement("div");
  messageSlot.slot = "message";
  messageSlot.textContent = message;
  notice.append(titleSlot, messageSlot);
  host.append(notice);
}

export function applyAccent(root: HTMLElement, accent: string | undefined): void {
  if (!accent) return;
  root.style.setProperty("--brass", accent);
  root.style.setProperty("--calcite-color-brand", accent);
  root.style.setProperty("--calcite-color-brand-hover", accent);
  root.style.setProperty("--calcite-color-brand-press", accent);
}

const TEMPLATE = `
<header class="masthead">
  <div class="brand">
    <svg class="mark" viewBox="0 0 36 36" aria-hidden="true">
      <rect x="3" y="3" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6"/>
      <rect x="6.5" y="6.5" width="23" height="23" fill="none" stroke="currentColor" stroke-width="0.8"/>
      <path d="M12 18h12M18 12v12" stroke="currentColor" stroke-width="0.8"/>
    </svg>
    <div>
      <p class="wordmark" id="brand-name"></p>
      <p class="tagline" id="brand-tagline"></p>
    </div>
  </div>
  <div class="mast-title">
    <h1 id="map-title"></h1>
    <p id="map-description"></p>
  </div>
  <div class="mast-actions">
    <label class="switcher">
      <span>Example</span>
      <calcite-select id="example-select" label="Example configuration" scale="s"></calcite-select>
    </label>
    <div class="panel-toggles">
      <calcite-button id="toggle-layers" appearance="outline" scale="s">Layers</calcite-button>
      <calcite-button id="toggle-tools" appearance="outline" scale="s">Tools</calcite-button>
    </div>
    <calcite-button id="about-button" appearance="transparent" scale="s">About</calcite-button>
    <div id="account"></div>
  </div>
</header>
<div class="workspace">
  <aside class="panel panel-start" id="panel-start" data-open="false" aria-label="Layers and legend">
    <calcite-tabs class="fill-tabs">
      <calcite-tab-nav slot="title-group">
        <calcite-tab-title selected>Layers</calcite-tab-title>
        <calcite-tab-title>Legend</calcite-tab-title>
      </calcite-tab-nav>
      <calcite-tab selected><div id="layer-list" class="fill"></div></calcite-tab>
      <calcite-tab><div id="legend" class="fill"></div></calcite-tab>
    </calcite-tabs>
  </aside>
  <div class="stage">
    <div class="map-frame">
      <div id="map-host"></div>
      <div id="map-loader" class="map-loader">
        <calcite-loader label="Loading map"></calcite-loader>
        <p>Opening the map</p>
      </div>
    </div>
  </div>
  <aside class="panel panel-end" id="panel-end" data-open="false" aria-label="Select, export, and print">
    <div id="notices"></div>
    <calcite-tabs class="fill-tabs">
      <calcite-tab-nav slot="title-group">
        <calcite-tab-title selected>Select</calcite-tab-title>
        <calcite-tab-title>Export</calcite-tab-title>
        <calcite-tab-title>Print</calcite-tab-title>
        <calcite-tab-title>Basemap</calcite-tab-title>
      </calcite-tab-nav>
      <calcite-tab selected>
        <div class="tool-stack">
          <calcite-segmented-control id="selection-mode" scale="s" width="full">
            <calcite-segmented-control-item value="click" checked>Click</calcite-segmented-control-item>
            <calcite-segmented-control-item value="rectangle">Rectangle</calcite-segmented-control-item>
            <calcite-segmented-control-item value="lasso">Lasso</calcite-segmented-control-item>
          </calcite-segmented-control>
          <p class="hint" id="selection-hint">Click a feature to select it. Hold Shift, or turn on Add, to keep the current selection.</p>
          <calcite-label layout="inline">
            <calcite-switch id="add-selection"></calcite-switch>
            Add to current selection
          </calcite-label>
          <div class="tool-row">
            <calcite-button id="zoom-selection" appearance="outline" scale="s">Zoom to</calcite-button>
            <calcite-button id="clear-selection" appearance="outline" scale="s" kind="danger">Clear</calcite-button>
          </div>
          <h2>Attribute query</h2>
          <calcite-label>Layer<calcite-select id="query-layer" label="Query layer"></calcite-select></calcite-label>
          <calcite-label>Field<calcite-select id="query-field" label="Query field"></calcite-select></calcite-label>
          <calcite-label>Operator<calcite-select id="query-operator" label="Query operator"></calcite-select></calcite-label>
          <div id="query-value-wrap">
            <calcite-label>Value<calcite-input id="query-value" label="Query value"></calcite-input></calcite-label>
          </div>
          <calcite-label id="query-coded-label">Value<calcite-select id="query-coded" label="Coded value"></calcite-select></calcite-label>
          <calcite-button id="query-button" width="full">Run query</calcite-button>
        </div>
      </calcite-tab>
      <calcite-tab>
        <div class="tool-stack">
          <p class="hint">CSV and GeoJSON are built in the browser. Shapefile, file geodatabase, and mobile geodatabase use the service createReplica operation when that service allows it.</p>
          <calcite-label>Layer<calcite-select id="export-layer" label="Export layer"></calcite-select></calcite-label>
          <calcite-label>Features<calcite-select id="export-scope" label="Export scope"></calcite-select></calcite-label>
          <calcite-label>Format<calcite-select id="export-format" label="Export format"></calcite-select></calcite-label>
          <p id="export-capability" class="hint"></p>
          <calcite-button id="export-button" width="full">Export</calcite-button>
          <div id="export-status" class="status"></div>
        </div>
      </calcite-tab>
      <calcite-tab><div id="print-host" class="fill"></div></calcite-tab>
      <calcite-tab><div id="basemap-host" class="fill"></div></calcite-tab>
    </calcite-tabs>
  </aside>
</div>
<section class="table-dock" aria-label="Selection results">
  <div class="table-bar">
    <div>
      <h2>Selection</h2>
      <p id="selection-count">Nothing selected</p>
    </div>
    <calcite-select id="table-layer" label="Table layer" scale="s"></calcite-select>
  </div>
  <div id="table-empty" class="table-empty">
    <p>Select features to list them here.</p>
    <p>Use click, a rectangle, a lasso, or an attribute query. The table follows the active layer.</p>
  </div>
  <div id="table-host"></div>
</section>
<calcite-dialog id="about" heading="About this map" modal scale="m">
  <div id="about-body"></div>
</calcite-dialog>
`;
