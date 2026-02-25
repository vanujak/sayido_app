import Constants from "expo-constants";
import { Platform } from "react-native";

const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

const extractHost = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const normalized = /^[a-z][a-z0-9+\-.]*:\/\//i.test(trimmed)
      ? trimmed
      : `http://${trimmed}`;
    return new URL(normalized).hostname.replace(/^\[|\]$/g, "");
  } catch {
    const hostPort = trimmed.replace(/^[a-z][a-z0-9+\-.]*:\/\//i, "").split("/")[0];
    if (!hostPort) return "";

    const withoutPort = hostPort.includes(":")
      ? hostPort.split(":")[0]
      : hostPort;
    return withoutPort.replace(/^\[|\]$/g, "");
  }
};

const getExpoHost = () => {
  const manifest = Constants.manifest as
    | {
        debuggerHost?: string;
      }
    | undefined;
  const manifest2 = (Constants as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } })
    .manifest2;
  const expoGoConfig = (Constants as {
    expoGoConfig?: {
      debuggerHost?: string;
      hostUri?: string;
      packagerOpts?: { devServer?: string };
    } | null;
  }).expoGoConfig;
  const hostCandidates = [
    Constants.expoConfig?.hostUri,
    manifest?.debuggerHost,
    expoGoConfig?.debuggerHost,
    expoGoConfig?.hostUri,
    expoGoConfig?.packagerOpts?.devServer,
    manifest2?.extra?.expoClient?.hostUri,
  ];

  for (const candidate of hostCandidates) {
    if (typeof candidate !== "string") continue;
    const host = extractHost(candidate);
    if (host && !LOCALHOST_HOSTS.has(host)) return host;
  }

  return "";
};

const replaceLocalhostForNative = (input: string) => {
  if (!input || Platform.OS === "web") return input;

  try {
    const url = new URL(input);
    if (!LOCALHOST_HOSTS.has(url.hostname)) return input;

    // Native devices cannot use localhost for APIs on your dev machine.
    const expoHost = getExpoHost();
    if (expoHost) {
      url.hostname = expoHost;
      return url.toString();
    }

    // Android emulator fallback when Expo host is unavailable.
    if (Platform.OS === "android") {
      url.hostname = "10.0.2.2";
      return url.toString();
    }

    return url.toString();
  } catch {
    return input;
  }
};

const rawGraphQlUrl = process.env.EXPO_PUBLIC_GRAPHQL_URL || "";
const rawApiBaseUrl =
  process.env.EXPO_PUBLIC_API_URL || rawGraphQlUrl.replace(/\/graphql\/?$/, "");
const explicitCredentialMode = process.env.EXPO_PUBLIC_FETCH_CREDENTIALS?.trim();

export const graphQlUrl = replaceLocalhostForNative(rawGraphQlUrl);
export const apiBaseUrl = replaceLocalhostForNative(rawApiBaseUrl);
export const apiCredentials: RequestCredentials =
  explicitCredentialMode === "include" || explicitCredentialMode === "omit"
    ? explicitCredentialMode
    : Platform.OS === "web"
      ? "omit"
      : "include";
