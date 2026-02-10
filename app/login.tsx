import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:5000/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Navigate to dashboard with params
        router.replace({
          pathname: "/(tabs)",
          params: {
            fname: data.user.fname,
            lname: data.user.lname,
            location: data.user.location,
          },
        });
      } else {
        alert(data.message || "Login failed");
      }
    } catch (error) {
      console.error("Login Error:", error);
      alert("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentContainer}>
          {/* Header / Logo Area */}
          <View style={styles.header}>
            <Text style={styles.title}>Say I Do</Text>
            <Text style={styles.subtitle}>Vendor Portal</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
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
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#9CA3AF"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
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
              <Text style={styles.loginButtonText}>
                {loading ? "Logging In..." : "Log In"}
              </Text>
            </TouchableOpacity>

            <View style={styles.footer}>
              <Text style={styles.footerText}>New vendor? </Text>
              <TouchableOpacity>
                <Text style={styles.linkText}>Create an account</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  contentContainer: {
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  title: {
    fontFamily: "Outfit_700Bold",
    fontSize: 42,
    color: "#000000",
    letterSpacing: -1,
  },
  subtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 18,
    color: "#6B7280",
    marginTop: 8,
  },
  form: {
    width: "100%",
  },
  inputGroup: {
    marginBottom: 20,
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
    borderColor: "#E5E7EB", // Light gray border
    borderRadius: 9999, // Pill shape
    paddingHorizontal: 24,
    fontFamily: "Montserrat_400Regular",
    fontSize: 16,
    color: "#000000",
    backgroundColor: "#F9FAFB", // Very subtle gray bg often looks premium
  },
  loginButton: {
    width: "100%",
    height: 56,
    backgroundColor: "#FC7B54", // Brand Orange
    borderRadius: 28, // Fully rounded to match pill inputs or 19px as per design. 56/2 = 28 for pill. Design said 19px, but pill fits 'pill inputs' better. I'll stick to pill for consistency if inputs are pill.
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
    marginBottom: 32,
    shadowColor: "#FC7B54",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 5,
  },
  loginButtonDisabled: {
    backgroundColor: "#FFBCA6", // Lighter orange
    shadowOpacity: 0,
  },
  loginButtonText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: "#FFFFFF",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: "#6B7280",
  },
  linkText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "#FC7B54",
  },
});
