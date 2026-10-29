import type { ExampleCatalog } from "./types.ts";

const CONFIG_ID = /^[a-z0-9-]+$/;

export async function resolveConfigDocument(
  search: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const requested = new URLSearchParams(search).get("config");
  if (requested) {
    if (!CONFIG_ID.test(requested)) {
      throw new Error(
        "The config parameter must be a lowercase id such as usa-reference. Absolute URLs are not accepted.",
      );
    }
    return fetchRequired(`./configs/${requested}.json`, fetchImpl);
  }

  const local = await fetchOptional("./config.json", fetchImpl);
  if (local !== undefined) return local;

  const catalog = await fetchOptional("./configs/index.json", fetchImpl);
  if (isCatalog(catalog)) {
    if (!CONFIG_ID.test(catalog.default)) {
      throw new Error("configs/index.json has an invalid default id.");
    }
    return fetchRequired(`./configs/${catalog.default}.json`, fetchImpl);
  }

  return fetchRequired("./configs/usa-reference.json", fetchImpl);
}

export async function loadExampleCatalog(
  fetchImpl: typeof fetch = fetch,
): Promise<ExampleCatalog | undefined> {
  const catalog = await fetchOptional("./configs/index.json", fetchImpl);
  return isCatalog(catalog) ? catalog : undefined;
}

async function fetchRequired(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const document = await fetchOptional(url, fetchImpl);
  if (document === undefined) {
    throw new Error(`Could not find ${url}.`);
  }
  return document;
}

async function fetchOptional(url: string, fetchImpl: typeof fetch): Promise<unknown | undefined> {
  const response = await fetchImpl(url);
  if (response.status === 404) return undefined;
  if (!response.ok) {
    throw new Error(`Could not load ${url} (${response.status}).`);
  }
  // A dev server may answer a missing file with the HTML app shell and status 200.
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) return undefined;
  return response.json() as Promise<unknown>;
}

function isCatalog(value: unknown): value is ExampleCatalog {
  if (typeof value !== "object" || value === null) return false;
  const catalog = value as Partial<ExampleCatalog>;
  return (
    typeof catalog.default === "string" &&
    Array.isArray(catalog.examples) &&
    catalog.examples.every(
      (example) =>
        typeof example === "object" &&
        example !== null &&
        typeof example.id === "string" &&
        typeof example.title === "string",
    )
  );
}
