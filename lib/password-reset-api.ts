import { apiBaseUrl, apiCredentials } from "./api-config";

export type UserRole = "visitor" | "vendor";

export interface RequestOtpResponse {
  message: string;
  role?: UserRole;
}

export interface VerifyOtpResponse {
  message: string;
  resetToken: string;
  role: UserRole;
}

export interface ResetPasswordResponse {
  message: string;
  role: UserRole;
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

export const requestPasswordResetOtp = async (
  email: string,
  role: UserRole = "vendor",
): Promise<RequestOtpResponse> => {
  const requestUrl = joinUrl(apiBaseUrl, "/auth/forgot-password/request-otp");
  const response = await fetch(requestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: apiCredentials,
    body: JSON.stringify({ email: email.trim(), role }),
  });

  if (!response.ok) {
    const err = await parseErrorMessage(response);
    throw new Error(err || `Failed to send verification code (${response.status})`);
  }

  return (await response.json()) as RequestOtpResponse;
};

export const verifyPasswordResetOtp = async (
  email: string,
  otp: string,
  role: UserRole = "vendor",
): Promise<VerifyOtpResponse> => {
  const requestUrl = joinUrl(apiBaseUrl, "/auth/forgot-password/verify-otp");
  const response = await fetch(requestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: apiCredentials,
    body: JSON.stringify({ email: email.trim(), otp: otp.trim(), role }),
  });

  if (!response.ok) {
    const err = await parseErrorMessage(response);
    throw new Error(err || `Verification failed (${response.status})`);
  }

  return (await response.json()) as VerifyOtpResponse;
};

export const resetPassword = async (
  resetToken: string,
  newPassword: string,
  role: UserRole = "vendor",
): Promise<ResetPasswordResponse> => {
  const requestUrl = joinUrl(apiBaseUrl, "/auth/forgot-password/reset-password");
  const response = await fetch(requestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: apiCredentials,
    body: JSON.stringify({ resetToken, newPassword, role }),
  });

  if (!response.ok) {
    const err = await parseErrorMessage(response);
    throw new Error(err || `Failed to reset password (${response.status})`);
  }

  return (await response.json()) as ResetPasswordResponse;
};
