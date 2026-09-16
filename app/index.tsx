import { Redirect, Stack, useRouter } from "expo-router";
import { getVendorSession } from "@/lib/vendor-session";
import {
  authenticateWithBiometricsAsync,
  checkBiometricsSupportAsync,
  isBiometricsEnabled,
} from "@/lib/biometrics";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function Index() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(true);
  const [target, setTarget] = useState<string | null>(null);
  const [biometricType, setBiometricType] = useState("Fingerprint");
  const [authFailed, setAuthFailed] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);

  const runBiometricAuth = async () => {
    setAuthenticating(true);
    setAuthFailed(false);
    try {
      const auth = await authenticateWithBiometricsAsync("Log in to Say I Do");
      if (auth.success) {
        setTarget("/(tabs)");
      } else {
        setAuthFailed(true);
      }
    } catch {
      setAuthFailed(true);
    } finally {
      setAuthenticating(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const checkAuth = async () => {
      const session = getVendorSession();
      if (!session.vendorId && !session.email) {
        if (mounted) {
          setTarget("/login");
          setChecking(false);
        }
        return;
      }

      if (isBiometricsEnabled()) {
        const support = await checkBiometricsSupportAsync();
        if (mounted) {
          setBiometricType(support.typeName);
        }
        await runBiometricAuth();
      } else {
        if (mounted) {
          setTarget("/(tabs)");
        }
      }

      if (mounted) {
        setChecking(false);
      }
    };

    void checkAuth();

    return () => {
      mounted = false;
    };
  }, []);

  if (target) {
    return <Redirect href={target as any} />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.content}>
        {/* Brand Header */}
        <View style={styles.brandHeader}>
          <Text style={styles.brandTitle}>Say I Do</Text>
          <Text style={styles.brandSubtitle}>Vendor Portal</Text>
        </View>

        {/* Biometric Icon & Status */}
        <View style={styles.authBox}>
          <View style={styles.iconCircle}>
            <Ionicons
              name={biometricType === "Face Recognition" ? "scan-outline" : "finger-print"}
              size={52}
              color="#FC7B54"
            />
          </View>

          <Text style={styles.promptTitle}>
            {authFailed ? `${biometricType} Not Recognized` : `Unlock with ${biometricType}`}
          </Text>

          <Text style={styles.promptDesc}>
            {authFailed
              ? "Touch sensor again to retry, or use your password to sign in."
              : `Touch the ${biometricType.toLowerCase()} sensor to access your dashboard.`}
          </Text>

          {authenticating ? (
            <ActivityIndicator size="small" color="#FC7B54" style={styles.spinner} />
          ) : null}
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          {authFailed && (
            <TouchableOpacity
              style={styles.retryButton}
              activeOpacity={0.8}
              onPress={runBiometricAuth}
            >
              <Text style={styles.retryButtonText}>Try {biometricType} Again</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.passwordButton}
            activeOpacity={0.7}
            onPress={() => router.replace("/login")}
          >
            <Text style={styles.passwordButtonText}>Sign In with Password</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF8F3",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  brandHeader: {
    alignItems: "center",
    marginBottom: 44,
  },
  brandTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 42,
    lineHeight: 46,
    color: "#111827",
    letterSpacing: -0.6,
  },
  brandSubtitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "#6B7280",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginTop: 6,
  },
  authBox: {
    alignItems: "center",
    marginBottom: 36,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#FED7AA40",
    borderWidth: 1.5,
    borderColor: "#FDBA74",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  promptTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 22,
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  promptDesc: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  spinner: {
    marginTop: 16,
  },
  actions: {
    width: "100%",
    gap: 12,
  },
  retryButton: {
    backgroundColor: "#FC7B54",
    borderRadius: 14,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FC7B54",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  retryButtonText: {
    fontFamily: "Outfit_700Bold",
    color: "#FFFFFF",
    fontSize: 15,
  },
  passwordButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  passwordButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    color: "#374151",
    fontSize: 14,
  },
});
