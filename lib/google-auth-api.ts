import { apiBaseUrl, apiCredentials, graphQlUrl } from "./api-config";
import { setVendorSession } from "./vendor-session";

export interface GoogleAuthResponse {
  message?: string;
  access_token?: string;
  vendorId?: string;
  vendor_id?: string;
  vendorEmail?: string;
  role?: string;
  isNewUser?: boolean;
}

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");
const joinUrl = (base: string, path: string) => {
  const normalizedBase = normalizeBaseUrl(base);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

const parseErrorMessage = async (response: Response): Promise<string> => {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const body = await response.json();
      if (body?.message) {
        return Array.isArray(body.message) ? body.message.join(", ") : body.message;
      }
    } catch {
      return "";
    }
  }

  try {
    const text = await response.text();
    return text.trim();
  } catch {
    return "";
  }
};

const extractVendorIdFromJwt = (token?: string): string => {
  if (!token) return "";
  const parts = token.split(".");
  if (parts.length < 2) return "";

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64)) as { sub?: string };
    return typeof payload?.sub === "string" ? payload.sub : "";
  } catch {
    return "";
  }
};

const resolveVendorIdByEmail = async (targetEmail: string): Promise<string> => {
  if (!targetEmail.trim() || !graphQlUrl) return "";

  try {
    const response = await fetch(graphQlUrl, {
      method: "POST",
      credentials: apiCredentials,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          query FindVendorByEmailForGoogleAuth($email: String!) {
            findVendorByEmail(email: $email) {
              id
              email
            }
          }
        `,
        variables: { email: targetEmail.trim() },
      }),
    });

    const payload = await response.json();
    if (!response.ok || payload?.errors?.length) return "";
    const vendor = payload?.data?.findVendorByEmail;
    return typeof vendor?.id === "string" ? vendor.id : "";
  } catch {
    return "";
  }
};

export const loginWithGoogleToken = async (
  idToken: string,
  role: "vendor" | "visitor" = "vendor",
): Promise<{
  vendorId: string;
  email: string;
  accessToken: string;
  isNewUser: boolean;
}> => {
  const requestUrl = joinUrl(apiBaseUrl, "/auth/google");
  const response = await fetch(requestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: apiCredentials,
    body: JSON.stringify({ idToken, role }),
  });

  if (!response.ok) {
    const err = await parseErrorMessage(response);
    throw new Error(err || `Google authentication failed (${response.status})`);
  }

  const data = (await response.json()) as GoogleAuthResponse;
  const token = data.access_token || "";
  const email = (data.vendorEmail || "").trim();
  const responseVendorId =
    typeof data.vendorId === "string"
      ? data.vendorId
      : typeof data.vendor_id === "string"
        ? data.vendor_id
        : "";
  const tokenVendorId = extractVendorIdFromJwt(token);
  const resolvedVendorId =
    responseVendorId ||
    tokenVendorId ||
    (email ? await resolveVendorIdByEmail(email) : "");

  if (!resolvedVendorId) {
    throw new Error("Unable to resolve vendor account ID after Google Sign-In.");
  }

  setVendorSession({ email, vendorId: resolvedVendorId });

  return {
    vendorId: resolvedVendorId,
    email,
    accessToken: token,
    isNewUser: !!data.isNewUser,
  };
};
