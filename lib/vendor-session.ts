type VendorSession = {
  vendorId?: string;
  email?: string;
};

const SESSION_KEY = "__sayido_vendor_session__";

const readStorage = (): VendorSession => {
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

const writeStorage = (value: VendorSession) => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
};

const readMemory = (): VendorSession => {
  const globalState = globalThis as { [SESSION_KEY]?: VendorSession };
  return globalState[SESSION_KEY] || {};
};

const writeMemory = (value: VendorSession) => {
  const globalState = globalThis as { [SESSION_KEY]?: VendorSession };
  globalState[SESSION_KEY] = value;
};

export const getVendorSession = (): VendorSession => {
  const memory = readMemory();
  if (memory.vendorId || memory.email) return memory;

  const stored = readStorage();
  if (stored.vendorId || stored.email) {
    writeMemory(stored);
    return stored;
  }
  return {};
};

export const setVendorSession = (next: VendorSession) => {
  const merged = { ...getVendorSession(), ...next };
  writeMemory(merged);
  writeStorage(merged);
};

export const clearVendorSession = () => {
  writeMemory({});
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore storage errors
  }
};
