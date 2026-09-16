import { Redirect } from "expo-router";
import { getVendorSession } from "@/lib/vendor-session";
import {
  authenticateWithBiometricsAsync,
  isBiometricsEnabled,
} from "@/lib/biometrics";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

export default function Index() {
  const [checking, setChecking] = useState(true);
  const [target, setTarget] = useState<string | null>(null);

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
        const auth = await authenticateWithBiometricsAsync("Log in to Say I Do");
        if (!mounted) return;
        if (auth.success) {
          setTarget("/(tabs)");
        } else {
          setTarget("/login");
        }
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

  if (checking || !target) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#FC7B54" />
      </View>
    );
  }

  return <Redirect href={target as any} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF8F3",
    alignItems: "center",
    justifyContent: "center",
  },
});
