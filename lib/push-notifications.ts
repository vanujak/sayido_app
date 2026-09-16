import Constants from "expo-constants";
import * as Device from "expo-device";
import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";

let cachedToken = "";
let notificationHandlerConfigured = false;

type NotificationsModule = typeof import("expo-notifications");

/**
 * Checks if the platform can display and handle notifications (iOS / Android native).
 * On Android, remote notifications and expo-notifications were removed from Expo Go in SDK 53+.
 * A development build (e.g. npx expo run:android) is required for notifications on Android.
 */
export const canReceiveNotifications = (): boolean => {
  if (Platform.OS === "web") return false;
  if (Platform.OS === "android" && isRunningInExpoGo()) return false;
  return true;
};

/**
 * Checks if remote push token registration via Expo Push Service can be executed.
 * Remote push in SDK 53+ requires a development build rather than standard Expo Go.
 */
export const canUseNativePushNotifications = (): boolean => {
  return Platform.OS !== "web" && !isRunningInExpoGo();
};

/**
 * Dynamically loads and configures expo-notifications presentation handler.
 */
export const getNotificationsModule = async (): Promise<NotificationsModule | null> => {
  if (!canReceiveNotifications()) return null;

  try {
    const Notifications = await import("expo-notifications");
    if (!notificationHandlerConfigured && typeof Notifications?.setNotificationHandler === "function") {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      notificationHandlerConfigured = true;
    }

    return Notifications;
  } catch (error) {
    console.warn("[push-notifications] expo-notifications could not be loaded:", error);
    return null;
  }
};

/**
 * Ensures the Android default notification channel is created with max importance.
 */
export const ensureNotificationChannelAsync = async (
  Notifications: NotificationsModule
): Promise<void> => {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FC7B54",
      sound: "default",
    });
  }
};

/**
 * Method A: Schedules a test notification locally on the device.
 * Uses the exact same notification structure and data payload as Method B (remote push from backend).
 */
export const sendTestLocalNotification = async (options?: {
  title?: string;
  body?: string;
  chatId?: string;
  delaySeconds?: number;
}): Promise<{ success: boolean; message: string }> => {
  if (!canReceiveNotifications()) {
    return {
      success: false,
      message:
        Platform.OS === "android" && isRunningInExpoGo()
          ? "Push and local notifications on Android require a development build in SDK 53+ (npx expo run:android). They are not supported in Expo Go."
          : "Notifications are not supported in this environment.",
    };
  }

  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    return {
      success: false,
      message: "Could not initialize notifications module.",
    };
  }

  await ensureNotificationChannelAsync(Notifications);

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const permission = await Notifications.requestPermissionsAsync();
    finalStatus = permission.status;
  }

  if (finalStatus !== "granted") {
    return {
      success: false,
      message: "Notification permission was not granted on this device.",
    };
  }

  const title = options?.title || "New message from Sophie & Mark";
  const body =
    options?.body || "Hi! Are you available on June 14th for wedding photography?";
  const chatId = options?.chatId || "demo-chat-id";
  const delaySeconds = options?.delaySeconds && options.delaySeconds > 0 ? options.delaySeconds : 0;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: "default",
      data: {
        type: "chat_message",
        chatId,
      },
    },
    trigger:
      delaySeconds > 0
        ? {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: delaySeconds,
          }
        : null,
  });

  return {
    success: true,
    message:
      delaySeconds > 0
        ? `Notification scheduled in ${delaySeconds}s! Lock your phone or go to home screen to test.`
        : "Notification triggered successfully!",
  };
};

/**
 * Method A: Schedules a test package purchase notification locally.
 * Matches the backend sendPushNotificationForPurchase structure and navigates to the reservations tab.
 */
export const sendTestPackagePurchaseNotification = async (options?: {
  clientName?: string;
  packageName?: string;
  amount?: number;
  bookingDate?: string;
  delaySeconds?: number;
}): Promise<{ success: boolean; message: string }> => {
  if (!canReceiveNotifications()) {
    return {
      success: false,
      message:
        Platform.OS === "android" && isRunningInExpoGo()
          ? "Push and local notifications on Android require a development build in SDK 53+ (npx expo run:android). They are not supported in Expo Go."
          : "Notifications are not supported in this environment.",
    };
  }

  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    return {
      success: false,
      message: "Could not initialize notifications module.",
    };
  }

  await ensureNotificationChannelAsync(Notifications);

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const permission = await Notifications.requestPermissionsAsync();
    finalStatus = permission.status;
  }

  if (finalStatus !== "granted") {
    return {
      success: false,
      message: "Notification permission was not granted on this device.",
    };
  }

  const clientName = options?.clientName || "Sophie & Mark";
  const packageName = options?.packageName || "Full Day Wedding Photography";
  const amount = options?.amount || 1500;
  const bookingDate = options?.bookingDate || "Dec 18, 2026";
  const delaySeconds = options?.delaySeconds && options.delaySeconds > 0 ? options.delaySeconds : 0;

  const title = `🎉 New Booking: ${packageName}!`;
  const body = `${clientName} booked "${packageName}" ($${amount.toLocaleString()}) for ${bookingDate}.`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: "default",
      data: {
        type: "package_purchase",
        paymentId: "demo-payment-123",
        packageName,
        amount,
        visitorName: clientName,
      },
    },
    trigger:
      delaySeconds > 0
        ? {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: delaySeconds,
          }
        : null,
  });

  return {
    success: true,
    message:
      delaySeconds > 0
        ? `Purchase notification scheduled in ${delaySeconds}s! Lock your phone to test.`
        : "Purchase notification triggered! Tap it to open Reservations.",
  };
};

const getProjectId = (): string => {
  const fromEasConfig = Constants?.easConfig?.projectId;
  if (fromEasConfig) return fromEasConfig;

  const fromExpoConfig = (
    Constants?.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
  )?.eas?.projectId;
  if (fromExpoConfig) return fromExpoConfig;

  return process.env.EXPO_PUBLIC_PROJECT_ID || "c2c881da-3117-4317-a49e-7a3a046ecf30";
};

/**
 * Method B: Requests permissions and retrieves the Expo Push Token for remote push notifications.
 */
export const registerForPushNotificationsAsync = async (): Promise<string> => {
  if (cachedToken) return cachedToken;
  if (!canUseNativePushNotifications()) return "";
  if (!Device.isDevice) return "";

  const Notifications = await getNotificationsModule();
  if (!Notifications) return "";

  await ensureNotificationChannelAsync(Notifications);

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const permission = await Notifications.requestPermissionsAsync();
    finalStatus = permission.status;
  }

  if (finalStatus !== "granted") return "";

  const projectId = getProjectId();
  const tokenResponse = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync();

  cachedToken = tokenResponse.data || "";
  return cachedToken;
};
