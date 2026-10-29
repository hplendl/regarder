import esriConfig from "@arcgis/core/config.js";
import IdentityManager from "@arcgis/core/identity/IdentityManager.js";
import OAuthInfo from "@arcgis/core/identity/OAuthInfo.js";
import esriRequest from "@arcgis/core/request.js";
import type { RegarderConfig } from "../config/types.ts";

export interface SignedInUser {
  username: string;
  fullName?: string;
}

const ASSETS_PATH = "https://js.arcgis.com/4.34/@arcgis/core/assets";

export function configureIdentity(
  config: RegarderConfig,
  appId: string | undefined,
  apiKey: string | undefined,
): void {
  esriConfig.portalUrl = config.portalUrl ?? "https://www.arcgis.com";
  esriConfig.assetsPath = ASSETS_PATH;
  if (apiKey) esriConfig.apiKey = apiKey;

  if (config.auth?.mode === "arcgis-oauth" && appId) {
    const info = new OAuthInfo({
      appId,
      portalUrl: config.portalUrl,
      popup: config.auth.popup !== false,
      popupCallbackUrl:
        config.auth.popupCallbackUrl || new URL("oauth-callback.html", window.location.href).href,
      flowType: "auto",
      expiration: config.auth.expiration,
    });
    IdentityManager.registerOAuthInfos([info]);
  }

  if (config.auth?.mode === "iwa") {
    const trusted = new Set([...(config.auth.trustedServers ?? []), config.portalUrl ?? ""]);
    for (const server of trusted) {
      if (server && !esriConfig.request.trustedServers.includes(server)) {
        esriConfig.request.trustedServers.push(server);
      }
    }
  }
}

export async function restoreUser(portalUrl: string): Promise<SignedInUser | undefined> {
  try {
    await IdentityManager.checkSignInStatus(`${portalUrl}/sharing`);
  } catch {
    return undefined;
  }
  return readSelf(portalUrl);
}

export async function signInOAuth(portalUrl: string): Promise<SignedInUser> {
  await IdentityManager.getCredential(`${portalUrl}/sharing`);
  return (await readSelf(portalUrl)) ?? { username: "Signed in" };
}

export async function signInIwa(portalUrl: string): Promise<SignedInUser> {
  const body = new URLSearchParams({
    f: "json",
    referer: window.location.origin,
    expiration: "60",
  });
  const response = await fetch(`${portalUrl}/sharing/rest/generateToken`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = (await response.json()) as {
    token?: string;
    expires?: number;
    error?: { message?: string; details?: string[] };
  };
  if (!payload.token) {
    const detail = payload.error?.details?.join(" ") || payload.error?.message;
    throw new Error(
      detail ||
        "The portal did not return a token. Integrated Windows Authentication works only when this browser can reach an ArcGIS Enterprise portal configured for IWA.",
    );
  }
  IdentityManager.registerToken({
    server: `${portalUrl}/sharing/rest`,
    token: payload.token,
    expires: payload.expires,
    userId: "windows-user",
    ssl: portalUrl.startsWith("https:"),
  });
  return (await readSelf(portalUrl)) ?? { username: "Signed in" };
}

export function signOut(): void {
  IdentityManager.destroyCredentials();
  window.location.reload();
}

async function readSelf(portalUrl: string): Promise<SignedInUser | undefined> {
  try {
    const response = await esriRequest(`${portalUrl}/sharing/rest/community/self`, {
      query: { f: "json" },
    });
    const data = response.data as { username?: string; fullName?: string; error?: unknown };
    if (!data || data.error || !data.username) return undefined;
    return { username: data.username, fullName: data.fullName };
  } catch {
    return undefined;
  }
}
