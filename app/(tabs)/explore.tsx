import { ExploreSkeleton } from "@/components/ui/skeletons";
import { useAppTheme } from "@/context/ThemeContext";
import { apiCredentials, graphQlUrl } from "@/lib/api-config";
import { getVendorSession, setVendorSession } from "@/lib/vendor-session";
import { useFocusEffect, useGlobalSearchParams } from "expo-router";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Package,
  Sparkles,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
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

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental &&
  !(globalThis as unknown as { nativeFabricUIManager?: unknown })
    .nativeFabricUIManager
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Service = {
  id: string;
  name: string;
  category: string;
  description: string;
  banner?: string | null;
};

type VendorPackage = {
  id: string;
  serviceId: string;
  name: string;
  description: string;
  pricing: number | null;
  features: string[];
  requiresReservation: boolean;
  requiresApproval: boolean;
  visible: boolean;
  image?: string | null;
};

type ServiceWithPackages = {
  service: Service;
  packages: VendorPackage[];
};
const pickList = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (!value || typeof value !== "object") return [];

  const source = value as Record<string, unknown>;
  if (Array.isArray(source.data))
    return source.data as Record<string, unknown>[];
  if (Array.isArray(source.items))
    return source.items as Record<string, unknown>[];
  if (Array.isArray(source.services))
    return source.services as Record<string, unknown>[];
  if (Array.isArray(source.packages))
    return source.packages as Record<string, unknown>[];
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
  variables: Record<string, unknown>,
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
    const payload = JSON.parse(
      atob(jwtParts[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as {
      sub?: string;
    };
    return toText(payload.sub);
  } catch {
    return "";
  }
};

const mapService = (item: Record<string, unknown>): Service => ({
  id: toText(item.id),
  name: toText(item.name, "Untitled service"),
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
    { email: email.trim() },
  );

  return toText(data.findVendorByEmail?.id);
};

const loadServicesByVendor = async (vendorId: string): Promise<Service[]> => {
  const data = await graphQlRequest<{
    findServicesByVendor?: Record<string, unknown>[];
  }>(
    `
      query FindServicesByVendor($id: String!) {
        findServicesByVendor(id: $id) {
          id
          name
          category
          description
          banner
        }
      }
    `,
    { id: vendorId },
  );

  return pickList(data.findServicesByVendor)
    .map(mapService)
    .filter((service) => !!service.id);
};

const loadServicesFromSession = async (
  vendorEmail: string,
): Promise<Service[]> => {
  const queryWithVendor = async () => {
    const data = await graphQlRequest<{
      findServices?: Record<string, unknown>[];
    }>(
      `
        query FindServicesForSession {
          findServices {
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
      {},
    );

    const services = pickList(data.findServices)
      .map(mapService)
      .filter((service) => !!service.id);
    if (!vendorEmail.trim()) return services;

    const target = vendorEmail.trim().toLowerCase();
    return pickList(data.findServices)
      .filter((item) => {
        const vendor = item.vendor as Record<string, unknown> | undefined;
        return toText(vendor?.email).toLowerCase() === target;
      })
      .map(mapService)
      .filter((service) => !!service.id);
  };

  try {
    return await queryWithVendor();
  } catch {
    return [];
  }
};

const parsePackages = (raw: unknown, serviceId: string): VendorPackage[] => {
  return pickList(raw)
    .map((item) => {
      const nestedService = item.service as Record<string, unknown> | undefined;
      const rawServiceId =
        toText(item.service_id) ||
        toText(item.serviceId) ||
        toText(nestedService?.id);
      return {
        id: toText(item.id),
        serviceId: rawServiceId || serviceId,
        name: toText(item.name, "Unnamed package"),
        description: toText(item.description),
        pricing: toPrice(item.pricing),
        features: toFeatures(item.features),
        requiresReservation: Boolean(
          item.requires_reservation ?? item.requiresReservation,
        ),
        requiresApproval: Boolean(
          item.requires_approval ?? item.requiresApproval,
        ),
        visible: item.visible !== false,
        image: toText(item.image) || null,
      };
    })
    .filter((pkg) => pkg.id && pkg.serviceId === serviceId && pkg.visible);
};

const loadPackagesByService = async (
  serviceId: string,
): Promise<VendorPackage[]> => {
  const data = await graphQlRequest<{
    findPackagesByService?: Record<string, unknown>[];
  }>(
    `
      query FindPackagesByService($serviceId: String!) {
        findPackagesByService(serviceId: $serviceId) {
          id
          name
          description
          pricing
          visible
          requiresReservation
          requiresApproval
          image
          service {
            id
          }
        }
      }
    `,
    { serviceId },
  );

  return parsePackages(data.findPackagesByService, serviceId);
};

function ServiceBannerImage({ uri, alt }: { uri: string; alt: string }) {
  const [hasError, setHasError] = useState(false);
  if (hasError || !uri.trim()) return null;

  return (
    <View style={styles.bannerContainer}>
      <Image
        source={{ uri }}
        style={styles.serviceBanner}
        resizeMode="cover"
        onError={() => setHasError(true)}
      />
    </View>
  );
}

function PackageThumbnailImage({
  uri,
  alt,
}: {
  uri?: string | null;
  alt?: string;
}) {
  const { colors, isDark } = useAppTheme();
  const [hasError, setHasError] = useState(false);

  if (hasError || !uri?.trim()) {
    return (
      <View
        style={[
          styles.thumbnailPlaceholder,
          isDark && {
            backgroundColor: "rgba(252, 123, 84, 0.15)",
            borderColor: "rgba(252, 123, 84, 0.3)",
          },
        ]}
      >
        <Package size={22} color="#FC7B54" />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.thumbnailContainer,
        {
          backgroundColor: isDark ? colors.cardSubtle : "#F3F4F6",
          borderColor: colors.border,
        },
      ]}
    >
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
  const { colors, isDark } = useAppTheme();
  return (
    <View
      style={[
        styles.packageCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.packageHeader}>
        <PackageThumbnailImage uri={pkg.image} alt={pkg.name} />

        <View style={styles.headerInfo}>
          <Text
            style={[styles.packageName, { color: colors.text }]}
            numberOfLines={2}
          >
            {pkg.name}
          </Text>

          <Text style={styles.packagePrice}>
            {pkg.pricing !== null
              ? formatLkr(pkg.pricing)
              : "Contact for pricing"}
          </Text>

          <View style={styles.headerPillsRow}>
            {pkg.requiresApproval ? (
              <View
                style={[
                  styles.miniBadge,
                  styles.miniBadgeApproval,
                  isDark && {
                    backgroundColor: "rgba(59, 130, 246, 0.15)",
                    borderColor: "rgba(59, 130, 246, 0.3)",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.miniBadgeText,
                    styles.miniBadgeTextApproval,
                    isDark && { color: "#60A5FA" },
                  ]}
                >
                  Requires Approval
                </Text>
              </View>
            ) : pkg.requiresReservation ? (
              <View
                style={[
                  styles.miniBadge,
                  styles.miniBadgeReservation,
                  isDark && {
                    backgroundColor: "rgba(245, 158, 11, 0.15)",
                    borderColor: "rgba(245, 158, 11, 0.3)",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.miniBadgeText,
                    styles.miniBadgeTextReservation,
                    isDark && { color: "#FBBF24" },
                  ]}
                >
                  Requires Reservation
                </Text>
              </View>
            ) : (
              <View
                style={[
                  styles.miniBadge,
                  styles.miniBadgeNormal,
                  isDark && {
                    backgroundColor: "rgba(16, 185, 129, 0.15)",
                    borderColor: "rgba(16, 185, 129, 0.3)",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.miniBadgeText,
                    styles.miniBadgeTextNormal,
                    isDark && { color: "#34D399" },
                  ]}
                >
                  Normal Package
                </Text>
              </View>
            )}

            {pkg.features.length > 0 && (
              <View
                style={[
                  styles.featureCountBadge,
                  isDark && { backgroundColor: colors.cardSubtle },
                ]}
              >
                <Text
                  style={[
                    styles.featureCountText,
                    { color: colors.textSecondary },
                  ]}
                >
                  {pkg.features.length}{" "}
                  {pkg.features.length === 1 ? "feature" : "features"}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {(Boolean(pkg.description) || pkg.features.length > 0) && (
        <View
          style={[
            styles.packageBody,
            {
              backgroundColor: isDark ? colors.cardSubtle : "#FAFAFC",
              borderTopColor: colors.border,
            },
          ]}
        >
          {!!pkg.description && (
            <View style={styles.descriptionSection}>
              <Text
                style={[
                  styles.packageDescription,
                  { color: colors.textSecondary },
                ]}
              >
                {pkg.description}
              </Text>
            </View>
          )}

          {pkg.features.length > 0 && (
            <View
              style={[
                styles.featuresContainer,
                { borderTopColor: colors.border },
                !pkg.description && { borderTopWidth: 0, paddingTop: 0 },
              ]}
            >
              <View style={styles.featuresHeaderRow}>
                <Sparkles size={13} color="#FC7B54" />
                <Text style={[styles.featuresTitle, { color: colors.text }]}>
                  What{"'"}s Included
                </Text>
              </View>

              <View style={styles.featuresList}>
                {pkg.features.map((feature, index) => (
                  <View
                    key={`${pkg.id}-${feature}-${index}`}
                    style={styles.featureItem}
                  >
                    <View
                      style={[
                        styles.featureCheckCircle,
                        isDark && {
                          backgroundColor: "rgba(16, 185, 129, 0.2)",
                        },
                      ]}
                    >
                      <Check size={11} color="#059669" strokeWidth={3} />
                    </View>
                    <Text style={[styles.featureText, { color: colors.text }]}>
                      {feature}
                    </Text>
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
  const { colors, isDark } = useAppTheme();
  const vendorSession = getVendorSession();
  const params = useGlobalSearchParams<{
    id?: string;
    vendor_id?: string;
    vendorId?: string;
    email?: string;
    vendor_email?: string;
  }>();
  const [sections, setSections] = useState<ServiceWithPackages[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [expandedServiceIds, setExpandedServiceIds] = useState<
    Record<string, boolean>
  >({});

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
        vendorId ||
        (await loadVendorIdByEmail(vendorEmail)) ||
        readVendorIdFromCookie();
      if (!resolvedVendorId) {
        throw new Error("Could not resolve vendor id for packages.");
      }
      setVendorSession({
        vendorId: resolvedVendorId,
        email: vendorEmail || vendorSession.email,
      });

      const services = resolvedVendorId
        ? await loadServicesByVendor(resolvedVendorId)
        : await loadServicesFromSession(vendorEmail);
      const withPackages = await Promise.all(
        services.map(async (service) => {
          let packages: VendorPackage[] = [];
          try {
            packages = await loadPackagesByService(service.id);
          } catch {
            packages = [];
          }
          return { service, packages };
        }),
      );

      setSections(withPackages);
      setExpandedServiceIds({});
    } catch (error) {
      setSections([]);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load packages right now.",
      );
    } finally {
      setLoading(false);
    }
  }, [vendorEmail, vendorId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        loadData();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [loadData]);

  const toggleService = (serviceId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedServiceIds((prev) => ({
      ...prev,
      [serviceId]: !prev[serviceId],
    }));
  };

  if (loading) {
    return <ExploreSkeleton />;
  }

  if (errorMessage) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View
          style={[styles.centerState, { backgroundColor: colors.background }]}
        >
          <Text style={[styles.errorTitle, { color: colors.text }]}>
            Could not load packages
          </Text>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>
            {errorMessage}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={loadData}
            activeOpacity={0.8}
          >
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          Services & Packages
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Your services and their packages
        </Text>

        {sections.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No services yet
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Add services and packages to show them on this page.
            </Text>
          </View>
        ) : (
          sections.map((entry) => {
            const isServiceOpen = Boolean(expandedServiceIds[entry.service.id]);
            const packageCount = entry.packages.length;

            return (
              <View
                key={entry.service.id}
                style={[
                  styles.serviceCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  isServiceOpen && [
                    styles.serviceCardOpen,
                    { borderColor: colors.primary },
                  ],
                ]}
              >
                {/* Service Header Accordion Button */}
                <TouchableOpacity
                  style={styles.serviceHeader}
                  onPress={() => toggleService(entry.service.id)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isServiceOpen }}
                >
                  <View style={styles.serviceHeaderMain}>
                    <View style={styles.serviceBadgesRow}>
                      <View
                        style={[
                          styles.categoryBadge,
                          isDark && {
                            backgroundColor: "rgba(252, 123, 84, 0.15)",
                            borderColor: "rgba(252, 123, 84, 0.3)",
                          },
                        ]}
                      >
                        <Text style={styles.categoryBadgeText}>
                          {entry.service.category.toUpperCase()}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.packageCountBadge,
                          isDark && {
                            backgroundColor: colors.cardSubtle,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.packageCountBadgeText,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {packageCount}{" "}
                          {packageCount === 1 ? "Package" : "Packages"}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.serviceName, { color: colors.text }]}>
                      {entry.service.name}
                    </Text>

                    {Boolean(entry.service.description) && !isServiceOpen && (
                      <Text
                        style={[
                          styles.serviceDescriptionCollapsed,
                          { color: colors.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {entry.service.description}
                      </Text>
                    )}
                  </View>

                  <View
                    style={[
                      styles.serviceChevronCircle,
                      isDark && { backgroundColor: colors.cardSubtle },
                      isServiceOpen && [
                        styles.serviceChevronCircleOpen,
                        isDark && {
                          backgroundColor: "rgba(252, 123, 84, 0.2)",
                        },
                      ],
                    ]}
                  >
                    {isServiceOpen ? (
                      <ChevronUp size={20} color="#FC7B54" strokeWidth={2.5} />
                    ) : (
                      <ChevronDown
                        size={20}
                        color={colors.textSecondary}
                        strokeWidth={2.5}
                      />
                    )}
                  </View>
                </TouchableOpacity>

                {/* Expanded Service Content: Packages & Details */}
                {isServiceOpen && (
                  <View
                    style={[
                      styles.serviceBody,
                      { borderTopColor: colors.border },
                    ]}
                  >
                    {Boolean(entry.service.banner) && (
                      <ServiceBannerImage
                        uri={entry.service.banner!}
                        alt={entry.service.name}
                      />
                    )}

                    {Boolean(entry.service.description) && (
                      <Text
                        style={[
                          styles.serviceDescription,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {entry.service.description}
                      </Text>
                    )}

                    {entry.packages.length === 0 ? (
                      <View
                        style={[
                          styles.noPackagesBox,
                          {
                            backgroundColor: isDark
                              ? colors.cardSubtle
                              : "#F9FAFB",
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Package
                          size={20}
                          color={isDark ? "#64748B" : "#9CA3AF"}
                        />
                        <Text
                          style={[
                            styles.noPackagesText,
                            { color: colors.textSecondary },
                          ]}
                        >
                          No packages yet for this service.
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.packagesSection}>
                        <View style={styles.packagesSectionHeader}>
                          <Text
                            style={[
                              styles.packagesSectionTitle,
                              { color: colors.textSecondary },
                            ]}
                          >
                            Packages
                          </Text>
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
    backgroundColor: "#FFEFEB",
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
    backgroundColor: "#FFEFEB",
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
  serviceCard: {
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
  serviceCardOpen: {
    borderColor: "#FC7B54",
    borderWidth: 1.5,
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  serviceHeader: {
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  serviceHeaderMain: {
    flex: 1,
    marginRight: 12,
    alignItems: "flex-start",
  },
  serviceBadgesRow: {
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
  serviceName: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: "#111827",
    lineHeight: 24,
    textAlign: "left",
    alignSelf: "flex-start",
  },
  serviceDescriptionCollapsed: {
    marginTop: 4,
    fontFamily: "Montserrat_400Regular",
    fontSize: 12.5,
    color: "#6B7280",
    lineHeight: 18,
  },
  serviceChevronCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  serviceChevronCircleOpen: {
    backgroundColor: "#FFF3EE",
  },
  serviceBody: {
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
  serviceBanner: {
    width: "100%",
    height: "100%",
  },
  serviceDescription: {
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
