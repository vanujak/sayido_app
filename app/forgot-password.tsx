import {
  requestPasswordResetOtp,
  resetPassword,
  UserRole,
  verifyPasswordResetOtp,
} from "@/lib/password-reset-api";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const role: UserRole = "vendor";
  // Steps: 1 = Request OTP, 2 = Verify OTP, 3 = Reset Password, 4 = Success
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Handle phone hardware back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (step === 2) {
          setStep(1);
          return true;
        }
        if (step === 3) {
          setStep(2);
          return true;
        }
        router.replace("/login");
        return true;
      };
      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => subscription.remove();
    }, [step, router])
  );

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // 60-second cooldown timer for resending OTP
  const [resendTimer, setResendTimer] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (resendTimer > 0) {
      timerRef.current = setTimeout(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resendTimer]);

  // Step 1: Request OTP
  const handleRequestOtp = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage("Please enter your email address.");
      return;
    }

    setErrorMessage("");
    setLoading(true);

    try {
      const response = await requestPasswordResetOtp(trimmedEmail, role);
      setSuccessMessage(
        response.message || "Verification code sent to your email!",
      );
      setResendTimer(60);
      setStep(2);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to send verification code. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    setErrorMessage("");
    setLoading(true);

    try {
      const response = await requestPasswordResetOtp(email.trim(), role);
      setSuccessMessage(response.message || "A new code has been sent.");
      setResendTimer(60);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to resend code. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async () => {
    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length !== 6) {
      setErrorMessage("Please enter the 6-digit verification code.");
      return;
    }

    setErrorMessage("");
    setLoading(true);

    try {
      const response = await verifyPasswordResetOtp(email.trim(), cleanOtp, role);
      setResetToken(response.resetToken);
      setSuccessMessage("Code verified successfully!");
      setStep(3);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Invalid or expired verification code.",
      );
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Reset Password
  const handleResetPassword = async () => {
    setErrorMessage("");

    if (newPassword.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await resetPassword(resetToken, newPassword, role);
      setStep(4);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to reset password. Please try again.",
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
              {/* Back Button */}
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => router.replace("/login")}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-back" size={24} color="#111827" />
                <Text style={styles.backButtonText}>Back to Login</Text>
              </TouchableOpacity>

              {/* STEP 1: REQUEST OTP */}
              {step === 1 && (
                <View style={styles.formCard}>
                  <View style={styles.header}>
                    <Text style={styles.title}>Forgot Password</Text>
                    <Text style={styles.subtitle}>
                      Enter your registered email address to receive a 6-digit
                      verification OTP code.
                    </Text>
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

                  {!!errorMessage && (
                    <Text style={styles.errorText}>{errorMessage}</Text>
                  )}

                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[
                      styles.actionButton,
                      loading && styles.actionButtonDisabled,
                    ]}
                    onPress={handleRequestOtp}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.actionButtonText}>
                        Send Verification Code
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* STEP 2: VERIFY OTP */}
              {step === 2 && (
                <View style={styles.formCard}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="mail-outline" size={30} color="#FC7B54" />
                  </View>

                  <View style={styles.header}>
                    <Text style={styles.title}>Verify Code</Text>
                    <Text style={styles.subtitle}>
                      We sent a 6-digit OTP code to:{"\n"}
                      <Text style={styles.emailHighlight}>{email}</Text>
                    </Text>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Enter 6-Digit Code</Text>
                    <TextInput
                      style={[styles.input, styles.otpInput]}
                      placeholder="000000"
                      placeholderTextColor="#CBD5E1"
                      value={otp}
                      onChangeText={(val) =>
                        setOtp(val.replace(/\D/g, "").slice(0, 6))
                      }
                      keyboardType="number-pad"
                      maxLength={6}
                      autoFocus
                    />
                  </View>

                  {!!errorMessage && (
                    <Text style={styles.errorText}>{errorMessage}</Text>
                  )}
                  {!!successMessage && (
                    <Text style={styles.successText}>{successMessage}</Text>
                  )}

                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[
                      styles.actionButton,
                      loading && styles.actionButtonDisabled,
                    ]}
                    onPress={handleVerifyOtp}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.actionButtonText}>Verify Code</Text>
                    )}
                  </TouchableOpacity>

                  <View style={styles.resendRow}>
                    <TouchableOpacity
                      onPress={() => {
                        setStep(1);
                        setOtp("");
                        setErrorMessage("");
                        setSuccessMessage("");
                      }}
                    >
                      <Text style={styles.changeEmailText}>Change email</Text>
                    </TouchableOpacity>

                    {resendTimer > 0 ? (
                      <Text style={styles.timerText}>
                        Resend in {resendTimer}s
                      </Text>
                    ) : (
                      <TouchableOpacity onPress={handleResendOtp}>
                        <Text style={styles.resendText}>Resend Code</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              {/* STEP 3: RESET PASSWORD */}
              {step === 3 && (
                <View style={styles.formCard}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="key-outline" size={30} color="#FC7B54" />
                  </View>

                  <View style={styles.header}>
                    <Text style={styles.title}>New Password</Text>
                    <Text style={styles.subtitle}>
                      Create a strong new password for your account (min 6
                      characters).
                    </Text>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>New Password</Text>
                    <View style={styles.passwordContainer}>
                      <TextInput
                        style={[styles.input, styles.passwordInput]}
                        placeholder="••••••••"
                        placeholderTextColor="#9CA3AF"
                        value={newPassword}
                        onChangeText={setNewPassword}
                        secureTextEntry={!showPassword}
                      />
                      <TouchableOpacity
                        onPress={() => setShowPassword((prev) => !prev)}
                        style={styles.passwordToggle}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={
                            showPassword ? "eye-off-outline" : "eye-outline"
                          }
                          size={22}
                          color="#6B7280"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Confirm New Password</Text>
                    <View style={styles.passwordContainer}>
                      <TextInput
                        style={[styles.input, styles.passwordInput]}
                        placeholder="••••••••"
                        placeholderTextColor="#9CA3AF"
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry={!showConfirmPassword}
                      />
                      <TouchableOpacity
                        onPress={() => setShowConfirmPassword((prev) => !prev)}
                        style={styles.passwordToggle}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={
                            showConfirmPassword
                              ? "eye-off-outline"
                              : "eye-outline"
                          }
                          size={22}
                          color="#6B7280"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {!!errorMessage && (
                    <Text style={styles.errorText}>{errorMessage}</Text>
                  )}

                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[
                      styles.actionButton,
                      loading && styles.actionButtonDisabled,
                    ]}
                    onPress={handleResetPassword}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.actionButtonText}>
                        Reset Password
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* STEP 4: SUCCESS */}
              {step === 4 && (
                <View style={[styles.formCard, styles.successCard]}>
                  <View style={styles.successIconCircle}>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={54}
                      color="#16A34A"
                    />
                  </View>

                  <Text style={styles.title}>Password Reset!</Text>
                  <Text style={styles.subtitle}>
                    Your password has been successfully updated. You can now
                    log in with your new credentials.
                  </Text>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={styles.actionButton}
                    onPress={() => router.replace("/login")}
                  >
                    <Text style={styles.actionButtonText}>Go to Log In</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
    backgroundColor: "rgba(8, 16, 28, 0.25)",
  },
  container: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  contentContainer: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginBottom: 20,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  backButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "#111827",
    marginLeft: 6,
  },
  formCard: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 26,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  successCard: {
    alignItems: "center",
    textAlign: "center",
    paddingVertical: 36,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(252, 123, 84, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 16,
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },
  header: {
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontFamily: "Outfit_700Bold",
    fontSize: 32,
    lineHeight: 36,
    color: "#111827",
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    lineHeight: 20,
    color: "#6B7280",
    marginTop: 8,
    textAlign: "center",
  },
  emailHighlight: {
    fontFamily: "Montserrat_600SemiBold",
    color: "#111827",
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "#1F2937",
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    width: "100%",
    height: 56,
    borderWidth: 1,
    borderColor: "#D4D8DE",
    borderRadius: 16,
    paddingHorizontal: 18,
    fontFamily: "Montserrat_400Regular",
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  otpInput: {
    textAlign: "center",
    fontSize: 24,
    letterSpacing: 8,
    fontFamily: "Outfit_700Bold",
  },
  passwordContainer: {
    position: "relative",
    width: "100%",
  },
  passwordInput: {
    paddingRight: 50,
  },
  passwordToggle: {
    position: "absolute",
    right: 16,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  actionButton: {
    width: "100%",
    height: 56,
    backgroundColor: "#FC7B54",
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    shadowColor: "#FC7B54",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  actionButtonDisabled: {
    backgroundColor: "#FFBCA6",
    shadowOpacity: 0,
  },
  actionButtonText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 17,
    color: "#FFFFFF",
  },
  resendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    paddingHorizontal: 4,
  },
  changeEmailText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#6B7280",
    textDecorationLine: "underline",
  },
  timerText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#9CA3AF",
  },
  resendText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: "#FC7B54",
  },
  errorText: {
    fontFamily: "Montserrat_400Regular",
    color: "#DC2626",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 8,
  },
  successText: {
    fontFamily: "Montserrat_400Regular",
    color: "#16A34A",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 8,
  },
});
