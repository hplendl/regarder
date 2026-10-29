import { PLACEHOLDER_APP_ID } from "./defaults.ts";

export function resolveAppId(
  configAppId: string | undefined,
  envAppId: string | undefined,
): string | undefined {
  const fromEnv = envAppId?.trim();
  if (fromEnv && !PLACEHOLDER_APP_ID.test(fromEnv)) return fromEnv;
  const fromConfig = configAppId?.trim();
  if (fromConfig && !PLACEHOLDER_APP_ID.test(fromConfig)) return fromConfig;
  return undefined;
}

export function resolveApiKey(envApiKey: string | undefined): string | undefined {
  const key = envApiKey?.trim();
  return key ? key : undefined;
}
