import { useLocalSearchParams } from "expo-router";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";

export default function Dashboard() {
  const params = useLocalSearchParams();
  const { fname, lname, location } = params;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Dashboard</Text>
        </View>
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

      <View style={styles.noteCard}>
        <Text style={styles.dashboardNote}>Track profile status and keep services updated.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 28,
    backgroundColor: "#F3F4F6",
    paddingTop: Platform.OS === "web" ? 56 : 74,
  },
  header: {
    marginBottom: 18,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#FFEDE6",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 10,
  },
  badgeText: {
    fontFamily: "Montserrat_600SemiBold",
    color: "#FC7B54",
    fontSize: 12,
  },
  title: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 18,
    color: "#6B7280",
  },
  name: {
    fontFamily: "Outfit_700Bold",
    fontSize: 34,
    color: "#1F2937",
    marginTop: 2,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#EEF1F5",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
    marginBottom: 12,
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
    paddingVertical: 13,
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
  noteCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EEF1F5",
    padding: 14,
  },
  dashboardNote: {
    color: "#6B7280",
    fontFamily: "Montserrat_400Regular",
    lineHeight: 20,
  },
});
