import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeConfig } from "../src/config/normalize.ts";
import { DEFAULT_PRINT_SERVICE_URL } from "../src/config/defaults.ts";
import { resolveConfigDocument } from "../src/config/load.ts";
import { resolveAppId } from "../src/config/secrets.ts";
import { validateConfig } from "../src/config/validate.ts";

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

describe("config validation", () => {
  it("accepts both example configurations and the published template", () => {
    for (const path of [
      "../public/configs/usa-reference.json",
      "../public/configs/natural-hazards.json",
      "../config.example.json",
    ]) {
      const result = validateConfig(readJson(path));
      expect(result.errors, result.errors.join("\n")).toEqual([]);
      expect(result.ok).toBe(true);
    }
  });

  it("rejects a configuration that cannot build a map", () => {
    const result = validateConfig({
      title: "",
      auth: { mode: "magic" },
      layers: [{ id: "1bad", title: "Cities", type: "feature" }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/title/);
    expect(result.errors.join(" ")).toMatch(/auth.mode/);
    expect(result.errors.join(" ")).toMatch(/url/);
  });

  it("requires a client id for OAuth and an item id for web maps", () => {
    const result = validateConfig({
      title: "Secure map",
      auth: { mode: "arcgis-oauth", appId: "  " },
      portalUrl: "http://intranet.example.com/portal",
      layers: [{ id: "plants", title: "Plants", type: "webmap" }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("auth.appId is required when auth.mode is arcgis-oauth.");
    expect(result.errors).toContain("portalUrl must be an https URL.");
    expect(result.errors.some((error) => error.includes("itemId"))).toBe(true);
  });

  it("warns when a vector tile is marked selectable and fills defaults", () => {
    const raw = {
      title: "Tiles",
      layers: [
        {
          id: "density",
          title: "Density",
          type: "vector-tile",
          url: "https://tiles.example.com/VectorTileServer",
          selectable: true,
        },
      ],
    };
    const result = validateConfig(raw);
    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/cannot be selected/);
    const normalized = normalizeConfig(raw as never);
    expect(normalized.layers[0]?.selectable).toBe(false);
    expect(normalized.printServiceUrl).toBe(DEFAULT_PRINT_SERVICE_URL);
    expect(normalized.auth?.mode).toBe("none");
    expect(normalized.portalUrl).toBe("https://www.arcgis.com");
  });

  it("rejects duplicate ids and an extent that is inside out", () => {
    const result = validateConfig({
      title: "Broken extent",
      extent: { xmin: 10, xmax: 0, ymin: 0, ymax: 1, wkid: 4326 },
      layers: [
        {
          id: "states",
          title: "States",
          type: "feature",
          url: "https://example.com/FeatureServer/0",
        },
        {
          id: "states",
          title: "Again",
          type: "feature",
          url: "https://example.com/FeatureServer/1",
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/duplicated/);
    expect(result.errors.join(" ")).toMatch(/xmin/);
  });
});

describe("config loading", () => {
  it("loads a named example and refuses absolute config urls", async () => {
    const fetchImpl = mockFetch({
      "./configs/natural-hazards.json": { title: "Hazards", layers: [] },
    });
    await expect(
      resolveConfigDocument("?config=natural-hazards", fetchImpl),
    ).resolves.toMatchObject({
      title: "Hazards",
    });
    await expect(
      resolveConfigDocument("?config=https://evil.example/config.json", fetchImpl),
    ).rejects.toThrow(/lowercase id/);
  });

  it("ignores an HTML page returned for a missing local config", async () => {
    const fetchImpl = mockFetch(
      {
        "./configs/index.json": {
          default: "usa-reference",
          examples: [{ id: "usa-reference", title: "United States reference" }],
        },
        "./configs/usa-reference.json": { title: "USA", layers: [] },
      },
      { "./config.json": { status: 200, contentType: "text/html", body: "<!doctype html>" } },
    );
    await expect(resolveConfigDocument("", fetchImpl)).resolves.toMatchObject({ title: "USA" });
  });

  it("prefers public/config.json and otherwise uses the catalog default", async () => {
    const local = mockFetch({
      "./config.json": { title: "Local", layers: [] },
      "./configs/index.json": { default: "usa-reference", examples: [] },
      "./configs/usa-reference.json": { title: "USA", layers: [] },
    });
    await expect(resolveConfigDocument("", local)).resolves.toMatchObject({ title: "Local" });

    const catalog = mockFetch({
      "./configs/index.json": {
        default: "usa-reference",
        examples: [{ id: "usa-reference", title: "United States reference" }],
      },
      "./configs/usa-reference.json": { title: "USA", layers: [] },
    });
    await expect(resolveConfigDocument("", catalog)).resolves.toMatchObject({ title: "USA" });
  });
});

describe("client ids", () => {
  it("lets an environment variable override a placeholder", () => {
    expect(resolveAppId("YOUR_CLIENT_ID", "abc123")).toBe("abc123");
    expect(resolveAppId("YOUR_CLIENT_ID", "")).toBeUndefined();
    expect(resolveAppId("real-client", undefined)).toBe("real-client");
  });
});

function mockFetch(
  routes: Record<string, unknown>,
  raw: Record<string, { status: number; contentType: string; body: string }> = {},
): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url in raw) {
      return new Response(raw[url].body, {
        status: raw[url].status,
        headers: { "Content-Type": raw[url].contentType },
      });
    }
    if (!(url in routes)) {
      return new Response("missing", { status: 404 });
    }
    return new Response(JSON.stringify(routes[url]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}
