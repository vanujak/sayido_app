import { useCallback, useEffect, useState } from "react";
import { ExploreSkeleton } from "@/components/ui/skeletons";
import { useFocusEffect, useGlobalSearchParams } from "expo-router";
import {
  AppState,
  Image,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { Check, ChevronDown, ChevronUp, Package, Sparkles } from "lucide-react-native";
import { getVendorSession, setVendorSession } from "@/lib/vendor-session";
import { apiCredentials, graphQlUrl } from "@/lib/api-config";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental &&
  !(global as unknown as { nativeFabricUIManager?: unknown }).nativeFabricUIManager
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Offering = {
  id: string;
  name: string;
  category: string;
  description: string;
  banner?: string | null;
};

type VendorPackage = {
  id: string;
  offeringId: string;
  name: string;
  description: string;
  pricing: number | null;
  features: string[];
  requiresReservation: boolean;
  requiresApproval: boolean;
  visible: boolean;
  image?: string | null;
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

async function graphQlRequest<TData>(
  query: string,
  variables: Record<string, unknown>
): Promise<TData> {
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

  let payload: { data?: TData; errors?: { message?: string }[] } = {};
  try {
    payload = (await response.json()) as {
      data?: TData;
      errors?: { message?: string }[];
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
}

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
  banner: toText(item.banner) || null,
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
          banner
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
      findOfferings?: Record<string, unknown>[];
    }>(
      `
        query FindOfferingsForSession {
          findOfferings {
            id
            name
            category
            description
            banner
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
        requiresApproval: Boolean(item.requires_approval ?? item.requiresApproval),
        visible: item.visible !== false,
        image: toText(item.image) || null,
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
          requiresApproval
          image
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

function OfferingBannerImage({ uri, alt }: { uri: string; alt: string }) {
  const [hasError, setHasError] = useState(false);
  if (hasError || !uri.trim()) return null;

  return (
    <View style={styles.bannerContainer}>
      <Image
        source={{ uri }}
        style={styles.offeringBanner}
        resizeMode="cover"
        onError={() => setHasError(true)}
      />
    </View>
  );
}

function PackageThumbnailImage({ uri, alt }: { uri?: string | null; alt?: string }) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !uri?.trim()) {
    return (
      <View style={styles.thumbnailPlaceholder}>
        <Package size={22} color="#FC7B54" />
      </View>
    );
  }

  return (
    <View style={styles.thumbnailContainer}>
      <Image
        source={{ uri }}
        style={styles.thumbnailImage}
        resizeMode="cover"
        onError={() => setHasError(true)}
      />
    </View>
  );
}

function PackageCard({ pkg }: { pkg: VendorPackage }) {
  return (
    <View style={styles.packageCard}>
      <View style={styles.packageHeader}>
        <PackageThumbnailImage uri={pkg.image} alt={pkg.name} />

        <View style={styles.headerInfo}>
          <Text style={styles.packageName} numberOfLines={2}>
            {pkg.name}
          </Text>

          <Text style={styles.packagePrice}>
            {pkg.pricing !== null ? formatLkr(pkg.pricing) : "Contact for pricing"}
          </Text>

          <View style={styles.headerPillsRow}>
            {pkg.requiresApproval ? (
              <View style={[styles.miniBadge, styles.miniBadgeApproval]}>
                <Text style={[styles.miniBadgeText, styles.miniBadgeTextApproval]}>
                  Requires Approval
                </Text>
              </View>
            ) : pkg.requiresReservation ? (
              <View style={[styles.miniBadge, styles.miniBadgeReservation]}>
                <Text style={[styles.miniBadgeText, styles.miniBadgeTextReservation]}>
                  Requires Reservation
                </Text>
              </View>
            ) : (
              <View style={[styles.miniBadge, styles.miniBadgeNormal]}>
                <Text style={[styles.miniBadgeText, styles.miniBadgeTextNormal]}>
                  Normal Package
                </Text>
              </View>
            )}

            {pkg.features.length > 0 && (
              <View style={styles.featureCountBadge}>
                <Text style={styles.featureCountText}>
                  {pkg.features.length} {pkg.features.length === 1 ? "feature" : "features"}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {(Boolean(pkg.description) || pkg.features.length > 0) && (
        <View style={styles.packageBody}>
          {!!pkg.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.packageDescription}>{pkg.description}</Text>
            </View>
          )}

          {pkg.features.length > 0 && (
            <View
              style={[
                styles.featuresContainer,
                !pkg.description && { borderTopWidth: 0, paddingTop: 0 },
              ]}
            >
              <View style={styles.featuresHeaderRow}>
                <Sparkles size={13} color="#FC7B54" />
                <Text style={styles.featuresTitle}>What{"'"}s Included</Text>
              </View>

              <View style={styles.featuresList}>
                {pkg.features.map((feature, index) => (
                  <View
                    key={`${pkg.id}-${feature}-${index}`}
                    style={styles.featureItem}
                  >
                    <View style={styles.featureCheckCircle}>
                      <Check
                        size={11}
                        color="#059669"
                        strokeWidth={3}
                      />
                    </View>
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

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
  const [errorMessage, setErrorMessage] = useState("");
  const [expandedOfferingIds, setExpandedOfferingIds] = useState<Record<string, boolean>>({});

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
    }
  }, [vendorEmail, vendorId, vendorSession.email]);

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

  const toggleOffering = (offeringId: string) => {
    if (Platform.OS !== "web") {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setExpandedOfferingIds((prev) => ({
      ...prev,
      [offeringId]: !prev[offeringId],
    }));
  };

  if (loading) {
    return <ExploreSkeleton />;
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
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Services & Packages</Text>
        <Text style={styles.subtitle}>Your offerings and their packages</Text>

        {sections.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No services yet</Text>
            <Text style={styles.emptyText}>
              Add services and packages to show them on this page.
            </Text>
          </View>
        ) : (
          sections.map((entry) => {
            const isOfferingOpen = Boolean(expandedOfferingIds[entry.offering.id]);
            const packageCount = entry.packages.length;

            return (
              <View
                key={entry.offering.id}
                style={[styles.offeringCard, isOfferingOpen && styles.offeringCardOpen]}
              >
                {/* Service Header Accordion Button */}
                <TouchableOpacity
                  style={styles.offeringHeader}
                  onPress={() => toggleOffering(entry.offering.id)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOfferingOpen }}
                >
                  <View style={styles.offeringHeaderMain}>
                    <View style={styles.offeringBadgesRow}>
                      <View style={styles.categoryBadge}>
                        <Text style={styles.categoryBadgeText}>
                          {entry.offering.category.toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.packageCountBadge}>
                        <Text style={styles.packageCountBadgeText}>
                          {packageCount} {packageCount === 1 ? "Package" : "Packages"}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.offeringName}>{entry.offering.name}</Text>

                    {Boolean(entry.offering.description) && !isOfferingOpen && (
                      <Text style={styles.offeringDescriptionCollapsed} numberOfLines={1}>
                        {entry.offering.description}
                      </Text>
                    )}
                  </View>

                  <View
                    style={[
                      styles.offeringChevronCircle,
                      isOfferingOpen && styles.offeringChevronCircleOpen,
                    ]}
                  >
                    {isOfferingOpen ? (
                      <ChevronUp size={20} color="#FC7B54" strokeWidth={2.5} />
                    ) : (
                      <ChevronDown size={20} color="#6B7280" strokeWidth={2.5} />
                    )}
                  </View>
                </TouchableOpacity>

                {/* Expanded Service Content: Packages & Details */}
                {isOfferingOpen && (
                  <View style={styles.offeringBody}>
                    {Boolean(entry.offering.banner) && (
                      <OfferingBannerImage
                        uri={entry.offering.banner!}
                        alt={entry.offering.name}
                      />
                    )}

                    {Boolean(entry.offering.description) && (
                      <Text style={styles.offeringDescription}>
                        {entry.offering.description}
                      </Text>
                    )}

                    {entry.packages.length === 0 ? (
                      <View style={styles.noPackagesBox}>
                        <Package size={20} color="#9CA3AF" />
                        <Text style={styles.noPackagesText}>
                          No packages yet for this service.
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.packagesSection}>
                        <View style={styles.packagesSectionHeader}>
                          <Text style={styles.packagesSectionTitle}>Packages</Text>
                        </View>

                        <View style={styles.packagesList}>
                          {entry.packages.map((pkg) => (
                            <PackageCard key={pkg.id} pkg={pkg} />
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })
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
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    marginBottom: 14,
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  offeringCardOpen: {
    borderColor: "#FC7B54",
    borderWidth: 1.5,
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  offeringHeader: {
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  offeringHeaderMain: {
    flex: 1,
    marginRight: 12,
    alignItems: "flex-start",
  },
  offeringBadgesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
    alignSelf: "flex-start",
  },
  categoryBadge: {
    backgroundColor: "#FFF3EE",
    borderWidth: 1,
    borderColor: "#FFD2C2",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  categoryBadgeText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 11,
    color: "#FC7B54",
    letterSpacing: 0.5,
  },
  packageCountBadge: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  packageCountBadgeText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 11,
    color: "#4B5563",
  },
  offeringName: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: "#111827",
    lineHeight: 24,
    textAlign: "left",
    alignSelf: "flex-start",
  },
  offeringDescriptionCollapsed: {
    marginTop: 4,
    fontFamily: "Montserrat_400Regular",
    fontSize: 12.5,
    color: "#6B7280",
    lineHeight: 18,
  },
  offeringChevronCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  offeringChevronCircleOpen: {
    backgroundColor: "#FFF3EE",
  },
  offeringBody: {
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  bannerContainer: {
    width: "100%",
    height: 130,
    borderRadius: 12,
    marginTop: 14,
    backgroundColor: "#F3F4F6",
    overflow: "hidden",
  },
  offeringBanner: {
    width: "100%",
    height: "100%",
  },
  offeringDescription: {
    marginTop: 10,
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 19,
  },
  noPackagesBox: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EEF2F6",
    borderStyle: "dashed",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  noPackagesText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#6B7280",
  },
  packagesSection: {
    marginTop: 16,
  },
  packagesSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  packagesSectionTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 13.5,
    color: "#374151",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  packagesList: {
    gap: 12,
  },
  packageCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EAEFF5",
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  packageHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  thumbnailContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  thumbnailImage: {
    width: "100%",
    height: "100%",
  },
  thumbnailPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: "#FFF5F0",
    borderWidth: 1,
    borderColor: "#FED7AA",
    alignItems: "center",
    justifyContent: "center",
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
    justifyContent: "center",
  },
  packageName: {
    fontFamily: "Outfit_700Bold",
    fontSize: 15,
    color: "#111827",
    lineHeight: 20,
  },
  packagePrice: {
    marginTop: 2,
    fontFamily: "Outfit_700Bold",
    fontSize: 14.5,
    color: "#FC7B54",
  },
  headerPillsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 5,
  },
  miniBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  miniBadgeReservation: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  miniBadgeDirect: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  miniBadgeNormal: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  miniBadgeApproval: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  miniBadgeText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 10.5,
  },
  miniBadgeTextReservation: {
    color: "#B45309",
  },
  miniBadgeTextDirect: {
    color: "#059669",
  },
  miniBadgeTextNormal: {
    color: "#059669",
  },
  miniBadgeTextApproval: {
    color: "#1D4ED8",
  },
  featureCountBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  featureCountText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 10.5,
    color: "#6B7280",
  },
  packageBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    backgroundColor: "#FAFAFC",
  },
  descriptionSection: {
    marginBottom: 10,
  },
  packageDescription: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 19,
  },
  featuresContainer: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#EEF2F6",
  },
  featuresHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  featuresTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#374151",
    letterSpacing: 0.2,
  },
  featuresList: {
    gap: 7,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  featureCheckCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#D1FAE5",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12.5,
    color: "#374151",
    flex: 1,
  },
});
