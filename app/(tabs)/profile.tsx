import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function ProfileScreen() {
  const router = useRouter();

  const handleLogout = () => {
    // Navigate back to login
    router.replace("/login");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile Manager</Text>
      <Text style={styles.subtitle}>Update your vendor details</Text>

      <TouchableOpacity
        style={styles.logoutButton}
        activeOpacity={0.8}
        onPress={handleLogout}
      >
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  title: {
    fontFamily: "Outfit_700Bold",
    fontSize: 24,
    color: "#000",
  },
  subtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 16,
    color: "#6B7280",
    marginTop: 8,
    marginBottom: 40,
  },
  logoutButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderWidth: 1,
    borderColor: "#000",
    borderRadius: 28, // Pill shape match
    backgroundColor: "#fff",
  },
  logoutText: {
    fontFamily: "Outfit_700Bold",
    color: "#000",
    fontSize: 16,
  },
});
