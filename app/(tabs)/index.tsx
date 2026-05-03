import { apiCredentials, graphQlUrl } from "@/lib/api-config";
import { getChatSocket } from "@/lib/chat-socket";
import { registerForPushNotificationsAsync } from "@/lib/push-notifications";
import { clearVendorSession, getVendorSession, setVendorSession } from "@/lib/vendor-session";
import { useFocusEffect } from "@react-navigation/native";
import { useGlobalSearchParams, useRouter } from "expo-router";
import { Bell, DollarSign, Eye, LogOut, Package, Users } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
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

type NotificationPreview = {
  id: string;
  type: "chat" | "reservation";
  chatId?: string;
  reservationId?: string;
  title: string;
  message: string;
  timestamp: string;
  senderType?: string;
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

const monthFull = (value: string) => {
  const parsedFromDate = new Date(value);
  if (!Number.isNaN(parsedFromDate.getTime())) {
    return parsedFromDate.toLocaleDateString("en-US", { month: "long" });
  }

  const parsedFromShort = new Date(`${value} 1, 2000`);
  if (!Number.isNaN(parsedFromShort.getTime())) {
    return parsedFromShort.toLocaleDateString("en-US", { month: "long" });
  }

  return value;
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

const loadUnreadMessageCount = async (vendorId: string): Promise<number> => {
  const data = await graphQlRequest<{
    getUnreadMessageCount?: number;
  }>(
    `
      query GetUnreadMessageCountForVendor($userId: String!, $userType: String!) {
        getUnreadMessageCount(userId: $userId, userType: $userType)
      }
    `,
    { userId: vendorId, userType: "vendor" },
  );

  return toNumber(data.getUnreadMessageCount, 0);
};

const getUnreadCountFromSocketPayload = (payload: unknown) => {
  if (typeof payload === "number" || typeof payload === "string") {
    return toNumber(payload, 0);
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    return toNumber(record.count ?? record.unreadCount ?? record.total, 0);
  }

  return 0;
};

const loadNotificationPreviews = async (vendorId: string): Promise<NotificationPreview[]> => {
  const data = await graphQlRequest<{
    getVendorChats?: Array<{
      chatId?: string;
      updatedAt?: string;
      messages?: Array<{
        content?: string;
        senderType?: string;
        timestamp?: string;
      }>;
    }>;
  }>(
    `
      query GetVendorNotificationPreviews($vendorId: String!) {
        getVendorChats(vendorId: $vendorId) {
          chatId
          updatedAt
          messages {
            content
            senderType
            timestamp
          }
        }
      }
    `,
    { vendorId },
  );

  const chats = Array.isArray(data.getVendorChats) ? data.getVendorChats : [];

  return chats
    .map((chat) => {
      const messages = Array.isArray(chat.messages) ? chat.messages : [];
      const latestFromVisitor = [...messages]
        .reverse()
        .find((msg) => toText(msg.senderType).toLowerCase() !== "vendor");
      return {
        id: `chat-${toText(chat.chatId)}`,
        type: "chat" as const,
        chatId: toText(chat.chatId),
        title: `Chat ${toText(chat.chatId).slice(0, 8)}`,
        message: toText(latestFromVisitor?.content, "New message"),
        senderType: toText(latestFromVisitor?.senderType),
        timestamp: toText(latestFromVisitor?.timestamp, toText(chat.updatedAt)),
      };
    })
    .filter((item) => !!item.chatId && toText(item.senderType).toLowerCase() !== "vendor")
    .sort((a, b) => {
      const aDate = new Date(a.timestamp).getTime();
      const bDate = new Date(b.timestamp).getTime();
      return (Number.isNaN(bDate) ? 0 : bDate) - (Number.isNaN(aDate) ? 0 : aDate);
    });
};

const loadReservationNotificationPreviews = async (
  vendorId: string,
): Promise<NotificationPreview[]> => {
  const data = await graphQlRequest<{
    vendorPayments?: Array<Record<string, unknown>>;
  }>(
    `
      query VendorReservationNotifications($vendorId: String!) {
        vendorPayments(vendorId: $vendorId) {
          id
          createdAt
          status
          visitor {
            visitor_fname
            visitor_lname
          }
          package {
            name
          }
        }
      }
    `,
    { vendorId },
  );

  const rows = Array.isArray(data.vendorPayments) ? data.vendorPayments : [];
  return rows
    .map((item) => {
      const visitor = (item.visitor as Record<string, unknown> | undefined) || {};
      const pkg = (item.package as Record<string, unknown> | undefined) || {};
      const firstName = toText(visitor.visitor_fname);
      const lastName = toText(visitor.visitor_lname);
      const visitorName = `${firstName} ${lastName}`.trim() || "A customer";
      const packageName = toText(pkg.name, "a package");
      const reservationId = toText(item.id);
      const status = toText(item.status, "pending").toUpperCase();

      return {
        id: `reservation-${reservationId}`,
        type: "reservation" as const,
        reservationId,
        title: "New Reservation",
        message: `${visitorName} reserved ${packageName} (${status})`,
        timestamp: toText(item.createdAt),
      };
    })
    .filter((item) => !!item.reservationId)
    .sort((a, b) => {
      const aDate = new Date(a.timestamp).getTime();
      const bDate = new Date(b.timestamp).getTime();
      return (Number.isNaN(bDate) ? 0 : bDate) - (Number.isNaN(aDate) ? 0 : aDate);
    });
};

const markChatAsRead = async (chatId: string, userId: string): Promise<void> => {
  await graphQlRequest<{
    markChatAsRead?: boolean;
  }>(
    `
      mutation MarkChatAsReadFromDashboard($chatId: String!, $userId: String!, $userType: String!) {
        markChatAsRead(chatId: $chatId, userId: $userId, userType: $userType)
      }
    `,
    { chatId, userId, userType: "vendor" },
  );
};

const formatNotificationTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const registerVendorPushToken = async (
  vendorId: string,
  pushToken: string,
): Promise<void> => {
  if (!vendorId || !pushToken) return;
  await graphQlRequest<{
    registerVendorPushToken?: boolean;
  }>(
    `
      mutation RegisterVendorPushToken($vendorId: String!, $pushToken: String!) {
        registerVendorPushToken(vendorId: $vendorId, pushToken: $pushToken)
      }
    `,
    { vendorId, pushToken },
  );
};

export default function Dashboard() {
  const router = useRouter();
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
  const [unreadCount, setUnreadCount] = useState(0);
  const [resolvedVendorId, setResolvedVendorId] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationPreviews, setNotificationPreviews] = useState<NotificationPreview[]>([]);
  const [markingReadChatId, setMarkingReadChatId] = useState("");
  const [dismissedPreviewReadAt, setDismissedPreviewReadAt] = useState<Record<string, number>>({});
  const [seenReservationIds, setSeenReservationIds] = useState<Record<string, true>>({});
  const [reservationUnreadCount, setReservationUnreadCount] = useState(0);
  const isCompactScreen = width < 390;
  const isWideScreen = width >= 860;
  const metricCardWidth = isWideScreen ? "24%" : "48.6%";
  const totalNotificationCount = unreadCount + reservationUnreadCount;

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
      setResolvedVendorId(resolvedVendorId);

      const [analyticsResult, paymentsResult, unreadResult] = await Promise.all([
        loadVendorAnalytics(resolvedVendorId),
        loadVendorPayments(resolvedVendorId),
        loadUnreadMessageCount(resolvedVendorId),
      ]);

      setAnalytics(analyticsResult);
      setPayments(paymentsResult);
      setUnreadCount(toNumber(unreadResult, 0));

      void (async () => {
        try {
          const pushToken = await registerForPushNotificationsAsync();
          if (pushToken) {
            await registerVendorPushToken(resolvedVendorId, pushToken);
          }
        } catch {
          // Push token registration failures should not block dashboard load.
        }
      })();
    } catch (error) {
      setAnalytics({ totalUniqueViews: 0, packagesAnalytics: [], monthlyViews: [] });
      setPayments([]);
      setUnreadCount(0);
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

  useEffect(() => {
    const socketVendorId = resolvedVendorId || vendorId || getVendorSession().vendorId || "";
    if (!socketVendorId) return;

    const socket = getChatSocket();
    if (!socket) return;

    const syncUnreadCount = async () => {
      try {
        const nextUnread = await loadUnreadMessageCount(socketVendorId);
        setUnreadCount(toNumber(nextUnread, 0));
      } catch {
        // Keep current badge if polling on connect fails.
      }
    };

    const handleConnect = () => {
      socket.emit("register", {
        userId: socketVendorId,
        userType: "vendor",
      });
      void syncUnreadCount();
    };

    const handleUnreadCount = (payload?: unknown) => {
      setUnreadCount(getUnreadCountFromSocketPayload(payload));
    };

    socket.on("connect", handleConnect);
    socket.on("unreadCount", handleUnreadCount);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("unreadCount", handleUnreadCount);
    };
  }, [resolvedVendorId, vendorId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const refreshUnreadCount = async () => {
        try {
          const resolvedVendorId =
            vendorId || (await loadVendorIdByEmail(vendorEmail)) || readVendorIdFromCookie();
          if (!resolvedVendorId || !active) return;
          const nextUnread = await loadUnreadMessageCount(resolvedVendorId);
          if (active) {
            setUnreadCount(toNumber(nextUnread, 0));
          }
        } catch {
          // Keep existing badge state on transient failures.
        }
      };

      void refreshUnreadCount();
      return () => {
        active = false;
      };
    }, [vendorEmail, vendorId]),
  );

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

  const refreshNotificationPreviews = useCallback(async () => {
    const targetVendorId = resolvedVendorId || vendorId || getVendorSession().vendorId || "";
    if (!targetVendorId) {
      setNotificationPreviews([]);
      setReservationUnreadCount(0);
      return;
    }

    setNotificationsLoading(true);
    try {
      const [chatResult, reservationResult] = await Promise.allSettled([
        loadNotificationPreviews(targetVendorId),
        loadReservationNotificationPreviews(targetVendorId),
      ]);
      const chatPreviews = chatResult.status === "fulfilled" ? chatResult.value : [];
      const reservationPreviews =
        reservationResult.status === "fulfilled" ? reservationResult.value : [];

      const filteredChatPreviews = chatPreviews.filter((item) => {
        const chatId = toText(item.chatId);
        if (!chatId) return false;
        const dismissedAt = dismissedPreviewReadAt[chatId];
        if (!dismissedAt) return true;
        const itemTime = new Date(item.timestamp).getTime();
        if (Number.isNaN(itemTime)) return false;
        return itemTime > dismissedAt;
      });

      const filteredReservationPreviews = reservationPreviews.filter((item) => {
        const reservationId = toText(item.reservationId);
        return !!reservationId && !seenReservationIds[reservationId];
      });

      setReservationUnreadCount(filteredReservationPreviews.length);
      setNotificationPreviews(
        [...filteredChatPreviews, ...filteredReservationPreviews].sort((a, b) => {
          const aDate = new Date(a.timestamp).getTime();
          const bDate = new Date(b.timestamp).getTime();
          return (Number.isNaN(bDate) ? 0 : bDate) - (Number.isNaN(aDate) ? 0 : aDate);
        }),
      );
    } catch {
      setNotificationPreviews([]);
      setReservationUnreadCount(0);
    } finally {
      setNotificationsLoading(false);
    }
  }, [dismissedPreviewReadAt, resolvedVendorId, seenReservationIds, vendorId]);

  const handleNotifications = () => {
    setNotificationsOpen(true);
    void refreshNotificationPreviews();
  };

  const handleOpenChatFromNotification = useCallback(
    (chatId: string) => {
      setNotificationsOpen(false);
      router.push({
        pathname: "/(tabs)/chat",
        params: { chatId },
      });
    },
    [router],
  );

  const handleMarkAsRead = useCallback(
    async (chatId: string, timestamp: string) => {
      const targetVendorId = resolvedVendorId || vendorId || getVendorSession().vendorId || "";
      if (!targetVendorId) return;

      setMarkingReadChatId(chatId);
      try {
        await markChatAsRead(chatId, targetVendorId);
        const markedAt = new Date(timestamp).getTime();
        setDismissedPreviewReadAt((current) => ({
          ...current,
          [chatId]: Number.isNaN(markedAt) ? Date.now() : markedAt,
        }));
        setNotificationPreviews((current) =>
          current.filter((item) => !(item.type === "chat" && item.chatId === chatId)),
        );
        setUnreadCount((current) => (current > 0 ? current - 1 : 0));
        const nextUnreadCount = await loadUnreadMessageCount(targetVendorId);
        setUnreadCount(toNumber(nextUnreadCount, 0));
      } catch {
        Alert.alert("Unable to mark as read", "Please try again.");
      } finally {
        setMarkingReadChatId("");
      }
    },
    [resolvedVendorId, vendorId],
  );

  const handleMarkReservationSeen = useCallback((reservationId: string) => {
    if (!reservationId) return;
    setSeenReservationIds((current) => ({
      ...current,
      [reservationId]: true,
    }));
    setReservationUnreadCount((current) => (current > 0 ? current - 1 : 0));
    setNotificationPreviews((current) =>
      current.filter((item) => !(item.type === "reservation" && item.reservationId === reservationId)),
    );
  }, []);

  useEffect(() => {
    if (!notificationsOpen) return;
    void refreshNotificationPreviews();
  }, [notificationsOpen, unreadCount, refreshNotificationPreviews]);

  useEffect(() => {
    const targetVendorId = resolvedVendorId || vendorId || getVendorSession().vendorId || "";
    if (!targetVendorId) return;

    void refreshNotificationPreviews();
    const timer = setInterval(() => {
      void refreshNotificationPreviews();
    }, 20000);

    return () => clearInterval(timer);
  }, [refreshNotificationPreviews, resolvedVendorId, vendorId]);

  const handleLogout = () => {
    clearVendorSession();
    setNotificationsOpen(false);
    router.replace("/login");
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
              {totalNotificationCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {totalNotificationCount > 99 ? "99+" : `${totalNotificationCount}`}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconButton, styles.exitButton]}
              onPress={handleLogout}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Log out"
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
            <Text style={styles.insightValue}>
              {peakMonth ? monthFull(peakMonth.month) : "--"}
            </Text>
            <Text style={styles.insightMeta}>
              {peakMonth
                ? `${analytics.totalUniqueViews} total veiws`
                : "No monthly data"}
            </Text>
            <Text style={styles.insightRevenue}>
              {peakMonth ? formatCurrency(revenueByMonth[peakMonth.month] || 0) : formatCurrency(0)}
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={notificationsOpen}
        onRequestClose={() => setNotificationsOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setNotificationsOpen(false)}>
          <Pressable style={styles.notificationModal} onPress={(event) => event.stopPropagation()}>
            <View style={styles.notificationHeader}>
              <Text style={styles.notificationTitle}>
                Notifications
                {totalNotificationCount > 0
                  ? ` (${totalNotificationCount > 99 ? "99+" : totalNotificationCount})`
                  : ""}
              </Text>
              <TouchableOpacity onPress={() => setNotificationsOpen(false)} activeOpacity={0.8}>
                <Text style={styles.notificationClose}>Close</Text>
              </TouchableOpacity>
            </View>

            {notificationsLoading ? (
              <View style={styles.notificationState}>
                <ActivityIndicator size="small" color="#FC7B54" />
              </View>
            ) : notificationPreviews.length ? (
              <ScrollView style={styles.notificationList} showsVerticalScrollIndicator={false}>
                {notificationPreviews.map((item) => {
                  const isChat = item.type === "chat";
                  const fromVisitor = toText(item.senderType).toLowerCase() !== "vendor";
                  return (
                    <View key={`${item.id}-${item.timestamp}`} style={styles.notificationItem}>
                      <Text style={styles.notificationItemTitle}>{item.title}</Text>
                      <Text style={styles.notificationItemMessage} numberOfLines={2}>
                        {item.message}
                      </Text>
                      <Text style={styles.notificationItemTime}>
                        {formatNotificationTime(item.timestamp)}
                      </Text>
                      <View style={styles.notificationActions}>
                        <TouchableOpacity
                          style={styles.notificationOpenButton}
                          onPress={() => {
                            if (item.chatId) {
                              handleOpenChatFromNotification(item.chatId);
                            } else {
                              setNotificationsOpen(false);
                              router.push("/(tabs)/resavations");
                            }
                          }}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.notificationOpenText}>
                            {isChat ? "Open Chat" : "Open Reservations"}
                          </Text>
                        </TouchableOpacity>
                        {isChat && fromVisitor && item.chatId && (
                          <TouchableOpacity
                            style={[
                              styles.notificationReadButton,
                              markingReadChatId === item.chatId &&
                                styles.notificationReadButtonDisabled,
                            ]}
                            onPress={() => handleMarkAsRead(item.chatId, item.timestamp)}
                            activeOpacity={0.85}
                            disabled={markingReadChatId === item.chatId}
                          >
                            <Text style={styles.notificationReadText}>
                              {markingReadChatId === item.chatId ? "Marking..." : "Mark as read"}
                            </Text>
                          </TouchableOpacity>
                        )}
                        {!isChat && item.reservationId && (
                          <TouchableOpacity
                            style={styles.notificationReadButton}
                            onPress={() => handleMarkReservationSeen(item.reservationId)}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.notificationReadText}>Mark as read</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.notificationState}>
                <Text style={styles.notificationEmpty}>No unread messages right now.</Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
    overflow: "visible",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: "#FFFFFF",
    zIndex: 3,
    elevation: 3,
  },
  badgeText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 10,
    color: "#FFFFFF",
    lineHeight: 12,
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
    backgroundColor: "#FFF8F3",
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.4)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: Platform.OS === "web" ? 70 : 58,
    paddingRight: 16,
  },
  notificationModal: {
    width: "92%",
    maxWidth: 360,
    maxHeight: 480,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EDF5",
    padding: 14,
  },
  notificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  notificationTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: "#1A2438",
  },
  notificationClose: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#FC7B54",
  },
  notificationList: {
    maxHeight: 390,
  },
  notificationItem: {
    borderWidth: 1,
    borderColor: "#E8EDF5",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    backgroundColor: "#FFFDFB",
  },
  notificationItemTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#5B6E8B",
  },
  notificationItemMessage: {
    marginTop: 4,
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#1F2937",
  },
  notificationItemTime: {
    marginTop: 6,
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: "#6B7280",
  },
  notificationActions: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  notificationOpenButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#EAF4FF",
  },
  notificationOpenText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#2563EB",
  },
  notificationReadButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#FFF1E8",
  },
  notificationReadButtonDisabled: {
    opacity: 0.55,
  },
  notificationReadText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#FC7B54",
  },
  notificationState: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationEmpty: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#6B7280",
  },
});
