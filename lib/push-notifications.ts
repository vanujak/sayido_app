import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

let cachedToken = "";
let notificationHandlerConfigured = false;

type NotificationsModule = typeof import("expo-notifications");
type ExpoRuntimeConstants = {
  appOwnership?: string | null;
  executionEnvironment?: string;
  expoVersion?: string | null;
};

export const canUseNativePushNotifications = () => {
  const constants = Constants as ExpoRuntimeConstants;
  const isExpoGo =
    constants.appOwnership === "expo" ||
    (constants.executionEnvironment === "storeClient" && !!constants.expoVersion);
  return Platform.OS !== "web" && !isExpoGo;
};

const getNotificationsModule = async (): Promise<NotificationsModule | null> => {
  if (!canUseNativePushNotifications()) return null;

  const Notifications = await import("expo-notifications");
  if (!notificationHandlerConfigured) {
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
};

const getProjectId = () => {
  const fromEasConfig = Constants?.easConfig?.projectId;
  if (fromEasConfig) return fromEasConfig;

  const fromExpoConfig = (Constants?.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  return fromExpoConfig || "";
};

export const registerForPushNotificationsAsync = async (): Promise<string> => {
  if (cachedToken) return cachedToken;
  if (!canUseNativePushNotifications()) return "";
  if (!Device.isDevice) return "";

  const Notifications = await getNotificationsModule();
  if (!Notifications) return "";

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FC7B54",
    });
  }

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
