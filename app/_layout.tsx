import {
  Montserrat_400Regular,
  Montserrat_600SemiBold,
} from "@expo-google-fonts/montserrat";
import {
  Outfit_400Regular,
  Outfit_700Bold,
  useFonts,
} from "@expo-google-fonts/outfit";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from "expo-router/react-navigation";
import { ThemeProvider as AppThemeProvider, useAppTheme } from "@/context/ThemeContext";
import {
  canReceiveNotifications,
  getNotificationsModule,
} from "@/lib/push-notifications";
import {
  initInAppNotificationsAsync,
  addInAppNotification,
  markNotificationAsRead,
} from "@/lib/in-app-notifications";
import { getVendorSession, initVendorSessionAsync } from "@/lib/vendor-session";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import "react-native-reanimated";

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary
} from "expo-router";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: "index",
};

function RootNavigation() {
  const { isDark, colors } = useAppTheme();

  const navigationTheme = useMemo(() => {
    return isDark
      ? {
          ...DarkTheme,
          colors: {
            ...DarkTheme.colors,
            primary: colors.primary,
            background: colors.background,
            card: colors.card,
            text: colors.text,
            border: colors.border,
          },
        }
      : {
          ...DefaultTheme,
          colors: {
            ...DefaultTheme.colors,
            primary: colors.primary,
            background: colors.background,
            card: colors.card,
            text: colors.text,
            border: colors.border,
          },
        };
  }, [isDark, colors]);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
        <Stack initialRouteName="index">
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen
            name="forgot-password"
            options={{ headerShown: false }}
          />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="modal"
            options={{ presentation: "modal", title: "Modal" }}
          />
        </Stack>
        <StatusBar style={isDark ? "light" : "dark"} />
      </SafeAreaView>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  const router = useRouter();
  const [loaded, error] = useFonts({
    Outfit_400Regular,
    Outfit_700Bold,
    Montserrat_400Regular,
    Montserrat_600SemiBold,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  const [sessionLoaded, setSessionLoaded] = useState(false);

  useEffect(() => {
    void Promise.all([
      initVendorSessionAsync(),
      initInAppNotificationsAsync(),
    ]).finally(() => {
      setSessionLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded && sessionLoaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded, sessionLoaded]);

  useEffect(() => {
    if (!canReceiveNotifications()) return;

    let responseSubscription: { remove: () => void } | undefined;
    let receivedSubscription: { remove: () => void } | undefined;
    let mounted = true;

    void getNotificationsModule().then((Notifications) => {
      if (!mounted || !Notifications) return;

      // 1. Capture incoming push notifications while app is running / foregrounded
      if (typeof Notifications.addNotificationReceivedListener === "function") {
        receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
          const content = notification.request.content;
          const vendorId = getVendorSession().vendorId || "";
          addInAppNotification(vendorId, {
            id: notification.request.identifier,
            title: content.title || "New Notification",
            body: content.body || "",
            data: (content.data as Record<string, unknown>) || {},
          });
        });
      }

      // 2. Capture when user taps a notification banner to open the app
      if (typeof Notifications.addNotificationResponseReceivedListener === "function") {
        responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
          const content = response.notification.request.content;
          const vendorId = getVendorSession().vendorId || "";
          const identifier = response.notification.request.identifier;

          addInAppNotification(vendorId, {
            id: identifier,
            title: content.title || "New Notification",
            body: content.body || "",
            data: (content.data as Record<string, unknown>) || {},
          });
          markNotificationAsRead(vendorId, identifier);

          const data = content.data as {
            type?: string;
            chatId?: string;
            paymentId?: string;
            requestId?: string;
          };

          if (data?.type === "package_purchase") {
            router.push("/(tabs)/resavations");
          } else if (data?.type === "package_approval_request") {
            router.push({
              pathname: "/(tabs)/resavations",
              params: { tab: "approvals" },
            });
          } else if (data?.type === "chat_message" && typeof data.chatId === "string" && data.chatId) {
            router.push({
              pathname: "/(tabs)/chat",
              params: { chatId: data.chatId },
            });
          }
        });
      }

      // 3. Catch notifications already presented in the tray
      if (typeof Notifications.getPresentedNotificationsAsync === "function") {
        Notifications.getPresentedNotificationsAsync()
          .then((presentedList) => {
            if (!mounted || !Array.isArray(presentedList)) return;
            const vendorId = getVendorSession().vendorId || "";
            presentedList.forEach((notif) => {
              addInAppNotification(vendorId, {
                id: notif.request.identifier,
                title: notif.request.content.title || "Notification",
                body: notif.request.content.body || "",
                data: (notif.request.content.data as Record<string, unknown>) || {},
              });
            });
          })
          .catch(() => {});
      }
    });

    return () => {
      mounted = false;
      receivedSubscription?.remove();
      responseSubscription?.remove();
    };
  }, [router]);

  if (!loaded || !sessionLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AppThemeProvider>
        <RootNavigation />
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}
