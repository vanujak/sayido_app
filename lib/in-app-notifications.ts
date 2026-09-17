import {
  documentDirectory,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from "expo-file-system/legacy";

export interface InAppNotification {
  id: string;
  title: string;
  body: string;
  data: {
    type?: string;
    chatId?: string;
    paymentId?: string;
    requestId?: string;
    approvalRequestId?: string;
    reservationId?: string;
    [key: string]: unknown;
  };
  receivedAt: string;
  read: boolean;
}

export interface NotificationStoreData {
  items: InAppNotification[];
  seenReservationIds: Record<string, true>;
  seenApprovalIds: Record<string, true>;
  dismissedPreviewReadAt: Record<string, number>;
}

const STORAGE_FILE = documentDirectory
  ? `${documentDirectory}sayido_in_app_notifications.json`
  : null;
const WEB_STORAGE_KEY = "__sayido_in_app_notifications__";

let memoryStore: Record<string, NotificationStoreData> = {};
let isInitialized = false;
const listeners = new Set<() => void>();

const notifyListeners = () => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore listener execution errors
    }
  });
};

const readWebStorage = (): Record<string, NotificationStoreData> => {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(WEB_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeWebStorage = (data: Record<string, NotificationStoreData>) => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(WEB_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
};

const persistStoreAsync = async () => {
  writeWebStorage(memoryStore);

  if (STORAGE_FILE) {
    try {
      await writeAsStringAsync(STORAGE_FILE, JSON.stringify(memoryStore));
    } catch (e) {
      console.warn("[in-app-notifications] Failed to persist notifications to disk:", e);
    }
  }
};

export const initInAppNotificationsAsync = async (): Promise<void> => {
  if (isInitialized) return;

  // 1. Try web storage
  const webData = readWebStorage();
  if (Object.keys(webData).length > 0) {
    memoryStore = webData;
    isInitialized = true;
    notifyListeners();
    return;
  }

  // 2. Try native disk storage
  if (STORAGE_FILE) {
    try {
      const info = await getInfoAsync(STORAGE_FILE);
      if (info.exists) {
        const raw = await readAsStringAsync(STORAGE_FILE);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            memoryStore = parsed;
          }
        }
      }
    } catch (e) {
      console.warn("[in-app-notifications] Error loading notification file:", e);
    }
  }

  isInitialized = true;
  notifyListeners();
};

const getOrCreateVendorStore = (vendorId: string): NotificationStoreData => {
  const key = vendorId || "__global__";
  if (!memoryStore[key]) {
    memoryStore[key] = {
      items: [],
      seenReservationIds: {},
      seenApprovalIds: {},
      dismissedPreviewReadAt: {},
    };
  }
  return memoryStore[key];
};

export const getInAppNotifications = (vendorId: string): InAppNotification[] => {
  return getOrCreateVendorStore(vendorId).items || [];
};

export const getNotificationReadState = (
  vendorId: string,
): {
  seenReservationIds: Record<string, true>;
  seenApprovalIds: Record<string, true>;
  dismissedPreviewReadAt: Record<string, number>;
} => {
  const store = getOrCreateVendorStore(vendorId);
  return {
    seenReservationIds: store.seenReservationIds || {},
    seenApprovalIds: store.seenApprovalIds || {},
    dismissedPreviewReadAt: store.dismissedPreviewReadAt || {},
  };
};

export const setNotificationReadState = (
  vendorId: string,
  state: {
    seenReservationIds?: Record<string, true>;
    seenApprovalIds?: Record<string, true>;
    dismissedPreviewReadAt?: Record<string, number>;
  },
) => {
  const store = getOrCreateVendorStore(vendorId);

  if (state.seenReservationIds) {
    store.seenReservationIds = { ...store.seenReservationIds, ...state.seenReservationIds };
  }
  if (state.seenApprovalIds) {
    store.seenApprovalIds = { ...store.seenApprovalIds, ...state.seenApprovalIds };
  }
  if (state.dismissedPreviewReadAt) {
    store.dismissedPreviewReadAt = {
      ...store.dismissedPreviewReadAt,
      ...state.dismissedPreviewReadAt,
    };
  }

  void persistStoreAsync();
  notifyListeners();
};

export const addInAppNotification = (
  vendorId: string,
  notification: {
    id?: string;
    title?: string;
    body?: string;
    data?: Record<string, unknown>;
  },
): InAppNotification => {
  const key = vendorId || "__global__";
  const store = getOrCreateVendorStore(key);
  const now = new Date().toISOString();
  const id = notification.id || `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Deduplicate by ID if already received
  const existingIdx = store.items.findIndex((item) => item.id === id);
  const newItem: InAppNotification = {
    id,
    title: notification.title || "New Notification",
    body: notification.body || "",
    data: notification.data || {},
    receivedAt: now,
    read: false,
  };

  if (existingIdx >= 0) {
    store.items[existingIdx] = newItem;
  } else {
    store.items.unshift(newItem);
  }

  // Limit in-app notification history to last 50 items
  if (store.items.length > 50) {
    store.items = store.items.slice(0, 50);
  }

  void persistStoreAsync();
  notifyListeners();
  return newItem;
};

export const markNotificationAsRead = (vendorId: string, notificationId: string) => {
  const key = vendorId || "__global__";
  const store = getOrCreateVendorStore(key);

  let updated = false;
  store.items = store.items.map((item) => {
    if (item.id === notificationId && !item.read) {
      updated = true;
      return { ...item, read: true };
    }
    return item;
  });

  if (updated) {
    void persistStoreAsync();
    notifyListeners();
  }
};

export const markAllNotificationsAsRead = (vendorId: string) => {
  const key = vendorId || "__global__";
  const store = getOrCreateVendorStore(key);

  let updated = false;
  store.items = store.items.map((item) => {
    if (!item.read) {
      updated = true;
      return { ...item, read: true };
    }
    return item;
  });

  if (updated) {
    void persistStoreAsync();
    notifyListeners();
  }
};

export const clearInAppNotifications = (vendorId: string) => {
  const key = vendorId || "__global__";
  const store = getOrCreateVendorStore(key);
  store.items = [];
  void persistStoreAsync();
  notifyListeners();
};

export const getUnreadNotificationCount = (vendorId: string): number => {
  const key = vendorId || "__global__";
  const store = getOrCreateVendorStore(key);
  return store.items.filter((item) => !item.read).length;
};

export const subscribeToNotifications = (callback: () => void): (() => void) => {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
};
