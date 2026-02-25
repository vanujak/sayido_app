import { apiCredentials, graphQlUrl } from "@/lib/api-config";
import { getVendorSession, setVendorSession } from "@/lib/vendor-session";
import { useGlobalSearchParams } from "expo-router";
import { Bell, DollarSign, Eye, LogOut, Package, Users } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

type PackageAnalytics = {
  packageId: string;
  packageName: string;
  uniqueViews: number;
};

type MonthlyView = {
  month: string;
  views: number;
};

type VendorAnalytics = {
  totalUniqueViews: number;
  packagesAnalytics: PackageAnalytics[];
  monthlyViews: MonthlyView[];
};

type VendorPayment = {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  packageId: string;
};

const toText = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim() ? value : fallback;

const toNumber = (value: unknown, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const monthShort = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", { month: "short" });
};

const formatCurrency = (value: number) =>
  `LKR ${value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const graphQlRequest = async <TData>(
  query: string,
  variables: Record<string, unknown>,
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

  if (!response.ok || payload.errors?.length) {
    const message = payload.errors
      ?.map((entry) => entry.message)
      .filter((entry): entry is string => !!entry)
      .join(", ");
    throw new Error(message || `GraphQL request failed (${response.status})`);
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

const loadVendorAnalytics = async (vendorId: string): Promise<VendorAnalytics> => {
  const data = await graphQlRequest<{
    getVendorAnalytics?: {
      totalUniqueViews?: number;
      packagesAnalytics?: Array<{
        packageId?: string;
        packageName?: string;
        uniqueViews?: number;
      }>;
      monthlyViews?: Array<{ month?: string; views?: number }>;
    };
  }>(
    `
      query GetVendorAnalytics($vendorId: String!) {
        getVendorAnalytics(vendorId: $vendorId) {
          totalUniqueViews
          packagesAnalytics {
            packageId
            packageName
            uniqueViews
          }
          monthlyViews {
            month
            views
          }
        }
      }
    `,
    { vendorId },
  );

  const analytics = data.getVendorAnalytics;
  return {
    totalUniqueViews: toNumber(analytics?.totalUniqueViews, 0),
    packagesAnalytics: Array.isArray(analytics?.packagesAnalytics)
      ? analytics.packagesAnalytics.map((item) => ({
          packageId: toText(item.packageId),
          packageName: toText(item.packageName, "Package"),
          uniqueViews: toNumber(item.uniqueViews, 0),
        }))
      : [],
    monthlyViews: Array.isArray(analytics?.monthlyViews)
      ? analytics.monthlyViews
          .map((item) => ({
            month: toText(item.month),
            views: toNumber(item.views, 0),
          }))
          .filter((item) => !!item.month)
      : [],
  };
};

const loadVendorPayments = async (vendorId: string): Promise<VendorPayment[]> => {
  const data = await graphQlRequest<{
    vendorPayments?: Array<Record<string, unknown>>;
  }>(
    `
      query VendorPaymentsForDashboard($vendorId: String!) {
        vendorPayments(vendorId: $vendorId) {
          id
          amount
          status
          createdAt
          package {
            id
          }
        }
      }
    `,
    { vendorId },
  );

  const rows = Array.isArray(data.vendorPayments) ? data.vendorPayments : [];
  return rows
    .map((item) => {
      const pkg = (item.package as Record<string, unknown> | undefined) || {};
      return {
        id: toText(item.id),
        amount: toNumber(item.amount, 0),
        status: toText(item.status, "pending").toLowerCase(),
        createdAt: toText(item.createdAt),
        packageId: toText(pkg.id),
      };
    })
    .filter((item) => !!item.id);
};

export default function Dashboard() {
  const { width } = useWindowDimensions();
  const vendorSession = getVendorSession();
  const params = useGlobalSearchParams<{
    id?: string;
    vendor_id?: string;
    vendorId?: string;
    email?: string;
    vendor_email?: string;
    fname?: string;
    lname?: string;
  }>();

  const [analytics, setAnalytics] = useState<VendorAnalytics>({
    totalUniqueViews: 0,
    packagesAnalytics: [],
    monthlyViews: [],
  });
  const [payments, setPayments] = useState<VendorPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const isCompactScreen = width < 390;
  const isWideScreen = width >= 860;
  const metricCardWidth = isWideScreen ? "24%" : "48.6%";

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

  const vendorName = `${toText(params.fname, "Vendor")} ${toText(params.lname)}`.trim();

  const loadDashboardData = useCallback(async () => {
    setErrorMessage("");
    try {
      const resolvedVendorId =
        vendorId || (await loadVendorIdByEmail(vendorEmail)) || readVendorIdFromCookie();
      if (!resolvedVendorId) {
        throw new Error("Could not resolve vendor id for analytics.");
      }

      setVendorSession({
        vendorId: resolvedVendorId,
        email: vendorEmail || vendorSession.email,
      });

      const [analyticsResult, paymentsResult] = await Promise.all([
        loadVendorAnalytics(resolvedVendorId),
        loadVendorPayments(resolvedVendorId),
      ]);

      setAnalytics(analyticsResult);
      setPayments(paymentsResult);
    } catch (error) {
      setAnalytics({ totalUniqueViews: 0, packagesAnalytics: [], monthlyViews: [] });
      setPayments([]);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load dashboard analytics.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [vendorEmail, vendorId, vendorSession.email]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDashboardData();
  }, [loadDashboardData]);

  const completedPayments = useMemo(
    () => payments.filter((payment) => payment.status === "completed"),
    [payments],
  );
  const totalRevenue = useMemo(
    () => completedPayments.reduce((sum, payment) => sum + payment.amount, 0),
    [completedPayments],
  );
  const totalBookings = completedPayments.length;
  const totalPackages = useMemo(() => analytics.packagesAnalytics.length, [analytics.packagesAnalytics]);

  const revenueByPackage = useMemo(() => {
    return completedPayments.reduce<Record<string, number>>((acc, payment) => {
      if (!payment.packageId) return acc;
      acc[payment.packageId] = (acc[payment.packageId] || 0) + payment.amount;
      return acc;
    }, {});
  }, [completedPayments]);

  const revenueByMonth = useMemo(() => {
    return completedPayments.reduce<Record<string, number>>((acc, payment) => {
      const month = monthShort(payment.createdAt);
      if (!month) return acc;
      acc[month] = (acc[month] || 0) + payment.amount;
      return acc;
    }, {});
  }, [completedPayments]);

  const topPackage = useMemo(() => {
    if (analytics.packagesAnalytics.length === 0) return null;
    return [...analytics.packagesAnalytics].sort((a, b) => b.uniqueViews - a.uniqueViews)[0];
  }, [analytics.packagesAnalytics]);

  const peakMonth = useMemo(() => {
    if (analytics.monthlyViews.length === 0) return null;
    return analytics.monthlyViews.reduce((max, item) => {
      if (!max) return item;
      return item.views > max.views ? item : max;
    }, analytics.monthlyViews[0]);
  }, [analytics.monthlyViews]);

  const metricCards = useMemo(
    () => [
      {
        key: "views",
        label: "Total Views",
        value: `${analytics.totalUniqueViews}`,
        icon: Eye,
        iconColor: "#3B82F6",
      },
      {
        key: "bookings",
        label: "Total Bookings",
        value: `${totalBookings}`,
        icon: Users,
        iconColor: "#22C55E",
      },
      {
        key: "revenue",
        label: "Total Revenue",
        value: formatCurrency(totalRevenue),
        icon: DollarSign,
        iconColor: "#F97316",
      },
      {
        key: "packages",
        label: "Packages",
        value: `${totalPackages}`,
        icon: Package,
        iconColor: "#14B8A6",
      },
    ],
    [analytics.totalUniqueViews, totalBookings, totalPackages, totalRevenue],
  );

  const handleNotifications = () => {
    Alert.alert("Notifications", "No new notifications right now.");
  };

  const handleExitApp = () => {
    if (Platform.OS === "android") {
      Alert.alert("Exit App", "Do you want to close the app?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Exit",
          style: "destructive",
          onPress: () => BackHandler.exitApp(),
        },
      ]);
      return;
    }

    Alert.alert("Exit App", "App exit is only supported on Android.");
  };

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color="#FC7B54" />
        <Text style={styles.stateText}>Loading analytics...</Text>
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.errorTitle}>Could not load dashboard</Text>
        <Text style={styles.errorText}>{errorMessage}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadDashboardData} activeOpacity={0.85}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.decorationTop} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View>
            <View style={styles.welcomePill}>
              <Text style={styles.welcomePillText}>Welcome back</Text>
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {vendorName}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleNotifications}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
            >
              <Bell size={18} color="#1A2438" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconButton, styles.exitButton]}
              onPress={handleExitApp}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Exit app"
            >
              <LogOut size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.metricGrid}>
          {metricCards.map((card) => {
            const Icon = card.icon;
            const isRevenueCard = card.key === "revenue";
            const revenueAmount = totalRevenue.toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            });
            return (
              <View
                key={card.key}
                style={[
                  styles.metricCard,
                  { width: metricCardWidth, minHeight: isCompactScreen ? 184 : 198 },
                ]}
              >
                <View style={styles.metricHeader}>
                  <Text style={styles.metricLabel}>{card.label}</Text>
                  <Icon size={22} color={card.iconColor} strokeWidth={2.1} />
                </View>
                {isRevenueCard ? (
                  <View style={styles.revenueValueBlock}>
                    <Text
                      style={styles.revenueCurrency}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.65}
                    >
                      LKR
                    </Text>
                    <Text
                      style={styles.revenueAmount}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.45}
                    >
                      {revenueAmount}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.metricValue}>{card.value}</Text>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.insightRow}>
          <View style={styles.insightCard}>
            <Text style={styles.insightTitle}>Top Package</Text>
            <Text style={styles.insightValue} numberOfLines={1}>
              {topPackage?.packageName || "No data"}
            </Text>
            <Text style={styles.insightMeta}>
              {topPackage ? `${topPackage.uniqueViews} views` : "Track views to unlock"}
            </Text>
            <Text style={styles.insightRevenue}>
              {topPackage ? formatCurrency(revenueByPackage[topPackage.packageId] || 0) : formatCurrency(0)}
            </Text>
          </View>

          <View style={styles.insightCard}>
            <Text style={styles.insightTitle}>Peak Month</Text>
            <Text style={styles.insightValue}>{peakMonth?.month || "--"}</Text>
            <Text style={styles.insightMeta}>
              {peakMonth ? `${peakMonth.views} views` : "No monthly data"}
            </Text>
            <Text style={styles.insightRevenue}>
              {peakMonth ? formatCurrency(revenueByMonth[peakMonth.month] || 0) : formatCurrency(0)}
            </Text>
          </View>
        </View>
      </ScrollView>
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
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: Platform.OS === "web" ? 24 : 12,
    paddingBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E8EDF5",
  },
  exitButton: {
    backgroundColor: "#1F2D48",
    borderColor: "#1F2D48",
  },
  title: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 18,
    color: "#5A6A82",
  },
  welcomePill: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E3EAF5",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 8,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  welcomePillText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: "#5B6E8B",
    letterSpacing: 0.2,
  },
  name: {
    fontFamily: "Outfit_700Bold",
    fontSize: 44,
    lineHeight: 48,
    color: "#1A2438",
    letterSpacing: 0.2,
    maxWidth: 220,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  metricCard: {
    width: "48.6%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E8EDF5",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    marginBottom: 10,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
  metricHeader: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metricLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 16,
    lineHeight: 20,
    color: "#607089",
  },
  metricValue: {
    fontFamily: "Outfit_700Bold",
    fontSize: 52,
    lineHeight: 56,
    color: "#0F2342",
    marginTop: 26,
  },
  metricValueSmall: {
    fontFamily: "Outfit_700Bold",
    fontSize: 40,
    lineHeight: 44,
    color: "#0F2342",
    marginTop: 26,
  },
  revenueValueBlock: {
    marginTop: 20,
    width: "100%",
  },
  revenueCurrency: {
    fontFamily: "Outfit_700Bold",
    fontSize: 46,
    lineHeight: 48,
    color: "#0F2342",
    includeFontPadding: false,
  },
  revenueAmount: {
    fontFamily: "Outfit_700Bold",
    fontSize: 56,
    lineHeight: 58,
    color: "#0F2342",
    marginTop: -2,
    includeFontPadding: false,
  },
  insightRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    flex: 1,
  },
  insightCard: {
    width: "48.6%",
    backgroundColor: "#1C2A43",
    borderRadius: 18,
    padding: 14,
    justifyContent: "space-between",
  },
  insightTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#AFC2E3",
  },
  insightValue: {
    fontFamily: "Outfit_700Bold",
    fontSize: 20,
    color: "#FFFFFF",
    marginTop: 2,
  },
  insightMeta: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: "#C4D3EC",
    marginTop: 2,
  },
  insightRevenue: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: "#FCB08A",
    marginTop: 6,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#ECF0F7",
  },
  stateText: {
    marginTop: 10,
    color: "#5A6A82",
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
});
