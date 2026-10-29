import { describe, expect, it, vi } from "vitest";
import { toCsv } from "../src/export/csv.ts";
import { exportFilename, pickAttributes } from "../src/export/fields.ts";
import { toGeoJson } from "../src/export/geojson.ts";
import { webMercatorToLngLat } from "../src/export/geometry.ts";
import {
  buildReplicaBody,
  interpretReplicaPayload,
  interpretServiceInfo,
  parseFeatureLayerUrl,
  requestReplica,
} from "../src/export/replica.ts";
import { collectPages } from "../src/query/page.ts";
import { buildWhereClause, combineWhere, objectIdWhere } from "../src/query/where.ts";
import { isDrawn } from "../src/map/visibility.ts";

describe("attribute queries", () => {
  it("escapes strings and rejects unsafe field names", () => {
    expect(buildWhereClause("state_name", "eq", "O'Brien", "string")).toEqual({
      ok: true,
      where: "state_name = 'O''Brien'",
    });
    expect(buildWhereClause("pop2000", "gt", "100000", "number")).toEqual({
      ok: true,
      where: "pop2000 > 100000",
    });
    expect(buildWhereClause("NAME", "contains", "Andrew", "string")).toEqual({
      ok: true,
      where: "UPPER(NAME) LIKE UPPER('%Andrew%')",
    });
    expect(buildWhereClause("eventdate", "gte", "2000-08-01", "date")).toEqual({
      ok: true,
      where: "eventdate >= DATE '2000-08-01'",
    });
    expect(buildWhereClause("comments", "is-null", "", "string")).toEqual({
      ok: true,
      where: "comments IS NULL",
    });
    expect(buildWhereClause("state name", "eq", "Maine", "string").ok).toBe(false);
    expect(buildWhereClause("pop2000", "eq", "many", "number").ok).toBe(false);
  });

  it("combines a definition expression with an object-id list", () => {
    expect(combineWhere("pop2000 > 100000", "objectid = 4")).toBe(
      "(pop2000 > 100000) AND (objectid = 4)",
    );
    expect(objectIdWhere("OBJECTID", [3, 8, 1.5])).toBe("OBJECTID IN (3,8)");
  });
});

describe("client exports", () => {
  const features = [
    {
      attributes: {
        state_name: "Maine",
        pop2000: 1274923,
        notes: '=HYPERLINK("http://example.com")',
      },
      geometry: { x: -69.4, y: 45.3, spatialReference: { wkid: 4326 } },
    },
    {
      attributes: { state_name: "Iowa", pop2000: 2926324 },
      geometry: {
        rings: [
          [
            [-96, 40],
            [-90, 40],
            [-90, 43],
          ],
        ],
        spatialReference: { wkid: 4326 },
      },
    },
  ];

  it("writes a spreadsheet-safe CSV with geometry columns", () => {
    const csv = toCsv(features, ["state_name", "pop2000", "notes"]);
    expect(csv.csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.csv).toContain("state_name,pop2000,notes,longitude,latitude,wkt");
    expect(csv.csv).toContain(
      'Maine,1274923,"\'=HYPERLINK(""http://example.com"")",-69.4,45.3,POINT (-69.4 45.3)',
    );
    expect(csv.csv).toContain("POLYGON ((-96 40, -90 40, -90 43, -96 40))");
    expect(csv.skipped).toBe(0);
  });

  it("projects web mercator and limits GeoJSON properties", () => {
    const [longitude, latitude] = webMercatorToLngLat(-8238310.24, 4970241.33);
    expect(longitude).toBeCloseTo(-74, 0);
    expect(latitude).toBeCloseTo(40.7, 0);
    const geojson = toGeoJson(
      [
        {
          attributes: { name: "Newark", secret: "no" },
          geometry: { x: -8238310.24, y: 4970241.33, spatialReference: { wkid: 102100 } },
        },
        {
          attributes: { name: "Missing" },
          geometry: { x: 1, y: 2, spatialReference: { wkid: 2264 } },
        },
      ],
      ["name"],
    );
    expect(geojson.collection.features).toHaveLength(1);
    expect(geojson.collection.features[0]?.properties).toEqual({ name: "Newark" });
    expect(geojson.collection.features[0]?.geometry?.type).toBe("Point");
    expect(geojson.skipped).toBe(1);
    expect(pickAttributes({ name: "A", pop: 1 }, ["name"])).toEqual({ name: "A" });
  });

  it("builds filenames without punctuation from the layer title", () => {
    expect(
      exportFilename("States / 2000", "selected", "csv", new Date("2026-10-29T03:04:05Z")),
    ).toBe("states-2000-selected-2026-10-29-03-04-05.csv");
  });
});

describe("service extracts", () => {
  it("parses feature service urls and ignores map services", () => {
    expect(
      parseFeatureLayerUrl(
        "https://sampleserver6.arcgisonline.com/arcgis/rest/services/Sync/SaveTheBaySync/FeatureServer/2",
      ),
    ).toEqual({
      root: "https://sampleserver6.arcgisonline.com/arcgis/rest/services/Sync/SaveTheBaySync/FeatureServer",
      layerId: 2,
    });
    expect(
      parseFeatureLayerUrl(
        "https://sampleserver6.arcgisonline.com/arcgis/rest/services/USA/MapServer/2",
      ),
    ).toBeNull();
  });

  it("reads sync capabilities and builds a createReplica body", () => {
    expect(
      interpretServiceInfo({
        capabilities: "Query,Sync",
        syncEnabled: true,
        supportedExportFormats: "sqlite,filegdb",
      }),
    ).toEqual({ supportsReplica: true, formats: ["sqlite", "filegdb"] });
    expect(interpretServiceInfo({ capabilities: "Query,Data" })).toEqual({
      supportsReplica: false,
      formats: [],
    });

    const body = buildReplicaBody({
      replicaName: "Regarder Export!",
      layerId: 2,
      format: "filegdb",
      geometry: '{"xmin":-123,"ymin":36,"xmax":-121,"ymax":38}',
      geometryType: "esriGeometryEnvelope",
      inSR: 4326,
      where: "objectid<=3",
      outFields: ["type", "comments"],
    });
    expect(body.get("dataFormat")).toBe("filegdb");
    expect(body.get("async")).toBe("true");
    expect(body.get("syncModel")).toBe("none");
    expect(body.get("layers")).toBe("2");
    expect(body.get("replicaName")).toBe("RegarderExport");
    expect(JSON.parse(body.get("layerQueries") ?? "{}")).toEqual({
      "2": { where: "objectid<=3", queryOption: "useFilter", outFields: "type,comments" },
    });
  });

  it("polls an async extract job until the file url is ready", async () => {
    expect(
      interpretReplicaPayload({
        error: { message: "Unable to complete operation.", details: ["Bad geometry"] },
      }),
    ).toEqual({
      state: "failed",
      message: "Unable to complete operation. Bad geometry",
    });
    expect(
      interpretReplicaPayload({
        status: "Completed",
        resultUrl: "https://example.com/extract.zip",
      }),
    ).toEqual({
      state: "completed",
      resultUrl: "https://example.com/extract.zip",
    });

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ statusUrl: "https://example.com/jobs/1" }))
      .mockResolvedValueOnce(jsonResponse({ status: "InProgress" }))
      .mockResolvedValueOnce(
        jsonResponse({ status: "Completed", resultUrl: "https://example.com/bay.zip" }),
      );
    await expect(
      requestReplica(
        "https://example.com/FeatureServer",
        {
          replicaName: "Bay",
          layerId: 2,
          format: "filegdb",
          geometry: "{}",
          geometryType: "esriGeometryEnvelope",
          inSR: 4326,
        },
        fetchImpl,
        { timeoutMs: 1000, intervalMs: 1, sleep: async () => undefined },
      ),
    ).resolves.toEqual({ resultUrl: "https://example.com/bay.zip" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe("paging and visibility", () => {
  it("stops when the service says the transfer is complete", async () => {
    const collected = await collectPages({
      pageSize: 2,
      maxItems: 10,
      fetchPage: async (offset) => ({
        items: offset === 0 ? [1, 2] : [3],
        exceeded: offset === 0,
      }),
    });
    expect(collected).toEqual({ items: [1, 2, 3], truncated: false });

    const capped = await collectPages({
      pageSize: 2,
      maxItems: 2,
      fetchPage: async () => ({ items: [1, 2], exceeded: true }),
    });
    expect(capped.truncated).toBe(true);
  });

  it("treats a hidden parent group as not drawn", () => {
    const group = { visible: false };
    const layer = { visible: true, parent: group };
    expect(isDrawn(layer)).toBe(false);
    expect(isDrawn({ visible: true, parent: { visible: true } })).toBe(true);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
