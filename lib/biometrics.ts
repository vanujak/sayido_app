import * as LocalAuthentication from "expo-local-authentication";
import { getVendorSession, setVendorSession } from "./vendor-session";

export type BiometricsSupport = {
  hasHardware: boolean;
  isEnrolled: boolean;
  typeName: "Fingerprint" | "Face Recognition" | "Biometrics";
};

/**
 * Checks if the current device has biometric hardware and registered credentials.
 */
export const checkBiometricsSupportAsync = async (): Promise<BiometricsSupport> => {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      return { hasHardware: false, isEnrolled: false, typeName: "Biometrics" };
    }

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

    let typeName: "Fingerprint" | "Face Recognition" | "Biometrics" = "Biometrics";
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      typeName = "Face Recognition";
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      typeName = "Fingerprint";
    }

    return { hasHardware, isEnrolled, typeName };
  } catch (error) {
    console.warn("[biometrics] Error checking biometrics support:", error);
    return { hasHardware: false, isEnrolled: false, typeName: "Biometrics" };
  }
};

/**
 * Triggers the native Android/iOS biometric authentication prompt.
 */
export const authenticateWithBiometricsAsync = async (
  promptMessage = "Unlock Say I Do"
): Promise<{ success: boolean; error?: string }> => {
  try {
    const support = await checkBiometricsSupportAsync();
    if (!support.hasHardware || !support.isEnrolled) {
      return { success: false, error: "Biometrics not available or not enrolled" };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: "Use Password",
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
    });

    if (result.success) {
      return { success: true };
    }

    return { success: false, error: result.error || "Authentication canceled" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Biometric authentication failed",
    };
  }
};

/**
 * Checks if biometric login is currently enabled by the vendor.
 */
export const isBiometricsEnabled = (): boolean => {
  return Boolean(getVendorSession().biometricsEnabled);
};

/**
 * Enables or disables biometric login for this vendor.
 */
export const setBiometricsEnabled = (enabled: boolean) => {
  setVendorSession({ biometricsEnabled: enabled, biometricsOptInPrompted: true });
};

/**
 * Checks if the user has already been asked to enable biometrics.
 */
export const isBiometricsOptInPrompted = (): boolean => {
  return Boolean(getVendorSession().biometricsOptInPrompted);
};

/**
 * Marks that the user was prompted for biometrics opt-in.
 */
export const setBiometricsOptInPrompted = (prompted = true) => {
  setVendorSession({ biometricsOptInPrompted: prompted });
};
