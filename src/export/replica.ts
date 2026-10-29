export const REPLICA_FORMATS = ["shapefile", "filegdb", "sqlite"] as const;
export type ReplicaFormat = (typeof REPLICA_FORMATS)[number];

export interface ServiceExportInfo {
  supportsReplica: boolean;
  formats: ReplicaFormat[];
}

export interface ReplicaRequestOptions {
  replicaName: string;
  layerId: number;
  format: ReplicaFormat;
  geometry: string;
  geometryType: string;
  inSR: number;
  where?: string;
  outFields?: string[];
}

export type ReplicaOutcome =
  | { state: "pending"; statusUrl?: string }
  | { state: "completed"; resultUrl: string }
  | { state: "failed"; message: string };

export interface FeatureLayerParts {
  root: string;
  layerId: number;
}

export function parseFeatureLayerUrl(url: string | undefined): FeatureLayerParts | null {
  if (!url) return null;
  const match = /^(https?:\/\/.+\/FeatureServer)\/(\d+)\/?(?:\?.*)?$/i.exec(url);
  if (!match) return null;
  return { root: match[1], layerId: Number(match[2]) };
}

export function interpretServiceInfo(json: unknown): ServiceExportInfo {
  const record = asRecord(json);
  const capabilities = stringValue(record.capabilities).toLowerCase();
  const capabilitySet = new Set(
    capabilities
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  const formats = parseSupportedFormats(record.supportedExportFormats);
  const syncEnabled =
    record.syncEnabled === true || capabilitySet.has("sync") || capabilitySet.has("extract");
  return {
    supportsReplica:
      syncEnabled &&
      (formats.length > 0 || capabilitySet.has("sync") || capabilitySet.has("extract")),
    formats: formats.length > 0 ? formats : syncEnabled ? ["filegdb", "sqlite"] : [],
  };
}

export function buildReplicaBody(options: ReplicaRequestOptions): URLSearchParams {
  const params = new URLSearchParams();
  params.set("f", "json");
  params.set("replicaName", sanitizeReplicaName(options.replicaName));
  params.set("layers", String(options.layerId));
  params.set("geometry", options.geometry);
  params.set("geometryType", options.geometryType);
  params.set("inSR", String(options.inSR));
  params.set("dataFormat", options.format);
  params.set("syncModel", "none");
  params.set("async", "true");
  params.set("returnAttachments", "false");
  params.set("returnAttachmentsDataByUrl", "false");
  params.set("transportType", "esriTransportTypeUrl");
  if (options.where || options.outFields?.length) {
    const query: Record<string, string> = {
      where: options.where?.trim() || "1=1",
      queryOption: "useFilter",
    };
    if (options.outFields?.length) query.outFields = options.outFields.join(",");
    params.set("layerQueries", JSON.stringify({ [String(options.layerId)]: query }));
  }
  return params;
}

export function interpretReplicaPayload(json: unknown): ReplicaOutcome {
  const record = asRecord(json);
  if (record.error !== undefined) {
    return { state: "failed", message: errorMessage(record.error) };
  }
  const resultUrl = firstString(record.resultUrl, record.URL, record.url);
  const status = stringValue(record.status);
  if (resultUrl && (status === "" || /complete/i.test(status) || status === "Succeeded")) {
    return { state: "completed", resultUrl };
  }
  if (/fail/i.test(status)) {
    return {
      state: "failed",
      message: errorMessage(record.error) || status || "The extract job failed.",
    };
  }
  const statusUrl = stringValue(record.statusUrl);
  if (statusUrl) return { state: "pending", statusUrl };
  if (status) return { state: "pending" };
  return { state: "failed", message: "The extract service returned an unexpected response." };
}

export async function requestReplica(
  serviceRoot: string,
  options: ReplicaRequestOptions,
  fetchImpl: typeof fetch = fetch,
  timing: { timeoutMs?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<{ resultUrl: string }> {
  const timeoutMs = timing.timeoutMs ?? 120_000;
  const intervalMs = timing.intervalMs ?? 2_000;
  const sleep = timing.sleep ?? defaultSleep;
  const response = await fetchImpl(`${serviceRoot.replace(/\/$/, "")}/createReplica`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: buildReplicaBody(options),
  });
  const payload = interpretReplicaPayload(await readJson(response));
  if (payload.state === "completed") return { resultUrl: payload.resultUrl };
  if (payload.state === "failed") throw new Error(payload.message);
  if (!payload.statusUrl) throw new Error("The extract job did not return a status URL.");

  const started = Date.now();
  let statusUrl = payload.statusUrl;
  while (Date.now() - started <= timeoutMs) {
    await sleep(intervalMs);
    const jobResponse = await fetchImpl(
      statusUrl.includes("?") ? `${statusUrl}&f=json` : `${statusUrl}?f=json`,
    );
    const job = interpretReplicaPayload(await readJson(jobResponse));
    if (job.state === "completed") return { resultUrl: job.resultUrl };
    if (job.state === "failed") throw new Error(job.message);
    if (job.statusUrl) statusUrl = job.statusUrl;
  }
  throw new Error("The extract job timed out before a file was ready.");
}

export function replicaExtension(format: ReplicaFormat, resultUrl: string): string {
  const fromUrl = /\.([a-z0-9]+)(?:\?|$)/i.exec(resultUrl)?.[1];
  if (fromUrl) return fromUrl.toLowerCase();
  if (format === "shapefile" || format === "filegdb") return "zip";
  return "geodatabase";
}

function parseSupportedFormats(value: unknown): ReplicaFormat[] {
  if (typeof value !== "string") return [];
  const formats: ReplicaFormat[] = [];
  for (const part of value.split(",")) {
    const token = part.trim().toLowerCase();
    if (token === "shapefile" || token === "filegdb" || token === "sqlite") formats.push(token);
    if (token === "filegeodatabase") formats.push("filegdb");
  }
  return [...new Set(formats)];
}

function sanitizeReplicaName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9]/g, "").slice(0, 28);
  return cleaned || "CartoucheExport";
}

function errorMessage(error: unknown): string {
  const record = asRecord(error);
  const description = firstString(record.description, record.message);
  const details = Array.isArray(record.details)
    ? record.details.filter((detail): detail is string => typeof detail === "string")
    : [];
  return [description, ...details].filter(Boolean).join(" ") || "The extract request failed.";
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return { error: { message: `The server returned ${response.status} and no JSON.` } };
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}
