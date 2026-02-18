import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { setVendorSession } from "@/lib/vendor-session";
import { apiBaseUrl, graphQlUrl } from "@/lib/api-config";

type LoginApiResponse = {
  message?: string;
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
    findAllVendors?: Array<{
      id?: string;
      email?: string;
    }>;
  };
  errors?: Array<{
    message?: string;
  }>;
};

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loginVendor = async () => {
    const requestUrl = joinUrl(apiBaseUrl, "/auth/loginVendor");
    let response: Response;

    try {
      response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Network error");
    }

    if (response.ok) {
      return;
    }

    const parsedMessage = await parseLoginErrorMessage(response);
    throw new Error(parsedMessage || `Login request failed (${response.status})`);
  };

  const resolveVendorIdByEmail = async (targetEmail: string) => {
    if (!targetEmail.trim()) return "";
    if (!graphQlUrl) return "";

    try {
      const response = await fetch(graphQlUrl, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
            query FindAllVendorsForLogin {
              findAllVendors {
                id
                email
              }
            }
          `,
          variables: {},
        }),
      });

      const payload = (await response.json()) as VendorsLookupResponse;
      if (!response.ok || payload.errors?.length) return "";

      const vendors = Array.isArray(payload.data?.findAllVendors)
        ? payload.data?.findAllVendors
        : [];
      const normalizedTarget = targetEmail.trim().toLowerCase();
      const matched = vendors.find(
        (vendor) =>
          typeof vendor?.email === "string" &&
          vendor.email.trim().toLowerCase() === normalizedTarget
      );

      return typeof matched?.id === "string" ? matched.id : "";
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
      await loginVendor();
      const normalizedEmail = email.trim();
      const resolvedVendorId = await resolveVendorIdByEmail(normalizedEmail);
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
          : "Login failed. Check credentials and backend."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
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
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#9CA3AF"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
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
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  contentContainer: {
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#EEF1F5",
    paddingVertical: 30,
    paddingHorizontal: 20,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
  },
  header: {
    alignItems: "center",
    marginBottom: 28,
  },
  title: {
    fontFamily: "Outfit_700Bold",
    fontSize: 40,
    color: "#111827",
    letterSpacing: -1,
  },
  subtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 16,
    color: "#6B7280",
    marginTop: 6,
  },
  form: {
    width: "100%",
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "#1F2937",
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    width: "100%",
    height: 54,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    paddingHorizontal: 24,
    fontFamily: "Montserrat_400Regular",
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#F9FAFB",
  },
  loginButton: {
    width: "100%",
    height: 54,
    backgroundColor: "#FC7B54",
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
    marginBottom: 24,
    shadowColor: "#FC7B54",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 4,
  },
  loginButtonDisabled: {
    backgroundColor: "#FFBCA6", // Lighter orange
    shadowOpacity: 0,
  },
  loginButtonText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: "#FFFFFF",
  },
  errorText: {
    fontFamily: "Montserrat_400Regular",
    color: "#DC2626",
    textAlign: "center",
    marginTop: -18,
    marginBottom: 16,
  },
});
