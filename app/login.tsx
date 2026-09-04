import GoogleIcon from "@/components/GoogleIcon";
import { apiBaseUrl, apiCredentials, graphQlUrl } from "@/lib/api-config";
import { loginWithGoogleToken } from "@/lib/google-auth-api";
import { clearVendorSession, setVendorSession } from "@/lib/vendor-session";
import { Ionicons } from "@expo/vector-icons";
import * as Google from "expo-auth-session/providers/google";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

WebBrowser.maybeCompleteAuthSession();

type LoginApiResponse = {
  message?: string;
  access_token?: string;
  vendorId?: string;
  vendor_id?: string;
};

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");
const joinUrl = (base: string, path: string) => {
  const normalizedBase = normalizeBaseUrl(base);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

const parseLoginErrorMessage = async (response: Response) => {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const body = (await response.json()) as LoginApiResponse;
      if (body?.message) return body.message;
    } catch {
      return "";
    }
    return "";
  }

  try {
    const text = await response.text();
    return text.trim();
  } catch {
    return "";
  }
};

type VendorsLookupResponse = {
  data?: {
    findVendorByEmail?: {
      id?: string;
      email?: string;
    } | null;
  };
  errors?: Array<{
    message?: string;
  }>;
};

const extractVendorIdFromJwt = (token?: string) => {
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

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [googleRequest, googleResponse, promptGoogleAsync] =
    Google.useIdTokenAuthRequest({
      clientId:
        process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
        "1054418062583-nja3fs3u9q072hh7avht54habq534luu.apps.googleusercontent.com",
      webClientId:
        process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
        "1054418062583-nja3fs3u9q072hh7avht54habq534luu.apps.googleusercontent.com",
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
      androidClientId:
        process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
    });

  useEffect(() => {
    if (googleResponse?.type === "success") {
      const idToken =
        googleResponse.params?.id_token ||
        googleResponse.authentication?.idToken;

      if (idToken) {
        void handleGoogleBackendLogin(idToken);
      } else {
        setErrorMessage("No ID token received from Google.");
      }
    } else if (googleResponse?.type === "error") {
      setErrorMessage(
        googleResponse.error?.message || "Google Sign-In failed.",
      );
    }
  }, [googleResponse]);

  const handleGoogleBackendLogin = async (idToken: string) => {
    setGoogleLoading(true);
    setErrorMessage("");
    try {
      const result = await loginWithGoogleToken(idToken, "vendor");
      router.replace({
        pathname: "/(tabs)",
        params: {
          email: result.email,
          vendor_email: result.email,
          vendor_id: result.vendorId,
        },
      });
    } catch (error) {
      console.error("Google Auth Error:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Google authentication failed. Please try again.",
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMessage("");
    try {
      await promptGoogleAsync();
    } catch {
      setErrorMessage("Could not launch Google Sign-In.");
    }
  };

  const loginVendor = async () => {
    const requestUrl = joinUrl(apiBaseUrl, "/auth/loginVendor");
    let response: Response;

    try {
      response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: apiCredentials,
        body: JSON.stringify({ email, password }),
      });
    } catch (error) {
      const baseMessage =
        error instanceof Error ? error.message : "Network error";
      throw new Error(
        `${baseMessage}. Request URL: ${requestUrl}. API base URL: ${apiBaseUrl}`,
      );
    }

    if (response.ok) {
      try {
        return (await response.json()) as LoginApiResponse;
      } catch {
        return {};
      }
    }

    const parsedMessage = await parseLoginErrorMessage(response);
    throw new Error(
      parsedMessage || `Login request failed (${response.status})`,
    );
  };

  const resolveVendorIdByEmail = async (targetEmail: string) => {
    if (!targetEmail.trim()) return "";
    if (!graphQlUrl) return "";

    try {
      const response = await fetch(graphQlUrl, {
        method: "POST",
        credentials: apiCredentials,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
            query FindVendorByEmailForLogin($email: String!) {
              findVendorByEmail(email: $email) {
                id
                email
              }
            }
          `,
          variables: { email: targetEmail.trim() },
        }),
      });

      const payload = (await response.json()) as VendorsLookupResponse;
      if (!response.ok || payload.errors?.length) return "";

      const vendor = payload.data?.findVendorByEmail;
      return typeof vendor?.id === "string" ? vendor.id : "";
    } catch {
      return "";
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setErrorMessage("Please enter email and password.");
      return;
    }

    setErrorMessage("");
    setLoading(true);
    try {
      clearVendorSession();
      const loginPayload = await loginVendor();
      const normalizedEmail = email.trim();
      const responseVendorId =
        typeof loginPayload?.vendorId === "string"
          ? loginPayload.vendorId
          : typeof loginPayload?.vendor_id === "string"
            ? loginPayload.vendor_id
            : "";
      const tokenVendorId = extractVendorIdFromJwt(loginPayload?.access_token);
      const resolvedVendorId =
        responseVendorId ||
        tokenVendorId ||
        (await resolveVendorIdByEmail(normalizedEmail));

      if (!resolvedVendorId) {
        throw new Error("Unable to resolve vendor account id after login.");
      }

      setVendorSession({ email: normalizedEmail, vendorId: resolvedVendorId });
      router.replace({
        pathname: "/(tabs)",
        params: {
          email: normalizedEmail,
          vendor_email: normalizedEmail,
          vendor_id: resolvedVendorId,
        },
      });
    } catch (error) {
      console.error("Login Error:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Login failed. Check credentials and backend.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require("../assets/images/sayido_login.png")}
      resizeMode="cover"
      style={styles.background}
      imageStyle={styles.backgroundImage}
    >
      <View style={styles.backgroundOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.container}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContainer}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.contentContainer}>
              {/* Header / Logo Area */}
              <View style={styles.header}>
                <Text style={styles.title}>Say I Do</Text>
                <Text style={styles.subtitle}>Vendor Portal</Text>
              </View>

              {/* Form */}
              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Email Address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="name@example.com"
                    placeholderTextColor="#9CA3AF"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Password</Text>
                  <View style={styles.passwordInputContainer}>
                    <TextInput
                      style={[styles.input, styles.passwordInput]}
                      placeholder="••••••••"
                      placeholderTextColor="#9CA3AF"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword((prev) => !prev)}
                      style={styles.passwordToggle}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={22}
                        color="#6B7280"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Forgot Password Link */}
                <View style={styles.forgotPasswordContainer}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => router.push("/forgot-password")}
                  >
                    <Text style={styles.forgotPasswordText}>
                      Forgot password?
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[
                    styles.loginButton,
                    loading && styles.loginButtonDisabled,
                  ]}
                  onPress={handleLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.loginButtonText}>Log In</Text>
                  )}
                </TouchableOpacity>

                {!!errorMessage && (
                  <Text style={styles.errorText}>{errorMessage}</Text>
                )}

                {/* OR Divider */}
                <View style={styles.dividerContainer}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Continue with Google */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[
                    styles.googleButton,
                    (googleLoading || !googleRequest) &&
                      styles.googleButtonDisabled,
                  ]}
                  onPress={handleGoogleLogin}
                  disabled={googleLoading || !googleRequest}
                >
                  {googleLoading ? (
                    <ActivityIndicator color="#111827" />
                  ) : (
                    <View style={styles.googleButtonContent}>
                      <GoogleIcon size={22} />
                      <Text style={styles.googleButtonText}>
                        Continue with Google
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  backgroundImage: {
    width: "100%",
    height: "100%",
  },
  backgroundOverlay: {
    flex: 1,
    backgroundColor: "rgba(8, 16, 28, 0.18)",
  },
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    padding: 20,
    paddingTop: 110,
    paddingBottom: 40,
  },
  contentContainer: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 0,
    borderWidth: 0,
    paddingVertical: 34,
    paddingHorizontal: 22,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontFamily: "Outfit_700Bold",
    fontSize: 48,
    lineHeight: 50,
    color: "#111827",
    letterSpacing: -0.8,
  },
  subtitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: "#4B5563",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 8,
  },
  form: {
    width: "100%",
  },
  inputGroup: {
    marginBottom: 22,
  },
  label: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: "#1F2937",
    marginBottom: 10,
    marginLeft: 6,
  },
  input: {
    width: "100%",
    height: 70,
    borderWidth: 1,
    borderColor: "#D4D8DE",
    borderRadius: 22,
    paddingHorizontal: 28,
    fontFamily: "Montserrat_400Regular",
    fontSize: 17,
    color: "#111827",
    backgroundColor: "rgba(248, 250, 252, 0.8)",
  },
  passwordInputContainer: {
    position: "relative",
    width: "100%",
  },
  passwordInput: {
    paddingRight: 62,
  },
  passwordToggle: {
    position: "absolute",
    right: 20,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  forgotPasswordContainer: {
    alignItems: "flex-end",
    marginTop: -8,
    marginBottom: 16,
    paddingRight: 6,
  },
  forgotPasswordText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "#FC7B54",
  },
  loginButton: {
    width: "100%",
    height: 64,
    backgroundColor: "#FC7B54",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
    marginBottom: 6,
    shadowColor: "#FC7B54",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.26,
    shadowRadius: 16,
    elevation: 6,
  },
  loginButtonDisabled: {
    backgroundColor: "#FFBCA6",
    shadowOpacity: 0,
  },
  loginButtonText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 20,
    lineHeight: 22,
    color: "#FFFFFF",
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 18,
    width: "100%",
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#D4D8DE",
  },
  dividerText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: "#9CA3AF",
    marginHorizontal: 12,
  },
  googleButton: {
    width: "100%",
    height: 64,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#D4D8DE",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  googleButtonText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: "#1F2937",
    marginLeft: 12,
  },
  errorText: {
    fontFamily: "Montserrat_400Regular",
    color: "#DC2626",
    textAlign: "center",
    marginTop: 12,
    marginBottom: 4,
  },
});
