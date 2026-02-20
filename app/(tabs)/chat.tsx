import { StyleSheet, Text, View } from "react-native";

export default function ChatScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.decorationTop} />
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Chat</Text>
          <Text style={styles.subtitle}>Messages with clients</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#ECF0F7",
  },
  decorationTop: {
    position: "absolute",
    top: -120,
    right: -70,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(252, 123, 84, 0.12)",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8EDF5",
    alignItems: "center",
    paddingVertical: 30,
    paddingHorizontal: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  title: {
    fontFamily: "Outfit_700Bold",
    fontSize: 24,
    color: "#111827",
  },
  subtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 16,
    color: "#6B7280",
    marginTop: 6,
  },
});
