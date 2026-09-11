import { apiCredentials, graphQlUrl } from "@/lib/api-config";
import { clearVendorSession, getVendorSession, setVendorSession } from "@/lib/vendor-session";
import { useFocusEffect } from "@react-navigation/native";
import { useGlobalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  RefreshControl,
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
  const [refreshing, setRefreshing] = useState(false);
  const [imageError, setImageError] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!graphQlUrl) {
      setLoading(false);
      setRefreshing(false);
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

        const payload = await res.json();
        if (payload?.data?.findVendorById) {
          const v = payload.data.findVendorById;
          setProfile({
            fname: v.fname,
            lname: v.lname,
            email: v.email,
            busname: v.busname,
            phone: v.phone,
            city: v.city,
            location: v.location,
            about: v.about,
            profilePicUrl: v.profile_pic_url || "",
          });
          setImageError(false);
          setVendorSession({
            vendorId: v.id,
            email: v.email,
          });
          return;
        }
      }

      // 2. If vendorId is missing or lookup failed, query all vendors to match by email
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

      const allPayload = await allRes.json();
      const vendors = allPayload?.data?.findAllVendors;
      if (Array.isArray(vendors) && vendors.length > 0) {
        const matched =
          vendors.find(
            (v: { email?: string }) => v.email && v.email.toLowerCase() === targetEmail
          ) || vendors[0];

        if (matched) {
          setProfile({
            fname: matched.fname,
            lname: matched.lname,
            email: matched.email,
            busname: matched.busname,
            phone: matched.phone,
            city: matched.city,
            location: matched.location,
            about: matched.about,
            profilePicUrl: matched.profile_pic_url || "",
          });
          setImageError(false);
          setVendorSession({
            vendorId: matched.id,
            email: matched.email,
          });
        }
      }
    } catch (err) {
      console.error("Failed to load vendor profile:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
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

  const onRefresh = () => {
    setRefreshing(true);
    loadProfile();
  };

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
    clearVendorSession();
    router.replace("/login");
  };

  const hasAvatar = Boolean(vendor.profilePicUrl && !imageError);

  if (loading && !profile) {
    return (
      <View style={styles.screen}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#FC7B54" />
          <Text style={styles.stateText}>Loading profile...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FC7B54"
            colors={["#FC7B54"]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerCard}>
          <View style={styles.avatarRing}>
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
          <Text style={styles.name}>{fullName}</Text>
          <Text style={styles.business}>{vendor.busname}</Text>
          <Text style={styles.email}>{vendor.email}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact</Text>
          <InfoRow label="Phone" value={vendor.phone || "Not specified"} />
          <InfoRow label="City" value={vendor.city || "Not specified"} />
          <InfoRow label="Location" value={vendor.location || "Not specified"} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Business</Text>
          <InfoRow
            label="About"
            value={vendor.about || "No description added yet."}
            multiline
            maxLines={4}
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
    </View>
  );
}

function InfoRow({
  label,
  value,
  multiline = false,
  maxLines,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  maxLines?: number;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[styles.rowValue, multiline && styles.rowValueMultiline]}
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
    backgroundColor: "#FFF8F3",
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
    backgroundColor: "#FFF8F3",
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
});
