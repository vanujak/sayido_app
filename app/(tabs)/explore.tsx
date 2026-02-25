import { useCallback, useEffect, useState } from "react";
import { useGlobalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import {
  AppState,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getVendorSession, setVendorSession } from "@/lib/vendor-session";
import { apiCredentials, graphQlUrl } from "@/lib/api-config";

type Offering = {
  id: string;
  name: string;
  category: string;
  description: string;
};

type VendorPackage = {
  id: string;
  offeringId: string;
  name: string;
  description: string;
  pricing: number | null;
  features: string[];
  requiresReservation: boolean;
  visible: boolean;
};

type OfferingWithPackages = {
  offering: Offering;
  packages: VendorPackage[];
};

const pickList = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (!value || typeof value !== "object") return [];

  const source = value as Record<string, unknown>;
  if (Array.isArray(source.data)) return source.data as Record<string, unknown>[];
  if (Array.isArray(source.items)) return source.items as Record<string, unknown>[];
  if (Array.isArray(source.offerings)) return source.offerings as Record<string, unknown>[];
  if (Array.isArray(source.packages)) return source.packages as Record<string, unknown>[];
  return [];
};

const toText = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim() ? value : fallback;

const toPrice = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toFeatures = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
};

const formatLkr = (value: number) =>
  `LKR ${value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

const graphQlRequest = async <TData>(
  query: string,
  variables: Record<string, unknown>
): Promise<TData> => {
  if (!graphQlUrl) {
    throw new Error("Missing EXPO_PUBLIC_GRAPHQL_URL");
  }

  const response = await fetch(graphQlUrl, {
    method: "POST",
    credentials: apiCredentials,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  let payload: { data?: TData; errors?: Array<{ message?: string }> } = {};
  try {
    payload = (await response.json()) as {
      data?: TData;
      errors?: Array<{ message?: string }>;
    };
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const message = payload.errors
      ?.map((entry) => entry.message)
      .filter((entry): entry is string => !!entry)
      .join(", ");
    throw new Error(message || `GraphQL request failed (${response.status})`);
  }

  if (payload.errors?.length) {
    const message = payload.errors
      .map((entry) => entry.message)
      .filter((entry): entry is string => !!entry)
      .join(", ");
    throw new Error(message || "GraphQL query error");
  }

  if (!payload.data) {
    throw new Error("GraphQL response has no data");
  }

  return payload.data;
};

const readVendorIdFromCookie = () => {
  if (typeof document === "undefined" || typeof atob !== "function") return "";
  const tokenPair = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("access_tokenVendor="));

  if (!tokenPair) return "";
  const token = tokenPair.slice("access_tokenVendor=".length);
  const jwtParts = token.split(".");
  if (jwtParts.length < 2) return "";

  try {
    const payload = JSON.parse(atob(jwtParts[1].replace(/-/g, "+").replace(/_/g, "/"))) as {
      sub?: string;
    };
    return toText(payload.sub);
  } catch {
    return "";
  }
};

const mapOffering = (item: Record<string, unknown>): Offering => ({
  id: toText(item.id),
  name: toText(item.name, "Untitled offering"),
  category: toText(item.category, "Uncategorized"),
  description: toText(item.description),
});

const loadVendorIdByEmail = async (email: string): Promise<string> => {
  if (!email.trim()) return "";

  const data = await graphQlRequest<{
    findVendorByEmail?: { id?: string; email?: string } | null;
  }>(
    `
      query FindVendorByEmailForLookup($email: String!) {
        findVendorByEmail(email: $email) {
          id
          email
        }
      }
    `,
    { email: email.trim() }
  );

  return toText(data.findVendorByEmail?.id);
};

const loadOfferingsByVendor = async (vendorId: string): Promise<Offering[]> => {
  const data = await graphQlRequest<{
    findOfferingsByVendor?: Record<string, unknown>[];
  }>(
    `
      query FindOfferingsByVendor($id: String!) {
        findOfferingsByVendor(id: $id) {
          id
          name
          category
          description
        }
      }
    `,
    { id: vendorId }
  );

  return pickList(data.findOfferingsByVendor).map(mapOffering).filter((offering) => !!offering.id);
};

const loadOfferingsFromSession = async (vendorEmail: string): Promise<Offering[]> => {
  const queryWithVendor = async () => {
    const data = await graphQlRequest<{
      findOfferings?: Array<Record<string, unknown>>;
    }>(
      `
        query FindOfferingsForSession {
          findOfferings {
            id
            name
            category
            description
            vendor {
              id
              email
            }
          }
        }
      `,
      {}
    );

    const offerings = pickList(data.findOfferings)
      .map(mapOffering)
      .filter((offering) => !!offering.id);
    if (!vendorEmail.trim()) return offerings;

    const target = vendorEmail.trim().toLowerCase();
    return pickList(data.findOfferings)
      .filter((item) => {
        const vendor = item.vendor as Record<string, unknown> | undefined;
        return toText(vendor?.email).toLowerCase() === target;
      })
      .map(mapOffering)
      .filter((offering) => !!offering.id);
  };

  try {
    return await queryWithVendor();
  } catch {
    return [];
  }
};

const parsePackages = (raw: unknown, offeringId: string): VendorPackage[] => {
  return pickList(raw)
    .map((item) => {
      const nestedOffering = item.offering as Record<string, unknown> | undefined;
      const rawOfferingId =
        toText(item.offering_id) || toText(item.offeringId) || toText(nestedOffering?.id);
      return {
        id: toText(item.id),
        offeringId: rawOfferingId || offeringId,
        name: toText(item.name, "Unnamed package"),
        description: toText(item.description),
        pricing: toPrice(item.pricing),
        features: toFeatures(item.features),
        requiresReservation: Boolean(item.requires_reservation ?? item.requiresReservation),
        visible: item.visible !== false,
      };
    })
    .filter((pkg) => pkg.id && pkg.offeringId === offeringId && pkg.visible);
};

const loadPackagesByOffering = async (offeringId: string): Promise<VendorPackage[]> => {
  const data = await graphQlRequest<{
    findPackagesByOffering?: Record<string, unknown>[];
  }>(
    `
      query FindPackagesByOffering($offeringId: String!) {
        findPackagesByOffering(offeringId: $offeringId) {
          id
          name
          description
          pricing
          features
          visible
          requiresReservation
          offering {
            id
          }
        }
      }
    `,
    { offeringId }
  );

  return parsePackages(data.findPackagesByOffering, offeringId);
};

export default function PackagesScreen() {
  const vendorSession = getVendorSession();
  const params = useGlobalSearchParams<{
    id?: string;
    vendor_id?: string;
    vendorId?: string;
    email?: string;
    vendor_email?: string;
  }>();
  const [sections, setSections] = useState<OfferingWithPackages[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const vendorId =
    (typeof params.vendor_id === "string" && params.vendor_id) ||
    (typeof params.vendorId === "string" && params.vendorId) ||
    (typeof params.id === "string" && params.id) ||
    vendorSession.vendorId ||
    process.env.EXPO_PUBLIC_VENDOR_ID ||
    "";
  const vendorEmail =
    (typeof params.vendor_email === "string" && params.vendor_email) ||
    (typeof params.email === "string" && params.email) ||
    vendorSession.email ||
    "";

  const loadData = useCallback(async () => {
    setErrorMessage("");

    try {
      const resolvedVendorId =
        vendorId || (await loadVendorIdByEmail(vendorEmail)) || readVendorIdFromCookie();
      if (resolvedVendorId) {
        setVendorSession({
          vendorId: resolvedVendorId,
          email: vendorEmail || vendorSession.email,
        });
      }
      if (!resolvedVendorId) {
        throw new Error("Unable to resolve vendor id for package loading.");
      }

      const offerings = resolvedVendorId
        ? await loadOfferingsByVendor(resolvedVendorId)
        : await loadOfferingsFromSession(vendorEmail);
      const packageRows = await Promise.all(
        offerings.map(async (offering) => ({
          offering,
          packages: await loadPackagesByOffering(offering.id),
        }))
      );

      setSections(packageRows);
    } catch (error) {
      setSections([]);
      const fallbackHelp =
        "Unable to load offerings/packages from GraphQL. Confirm vendor id source and resolver query names.";
      setErrorMessage(
        error instanceof Error && error.message
          ? `${error.message}. ${fallbackHelp}`
          : fallbackHelp
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [vendorEmail, vendorId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        loadData();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#FC7B54" />
          <Text style={styles.stateText}>Loading packages...</Text>
        </View>
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={styles.screen}>
        <View style={styles.centerState}>
          <Text style={styles.errorTitle}>Could not load packages</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadData} activeOpacity={0.8}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Packages</Text>
        <Text style={styles.subtitle}>Your offerings and their packages</Text>

        {sections.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No packages yet</Text>
            <Text style={styles.emptyText}>
              Add packages under offerings to show them on this page.
            </Text>
          </View>
        ) : (
          sections.map((entry) => (
            <View key={entry.offering.id} style={styles.offeringCard}>
              <Text style={styles.offeringName}>{entry.offering.name}</Text>
              <Text style={styles.offeringCategory}>{entry.offering.category}</Text>
              {!!entry.offering.description && (
                <Text style={styles.offeringDescription}>{entry.offering.description}</Text>
              )}

              {entry.packages.length === 0 ? (
                <View style={styles.packageCard}>
                  <Text style={styles.packageDescription}>
                    No packages yet for this offering.
                  </Text>
                </View>
              ) : (
                entry.packages.map((pkg) => (
                  <View key={pkg.id} style={styles.packageCard}>
                    <View style={styles.packageHeader}>
                      <Text style={styles.packageName}>{pkg.name}</Text>
                      {pkg.pricing !== null && (
                        <Text style={styles.packagePrice}>{formatLkr(pkg.pricing)}</Text>
                      )}
                    </View>

                    {!!pkg.description && (
                      <Text style={styles.packageDescription}>{pkg.description}</Text>
                    )}

                    <Text style={styles.packageMeta}>
                      {pkg.requiresReservation ? "Requires reservation" : "No reservation required"}
                    </Text>

                    {pkg.features.length > 0 && (
                      <View style={styles.featuresWrap}>
                        {pkg.features.map((feature, index) => (
                          <View key={`${pkg.id}-${feature}-${index}`} style={styles.featureTag}>
                            <Text style={styles.featureText}>{feature}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>
          ))
        )}
      </ScrollView>
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
    paddingBottom: 40,
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
  errorTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 20,
    color: "#111827",
    marginBottom: 8,
  },
  errorText: {
    fontFamily: "Montserrat_400Regular",
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: "#111827",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  retryText: {
    color: "#FFFFFF",
    fontFamily: "Outfit_700Bold",
    fontSize: 14,
  },
  title: {
    fontFamily: "Outfit_700Bold",
    fontSize: 30,
    color: "#111827",
  },
  subtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
    marginBottom: 14,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EDF5",
    padding: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 1,
  },
  emptyTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: "#111827",
    marginBottom: 6,
  },
  emptyText: {
    fontFamily: "Montserrat_400Regular",
    color: "#6B7280",
  },
  offeringCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EDF5",
    padding: 16,
    marginBottom: 12,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 1,
  },
  offeringName: {
    fontFamily: "Outfit_700Bold",
    fontSize: 20,
    color: "#111827",
  },
  offeringCategory: {
    marginTop: 2,
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: "#FC7B54",
  },
  offeringDescription: {
    marginTop: 8,
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
  },
  packageCard: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  packageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  packageName: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: "#111827",
    flex: 1,
  },
  packagePrice: {
    fontFamily: "Outfit_700Bold",
    fontSize: 15,
    color: "#111827",
  },
  packageDescription: {
    marginTop: 6,
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
  },
  packageMeta: {
    marginTop: 8,
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#4B5563",
  },
  featuresWrap: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  featureTag: {
    backgroundColor: "#FFF3EE",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  featureText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#FC7B54",
  },
});
