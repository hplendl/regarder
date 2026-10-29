import type FeatureLayerView from "@arcgis/core/views/layers/FeatureLayerView.js";
import { EXPORT_ROW_LIMIT, HIGHLIGHT_LIMIT, TABLE_ROW_LIMIT } from "../config/defaults.ts";
import { collectPages } from "../query/page.ts";
import { objectIdWhere } from "../query/where.ts";
import { isDrawn } from "../map/visibility.ts";
import type { QueryableEntry, QueryLayer } from "../map/layers.ts";
import type { ArcgisFeatureTable } from "@arcgis/map-components/components/arcgis-feature-table";

export interface SelectionEntry {
  entry: QueryableEntry;
  objectIds: number[];
  total: number;
  truncated: boolean;
  where: string;
  geometry?: __esri.Geometry;
  highlight?: __esri.Handle;
}

export class SelectionController {
  private readonly entries = new Map<string, SelectionEntry>();
  private activeId: string | undefined;
  private renderToken = 0;
  private table: ArcgisFeatureTable | undefined;
  additive = false;
  private readonly view: __esri.MapView;
  private readonly tableHost: HTMLElement;
  private readonly emptyState: HTMLElement;
  private readonly countLabel: HTMLElement;
  private readonly layerSelect: HTMLElement & { value?: string };
  private readonly onChange: () => void;

  constructor(
    view: __esri.MapView,
    tableHost: HTMLElement,
    emptyState: HTMLElement,
    countLabel: HTMLElement,
    layerSelect: HTMLElement & { value?: string },
    onChange: () => void,
  ) {
    this.view = view;
    this.tableHost = tableHost;
    this.emptyState = emptyState;
    this.countLabel = countLabel;
    this.layerSelect = layerSelect;
    this.onChange = onChange;
  }

  list(): SelectionEntry[] {
    return [...this.entries.values()];
  }

  active(): SelectionEntry | undefined {
    if (this.activeId && this.entries.has(this.activeId)) return this.entries.get(this.activeId);
    return this.list()[0];
  }

  clear(): void {
    for (const entry of this.entries.values()) entry.highlight?.remove();
    this.entries.clear();
    this.activeId = undefined;
    this.render();
  }

  async replaceFromClick(
    candidates: QueryableEntry[],
    event: __esri.ViewClickEvent,
  ): Promise<void> {
    const hit = await this.view.hitTest(event);
    const match = hit.results.find((result) => {
      if (result.type !== "graphic" || !result.graphic.layer) return false;
      return candidates.some(
        (candidate) => candidate.layer === result.graphic.layer && isDrawn(candidate.layer),
      );
    });
    if (!match || match.type !== "graphic") {
      if (!this.additive) this.clear();
      return;
    }
    const candidate = candidates.find((item) => item.layer === match.graphic.layer);
    if (!candidate) return;
    const raw = match.graphic.attributes?.[candidate.layer.objectIdField];
    const objectId = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isInteger(objectId)) return;
    if (!this.additive) this.clear();
    const existing = this.entries.get(candidate.id);
    const objectIds = new Set(existing?.objectIds ?? []);
    if (objectIds.has(objectId)) objectIds.delete(objectId);
    else objectIds.add(objectId);
    await this.commit(
      candidate,
      [...objectIds],
      false,
      objectIdWhere(candidate.layer.objectIdField, [...objectIds]),
    );
  }

  async replaceFromGeometry(
    candidates: QueryableEntry[],
    geometry: __esri.Geometry,
  ): Promise<void> {
    if (!this.additive) this.clear();
    const visible = candidates.filter((candidate) => isDrawn(candidate.layer));
    await Promise.all(
      visible.map(async (candidate) => {
        const collected = await collectObjectIds(candidate.layer, { geometry });
        const previous = this.additive ? (this.entries.get(candidate.id)?.objectIds ?? []) : [];
        const objectIds = [...new Set([...previous, ...collected.items])];
        await this.commit(candidate, objectIds, collected.truncated, "1=1", geometry);
      }),
    );
  }

  async replaceFromWhere(candidate: QueryableEntry, where: string): Promise<void> {
    if (!this.additive) this.clear();
    const collected = await collectObjectIds(candidate.layer, { where });
    const previous = this.additive ? (this.entries.get(candidate.id)?.objectIds ?? []) : [];
    const objectIds = [...new Set([...previous, ...collected.items])];
    await this.commit(candidate, objectIds, collected.truncated, where);
  }

  show(id: string): void {
    if (!this.entries.has(id)) return;
    this.activeId = id;
    this.render();
  }

  private async commit(
    entry: QueryableEntry,
    objectIds: number[],
    truncated: boolean,
    where: string,
    geometry?: __esri.Geometry,
  ): Promise<void> {
    const previous = this.entries.get(entry.id);
    previous?.highlight?.remove();
    if (objectIds.length === 0) {
      this.entries.delete(entry.id);
      if (this.activeId === entry.id) this.activeId = undefined;
      this.render();
      return;
    }
    const layerView = (await this.view.whenLayerView(entry.layer)) as FeatureLayerView;
    const highlight = layerView.highlight(objectIds.slice(0, HIGHLIGHT_LIMIT));
    this.entries.set(entry.id, {
      entry,
      objectIds,
      total: truncated ? objectIds.length : objectIds.length,
      truncated,
      where,
      geometry: geometry ?? previous?.geometry,
      highlight,
    });
    this.activeId = entry.id;
    this.render();
  }

  private render(): void {
    const selected = this.list();
    const featureCount = selected.reduce((sum, entry) => sum + entry.objectIds.length, 0);
    const truncated = selected.some((entry) => entry.truncated);
    this.countLabel.textContent =
      featureCount === 0
        ? "Nothing selected"
        : `${featureCount.toLocaleString()} feature${featureCount === 1 ? "" : "s"} in ${selected.length} layer${selected.length === 1 ? "" : "s"}${truncated ? " (list truncated)" : ""}`;

    this.layerSelect.replaceChildren();
    for (const entry of selected) {
      const option = document.createElement("calcite-option");
      option.value = entry.entry.id;
      option.textContent = entry.entry.title;
      if (entry.entry.id === this.active()?.entry.id) option.selected = true;
      this.layerSelect.append(option);
    }
    if (this.active()) this.layerSelect.value = this.active()?.entry.id;

    const active = this.active();
    this.emptyState.hidden = Boolean(active);
    if (!active) {
      this.table?.remove();
      this.table = undefined;
      this.onChange();
      return;
    }
    if (!this.table) {
      this.table = document.createElement("arcgis-feature-table") as ArcgisFeatureTable;
      this.table.hideSelectionColumn = true;
      this.tableHost.append(this.table);
    }
    const ids = active.objectIds.slice(0, TABLE_ROW_LIMIT);
    this.table.layer = active.entry.layer;
    this.table.definitionExpression = objectIdWhere(active.entry.layer.objectIdField, ids);
    const token = ++this.renderToken;
    const applyHighlights = () => {
      if (token !== this.renderToken || !this.table) return;
      this.table.highlightIds?.removeAll();
      this.table.highlightIds?.addMany(ids);
    };
    applyHighlights();
    window.setTimeout(applyHighlights, 600);
    const noisy = active.entry.layer.fields
      .map((field) => field.name)
      .filter((name) => /shape|globalid|st_area|st_length|\.area$/i.test(name));
    this.table.hiddenFields?.removeAll();
    if (noisy.length > 0) this.table.hiddenFields?.addMany(noisy);
    this.onChange();
  }
}

export async function collectObjectIds(
  layer: QueryLayer,
  filter: { geometry?: __esri.Geometry; where?: string; objectIds?: number[] },
  maxItems = 5000,
): Promise<{ items: number[]; truncated: boolean }> {
  const pageSize = layerPageSize(layer);
  return collectPages({
    pageSize,
    maxItems,
    fetchPage: async (offset, count) => {
      const query = layer.createQuery();
      query.start = offset;
      query.num = count;
      query.returnGeometry = false;
      query.outFields = [layer.objectIdField];
      if (filter.geometry) {
        query.geometry = filter.geometry;
        query.spatialRelationship = "intersects";
      }
      if (filter.where) query.where = filter.where;
      if (filter.objectIds) query.objectIds = filter.objectIds;
      const result = await layer.queryFeatures(query);
      const items = result.features
        .map((feature) => Number(feature.attributes?.[layer.objectIdField]))
        .filter((id) => Number.isInteger(id));
      return { items, exceeded: Boolean(result.exceededTransferLimit) };
    },
  });
}

export function layerPageSize(layer: QueryLayer): number {
  const capabilities = layer.capabilities as { query?: { maxRecordCount?: number } } | nullish;
  const max = capabilities?.query?.maxRecordCount;
  return max && max > 0 ? Math.min(max, 2000) : 1000;
}

export { EXPORT_ROW_LIMIT };
