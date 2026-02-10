import { useLocalSearchParams } from "expo-router";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";

export default function Dashboard() {
  const params = useLocalSearchParams();
  const { fname, lname, location } = params;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome back,</Text>
        <Text style={styles.name}>
          {fname || "Vendor"} {lname || ""}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Profile Details</Text>
        {location && (
          <View style={styles.row}>
            <Text style={styles.label}>Location:</Text>
            <Text style={styles.value}>{location}</Text>
          </View>
        )}
        <View style={styles.row}>
          <Text style={styles.label}>Status:</Text>
          <Text style={styles.activeStatus}>Active</Text>
        </View>
      </View>

      <Text style={styles.dashboardNote}>
        This is your simple vendor dashboard.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    backgroundColor: "#F3F4F6",
    paddingTop: Platform.OS === "web" ? 60 : 80,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 20,
    color: "#6B7280",
  },
  name: {
    fontFamily: "Outfit_700Bold",
    fontSize: 32,
    color: "#1F2937",
    marginTop: 4,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: "#1F2937",
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  label: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 16,
    color: "#6B7280",
  },
  value: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 16,
    color: "#1F2937",
  },
  activeStatus: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 16,
    color: "#10B981", // Green
  },
  dashboardNote: {
    textAlign: "center",
    color: "#9CA3AF",
    fontFamily: "Montserrat_400Regular",
  },
});
