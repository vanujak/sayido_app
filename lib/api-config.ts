import Constants from "expo-constants";
import { Platform } from "react-native";

const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

const extractHost = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const hostPort = trimmed.replace(/^https?:\/\//, "").split("/")[0];
  if (!hostPort) return "";

  const withoutPort = hostPort.includes(":")
    ? hostPort.split(":")[0]
    : hostPort;
  return withoutPort.replace(/^\[|\]$/g, "");
};

const getExpoHost = () => {
  const manifest = Constants.manifest as
    | {
        debuggerHost?: string;
      }
    | undefined;
  const manifest2 = (Constants as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } })
    .manifest2;
  const hostCandidates = [
    Constants.expoConfig?.hostUri,
    manifest?.debuggerHost,
    manifest2?.extra?.expoClient?.hostUri,
  ];

  for (const candidate of hostCandidates) {
    if (typeof candidate !== "string") continue;
    const host = extractHost(candidate);
    if (host && !LOCALHOST_HOSTS.has(host)) return host;
  }

  return "";
};

const replaceLocalhostForAndroid = (input: string) => {
  if (!input || Platform.OS !== "android") return input;

  try {
    const url = new URL(input);
    if (!LOCALHOST_HOSTS.has(url.hostname)) return input;

    // Android emulator cannot access computer localhost directly.
    url.hostname = getExpoHost() || "10.0.2.2";
    return url.toString();
  } catch {
    return input;
  }
};

const rawGraphQlUrl = process.env.EXPO_PUBLIC_GRAPHQL_URL || "";
const rawApiBaseUrl =
  process.env.EXPO_PUBLIC_API_URL || rawGraphQlUrl.replace(/\/graphql\/?$/, "");

export const graphQlUrl = replaceLocalhostForAndroid(rawGraphQlUrl);
export const apiBaseUrl = replaceLocalhostForAndroid(rawApiBaseUrl);
