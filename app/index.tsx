import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  ImageBackground,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { getVendorSession } from "@/lib/vendor-session";
import { isBiometricsEnabled } from "@/lib/biometrics";
import { useAppTheme } from "@/context/ThemeContext";

export default function AppLoadingScreen() {
  const router = useRouter();
  const { isDark } = useAppTheme();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Smooth entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 650,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // Subtle breathing pulse for the logo
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.04,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();

    // Check session & transition to appropriate screen
    const timer = setTimeout(() => {
      const session = getVendorSession();
      // If vendor session exists and biometric lock is not enabled, can go directly to tabs;
      // otherwise, go to login for authentication
      if (session.vendorId && !isBiometricsEnabled()) {
        router.replace("/(tabs)");
      } else {
        router.replace("/login");
      }
    }, 1400);

    return () => {
      clearTimeout(timer);
      pulseLoop.stop();
    };
  }, [fadeAnim, pulseAnim, router, scaleAnim]);

  return (
    <ImageBackground
      source={require("../assets/images/sayido_login.png")}
      resizeMode="cover"
      style={styles.background}
      imageStyle={styles.backgroundImage}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={[
          styles.backgroundOverlay,
          isDark && styles.backgroundOverlayDark,
        ]}
      >
        <Animated.View
          style={[
            styles.centerContent,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Logo Badge in Small Size */}
          <Animated.View
            style={[
              styles.logoBadge,
              isDark && styles.logoBadgeDark,
              { transform: [{ scale: pulseAnim }] },
            ]}
          >
            <Image
              source={require("../assets/images/splash-icon.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </Animated.View>

          {/* App Branding */}
          <Text style={[styles.title, isDark && styles.titleDark]}>
            Say I Do
          </Text>

          <View style={[styles.taglinePill, isDark && styles.taglinePillDark]}>
            <Text style={styles.subtitle}>Vendor Portal</Text>
          </View>
        </Animated.View>

        {/* Bottom Loading Indicator */}
        <Animated.View style={[styles.bottomContainer, { opacity: fadeAnim }]}>
          <ActivityIndicator size="small" color="#FC7B54" />
          <Text style={[styles.loadingText, isDark && styles.loadingTextDark]}>
            Loading vendor portal...
          </Text>
        </Animated.View>
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
    backgroundColor: "rgba(8, 16, 28, 0.16)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  backgroundOverlayDark: {
    backgroundColor: "rgba(15, 23, 42, 0.72)",
  },
  centerContent: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    maxWidth: 320,
  },
  logoBadge: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(254, 215, 170, 0.8)",
    shadowColor: "#FC7B54",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 4,
    marginBottom: 18,
  },
  logoBadgeDark: {
    backgroundColor: "rgba(30, 41, 59, 0.92)",
    borderColor: "rgba(252, 123, 84, 0.35)",
    shadowColor: "#000000",
    shadowOpacity: 0.35,
  },
  logoImage: {
    width: 52,
    height: 52,
  },
  title: {
    fontFamily: "Outfit_700Bold",
    fontSize: 36,
    lineHeight: 40,
    color: "#111827",
    letterSpacing: -0.6,
    textAlign: "center",
  },
  titleDark: {
    color: "#F8FAFC",
  },
  taglinePill: {
    backgroundColor: "rgba(252, 123, 84, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(252, 123, 84, 0.25)",
    paddingHorizontal: 14,
    paddingVertical: 4.5,
    borderRadius: 999,
    marginTop: 8,
  },
  taglinePillDark: {
    backgroundColor: "rgba(252, 123, 84, 0.18)",
    borderColor: "rgba(252, 123, 84, 0.35)",
  },
  subtitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12.5,
    color: "#FC7B54",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  bottomContainer: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 54 : 42,
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 12.5,
    color: "#4B5563",
    letterSpacing: 0.3,
  },
  loadingTextDark: {
    color: "#94A3B8",
  },
});
