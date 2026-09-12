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
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import {
  canReceiveNotifications,
  getNotificationsModule,
} from "@/lib/push-notifications";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import "react-native-reanimated";

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary
} from "expo-router";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: "(tabs)",
};

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

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    if (!canReceiveNotifications()) return;

    let subscription: { remove: () => void } | undefined;
    let mounted = true;

    void getNotificationsModule().then((Notifications) => {
      if (!mounted || !Notifications) return;

      subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as {
          type?: string;
          chatId?: string;
          paymentId?: string;
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
    });

    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, [router]);

  if (!loaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider value={DefaultTheme}>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <Stack>
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
          <StatusBar style="dark" backgroundColor="#ffffff" />
        </SafeAreaView>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
