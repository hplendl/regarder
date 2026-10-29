import Extent from "@arcgis/core/geometry/Extent.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import Viewpoint from "@arcgis/core/Viewpoint.js";
import SketchViewModel from "@arcgis/core/widgets/Sketch/SketchViewModel.js";
import LayerSearchSource from "@arcgis/core/widgets/Search/LayerSearchSource.js";
import type { ArcgisBasemapGallery } from "@arcgis/map-components/components/arcgis-basemap-gallery";
import type { ArcgisHome } from "@arcgis/map-components/components/arcgis-home";
import type { ArcgisLayerList } from "@arcgis/map-components/components/arcgis-layer-list";
import type { ArcgisLegend } from "@arcgis/map-components/components/arcgis-legend";
import type { ArcgisMap } from "@arcgis/map-components/components/arcgis-map";
import type { ArcgisPrint } from "@arcgis/map-components/components/arcgis-print";
import type { ArcgisSearch } from "@arcgis/map-components/components/arcgis-search";
import {
  configureIdentity,
  restoreUser,
  signInIwa,
  signInOAuth,
  signOut,
  type SignedInUser,
} from "../auth/session.ts";
import { APP_VERSION } from "../config/defaults.ts";
import { loadExampleCatalog, resolveConfigDocument } from "../config/load.ts";
import { normalizeConfig } from "../config/normalize.ts";
import { resolveApiKey, resolveAppId } from "../config/secrets.ts";
import type { RegarderConfig } from "../config/types.ts";
import { validateConfig } from "../config/validate.ts";
import { createBasemap, createBasemapSource } from "../map/basemaps.ts";
import "../map/elements.ts";
import { addConfiguredLayers, type QueryableEntry, type QueryLayer } from "../map/layers.ts";
import { QUERY_OPERATORS, buildWhereClause, type QueryFieldType } from "../query/where.ts";
import { messageOf } from "../util.ts";
import { runExport, serviceExportInfo, type ExportFormat } from "./exporter.ts";
import { SelectionController } from "./selection.ts";
import {
  applyAccent,
  fillExampleSelect,
  renderFatal,
  renderShell,
  showNotice,
} from "../ui/shell.ts";

type DrawMode = "click" | "rectangle" | "lasso";

export async function start(): Promise<void> {
  let documentJson: unknown;
  try {
    documentJson = await resolveConfigDocument(window.location.search);
  } catch (error) {
    renderFatal(messageOf(error), [
      "Copy config.example.json to public/config.json, or open the app with ?config=usa-reference.",
    ]);
    return;
  }

  const validation = validateConfig(documentJson);
  if (!validation.ok) {
    renderFatal("The configuration file has errors.", validation.errors);
    return;
  }

  const config = normalizeConfig(documentJson as RegarderConfig);
  const catalog = await loadExampleCatalog().catch(() => undefined);
  const requested = new URLSearchParams(window.location.search).get("config") ?? catalog?.default;
  document.title = `${config.title} · ${config.branding?.name ?? "Regarder"}`;
  document.body.classList.add(config.theme === "dark" ? "calcite-mode-dark" : "calcite-mode-light");

  const shell = renderShell();
  shell.root.dataset.theme = config.theme ?? "light";
  applyAccent(shell.root, config.branding?.accent);
  shell.brandName.textContent = config.branding?.name ?? "Regarder";
  shell.brandTagline.textContent = config.branding?.tagline ?? "";
  shell.title.textContent = config.title;
  shell.description.textContent = config.description ?? "";
  fillExampleSelect(
    shell.exampleSelect,
    catalog,
    requested ?? undefined,
    config.ui?.exampleSwitcher !== false,
  );
  shell.exampleSelect.addEventListener("calciteSelectChange", () => {
    const value = selectValue(shell.exampleSelect);
    if (!value) return;
    const url = new URL(window.location.href);
    url.searchParams.set("config", value);
    window.location.assign(url.toString());
  });

  for (const warning of validation.warnings)
    showNotice(shell.notices, "warning", "Configuration", warning);

  const appId = resolveAppId(config.auth?.appId, import.meta.env.VITE_ARCGIS_APP_ID);
  const apiKey = resolveApiKey(import.meta.env.VITE_ARCGIS_API_KEY);
  configureIdentity(config, appId, apiKey);
  const user = await restoreUser(config.portalUrl ?? "https://www.arcgis.com").catch(
    () => undefined,
  );
  renderAccount(shell.account, config, appId, user);

  const basemap = createBasemap(config.basemap);
  const mapElement = document.createElement("arcgis-map") as ArcgisMap;
  mapElement.id = "map";
  if (config.webMapItemId) mapElement.itemId = config.webMapItemId;
  else mapElement.basemap = basemap;
  if (!config.extent && config.center) {
    mapElement.center = config.center;
    mapElement.zoom = config.zoom ?? 3;
  }

  const zoom = document.createElement("arcgis-zoom");
  zoom.setAttribute("slot", "top-left");
  const home = document.createElement("arcgis-home") as ArcgisHome;
  home.setAttribute("slot", "top-left");
  const search = document.createElement("arcgis-search") as ArcgisSearch;
  search.setAttribute("slot", "top-right");
  if (config.search?.placeholder) search.allPlaceholder = config.search.placeholder;
  search.includeDefaultSourcesDisabled = config.search?.includeDefaultSources !== true;
  if (config.search?.enabled === false) search.hidden = true;
  const scaleBar = document.createElement("arcgis-scale-bar");
  scaleBar.setAttribute("slot", "bottom-left");
  mapElement.append(zoom, home, search, scaleBar);
  shell.mapHost.append(mapElement);

  const legend = document.createElement("arcgis-legend") as ArcgisLegend;
  legend.referenceElement = mapElement;
  shell.legendHost.append(legend);
  const layerList = document.createElement("arcgis-layer-list") as ArcgisLayerList;
  layerList.referenceElement = mapElement;
  shell.layerListHost.append(layerList);
  const gallery = document.createElement("arcgis-basemap-gallery") as ArcgisBasemapGallery;
  gallery.referenceElement = mapElement;
  gallery.source = createBasemapSource(config.basemapGallery ?? []);
  shell.basemapHost.append(gallery);
  const print = document.createElement("arcgis-print") as ArcgisPrint;
  print.referenceElement = mapElement;
  print.printServiceUrl = config.printServiceUrl;
  print.allowedFormats = ["pdf", "png32", "jpg", "svg"];
  print.allowedLayouts = [
    "letter-ansi-a-landscape",
    "letter-ansi-a-portrait",
    "a4-landscape",
    "a4-portrait",
    "tabloid-ansi-b-landscape",
    "tabloid-ansi-b-portrait",
    "map-only",
  ];
  shell.printHost.append(print);

  wirePanels(shell);
  wireAbout(shell, config, user);

  try {
    await mapElement.viewOnReady();
  } catch (error) {
    shell.loader.remove();
    showNotice(shell.notices, "danger", "Map", messageOf(error));
    return;
  }
  const view = mapElement.view;
  view.highlightOptions = {
    color: [176, 58, 46, 1],
    haloColor: [255, 236, 180, 1],
    haloOpacity: 1,
    fillOpacity: 0.45,
  };

  if (config.extent) {
    await view.goTo(
      new Extent({
        xmin: config.extent.xmin,
        ymin: config.extent.ymin,
        xmax: config.extent.xmax,
        ymax: config.extent.ymax,
        spatialReference: { wkid: config.extent.wkid ?? 4326 },
      }),
      { animate: false },
    );
  }
  home.viewpoint = new Viewpoint({ targetGeometry: view.extent });

  const map = mapElement.map ?? view.map;
  if (!map) throw new Error("The map did not start.");
  const loaded = await addConfiguredLayers(map, config);
  for (const error of loaded.errors) showNotice(shell.notices, "danger", "Layer", error);
  const queryable = loaded.entries;
  wireSearch(search, config, queryable);

  const sketchLayer = new GraphicsLayer({ listMode: "hide", title: "Selection sketch" });
  map.add(sketchLayer);
  const sketch = new SketchViewModel({
    view,
    layer: sketchLayer,
    updateOnGraphicClick: false,
    polygonSymbol: {
      type: "simple-fill",
      color: [138, 90, 43, 0.12],
      outline: { color: [94, 61, 30, 1], width: 1.5 },
    },
  });

  const selection = new SelectionController(
    view,
    shell.tableHost,
    shell.tableEmpty,
    shell.selectionCount,
    shell.tableLayer as HTMLElement & { value?: string },
    () => undefined,
  );

  let mode: DrawMode = "click";
  const setMode = (next: DrawMode) => {
    mode = next;
    sketch.cancel();
    view.popupEnabled = next === "click";
    const hint = document.querySelector("#selection-hint");
    if (hint) {
      hint.textContent =
        next === "click"
          ? "Click a feature to select it. Hold Shift, or turn on Add, to keep the current selection."
          : next === "rectangle"
            ? "Drag a rectangle around the features you want."
            : "Draw a freehand shape around the features you want.";
    }
    if (next === "rectangle") sketch.create("rectangle");
    if (next === "lasso") sketch.create("polygon", { mode: "freehand" });
  };

  shell.selectionMode.addEventListener("calciteSegmentedControlChange", () => {
    const value = selectValue(shell.selectionMode);
    if (value === "click" || value === "rectangle" || value === "lasso") setMode(value);
  });
  shell.addSwitch.addEventListener("calciteSwitchChange", () => {
    selection.additive = switchChecked(shell.addSwitch);
  });
  view.on("click", (event) => {
    if (mode !== "click") return;
    selection.additive = switchChecked(shell.addSwitch) || event.native.shiftKey;
    void selection.replaceFromClick(queryable, event).catch((error: unknown) => {
      showNotice(shell.notices, "danger", "Selection", messageOf(error));
    });
  });
  sketch.on("create", (event) => {
    if (event.state !== "complete" || !event.graphic?.geometry) return;
    selection.additive = switchChecked(shell.addSwitch);
    void selection
      .replaceFromGeometry(queryable, event.graphic.geometry)
      .catch((error: unknown) => showNotice(shell.notices, "danger", "Selection", messageOf(error)))
      .finally(() => {
        if (mode === "rectangle") sketch.create("rectangle");
        if (mode === "lasso") sketch.create("polygon", { mode: "freehand" });
      });
  });

  shell.clearButton.addEventListener("click", () => {
    sketchLayer.removeAll();
    selection.clear();
  });
  shell.zoomButton.addEventListener("click", () => {
    const active = selection.active();
    const target = active?.geometry ?? sketchLayer.graphics.at(0)?.geometry;
    if (target) void view.goTo(target);
    else if (active) {
      void active.entry.layer
        .queryExtent(objectIdQuery(active.entry.layer, active.objectIds.slice(0, 200)))
        .then((result) => view.goTo(result.extent));
    }
  });
  shell.tableLayer.addEventListener("calciteSelectChange", () => {
    const id = selectValue(shell.tableLayer);
    if (id) selection.show(id);
  });

  wireQuery(shell, queryable, selection);
  wireExport(shell, queryable, selection);
  shell.loader.remove();
  if (queryable.length === 0 && loaded.errors.length === 0) {
    showNotice(
      shell.notices,
      "info",
      "Layers",
      "This configuration has no selectable feature layers.",
    );
  }
}

function wireSearch(
  search: ArcgisSearch,
  config: RegarderConfig,
  queryable: QueryableEntry[],
): void {
  const sources = config.search?.layerSources ?? [];
  if (sources.length === 0) return;
  search.sources.removeAll();
  for (const source of sources) {
    const entry = queryable.find(
      (candidate) => candidate.config.id === source.layerId || candidate.id === source.layerId,
    );
    if (!entry) continue;
    search.sources.add(
      new LayerSearchSource({
        layer: entry.layer,
        searchFields: source.searchFields,
        displayField: source.displayField,
        exactMatch: false,
        outFields: ["*"],
        name: entry.title,
        placeholder: source.placeholder || `Find ${entry.title}`,
      }),
    );
  }
}

function wireQuery(
  shell: ReturnType<typeof renderShell>,
  queryable: QueryableEntry[],
  selection: SelectionController,
): void {
  setOptions(
    shell.queryLayer,
    queryable.map((entry) => ({ value: entry.id, label: entry.title })),
  );
  setOptions(
    shell.queryOperator,
    QUERY_OPERATORS.map((operator) => ({ value: operator.id, label: operator.label })),
  );
  const refreshFields = () => {
    const entry = queryable.find((candidate) => candidate.id === selectValue(shell.queryLayer));
    const fields = (entry?.layer.fields ?? []).filter((field) =>
      isQueryableField(field.name, field.type),
    );
    const ordered = [
      ...fields.filter((field) => field.type === "string"),
      ...fields.filter((field) => field.type !== "string"),
    ];
    setOptions(
      shell.queryField,
      ordered.map((field) => ({ value: field.name, label: field.alias || field.name })),
    );
    refreshValueControl(shell, entry);
  };
  shell.queryLayer.addEventListener("calciteSelectChange", refreshFields);
  shell.queryField.addEventListener("calciteSelectChange", () => {
    const entry = queryable.find((candidate) => candidate.id === selectValue(shell.queryLayer));
    refreshValueControl(shell, entry);
  });
  refreshFields();
  shell.queryButton.addEventListener("click", () => {
    const entry = queryable.find((candidate) => candidate.id === selectValue(shell.queryLayer));
    if (!entry) return;
    const fieldName = selectValue(shell.queryField);
    const field = entry.layer.fields.find((item) => item.name === fieldName);
    if (!field) return;
    const operator = selectValue(shell.queryOperator) as (typeof QUERY_OPERATORS)[number]["id"];
    const coded = selectValue(shell.queryCoded);
    const typed = inputValue(shell.queryValue);
    const value = codedWrapVisible(shell) ? coded : typed;
    const built = buildWhereClause(field.name, operator, value, fieldKind(field.type));
    if (!built.ok) {
      showNotice(shell.notices, "warning", "Query", built.error);
      return;
    }
    void selection.replaceFromWhere(entry, built.where).catch((error: unknown) => {
      showNotice(shell.notices, "danger", "Query", messageOf(error));
    });
  });
}

function wireExport(
  shell: ReturnType<typeof renderShell>,
  queryable: QueryableEntry[],
  selection: SelectionController,
): void {
  setOptions(
    shell.exportLayer,
    queryable.map((entry) => ({ value: entry.id, label: entry.title })),
  );
  setOptions(shell.exportScope, [
    { value: "selected", label: "Selected features" },
    { value: "all", label: "All features matching the layer filter" },
  ]);
  const formats: { value: ExportFormat; label: string }[] = [
    { value: "csv", label: "CSV" },
    { value: "geojson", label: "GeoJSON" },
    { value: "shapefile", label: "Shapefile" },
    { value: "filegdb", label: "File geodatabase" },
    { value: "sqlite", label: "Mobile geodatabase" },
  ];
  const refreshFormats = () => {
    const entry = queryable.find((candidate) => candidate.id === selectValue(shell.exportLayer));
    setOptions(shell.exportFormat, formats);
    if (!entry) return;
    const requestedId = entry.id;
    void serviceExportInfo(entry.layer)
      .then((info) => {
        if (selectValue(shell.exportLayer) !== requestedId) return;
        for (const option of shell.exportFormat.querySelectorAll("calcite-option")) {
          const value = option.getAttribute("value") as ExportFormat | null;
          const serviceFormat = value === "shapefile" || value === "filegdb" || value === "sqlite";
          const unavailable = Boolean(serviceFormat && value && !info.formats.includes(value));
          option.toggleAttribute("disabled", unavailable);
          (option as HTMLElement & { disabled: boolean }).disabled = unavailable;
        }
        const current = selectValue(shell.exportFormat) as ExportFormat;
        if (
          (current === "shapefile" || current === "filegdb" || current === "sqlite") &&
          !info.formats.includes(current)
        ) {
          (shell.exportFormat as HTMLElement & { value: string }).value = "csv";
        }
        const offered = info.formats.map((format) =>
          format === "filegdb"
            ? "file geodatabase"
            : format === "sqlite"
              ? "mobile geodatabase"
              : format,
        );
        shell.exportCapability.textContent = offered.length
          ? `This service can also extract ${offered.join(" and ")}.`
          : "This layer has no extract capability. CSV and GeoJSON are built in the browser.";
      })
      .catch(() => {
        shell.exportCapability.textContent = "CSV and GeoJSON are built in the browser.";
      });
  };
  shell.exportLayer.addEventListener("calciteSelectChange", refreshFormats);
  refreshFormats();
  shell.exportButton.addEventListener("click", () => {
    const entry = queryable.find((candidate) => candidate.id === selectValue(shell.exportLayer));
    const format = selectValue(shell.exportFormat) as ExportFormat;
    const scope = selectValue(shell.exportScope) === "all" ? "all" : "selected";
    if (!entry || !format) return;
    const selected = selection.list().find((item) => item.entry.id === entry.id);
    if (scope === "selected" && !selected) {
      writeStatus(
        shell.exportStatus,
        "Select features on that layer first, or export the whole filtered layer.",
      );
      return;
    }
    writeStatus(shell.exportStatus, "Preparing the export…");
    void runExport({
      layer: entry.layer,
      title: entry.title,
      format,
      scope,
      selection: selected,
      exportableFields: entry.config.exportableFields,
    })
      .then((outcome) => {
        shell.exportStatus.replaceChildren();
        const text = document.createElement("p");
        text.textContent = outcome.message;
        shell.exportStatus.append(text);
        if (outcome.href) {
          const link = document.createElement("a");
          link.href = outcome.href;
          link.target = "_blank";
          link.rel = "noopener";
          link.textContent = outcome.hrefLabel ?? "Download";
          shell.exportStatus.append(link);
        }
      })
      .catch((error: unknown) => writeStatus(shell.exportStatus, messageOf(error)));
  });
}

function renderAccount(
  host: HTMLElement,
  config: RegarderConfig,
  appId: string | undefined,
  user: SignedInUser | undefined,
): void {
  host.replaceChildren();
  const mode = config.auth?.mode ?? "none";
  if (mode === "none") {
    const quiet = document.createElement("span");
    quiet.className = "account-quiet";
    quiet.textContent = "Public layers";
    host.append(quiet);
    return;
  }
  if (user) {
    const name = document.createElement("span");
    name.className = "account-name";
    name.textContent = user.fullName || user.username;
    const button = document.createElement("calcite-button");
    button.setAttribute("appearance", "outline");
    button.setAttribute("scale", "s");
    button.textContent = "Sign out";
    button.addEventListener("click", () => signOut());
    host.append(name, button);
    return;
  }
  if (mode === "arcgis-oauth" && !appId) {
    const quiet = document.createElement("span");
    quiet.className = "account-quiet";
    quiet.textContent = "Sign-in not configured";
    quiet.title = "Add an OAuth client ID with auth.appId or VITE_ARCGIS_APP_ID.";
    host.append(quiet);
    return;
  }
  const button = document.createElement("calcite-button");
  button.setAttribute("scale", "s");
  button.textContent = mode === "iwa" ? "Organization sign-in" : "Sign in";
  button.addEventListener("click", () => {
    const action =
      mode === "iwa"
        ? signInIwa(config.portalUrl ?? "https://www.arcgis.com")
        : signInOAuth(config.portalUrl ?? "https://www.arcgis.com");
    void action
      .then((signedIn) => {
        renderAccount(host, config, appId, signedIn);
      })
      .catch((error: unknown) => {
        const quiet = document.createElement("span");
        quiet.className = "account-quiet";
        quiet.textContent = messageOf(error);
        host.append(quiet);
      });
  });
  host.append(button);
}

function wireAbout(
  shell: ReturnType<typeof renderShell>,
  config: RegarderConfig,
  user: SignedInUser | undefined,
): void {
  const aboutButton = document.querySelector("#about-button");
  aboutButton?.addEventListener("click", () => {
    shell.aboutBody.replaceChildren();
    const paragraphs = [
      config.description ||
        "Regarder loads its map, layers, and tools from a single configuration file.",
      `${config.layers.length} configured layers. Portal ${config.portalUrl}. Authentication ${config.auth?.mode ?? "none"}.`,
      user ? `Signed in as ${user.fullName || user.username}.` : "No named user is signed in.",
      `Regarder ${APP_VERSION}, ArcGIS Maps SDK for JavaScript 4.34.`,
    ];
    for (const text of paragraphs) {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      shell.aboutBody.append(paragraph);
    }
    (shell.about as HTMLElement & { open: boolean }).open = true;
  });
}

function wirePanels(shell: ReturnType<typeof renderShell>): void {
  document.querySelector("#toggle-layers")?.addEventListener("click", () => {
    shell.panelStart.dataset.open = shell.panelStart.dataset.open === "true" ? "false" : "true";
    shell.panelEnd.dataset.open = "false";
  });
  document.querySelector("#toggle-tools")?.addEventListener("click", () => {
    shell.panelEnd.dataset.open = shell.panelEnd.dataset.open === "true" ? "false" : "true";
    shell.panelStart.dataset.open = "false";
  });
}

function refreshValueControl(
  shell: ReturnType<typeof renderShell>,
  entry: QueryableEntry | undefined,
): void {
  const fieldName = selectValue(shell.queryField);
  const field = entry?.layer.fields.find((item) => item.name === fieldName);
  const domain = field?.domain;
  const coded = domain && domain.type === "coded-value" ? domain.codedValues : undefined;
  const codedLabel = document.querySelector("#query-coded-label");
  if (coded && coded.length > 0) {
    shell.queryValueWrap.hidden = true;
    codedLabel?.removeAttribute("hidden");
    setOptions(
      shell.queryCoded,
      coded.map((item) => ({ value: String(item.code), label: item.name })),
    );
  } else {
    shell.queryValueWrap.hidden = false;
    codedLabel?.setAttribute("hidden", "");
  }
}

function codedWrapVisible(shell: ReturnType<typeof renderShell>): boolean {
  return shell.queryValueWrap.hidden;
}

function objectIdQuery(layer: QueryLayer, objectIds: number[]): __esri.Query {
  const query = layer.createQuery();
  query.objectIds = objectIds;
  return query;
}

function isQueryableField(name: string, type: string | null | undefined): boolean {
  if (type === "geometry" || type === "blob" || type === "oid" || type === "global-id")
    return false;
  return !/^(objectid|globalid|shape|st_area|st_length)/i.test(name) && !/\.area$/i.test(name);
}

function fieldKind(type: string | null | undefined): QueryFieldType {
  if (!type) return "string";
  if (type.includes("date")) return "date";
  if (/(integer|double|single|oid|small|long|number)/i.test(type)) return "number";
  return "string";
}

function setOptions(select: HTMLElement, options: { value: string; label: string }[]): void {
  const current = selectValue(select);
  select.replaceChildren();
  for (const option of options) {
    const item = document.createElement("calcite-option");
    item.setAttribute("value", option.value);
    item.textContent = option.label;
    if (option.value === current) item.setAttribute("selected", "");
    select.append(item);
  }
}

function selectValue(select: HTMLElement): string {
  const value = (select as HTMLElement & { value?: string }).value;
  if (value) return value;
  return (
    select.querySelector("calcite-option[selected]")?.getAttribute("value") ??
    select.querySelector("calcite-option")?.getAttribute("value") ??
    ""
  );
}

function inputValue(input: HTMLElement): string {
  return (input as HTMLElement & { value?: string }).value ?? "";
}

function switchChecked(element: HTMLElement): boolean {
  return Boolean((element as HTMLElement & { checked?: boolean }).checked);
}

function writeStatus(host: HTMLElement, message: string): void {
  host.replaceChildren();
  const paragraph = document.createElement("p");
  paragraph.textContent = message;
  host.append(paragraph);
}
