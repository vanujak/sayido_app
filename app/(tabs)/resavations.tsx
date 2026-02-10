import { StyleSheet, Text, View } from "react-native";

export default function ReservationsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reservations</Text>
      <Text style={styles.subtitle}>Manage your bookings here</Text>
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
  },
});
