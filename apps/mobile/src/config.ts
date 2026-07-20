import Constants from "expo-constants";

/**
 * Base URL for the API. On a physical device via Expo Go, `localhost` points at
 * the phone, not the dev machine — so we derive the dev machine's LAN IP from
 * Expo's `hostUri` (e.g. "192.168.1.5:8081") and target the API's port there.
 * Override explicitly with EXPO_PUBLIC_API_URL when needed (tunnels, staging).
 */
function resolveApiBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_API_URL;
  if (override !== undefined && override !== "") {
    return override.replace(/\/$/, "");
  }
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(":")[0];
  if (host !== undefined && host !== "") {
    return `http://${host}:3000`;
  }
  return "http://localhost:3000";
}

export const API_BASE_URL = resolveApiBaseUrl();
export const API_PREFIX = "/api/v1";
