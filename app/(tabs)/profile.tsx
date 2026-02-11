import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type VendorProfile = {
  fname: string;
  lname: string;
  email: string;
  busname: string;
  phone: string;
  city: string;
  location: string;
  about: string;
  profilePicUrl: string;
};

export default function ProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const vendor: VendorProfile = {
    fname: String(params.fname ?? "Vendor"),
    lname: String(params.lname ?? "Test"),
    email: String(params.email ?? "test@gmail.com"),
    busname: String(params.busname ?? "Test Vendor"),
    phone: String(params.phone ?? "0771234567"),
    city: String(params.city ?? "Ratnapura"),
    location: String(params.location ?? "Ratnapura, Sri Lanka"),
    about: String(
      params.about ??
        "Professional wedding vendor focused on quality service and reliable communication.",
    ),
    profilePicUrl: String(params.profile_pic_url ?? ""),
  };

  const fullName = `${vendor.fname} ${vendor.lname}`.trim();
  const initials =
    `${vendor.fname.charAt(0)}${vendor.lname.charAt(0)}`.toUpperCase();

  const handleLogout = () => {
    router.replace("/login");
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerCard}>
        {vendor.profilePicUrl ? (
          <Image
            source={{ uri: vendor.profilePicUrl }}
            style={styles.avatarImage}
          />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarText}>{initials || "V"}</Text>
          </View>
        )}
        <Text style={styles.name}>{fullName}</Text>
        <Text style={styles.business}>{vendor.busname}</Text>
        <Text style={styles.email}>{vendor.email}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact</Text>
        <InfoRow label="Phone" value={vendor.phone} />
        <InfoRow label="City" value={vendor.city} />
        <InfoRow label="Location" value={vendor.location} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Business</Text>
        <InfoRow
          label="About"
          value={vendor.about || "No description added yet."}
          multiline
        />
      </View>

      <TouchableOpacity
        style={styles.logoutButton}
        activeOpacity={0.8}
        onPress={handleLogout}
      >
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function InfoRow({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, multiline && styles.rowValueMultiline]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "#F5F7FA",
    paddingBottom: 40,
  },
  headerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    alignItems: "center",
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#EEF1F5",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginBottom: 14,
  },
  avatarFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#FC7B54",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  avatarText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 30,
    color: "#FFFFFF",
  },
  name: {
    fontFamily: "Outfit_700Bold",
    fontSize: 24,
    color: "#111827",
  },
  business: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: "#FC7B54",
    marginTop: 4,
  },
  email: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: "#6B7280",
    marginTop: 6,
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#EEF1F5",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  sectionTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: "#111827",
    marginBottom: 10,
  },
  row: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  rowLabel: {
    fontFamily: "Montserrat_600SemiBold",
    color: "#6B7280",
    fontSize: 13,
    marginBottom: 3,
  },
  rowValue: {
    fontFamily: "Montserrat_400Regular",
    color: "#111827",
    fontSize: 15,
  },
  rowValueMultiline: {
    lineHeight: 22,
  },
  logoutButton: {
    marginTop: 10,
    backgroundColor: "#111827",
    borderRadius: 14,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#111827",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 3,
  },
  logoutText: {
    fontFamily: "Outfit_700Bold",
    color: "#FFFFFF",
    fontSize: 16,
  },
});
