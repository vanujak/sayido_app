import {
  deleteAsync,
  documentDirectory,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from "expo-file-system/legacy";

export type VendorSession = {
  vendorId?: string;
  email?: string;
  name?: string;
  profilePicUrl?: string;
  authProvider?: "google" | "password";
  biometricsEnabled?: boolean;
  biometricsOptInPrompted?: boolean;
  themeMode?: "system" | "light" | "dark";
};

const SESSION_KEY = "__sayido_vendor_session__";
const SESSION_FILE = documentDirectory
  ? `${documentDirectory}sayido_vendor_session.json`
  : null;

let memorySession: VendorSession = {};

const readLocalStorage = (): VendorSession => {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as VendorSession;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeLocalStorage = (value: VendorSession) => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
};

const clearLocalStorage = () => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
};

/**
 * Initializes the session from persistent disk storage (file on native mobile, localStorage on web).
 * Called once at app startup before splash screen is dismissed.
 */
export const initVendorSessionAsync = async (): Promise<VendorSession> => {
  if (memorySession.vendorId || memorySession.email) {
    return memorySession;
  }

  // 1. Try web localStorage
  const webSession = readLocalStorage();
  if (webSession.vendorId || webSession.email) {
    memorySession = webSession;
    return memorySession;
  }

  // 2. Try native mobile file system
  if (SESSION_FILE) {
    try {
      const info = await getInfoAsync(SESSION_FILE);
      if (info.exists) {
        const raw = await readAsStringAsync(SESSION_FILE);
        if (raw) {
          const parsed = JSON.parse(raw) as VendorSession;
          if (parsed && (parsed.vendorId || parsed.email)) {
            memorySession = parsed;
            return memorySession;
          }
        }
      }
    } catch (e) {
      console.warn("[vendor-session] Error reading session file:", e);
    }
  }

  return memorySession;
};

/**
 * Synchronously retrieves the current vendor session from memory.
 */
export const getVendorSession = (): VendorSession => {
  if (memorySession.vendorId || memorySession.email) {
    return memorySession;
  }
  const webSession = readLocalStorage();
  if (webSession.vendorId || webSession.email) {
    memorySession = webSession;
    return memorySession;
  }
  return memorySession;
};

/**
 * Persists the vendor session to both memory and permanent disk storage.
 */
export const setVendorSession = (next: VendorSession) => {
  memorySession = { ...memorySession, ...next };
  writeLocalStorage(memorySession);

  if (SESSION_FILE) {
    void writeAsStringAsync(SESSION_FILE, JSON.stringify(memorySession)).catch(
      (err) => console.warn("[vendor-session] Failed to save session to disk:", err)
    );
  }
};

/**
 * Clears the session from memory, localStorage, and permanent disk file.
 * If keepProfile is true, retains the email, name, avatar, and biometrics setting for fast returning login.
 */
export const clearVendorSession = (keepProfile = false) => {
  if (keepProfile) {
    memorySession = {
      email: memorySession.email,
      name: memorySession.name,
      profilePicUrl: memorySession.profilePicUrl,
      authProvider: memorySession.authProvider,
      biometricsEnabled: memorySession.biometricsEnabled,
      biometricsOptInPrompted: memorySession.biometricsOptInPrompted,
      themeMode: memorySession.themeMode,
    };
    writeLocalStorage(memorySession);
    if (SESSION_FILE) {
      void writeAsStringAsync(SESSION_FILE, JSON.stringify(memorySession)).catch(() => {});
    }
  } else {
    memorySession = {};
    clearLocalStorage();
    if (SESSION_FILE) {
      void deleteAsync(SESSION_FILE, { idempotent: true }).catch(() => {});
    }
  }
};
