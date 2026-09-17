import GoogleIcon from "@/components/GoogleIcon";
import { apiBaseUrl, apiCredentials, graphQlUrl } from "@/lib/api-config";
import { loginWithGoogleToken } from "@/lib/google-auth-api";
import { clearVendorSession, getVendorSession, setVendorSession } from "@/lib/vendor-session";
import {
  authenticateWithBiometricsAsync,
  checkBiometricsSupportAsync,
  isBiometricsEnabled,
  isBiometricsOptInPrompted,
  setBiometricsEnabled,
  setBiometricsOptInPrompted,
} from "@/lib/biometrics";
import { Ionicons } from "@expo/vector-icons";
import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";
import * as Google from "expo-auth-session/providers/google";
import { useFocusEffect, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

WebBrowser.maybeCompleteAuthSession();

type LoginApiResponse = {
  message?: string;
  access_token?: string;
  vendorId?: string;
  vendor_id?: string;
};

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");
const joinUrl = (base: string, path: string) => {
  const normalizedBase = normalizeBaseUrl(base);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

const parseLoginErrorMessage = async (response: Response) => {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const body = (await response.json()) as LoginApiResponse;
      if (body?.message) return body.message;
    } catch {
      return "";
    }
    return "";
  }

  try {
    const text = await response.text();
    return text.trim();
  } catch {
    return "";
  }
};

type VendorsLookupResponse = {
  data?: {
    findVendorByEmail?: {
      id?: string;
      email?: string;
      fname?: string;
      lname?: string;
      profile_pic_url?: string;
    } | null;
  };
  errors?: Array<{
    message?: string;
  }>;
};

const getInitials = (name?: string, fallbackEmail?: string) => {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (fallbackEmail && fallbackEmail.trim()) {
    return fallbackEmail.charAt(0).toUpperCase();
  }
  return "V";
};

const extractVendorIdFromJwt = (token?: string) => {
  if (!token) return "";
  const parts = token.split(".");
  if (parts.length < 2) return "";

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64)) as { sub?: string };
    return typeof payload?.sub === "string" ? payload.sub : "";
  } catch {
    return "";
  }
};

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Returning user state
  const [savedEmail, setSavedEmail] = useState("");
  const [savedName, setSavedName] = useState("");
  const [savedProfilePic, setSavedProfilePic] = useState("");
  const [authProvider, setAuthProvider] = useState<"google" | "password">("password");
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [biometricsOn, setBiometricsOn] = useState(false);

  const [optInVisible, setOptInVisible] = useState(false);
  const [pendingSession, setPendingSession] = useState<{
    email: string;
    vendorId: string;
  } | null>(null);
  const [biometricType, setBiometricType] = useState("Fingerprint");

  // Prevent smartphone back button from navigating back into protected tabs or invalid sessions
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        BackHandler.exitApp();
        return true;
      };
      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => subscription.remove();
    }, [])
  );

  const fetchVendorPreview = async (targetEmail: string) => {
    if (!graphQlUrl || !targetEmail) return;
    try {
      const response = await fetch(graphQlUrl, {
        method: "POST",
        credentials: apiCredentials,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
            query FindVendorPreview($email: String!) {
              findVendorByEmail(email: $email) {
                id
                email
                fname
                lname
                profile_pic_url
              }
            }
          `,
          variables: { email: targetEmail.trim() },
        }),
      });
      const payload = (await response.json()) as VendorsLookupResponse;
      const v = payload.data?.findVendorByEmail;
      if (v) {
        const name = `${v.fname || ""} ${v.lname || ""}`.trim();
        const pic = v.profile_pic_url || "";
        if (name) setSavedName(name);
        if (pic) setSavedProfilePic(pic);
        setVendorSession({
          name: name || undefined,
          profilePicUrl: pic || undefined,
        });
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const session = getVendorSession();
    if (session.email) {
      setSavedEmail(session.email);
      setIsReturningUser(true);
      if (session.name) setSavedName(session.name);
      if (session.profilePicUrl) setSavedProfilePic(session.profilePicUrl);
      if (session.authProvider) setAuthProvider(session.authProvider);
      setBiometricsOn(isBiometricsEnabled());

      if (!session.profilePicUrl || !session.name) {
        void fetchVendorPreview(session.email);
      }
    }

    void checkBiometricsSupportAsync().then((support) => {
      setBiometricType(support.typeName);
    });
  }, []);

  const navigateToTabsWithBiometricsCheck = async (
    targetEmail: string,
    targetVendorId: string,
    provider: "google" | "password" = "password"
  ) => {
    setVendorSession({
      email: targetEmail,
      vendorId: targetVendorId,
      authProvider: provider,
    });

    const support = await checkBiometricsSupportAsync();
    if (
      support.hasHardware &&
      support.isEnrolled &&
      !isBiometricsOptInPrompted()
    ) {
      setBiometricType(support.typeName);
      setPendingSession({ email: targetEmail, vendorId: targetVendorId });
      setOptInVisible(true);
      return;
    }

    router.replace({
      pathname: "/(tabs)",
      params: {
        email: targetEmail,
        vendor_email: targetEmail,
        vendor_id: targetVendorId,
      },
    });
  };

  const handleEnableBiometrics = async () => {
    const auth = await authenticateWithBiometricsAsync(
      `Verify ${biometricType.toLowerCase()} to enable`
    );
    setOptInVisible(false);
    if (auth.success) {
      setBiometricsEnabled(true);
    } else {
      setBiometricsOptInPrompted(true);
    }
    if (pendingSession) {
      router.replace({
        pathname: "/(tabs)",
        params: {
          email: pendingSession.email,
          vendor_email: pendingSession.email,
          vendor_id: pendingSession.vendorId,
        },
      });
    }
  };

  const handleSkipBiometrics = () => {
    setOptInVisible(false);
    setBiometricsOptInPrompted(true);
    if (pendingSession) {
      router.replace({
        pathname: "/(tabs)",
        params: {
          email: pendingSession.email,
          vendor_email: pendingSession.email,
          vendor_id: pendingSession.vendorId,
        },
      });
    }
  };

  const handleBiometricQuickLogin = async () => {
    const targetEmail = savedEmail || getVendorSession().email;
    if (!targetEmail) return;

    setErrorMessage("");
    const auth = await authenticateWithBiometricsAsync("Log in to Say I Do");
    if (auth.success) {
      let targetVendorId = getVendorSession().vendorId;
      if (!targetVendorId) {
        targetVendorId = await resolveVendorIdByEmail(targetEmail);
      }
      setVendorSession({
        email: targetEmail,
        vendorId: targetVendorId,
        authProvider,
      });
      router.replace({
        pathname: "/(tabs)",
        params: {
          email: targetEmail,
          vendor_email: targetEmail,
          vendor_id: targetVendorId,
        },
      });
    }
  };

  const handleSwitchAccount = () => {
    setIsReturningUser(false);
    setEmail("");
    setPassword("");
    setErrorMessage("");
  };

  const handleBackToSavedAccount = () => {
    setIsReturningUser(true);
    setPassword("");
    setErrorMessage("");
  };

  const [googleRequest, googleResponse, promptGoogleAsync] =
    Google.useIdTokenAuthRequest({
      clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || undefined,
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
      androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
    });

  useEffect(() => {
    if (Platform.OS !== "web") {
      GoogleSignin.configure({
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
        offlineAccess: true,
      });
    }
  }, []);

  useEffect(() => {
    const onBackPress = () => {
      BackHandler.exitApp();
      return true;
    };

    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (googleResponse?.type === "success") {
      const idToken =
        googleResponse.params?.id_token ||
        googleResponse.authentication?.idToken;

      if (idToken) {
        void handleGoogleBackendLogin(idToken);
      }
    } else if (googleResponse?.type === "error") {
      setErrorMessage(
        googleResponse.error?.message || "Google Sign-In failed.",
      );
    }
  }, [googleResponse]);

  const handleGoogleBackendLogin = async (idToken: string) => {
    setGoogleLoading(true);
    setErrorMessage("");
    try {
      const result = await loginWithGoogleToken(idToken, "vendor");
      setAuthProvider("google");
      await navigateToTabsWithBiometricsCheck(result.email, result.vendorId, "google");
    } catch (error) {
      console.error("Google Auth Error:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Google authentication failed. Please try again.",
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMessage("");
    setGoogleLoading(true);
    try {
      if (Platform.OS === "web") {
        await promptGoogleAsync();
        return;
      }

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if ((response as any)?.type === "cancelled") {
        return;
      }

      const idToken =
        (response as any)?.data?.idToken ||
        (response as any)?.idToken;

      if (idToken) {
        await handleGoogleBackendLogin(idToken);
      }
    } catch (error: any) {
      if (
        error?.code === statusCodes.SIGN_IN_CANCELLED ||
        error?.code === "12501" ||
        String(error?.message || "").toLowerCase().includes("cancel")
      ) {
        // User cancelled or touched outside the popup - silently ignore without showing error
      } else if (error?.code === statusCodes.IN_PROGRESS) {
        // Sign-in already in progress
      } else if (error?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setErrorMessage("Google Play Services is not available or needs to be updated.");
      } else {
        console.error("Native Google Sign-In Error:", error);
        setErrorMessage(error?.message || "Could not complete Google Sign-In.");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const loginVendor = async (targetEmail: string, targetPass: string) => {
    const requestUrl = joinUrl(apiBaseUrl, "/auth/loginVendor");
    let response: Response;

    try {
      response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: apiCredentials,
        body: JSON.stringify({ email: targetEmail, password: targetPass }),
      });
    } catch (error) {
      const baseMessage =
        error instanceof Error ? error.message : "Network error";
      throw new Error(
        `${baseMessage}. Request URL: ${requestUrl}. API base URL: ${apiBaseUrl}`,
      );
    }

    if (response.ok) {
      try {
        return (await response.json()) as LoginApiResponse;
      } catch {
        return {};
      }
    }

    const parsedMessage = await parseLoginErrorMessage(response);
    throw new Error(
      parsedMessage || `Login request failed (${response.status})`,
    );
  };

  const resolveVendorIdByEmail = async (targetEmail: string) => {
    if (!targetEmail.trim()) return "";
    if (!graphQlUrl) return "";

    try {
      const response = await fetch(graphQlUrl, {
        method: "POST",
        credentials: apiCredentials,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
            query FindVendorByEmailForLogin($email: String!) {
              findVendorByEmail(email: $email) {
                id
                email
                fname
                lname
                profile_pic_url
              }
            }
          `,
          variables: { email: targetEmail.trim() },
        }),
      });

      const payload = (await response.json()) as VendorsLookupResponse;
      if (!response.ok || payload.errors?.length) return "";

      const vendor = payload.data?.findVendorByEmail;
      if (vendor) {
        const name = `${vendor.fname || ""} ${vendor.lname || ""}`.trim();
        const pic = vendor.profile_pic_url || "";
        if (name) setSavedName(name);
        if (pic) setSavedProfilePic(pic);
        setVendorSession({
          name: name || undefined,
          profilePicUrl: pic || undefined,
        });
      }
      return typeof vendor?.id === "string" ? vendor.id : "";
    } catch {
      return "";
    }
  };

  const handleLogin = async () => {
    const activeEmail = isReturningUser ? savedEmail : email.trim();
    if (!activeEmail) {
      setErrorMessage("Please enter your email address.");
      return;
    }
    if (!password.trim()) {
      setErrorMessage("Please enter your password.");
      return;
    }

    setErrorMessage("");
    setLoading(true);
    try {
      const loginPayload = await loginVendor(activeEmail, password);
      const normalizedEmail = activeEmail.toLowerCase();
      const responseVendorId =
        typeof loginPayload?.vendorId === "string"
          ? loginPayload.vendorId
          : typeof loginPayload?.vendor_id === "string"
            ? loginPayload.vendor_id
            : "";
      const tokenVendorId = extractVendorIdFromJwt(loginPayload?.access_token);
      const resolvedVendorId =
        responseVendorId ||
        tokenVendorId ||
        (await resolveVendorIdByEmail(normalizedEmail));

      if (!resolvedVendorId) {
        throw new Error("Unable to resolve vendor account id after login.");
      }

      setAuthProvider("password");
      await navigateToTabsWithBiometricsCheck(
        normalizedEmail,
        resolvedVendorId,
        "password",
      );
    } catch (error) {
      console.error("Login Error:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Login failed. Check credentials and backend.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require("../assets/images/sayido_login.png")}
      resizeMode="cover"
      style={styles.background}
      imageStyle={styles.backgroundImage}
    >
      <View style={styles.backgroundOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.container}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContainer,
              { paddingBottom: Math.max(40, insets.bottom + 24) },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.contentContainer}>
              {isReturningUser ? (
                /* RETURNING USER MODE (Profile image + email + empty password field + biometrics button if enabled) */
                <View style={styles.form}>
                  <View style={styles.returningHeader}>
                    <View style={styles.returningAvatarRing}>
                      {savedProfilePic ? (
                        <Image
                          source={{ uri: savedProfilePic }}
                          style={styles.returningAvatarImage}
                        />
                      ) : (
                        <View style={styles.returningAvatarFallback}>
                          <Text style={styles.returningAvatarInitials}>
                            {getInitials(savedName, savedEmail)}
                          </Text>
                        </View>
                      )}
                    </View>

                    <Text style={styles.returningGreeting}>
                      {savedName ? `Welcome back, ${savedName.split(" ")[0]}!` : "Welcome Back"}
                    </Text>

                    <View style={styles.returningEmailPill}>
                      <Text style={styles.returningEmailText}>{savedEmail}</Text>
                    </View>
                  </View>

                  {authProvider === "google" ? (
                    <>
                      {/* Biometrics Button: ONLY shown if user enabled biometrics */}
                      {biometricsOn && (
                        <TouchableOpacity
                          activeOpacity={0.8}
                          style={styles.biometricQuickButton}
                          onPress={handleBiometricQuickLogin}
                        >
                          <Ionicons
                            name={
                              biometricType === "Face Recognition"
                                ? "scan-outline"
                                : "finger-print-outline"
                            }
                            size={24}
                            color="#FC7B54"
                          />
                          <Text style={styles.biometricQuickButtonText}>
                            Unlock with {biometricType}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {biometricsOn && (
                        <View style={styles.dividerContainer}>
                          <View style={styles.dividerLine} />
                          <Text style={styles.dividerText}>OR</Text>
                          <View style={styles.dividerLine} />
                        </View>
                      )}

                      {/* 1-Tap Continue with Google Button */}
                      <TouchableOpacity
                        activeOpacity={0.8}
                        style={[
                          styles.googleButton,
                          (googleLoading || !googleRequest) &&
                            styles.googleButtonDisabled,
                        ]}
                        onPress={handleGoogleLogin}
                        disabled={googleLoading || !googleRequest}
                      >
                        {googleLoading ? (
                          <ActivityIndicator color="#111827" />
                        ) : (
                          <View style={styles.googleButtonContent}>
                            <GoogleIcon size={22} />
                            <Text style={styles.googleButtonText}>
                              Continue with Google
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      {/* Empty Password Field */}
                      <View style={styles.inputGroup}>
                        <Text style={styles.label}>Password</Text>
                        <View style={styles.passwordInputContainer}>
                          <TextInput
                            style={[styles.input, styles.passwordInput]}
                            placeholder="Enter your password"
                            placeholderTextColor="#9CA3AF"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPassword}
                          />
                          <TouchableOpacity
                            onPress={() => setShowPassword((prev) => !prev)}
                            style={styles.passwordToggle}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={
                              showPassword ? "Hide password" : "Show password"
                            }
                          >
                            <Ionicons
                              name={showPassword ? "eye-off-outline" : "eye-outline"}
                              size={22}
                              color="#6B7280"
                            />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Forgot Password Link */}
                      <View style={styles.forgotPasswordContainer}>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => router.push("/forgot-password")}
                        >
                          <Text style={styles.forgotPasswordText}>
                            Forgot password?
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Sign In Button */}
                      <TouchableOpacity
                        activeOpacity={0.8}
                        style={[
                          styles.loginButton,
                          loading && styles.loginButtonDisabled,
                        ]}
                        onPress={handleLogin}
                        disabled={loading}
                      >
                        {loading ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <Text style={styles.loginButtonText}>Sign In</Text>
                        )}
                      </TouchableOpacity>

                      {/* Biometrics Button: ONLY shown if user enabled biometrics */}
                      {biometricsOn && (
                        <TouchableOpacity
                          activeOpacity={0.8}
                          style={styles.biometricQuickButton}
                          onPress={handleBiometricQuickLogin}
                        >
                          <Ionicons
                            name={
                              biometricType === "Face Recognition"
                                ? "scan-outline"
                                : "finger-print-outline"
                            }
                            size={24}
                            color="#FC7B54"
                          />
                          <Text style={styles.biometricQuickButtonText}>
                            Unlock with {biometricType}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}

                  {!!errorMessage && (
                    <Text style={styles.errorText}>{errorMessage}</Text>
                  )}

                  {/* Switch Account */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.switchAccountButton}
                    onPress={handleSwitchAccount}
                  >
                    <Text style={styles.switchAccountButtonText}>
                      Not you? Log in with another account
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* STANDARD FRESH LOGIN FORM */
                <View style={styles.form}>
                  {/* Header / Logo Area */}
                  <View style={styles.header}>
                    <Text style={styles.title}>Say I Do</Text>
                    <Text style={styles.subtitle}>Vendor Portal</Text>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Email Address</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="name@example.com"
                      placeholderTextColor="#9CA3AF"
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Password</Text>
                    <View style={styles.passwordInputContainer}>
                      <TextInput
                        style={[styles.input, styles.passwordInput]}
                        placeholder="••••••••"
                        placeholderTextColor="#9CA3AF"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                      />
                      <TouchableOpacity
                        onPress={() => setShowPassword((prev) => !prev)}
                        style={styles.passwordToggle}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        <Ionicons
                          name={showPassword ? "eye-off-outline" : "eye-outline"}
                          size={22}
                          color="#6B7280"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Forgot Password Link */}
                  <View style={styles.forgotPasswordContainer}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => router.push("/forgot-password")}
                    >
                      <Text style={styles.forgotPasswordText}>
                        Forgot password?
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[
                      styles.loginButton,
                      loading && styles.loginButtonDisabled,
                    ]}
                    onPress={handleLogin}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.loginButtonText}>Log In</Text>
                    )}
                  </TouchableOpacity>

                  {!!errorMessage && (
                    <Text style={styles.errorText}>{errorMessage}</Text>
                  )}

                  {/* OR Divider */}
                  <View style={styles.dividerContainer}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>OR</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  {/* Continue with Google */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[
                      styles.googleButton,
                      (googleLoading || !googleRequest) &&
                        styles.googleButtonDisabled,
                    ]}
                    onPress={handleGoogleLogin}
                    disabled={googleLoading || !googleRequest}
                  >
                    {googleLoading ? (
                      <ActivityIndicator color="#111827" />
                    ) : (
                      <View style={styles.googleButtonContent}>
                        <GoogleIcon size={22} />
                        <Text style={styles.googleButtonText}>
                          Continue with Google
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {Boolean(savedEmail) && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={styles.switchAccountButton}
                      onPress={handleBackToSavedAccount}
                    >
                      <Text style={styles.switchAccountButtonText}>
                        Back to saved account ({savedEmail})
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      {/* Biometrics Opt-in Modal */}
      <Modal
        visible={optInVisible}
        transparent
        animationType="fade"
        onRequestClose={handleSkipBiometrics}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconRing}>
              <Ionicons
                name={
                  biometricType === "Face Recognition"
                    ? "scan-outline"
                    : "finger-print-outline"
                }
                size={38}
                color="#FC7B54"
              />
            </View>
            <Text style={styles.modalTitle}>Enable {biometricType} Login?</Text>
            <Text style={styles.modalDesc}>
              Fast and secure. Use your {biometricType.toLowerCase()} to unlock Say I Do next time without typing your password.
            </Text>

            <TouchableOpacity
              style={styles.modalBtnPrimary}
              activeOpacity={0.8}
              onPress={handleEnableBiometrics}
            >
              <Text style={styles.modalBtnPrimaryText}>
                Enable {biometricType}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalBtnSecondary}
              activeOpacity={0.7}
              onPress={handleSkipBiometrics}
            >
              <Text style={styles.modalBtnSecondaryText}>Maybe Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    backgroundColor: "rgba(8, 16, 28, 0.18)",
  },
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    padding: 20,
    paddingTop: 110,
    paddingBottom: 40,
  },
  contentContainer: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 0,
    borderWidth: 0,
    paddingVertical: 34,
    paddingHorizontal: 22,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontFamily: "Outfit_700Bold",
    fontSize: 48,
    lineHeight: 50,
    color: "#111827",
    letterSpacing: -0.8,
  },
  subtitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: "#4B5563",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 8,
  },
  form: {
    width: "100%",
  },
  inputGroup: {
    marginBottom: 22,
  },
  label: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: "#1F2937",
    marginBottom: 10,
    marginLeft: 6,
  },
  input: {
    width: "100%",
    height: 70,
    borderWidth: 1,
    borderColor: "#D4D8DE",
    borderRadius: 22,
    paddingHorizontal: 28,
    fontFamily: "Montserrat_400Regular",
    fontSize: 17,
    color: "#111827",
    backgroundColor: "rgba(248, 250, 252, 0.8)",
  },
  passwordInputContainer: {
    position: "relative",
    width: "100%",
  },
  passwordInput: {
    paddingRight: 62,
  },
  passwordToggle: {
    position: "absolute",
    right: 20,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  forgotPasswordContainer: {
    alignItems: "flex-end",
    marginTop: -8,
    marginBottom: 16,
    paddingRight: 6,
  },
  forgotPasswordText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "#FC7B54",
  },
  loginButton: {
    width: "100%",
    height: 64,
    backgroundColor: "#FC7B54",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
    marginBottom: 6,
    shadowColor: "#FC7B54",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.26,
    shadowRadius: 16,
    elevation: 6,
  },
  loginButtonDisabled: {
    backgroundColor: "#FFBCA6",
    shadowOpacity: 0,
  },
  loginButtonText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 20,
    lineHeight: 22,
    color: "#FFFFFF",
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 18,
    width: "100%",
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#D4D8DE",
  },
  dividerText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: "#9CA3AF",
    marginHorizontal: 12,
  },
  googleButton: {
    width: "100%",
    height: 64,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#D4D8DE",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  googleButtonText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: "#1F2937",
    marginLeft: 12,
  },
  errorText: {
    fontFamily: "Montserrat_400Regular",
    color: "#DC2626",
    textAlign: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  biometricQuickButton: {
    width: "100%",
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF3EE",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#FFD7CA",
    marginTop: 14,
  },
  biometricQuickButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 16,
    color: "#FC7B54",
    marginLeft: 10,
  },
  returningHeader: {
    alignItems: "center",
    marginBottom: 26,
    width: "100%",
  },
  returningAvatarRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    borderWidth: 2.5,
    borderColor: "#FC7B54",
    overflow: "hidden",
    shadowColor: "#FC7B54",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  returningAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 45,
  },
  returningAvatarFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 45,
    backgroundColor: "#FFF0EB",
    alignItems: "center",
    justifyContent: "center",
  },
  returningAvatarInitials: {
    fontFamily: "Outfit_700Bold",
    fontSize: 32,
    color: "#FC7B54",
  },
  returningGreeting: {
    fontFamily: "Outfit_700Bold",
    fontSize: 26,
    lineHeight: 30,
    color: "#111827",
    textAlign: "center",
    marginBottom: 6,
  },
  returningEmailPill: {
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  returningEmailText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: "#4B5563",
  },
  switchAccountButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    marginTop: 6,
  },
  switchAccountButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: "#6B7280",
    textDecorationLine: "underline",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  modalIconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FFF3EE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 22,
    color: "#111827",
    textAlign: "center",
    marginBottom: 8,
  },
  modalDesc: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    lineHeight: 20,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 24,
  },
  modalBtnPrimary: {
    width: "100%",
    height: 52,
    backgroundColor: "#FC7B54",
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  modalBtnPrimaryText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  modalBtnSecondary: {
    width: "100%",
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  modalBtnSecondaryText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: "#9CA3AF",
  },
});
