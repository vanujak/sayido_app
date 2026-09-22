import { apiCredentials, graphQlUrl } from "@/lib/api-config";
import { getChatSocket } from "@/lib/chat-socket";
import {
  getNotificationReadState,
  setNotificationReadState,
  getInAppNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  subscribeToNotifications,
} from "@/lib/in-app-notifications";
import { registerForPushNotificationsAsync } from "@/lib/push-notifications";
import { getVendorSession, setVendorSession } from "@/lib/vendor-session";
import { formatCoupleName } from "@/lib/formatCoupleName";
import { useFocusEffect, useGlobalSearchParams, useRouter } from "expo-router";
import { Bell, DollarSign, Eye, Package, Users } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardSkeleton, NotificationListSkeleton } from "@/components/ui/skeletons";
import { useAppTheme } from "@/context/ThemeContext";
import {
  Alert,
  BackHandler,
  Modal,
  Platform,
  Pressable,
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
  type: "chat" | "reservation" | "approval";
  chatId?: string;
  reservationId?: string;
  approvalRequestId?: string;
  inAppNotificationId?: string;
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

const graphQlRequest = async <TData,>(
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

const loadVendorProfile = async (
  vendorId: string,
): Promise<{
  fname?: string;
  lname?: string;
  busname?: string;
} | null> => {
  if (!vendorId) return null;
  try {
    const data = await graphQlRequest<{
      findVendorById?: {
        id?: string;
        fname?: string;
        lname?: string;
        busname?: string;
      } | null;
    }>(
      `
        query GetVendorProfileForDashboard($id: String!) {
          findVendorById(id: $id) {
            id
            fname
            lname
            busname
          }
        }
      `,
      { id: vendorId },
    );
    return data.findVendorById || null;
  } catch {
    return null;
  }
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
            partner_fname
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
    .filter((item) => toText(item.status).toLowerCase() !== "failed")
    .map((item) => {
      const visitor = (item.visitor as Record<string, unknown> | undefined) || {};
      const pkg = (item.package as Record<string, unknown> | undefined) || {};
      const visitorName = formatCoupleName(
        {
          visitor_fname: toText(visitor.visitor_fname),
          visitor_lname: toText(visitor.visitor_lname),
          partner_fname: toText(visitor.partner_fname),
        },
        "A customer"
      );
      const packageName = toText(pkg.name, "a package");
      const reservationId = toText(item.id);

      return {
        id: `reservation-${reservationId}`,
        type: "reservation" as const,
        reservationId,
        title: "New Booking",
        message: `${visitorName} booked ${packageName}`,
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

const loadApprovalNotificationPreviews = async (
  vendorId: string,
): Promise<NotificationPreview[]> => {
  try {
    const data = await graphQlRequest<{
      getVendorApprovalRequests?: Array<Record<string, unknown>>;
    }>(
      `
        query VendorApprovalNotifications($vendorId: String!) {
          getVendorApprovalRequests(vendorId: $vendorId) {
            id
            createdAt
            status
            bookingDate
            visitor {
              visitor_fname
              visitor_lname
              partner_fname
            }
            package {
              name
            }
          }
        }
      `,
      { vendorId },
    );

    const rows = Array.isArray(data.getVendorApprovalRequests) ? data.getVendorApprovalRequests : [];
    return rows
      .filter((item) => toText(item.status).toLowerCase() === "pending")
      .map((item) => {
        const visitor = (item.visitor as Record<string, unknown> | undefined) || {};
        const pkg = (item.package as Record<string, unknown> | undefined) || {};
        const visitorName = formatCoupleName(
          {
            visitor_fname: toText(visitor.visitor_fname),
            visitor_lname: toText(visitor.visitor_lname),
            partner_fname: toText(visitor.partner_fname),
          },
          "A couple"
        );
        const packageName = toText(pkg.name, "a package");
        const approvalRequestId = toText(item.id);
        const bookingDate = toText(item.bookingDate);

        return {
          id: `approval-${approvalRequestId}`,
          type: "approval" as const,
          approvalRequestId,
          title: "Approval Request",
          message: `${visitorName} requested booking for ${packageName} on ${bookingDate}`,
          timestamp: toText(item.createdAt),
        };
      })
      .filter((item) => !!item.approvalRequestId)
      .sort((a, b) => {
        const aDate = new Date(a.timestamp).getTime();
        const bDate = new Date(b.timestamp).getTime();
        return (Number.isNaN(bDate) ? 0 : bDate) - (Number.isNaN(aDate) ? 0 : aDate);
      });
  } catch {
    return [];
  }
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
  const { colors, isDark } = useAppTheme();
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
  const [errorMessage, setErrorMessage] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [resolvedVendorId, setResolvedVendorId] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationPreviews, setNotificationPreviews] = useState<NotificationPreview[]>([]);
  const [markingReadChatId, setMarkingReadChatId] = useState("");
  const [dismissedPreviewReadAt, setDismissedPreviewReadAt] = useState<Record<string, number>>({});
  const [seenReservationIds, setSeenReservationIds] = useState<Record<string, true>>({});
  const [seenApprovalIds, setSeenApprovalIds] = useState<Record<string, true>>({});
  const [reservationUnreadCount, setReservationUnreadCount] = useState(0);
  const [approvalUnreadCount, setApprovalUnreadCount] = useState(0);
  const [vendorProfile, setVendorProfile] = useState<{
    fname?: string;
    lname?: string;
    busname?: string;
  } | null>(null);
  const isCompactScreen = width < 390;
  const isWideScreen = width >= 860;
  const metricCardWidth = isWideScreen ? "24%" : "48.6%";
  const totalNotificationCount = notificationPreviews.length;

  // Handle phone hardware back button on root dashboard
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (notificationsOpen) {
          setNotificationsOpen(false);
          return true;
        }
        BackHandler.exitApp();
        return true;
      };
      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => subscription.remove();
    }, [notificationsOpen])
  );

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
  const notificationStateVendorId = resolvedVendorId || vendorId || vendorSession.vendorId || "";

  const firstName =
    vendorProfile?.fname?.trim() ||
    toText(params.fname).trim() ||
    "";
  const vendorName = firstName || "Vendor";

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

      const [analyticsResult, paymentsResult, unreadResult, profileResult] = await Promise.all([
        loadVendorAnalytics(resolvedVendorId),
        loadVendorPayments(resolvedVendorId),
        loadUnreadMessageCount(resolvedVendorId),
        loadVendorProfile(resolvedVendorId),
      ]);

      setAnalytics(analyticsResult);
      setPayments(paymentsResult);
      setUnreadCount(toNumber(unreadResult, 0));
      if (profileResult) {
        setVendorProfile(profileResult);
      }

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
    }
  }, [vendorEmail, vendorId, vendorSession.email]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    const readState = getNotificationReadState(notificationStateVendorId);
    setDismissedPreviewReadAt(readState.dismissedPreviewReadAt);
    setSeenReservationIds(readState.seenReservationIds);
    setSeenApprovalIds(readState.seenApprovalIds || {});
  }, [notificationStateVendorId]);

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

      const refreshDashboardSummary = async () => {
        try {
          const resolvedVendorId =
            vendorId || (await loadVendorIdByEmail(vendorEmail)) || readVendorIdFromCookie();
          if (!resolvedVendorId || !active) return;
          const [nextUnread, nextProfile] = await Promise.all([
            loadUnreadMessageCount(resolvedVendorId),
            loadVendorProfile(resolvedVendorId),
          ]);
          if (active) {
            setUnreadCount(toNumber(nextUnread, 0));
            if (nextProfile) {
              setVendorProfile(nextProfile);
            }
          }
        } catch {
          // Keep existing state on transient failures.
        }
      };

      void refreshDashboardSummary();
      return () => {
        active = false;
      };
    }, [vendorEmail, vendorId]),
  );

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
      setApprovalUnreadCount(0);
      return;
    }

    setNotificationsLoading(true);
    try {
      const currentReadState = getNotificationReadState(targetVendorId);
      const currentSeenReservations = { ...seenReservationIds, ...currentReadState.seenReservationIds };
      const currentSeenApprovals = { ...seenApprovalIds, ...(currentReadState.seenApprovalIds || {}) };
      const currentDismissedPreview = { ...dismissedPreviewReadAt, ...currentReadState.dismissedPreviewReadAt };

      const [chatResult, reservationResult, approvalResult, unreadResult] = await Promise.allSettled([
        loadNotificationPreviews(targetVendorId),
        loadReservationNotificationPreviews(targetVendorId),
        loadApprovalNotificationPreviews(targetVendorId),
        loadUnreadMessageCount(targetVendorId),
      ]);
      const chatPreviews = chatResult.status === "fulfilled" ? chatResult.value : [];
      const reservationPreviews =
        reservationResult.status === "fulfilled" ? reservationResult.value : [];
      const approvalPreviews =
        approvalResult.status === "fulfilled" ? approvalResult.value : [];
      const latestUnreadCount = unreadResult.status === "fulfilled" ? toNumber(unreadResult.value) : unreadCount;

      const filteredChatPreviews =
        latestUnreadCount > 0
          ? chatPreviews.filter((item) => {
              const chatId = toText(item.chatId);
              if (!chatId) return false;
              const dismissedAt = currentDismissedPreview[chatId];
              if (!dismissedAt) return true;
              const itemTime = new Date(item.timestamp).getTime();
              if (Number.isNaN(itemTime)) return false;
              return itemTime > dismissedAt;
            })
          : [];
      setUnreadCount(filteredChatPreviews.length ? latestUnreadCount : 0);

      const filteredReservationPreviews = reservationPreviews.filter((item) => {
        const reservationId = toText(item.reservationId);
        return !!reservationId && !currentSeenReservations[reservationId];
      });

      const filteredApprovalPreviews = approvalPreviews.filter((item) => {
        const approvalRequestId = toText(item.approvalRequestId);
        return !!approvalRequestId && !currentSeenApprovals[approvalRequestId];
      });

      // Load push notifications received via Firebase / Expo
      const inAppList = getInAppNotifications(targetVendorId);
      const unreadInAppPreviews: NotificationPreview[] = inAppList
        .filter(
          (item) =>
            !item.read &&
            item.data?.status !== "failed" &&
            !item.body?.toLowerCase().includes("(failed)")
        )
        .map((item) => {
          const notifType =
            item.data?.type === "chat_message"
              ? ("chat" as const)
              : item.data?.type === "package_approval_request"
              ? ("approval" as const)
              : item.data?.type === "package_purchase"
              ? ("reservation" as const)
              : ("chat" as const);
          return {
            id: item.id,
            inAppNotificationId: item.id,
            type: notifType,
            chatId: toText(item.data?.chatId),
            reservationId: toText(item.data?.paymentId || item.data?.reservationId),
            approvalRequestId: toText(item.data?.requestId || item.data?.approvalRequestId),
            title: item.title,
            message: item.body,
            timestamp: item.receivedAt,
          };
        });

      // Deduplicate: merge in-app push notifications and polled previews
      const seenKeys = new Set<string>();
      const combined: NotificationPreview[] = [];

      for (const item of [
        ...unreadInAppPreviews,
        ...filteredChatPreviews,
        ...filteredReservationPreviews,
        ...filteredApprovalPreviews,
      ]) {
        const dedupeKey = item.inAppNotificationId
          ? `inapp-${item.inAppNotificationId}`
          : item.reservationId
          ? `reservation-${item.reservationId}`
          : item.approvalRequestId
          ? `approval-${item.approvalRequestId}`
          : item.chatId
          ? `chat-${item.chatId}`
          : item.id;

        if (!seenKeys.has(dedupeKey)) {
          seenKeys.add(dedupeKey);
          combined.push(item);
        }
      }

      combined.sort((a, b) => {
        const aDate = new Date(a.timestamp).getTime();
        const bDate = new Date(b.timestamp).getTime();
        return (Number.isNaN(bDate) ? 0 : bDate) - (Number.isNaN(aDate) ? 0 : aDate);
      });

      setReservationUnreadCount(filteredReservationPreviews.length);
      setApprovalUnreadCount(filteredApprovalPreviews.length);
      setNotificationPreviews(combined);
    } catch {
      setNotificationPreviews([]);
      setReservationUnreadCount(0);
      setApprovalUnreadCount(0);
    } finally {
      setNotificationsLoading(false);
    }
  }, [dismissedPreviewReadAt, resolvedVendorId, seenReservationIds, seenApprovalIds, unreadCount, vendorId]);

  const handleNotifications = useCallback(() => {
    setNotificationsOpen((prev) => {
      const next = !prev;
      if (next) {
        void refreshNotificationPreviews();
      }
      return next;
    });
  }, [refreshNotificationPreviews]);

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
    async (chatId: string, timestamp: string, inAppNotificationId?: string) => {
      const targetVendorId = resolvedVendorId || vendorId || getVendorSession().vendorId || "";
      if (!targetVendorId) return;

      if (inAppNotificationId) {
        markNotificationAsRead(targetVendorId, inAppNotificationId);
      }

      setMarkingReadChatId(chatId);
      try {
        if (chatId) {
          await markChatAsRead(chatId, targetVendorId);
        }
        const markedAt = new Date(timestamp).getTime();
        const dismissedAt = Number.isNaN(markedAt) ? Date.now() : markedAt;
        setDismissedPreviewReadAt((current) => ({
          ...current,
          [chatId]: dismissedAt,
        }));
        setNotificationReadState(targetVendorId, {
          dismissedPreviewReadAt: {
            [chatId]: dismissedAt,
          },
        });
        setNotificationPreviews((current) =>
          current.filter(
            (item) =>
              !(
                (item.type === "chat" && item.chatId === chatId) ||
                (inAppNotificationId && item.inAppNotificationId === inAppNotificationId)
              ),
          ),
        );
        setUnreadCount((current) => (current > 0 ? current - 1 : 0));
      } catch {
        Alert.alert("Unable to mark as read", "Please try again.");
      } finally {
        setMarkingReadChatId("");
      }
    },
    [resolvedVendorId, vendorId],
  );

  const handleMarkReservationSeen = useCallback(
    (reservationId: string, inAppNotificationId?: string) => {
      if (!reservationId && !inAppNotificationId) return;
      const targetVendorId = notificationStateVendorId || getVendorSession().vendorId || "";

      if (inAppNotificationId && targetVendorId) {
        markNotificationAsRead(targetVendorId, inAppNotificationId);
      }

      if (reservationId) {
        setSeenReservationIds((current) => ({
          ...current,
          [reservationId]: true,
        }));
        if (targetVendorId) {
          setNotificationReadState(targetVendorId, {
            seenReservationIds: {
              [reservationId]: true,
            },
          });
        }
      }

      setReservationUnreadCount((current) => (current > 0 ? current - 1 : 0));
      setNotificationPreviews((current) =>
        current.filter(
          (item) =>
            !(
              (item.type === "reservation" && item.reservationId === reservationId) ||
              (inAppNotificationId && item.inAppNotificationId === inAppNotificationId)
            ),
        ),
      );
    },
    [notificationStateVendorId],
  );

  const handleMarkApprovalSeen = useCallback(
    (approvalRequestId: string, inAppNotificationId?: string) => {
      if (!approvalRequestId && !inAppNotificationId) return;
      const targetVendorId = notificationStateVendorId || getVendorSession().vendorId || "";

      if (inAppNotificationId && targetVendorId) {
        markNotificationAsRead(targetVendorId, inAppNotificationId);
      }

      if (approvalRequestId) {
        setSeenApprovalIds((current) => ({
          ...current,
          [approvalRequestId]: true,
        }));
        if (targetVendorId) {
          setNotificationReadState(targetVendorId, {
            seenApprovalIds: {
              [approvalRequestId]: true,
            },
          });
        }
      }

      setApprovalUnreadCount((current) => (current > 0 ? current - 1 : 0));
      setNotificationPreviews((current) =>
        current.filter(
          (item) =>
            !(
              (item.type === "approval" && item.approvalRequestId === approvalRequestId) ||
              (inAppNotificationId && item.inAppNotificationId === inAppNotificationId)
            ),
        ),
      );
    },
    [notificationStateVendorId],
  );

  const handleMarkAllRead = useCallback(() => {
    const targetVendorId = resolvedVendorId || vendorId || getVendorSession().vendorId || "";
    if (!targetVendorId) return;

    markAllNotificationsAsRead(targetVendorId);

    const now = Date.now();
    const nextSeenReservations: Record<string, true> = { ...seenReservationIds };
    const nextSeenApprovals: Record<string, true> = { ...seenApprovalIds };
    const nextDismissedChat: Record<string, number> = { ...dismissedPreviewReadAt };

    notificationPreviews.forEach((item) => {
      if (item.reservationId) {
        nextSeenReservations[item.reservationId] = true;
      }
      if (item.approvalRequestId) {
        nextSeenApprovals[item.approvalRequestId] = true;
      }
      if (item.chatId) {
        nextDismissedChat[item.chatId] = now;
      }
    });

    setSeenReservationIds(nextSeenReservations);
    setSeenApprovalIds(nextSeenApprovals);
    setDismissedPreviewReadAt(nextDismissedChat);
    setNotificationReadState(targetVendorId, {
      seenReservationIds: nextSeenReservations,
      seenApprovalIds: nextSeenApprovals,
      dismissedPreviewReadAt: nextDismissedChat,
    });

    setNotificationPreviews([]);
    setUnreadCount(0);
    setReservationUnreadCount(0);
    setApprovalUnreadCount(0);
  }, [dismissedPreviewReadAt, notificationPreviews, resolvedVendorId, seenApprovalIds, seenReservationIds, vendorId]);

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

  useEffect(() => {
    const unsubscribe = subscribeToNotifications(() => {
      const targetVendorId = resolvedVendorId || vendorId || getVendorSession().vendorId || "";
      if (targetVendorId) {
        const readState = getNotificationReadState(targetVendorId);
        setDismissedPreviewReadAt(readState.dismissedPreviewReadAt);
        setSeenReservationIds(readState.seenReservationIds);
        setSeenApprovalIds(readState.seenApprovalIds || {});
      }
      void refreshNotificationPreviews();
    });
    return () => unsubscribe();
  }, [refreshNotificationPreviews, resolvedVendorId, vendorId]);

  if (loading) {
    return <DashboardSkeleton />;
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
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <View style={styles.headerTitleContainer}>
            <View style={[styles.welcomePill, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.welcomePillText, { color: colors.textSecondary }]}>Welcome back</Text>
            </View>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {vendorName}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={handleNotifications}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
            >
              <Bell size={20} color={colors.text} />
              {totalNotificationCount > 0 && (
                <View style={styles.badge} pointerEvents="none">
                  <Text style={styles.badgeText}>
                    {totalNotificationCount > 99 ? "99+" : `${totalNotificationCount}`}
                  </Text>
                </View>
              )}
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
                  {
                    width: metricCardWidth,
                    minHeight: isCompactScreen ? 134 : 144,
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.metricHeader}>
                  <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{card.label}</Text>
                  <Icon size={20} color={card.iconColor} strokeWidth={2.1} />
                </View>
                {isRevenueCard ? (
                  <View style={styles.revenueValueBlock}>
                    <Text
                      style={[styles.revenueCurrency, { color: colors.textSecondary }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.65}
                    >
                      LKR
                    </Text>
                    <Text
                      style={[styles.revenueAmount, { color: colors.text }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.45}
                    >
                      {revenueAmount}
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.metricValue, { color: colors.text }]}>{card.value}</Text>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.insightRow}>
          <View style={[styles.insightCard, { backgroundColor: colors.insightCardBg }]}>
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

          <View style={[styles.insightCard, { backgroundColor: colors.insightCardBg }]}>
            <Text style={styles.insightTitle}>Peak Month</Text>
            <Text style={styles.insightValue}>
              {peakMonth ? monthFull(peakMonth.month) : "--"}
            </Text>
            <Text style={styles.insightMeta}>
              {peakMonth
                ? `${analytics.totalUniqueViews} total views`
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
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setNotificationsOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close notifications backdrop"
          />
          <View
            style={[
              styles.notificationModal,
              { backgroundColor: colors.cardElevated, borderColor: colors.border },
            ]}
          >
            <View style={styles.notificationHeader}>
              <Text style={[styles.notificationTitle, { color: colors.text }]}>
                Notifications
                {totalNotificationCount > 0
                  ? ` (${totalNotificationCount > 99 ? "99+" : totalNotificationCount})`
                  : ""}
              </Text>
              <View style={styles.notificationHeaderActions}>
                {totalNotificationCount > 0 && (
                  <TouchableOpacity onPress={handleMarkAllRead} activeOpacity={0.8}>
                    <Text style={styles.notificationMarkAll}>Mark all read</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setNotificationsOpen(false)} activeOpacity={0.8}>
                  <Text style={[styles.notificationClose, { color: colors.primary }]}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>

            {notificationsLoading ? (
              <NotificationListSkeleton />
            ) : notificationPreviews.length ? (
              <ScrollView style={styles.notificationList} showsVerticalScrollIndicator={false}>
                {notificationPreviews.map((item) => {
                  const isChat = item.type === "chat";
                  const isApproval = item.type === "approval";
                  const fromVisitor = toText(item.senderType).toLowerCase() !== "vendor";
                  return (
                    <View
                      key={`${item.id}-${item.timestamp}`}
                      style={[
                        styles.notificationItem,
                        {
                          backgroundColor: isDark ? colors.card : "#F9FAFB",
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.notificationItemTitle, { color: colors.text }]}>{item.title}</Text>
                      <Text
                        style={[styles.notificationItemMessage, { color: colors.textSecondary }]}
                        numberOfLines={2}
                      >
                        {item.message}
                      </Text>
                      <Text style={[styles.notificationItemTime, { color: colors.textMuted }]}>
                        {formatNotificationTime(item.timestamp)}
                      </Text>
                      <View style={styles.notificationActions}>
                        <TouchableOpacity
                          style={styles.notificationOpenButton}
                          onPress={() => {
                            if (item.chatId) {
                              void handleMarkAsRead(item.chatId, item.timestamp, item.inAppNotificationId);
                              handleOpenChatFromNotification(item.chatId);
                            } else if (isApproval) {
                              if (item.approvalRequestId) {
                                handleMarkApprovalSeen(item.approvalRequestId, item.inAppNotificationId);
                              } else if (item.inAppNotificationId && notificationStateVendorId) {
                                markNotificationAsRead(notificationStateVendorId, item.inAppNotificationId);
                              }
                              setNotificationsOpen(false);
                              router.push({
                                pathname: "/(tabs)/resavations",
                                params: { tab: "approvals" },
                              });
                            } else {
                              if (item.reservationId) {
                                handleMarkReservationSeen(item.reservationId, item.inAppNotificationId);
                              } else if (item.inAppNotificationId && notificationStateVendorId) {
                                markNotificationAsRead(notificationStateVendorId, item.inAppNotificationId);
                              }
                              setNotificationsOpen(false);
                              router.push("/(tabs)/resavations");
                            }
                          }}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.notificationOpenText}>
                            {isChat
                              ? "Open Chat"
                              : isApproval
                              ? "Review Request"
                              : "Open Reservations"}
                          </Text>
                        </TouchableOpacity>
                        {isChat && fromVisitor && item.chatId && (
                          <TouchableOpacity
                            style={[
                              styles.notificationReadButton,
                              markingReadChatId === item.chatId &&
                                styles.notificationReadButtonDisabled,
                            ]}
                            onPress={() => handleMarkAsRead(item.chatId!, item.timestamp, item.inAppNotificationId)}
                            activeOpacity={0.85}
                            disabled={markingReadChatId === item.chatId}
                          >
                            <Text style={styles.notificationReadText}>
                              {markingReadChatId === item.chatId ? "Marking..." : "Mark as read"}
                            </Text>
                          </TouchableOpacity>
                        )}
                        {!isChat && !isApproval && (item.reservationId || item.inAppNotificationId) && (
                          <TouchableOpacity
                            style={styles.notificationReadButton}
                            onPress={() => handleMarkReservationSeen(item.reservationId || "", item.inAppNotificationId)}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.notificationReadText}>Mark as read</Text>
                          </TouchableOpacity>
                        )}
                        {isApproval && (item.approvalRequestId || item.inAppNotificationId) && (
                          <TouchableOpacity
                            style={styles.notificationReadButton}
                            onPress={() => handleMarkApprovalSeen(item.approvalRequestId || "", item.inAppNotificationId)}
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
          </View>
        </View>
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
    zIndex: 10,
  },
  headerTitleContainer: {
    flex: 1,
    marginRight: 12,
    justifyContent: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 10,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E8EDF5",
    overflow: "visible",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    zIndex: 10,
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
    borderWidth: 1.5,
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
    fontSize: 38,
    lineHeight: 42,
    color: "#1A2438",
    letterSpacing: 0.2,
    maxWidth: 240,
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
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
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
    fontSize: 14,
    lineHeight: 18,
    color: "#607089",
  },
  metricValue: {
    fontFamily: "Outfit_700Bold",
    fontSize: 42,
    lineHeight: 46,
    color: "#0F2342",
    marginTop: 12,
  },
  metricValueSmall: {
    fontFamily: "Outfit_700Bold",
    fontSize: 36,
    lineHeight: 40,
    color: "#0F2342",
    marginTop: 12,
  },
  revenueValueBlock: {
    marginTop: 8,
    width: "100%",
  },
  revenueCurrency: {
    fontFamily: "Outfit_700Bold",
    fontSize: 22,
    lineHeight: 24,
    color: "#607089",
    includeFontPadding: false,
  },
  revenueAmount: {
    fontFamily: "Outfit_700Bold",
    fontSize: 36,
    lineHeight: 38,
    color: "#0F2342",
    marginTop: 2,
    includeFontPadding: false,
  },
  insightRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 18,
  },
  insightCard: {
    width: "48.6%",
    backgroundColor: "#1C2A43",
    borderRadius: 18,
    padding: 14,
    justifyContent: "space-between",
    minHeight: 130,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
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
    elevation: 10,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    zIndex: 20,
  },
  notificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  notificationHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  notificationTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: "#1A2438",
  },
  notificationMarkAll: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#2563EB",
    marginRight: 12,
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
