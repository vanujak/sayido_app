import { apiCredentials, graphQlUrl } from "@/lib/api-config";
import { clearVendorSession, getVendorSession, setVendorSession } from "@/lib/vendor-session";
import {
  authenticateWithBiometricsAsync,
  checkBiometricsSupportAsync,
  isBiometricsEnabled,
  setBiometricsEnabled,
} from "@/lib/biometrics";
import { ProfileSkeleton } from "@/components/ui/skeletons";
import { useAppTheme } from "@/context/ThemeContext";
import { useFocusEffect, useGlobalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type VendorApiData = {
  id: string;
  fname?: string;
  lname?: string;
  email?: string;
  busname?: string;
  phone?: string;
  city?: string;
  location?: string;
  about?: string;
  profile_pic_url?: string;
};

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
  const { colors, isDark, themeMode, toggleTheme } = useAppTheme();
  const params = useGlobalSearchParams<{
    id?: string;
    vendor_id?: string;
    vendorId?: string;
    email?: string;
    vendor_email?: string;
    fname?: string;
    lname?: string;
    busname?: string;
    phone?: string;
    city?: string;
    location?: string;
    about?: string;
    profile_pic_url?: string;
  }>();

  const [profile, setProfile] = useState<Partial<VendorProfile> | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  const [biometricsOn, setBiometricsOn] = useState(isBiometricsEnabled());
  const [biometricsSupported, setBiometricsSupported] = useState(false);
  const [biometricType, setBiometricType] = useState("Fingerprint");

  useEffect(() => {
    void checkBiometricsSupportAsync().then((support) => {
      setBiometricsSupported(support.hasHardware && support.isEnrolled);
      setBiometricType(support.typeName);
      setBiometricsOn(isBiometricsEnabled());
    });
  }, []);

  const handleToggleBiometrics = async (value: boolean) => {
    if (value) {
      const auth = await authenticateWithBiometricsAsync(
        `Verify ${biometricType.toLowerCase()} to enable`
      );
      if (auth.success) {
        setBiometricsEnabled(true);
        setBiometricsOn(true);
      }
    } else {
      setBiometricsEnabled(false);
      setBiometricsOn(false);
    }
  };

  const loadProfile = useCallback(async () => {
    if (!graphQlUrl) {
      setLoading(false);
      return;
    }

    const session = getVendorSession();
    const vendorId =
      (typeof params.vendor_id === "string" && params.vendor_id) ||
      (typeof params.vendorId === "string" && params.vendorId) ||
      (typeof params.id === "string" && params.id) ||
      session.vendorId ||
      process.env.EXPO_PUBLIC_VENDOR_ID ||
      "";

    const vendorEmail =
      (typeof params.vendor_email === "string" && params.vendor_email) ||
      (typeof params.email === "string" && params.email) ||
      session.email ||
      "";

    try {
      // 1. If we have a vendorId, fetch directly by ID
      if (vendorId) {
        const res = await fetch(graphQlUrl, {
          method: "POST",
          credentials: apiCredentials,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `
              query GetVendorProfileById($id: String!) {
                findVendorById(id: $id) {
                  id
                  email
                  fname
                  lname
                  busname
                  phone
                  city
                  location
                  about
                  profile_pic_url
                }
              }
            `,
            variables: { id: vendorId },
          }),
        });

        const json = (await res.json()) as {
          data?: { findVendorById?: VendorApiData };
        };
        if (json.data?.findVendorById) {
          const v = json.data.findVendorById;
          setProfile({
            fname: v.fname || "",
            lname: v.lname || "",
            email: v.email || "",
            busname: v.busname || "",
            phone: v.phone || "",
            city: v.city || "",
            location: v.location || "",
            about: v.about || "",
            profilePicUrl: v.profile_pic_url || "",
          });
          setImageError(false);
          setVendorSession({
            vendorId: v.id,
            email: v.email,
            name: `${v.fname || ""} ${v.lname || ""}`.trim(),
            profilePicUrl: v.profile_pic_url || "",
          });
          return;
        }
      }

      // 2. Fallback: fetch all vendors and find by email
      const targetEmail = (vendorEmail || "test@gmail.com").trim().toLowerCase();
      const allRes = await fetch(graphQlUrl, {
        method: "POST",
        credentials: apiCredentials,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
            query GetAllVendorsForProfile {
              findAllVendors {
                id
                email
                fname
                lname
                busname
                phone
                city
                location
                about
                profile_pic_url
              }
            }
          `,
        }),
      });
      const allJson = (await allRes.json()) as {
        data?: { findAllVendors?: Array<VendorApiData> };
      };
      const list = allJson.data?.findAllVendors || [];
      const matched =
        list.find((item) => item.email && item.email.toLowerCase() === targetEmail) ||
        list[0];
      if (matched) {
        setProfile({
          fname: matched.fname || "",
          lname: matched.lname || "",
          email: matched.email || "",
          busname: matched.busname || "",
          phone: matched.phone || "",
          city: matched.city || "",
          location: matched.location || "",
          about: matched.about || "",
          profilePicUrl: matched.profile_pic_url || "",
        });
        setImageError(false);
        setVendorSession({
          vendorId: matched.id,
          email: matched.email,
          name: `${matched.fname || ""} ${matched.lname || ""}`.trim(),
          profilePicUrl: matched.profile_pic_url || "",
        });
      }
    } catch (err) {
      console.error("Failed to load vendor profile:", err);
    } finally {
      setLoading(false);
    }
  }, [params.id, params.vendor_id, params.vendorId, params.email, params.vendor_email]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const session = getVendorSession();
  const vendor: VendorProfile = {
    fname: profile?.fname || String(params.fname ?? "Vendor"),
    lname: profile?.lname || String(params.lname ?? ""),
    email: profile?.email || String(params.email ?? session.email ?? "test@gmail.com"),
    busname: profile?.busname || String(params.busname ?? "Test Vendor"),
    phone: profile?.phone || String(params.phone ?? ""),
    city: profile?.city || String(params.city ?? ""),
    location: profile?.location || String(params.location ?? ""),
    about:
      profile?.about ||
      String(
        params.about ??
          "Professional wedding vendor focused on quality service and reliable communication."
      ),
    profilePicUrl: profile?.profilePicUrl || String(params.profile_pic_url ?? ""),
  };

  const fullName = `${vendor.fname} ${vendor.lname}`.trim();
  const initials = `${vendor.fname.charAt(0)}${vendor.lname.charAt(0)}`.toUpperCase();

  const handleLogout = () => {
    clearVendorSession(true);
    router.replace("/login");
  };

  const hasAvatar = Boolean(vendor.profilePicUrl && !imageError);

  if (loading && !profile) {
    return <ProfileSkeleton />;
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatarRing, { backgroundColor: colors.primaryLight }]}>
            {hasAvatar ? (
              <Image
                source={{ uri: vendor.profilePicUrl }}
                style={styles.avatarImage}
                resizeMode="cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarText}>{initials || "V"}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.name, { color: colors.text }]}>{fullName}</Text>
          <Text style={[styles.business, { color: colors.primary }]}>{vendor.busname}</Text>
          <Text style={[styles.email, { color: colors.textSecondary }]}>{vendor.email}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Appearance</Text>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.switchLabel, { color: colors.text }]}>
                Dark Theme
              </Text>
              <Text style={[styles.switchDesc, { color: colors.textSecondary }]}>
                {themeMode === "system"
                  ? "System default (follows device settings)"
                  : isDark
                  ? "Dark theme active"
                  : "Light theme active"}
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: isDark ? "#334155" : "#E5E7EB", true: "#FED7AA" }}
              thumbColor={isDark ? "#FC7B54" : "#9CA3AF"}
            />
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Contact</Text>
          <InfoRow label="Phone" value={vendor.phone || "Not specified"} colors={colors} />
          <InfoRow label="City" value={vendor.city || "Not specified"} colors={colors} />
          <InfoRow label="Location" value={vendor.location || "Not specified"} colors={colors} />
        </View>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Business</Text>
          <InfoRow
            label="About"
            value={vendor.about || "No description added yet."}
            multiline
            maxLines={4}
            colors={colors}
          />
        </View>

        {biometricsSupported && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Security</Text>
            <View style={styles.switchRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.switchLabel, { color: colors.text }]}>
                  {biometricType} Login
                </Text>
                <Text style={[styles.switchDesc, { color: colors.textSecondary }]}>
                  Unlock the app using your {biometricType.toLowerCase()} instead of entering your password.
                </Text>
              </View>
              <Switch
                value={biometricsOn}
                onValueChange={handleToggleBiometrics}
                trackColor={{ false: isDark ? "#334155" : "#E5E7EB", true: "#FED7AA" }}
                thumbColor={biometricsOn ? "#FC7B54" : "#9CA3AF"}
              />
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.logoutButton,
            {
              backgroundColor: isDark ? "#1E293B" : "#111827",
              borderColor: colors.border,
              borderWidth: isDark ? 1 : 0,
            },
          ]}
          activeOpacity={0.8}
          onPress={handleLogout}
        >
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function InfoRow({
  label,
  value,
  multiline = false,
  maxLines,
  colors,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  maxLines?: number;
  colors?: { text: string; textSecondary: string; borderLight: string };
}) {
  return (
    <View style={[styles.row, colors && { borderTopColor: colors.borderLight }]}>
      <Text style={[styles.rowLabel, colors && { color: colors.textSecondary }]}>{label}</Text>
      <Text
        style={[styles.rowValue, multiline && styles.rowValueMultiline, colors && { color: colors.text }]}
        numberOfLines={maxLines}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFEFEB",
  },
  container: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 24,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#FFEFEB",
  },
  stateText: {
    marginTop: 10,
    color: "#6B7280",
    fontFamily: "Montserrat_400Regular",
  },
  headerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    alignItems: "center",
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E8EDF5",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  avatarRing: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: "#FFF3EE",
    padding: 3,
    marginBottom: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#FC7B54",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 28,
    color: "#FFFFFF",
  },
  name: {
    fontFamily: "Outfit_700Bold",
    fontSize: 20,
    color: "#111827",
  },
  business: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "#FC7B54",
    marginTop: 4,
  },
  email: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#6B7280",
    marginTop: 4,
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E8EDF5",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  sectionTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
    color: "#111827",
    marginBottom: 8,
  },
  row: {
    paddingVertical: 8,
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
    fontSize: 14,
  },
  rowValueMultiline: {
    lineHeight: 20,
  },
  logoutButton: {
    marginTop: 16,
    backgroundColor: "#111827",
    borderRadius: 14,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#111827",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  logoutText: {
    fontFamily: "Outfit_700Bold",
    color: "#FFFFFF",
    fontSize: 16,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  switchLabel: {
    fontFamily: "Outfit_700Bold",
    fontSize: 15,
    color: "#111827",
    marginBottom: 2,
  },
  switchDesc: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
});
