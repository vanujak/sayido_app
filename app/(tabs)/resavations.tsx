import { ReservationsSkeleton } from "@/components/ui/skeletons";
import { useAppTheme } from "@/context/ThemeContext";
import { apiCredentials, graphQlUrl } from "@/lib/api-config";
import { formatCoupleName } from "@/lib/formatCoupleName";
import { setNotificationReadState } from "@/lib/in-app-notifications";
import { getVendorSession, setVendorSession } from "@/lib/vendor-session";
import { useGlobalSearchParams } from "expo-router";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Mail,
  MessageSquare,
  Phone,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type Reservation = {
  id: string;
  amount: number;
  status: string;
  bookingDate: string;
  createdAt: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string;
  packageName: string;
  serviceName: string;
  requiresReservation: boolean;
  requiresApproval: boolean;
};

type Booking = Reservation;

type ApprovalRequest = {
  id: string;
  bookingDate: string;
  userNote?: string;
  status: string;
  vendorMessage?: string;
  approvedAt?: string;
  expiresAt?: string;
  isExpired: boolean;
  secondsRemaining?: number;
  createdAt: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string;
  packageName: string;
  packagePricing: number;
  serviceName: string;
};

type ReservationMap = Record<string, Reservation[]>;

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

const dateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const monthLabel = (value: Date) =>
  value.toLocaleDateString(undefined, { month: "long", year: "numeric" });

const formatDateString = (value: string) => {
  const d = parseDate(value);
  if (!d) return value || "-";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatFullDate = (value: string) => {
  const d = parseDate(value);
  if (!d) return value || "-";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatRemaining = (seconds?: number) => {
  if (!seconds || seconds <= 0) return "Expired";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m left`;
};

const graphQlRequest = async <TData extends unknown>(
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

const loadVendorReservations = async (
  vendorId: string,
): Promise<Reservation[]> => {
  const data = await graphQlRequest<{
    vendorPayments?: Array<Record<string, unknown>>;
  }>(
    `
      query VendorPayments($vendorId: String!) {
        vendorPayments(vendorId: $vendorId) {
          id
          amount
          status
          bookingDate
          createdAt
          visitor {
            visitor_fname
            visitor_lname
            partner_fname
            email
            phone
          }
          package {
            name
            requiresReservation
            requiresApproval
            service {
              name
            }
          }
        }
      }
    `,
    { vendorId },
  );

  const rows = Array.isArray(data.vendorPayments) ? data.vendorPayments : [];
  return rows
    .map((item) => {
      const visitor =
        (item.visitor as Record<string, unknown> | undefined) || {};
      const pkg = (item.package as Record<string, unknown> | undefined) || {};
      const service =
        (pkg.service as Record<string, unknown> | undefined) || {};

      const visitorName = formatCoupleName(
        {
          visitor_fname: toText(visitor.visitor_fname),
          visitor_lname: toText(visitor.visitor_lname),
          partner_fname: toText(visitor.partner_fname),
        },
        "Guest",
      );

      return {
        id: toText(item.id),
        amount: toNumber(item.amount, 0),
        status: toText(item.status, "pending"),
        bookingDate: toText(item.bookingDate),
        createdAt: toText(item.createdAt),
        visitorName,
        visitorEmail: toText(visitor.email),
        visitorPhone: toText(visitor.phone),
        packageName: toText(pkg.name, "Package"),
        serviceName: toText(service.name, "Service"),
        requiresReservation: Boolean(
          pkg.requiresReservation ?? pkg.requires_reservation,
        ),
        requiresApproval: Boolean(
          pkg.requiresApproval ?? pkg.requires_approval,
        ),
      };
    })
    .filter(
      (reservation) =>
        !!reservation.id &&
        !!reservation.bookingDate &&
        reservation.status.trim().toLowerCase() === "completed",
    );
};

const loadVendorApprovalRequests = async (
  vendorId: string,
): Promise<ApprovalRequest[]> => {
  const data = await graphQlRequest<{
    getVendorApprovalRequests?: Array<Record<string, unknown>>;
  }>(
    `
      query GetVendorApprovalRequestsForMobile($vendorId: String!) {
        getVendorApprovalRequests(vendorId: $vendorId) {
          id
          bookingDate
          userNote
          status
          vendorMessage
          approvedAt
          expiresAt
          isExpired
          secondsRemaining
          createdAt
          visitor {
            visitor_fname
            visitor_lname
            partner_fname
            email
            phone
          }
          package {
            name
            pricing
            service {
              name
            }
          }
        }
      }
    `,
    { vendorId },
  );

  const rows = Array.isArray(data.getVendorApprovalRequests)
    ? data.getVendorApprovalRequests
    : [];
  return rows.map((item) => {
    const visitor = (item.visitor as Record<string, unknown> | undefined) || {};
    const pkg = (item.package as Record<string, unknown> | undefined) || {};
    const service = (pkg.service as Record<string, unknown> | undefined) || {};

    const visitorName = formatCoupleName(
      {
        visitor_fname: toText(visitor.visitor_fname),
        visitor_lname: toText(visitor.visitor_lname),
        partner_fname: toText(visitor.partner_fname),
      },
      "Couple",
    );

    return {
      id: toText(item.id),
      bookingDate: toText(item.bookingDate),
      userNote: toText(item.userNote),
      status: toText(item.status, "pending").toLowerCase(),
      vendorMessage: toText(item.vendorMessage),
      approvedAt: toText(item.approvedAt),
      expiresAt: toText(item.expiresAt),
      isExpired: Boolean(item.isExpired),
      secondsRemaining: toNumber(item.secondsRemaining, 0),
      createdAt: toText(item.createdAt),
      visitorName,
      visitorEmail: toText(visitor.email),
      visitorPhone: toText(visitor.phone),
      packageName: toText(pkg.name, "Package"),
      packagePricing: toNumber(pkg.pricing, 0),
      serviceName: toText(service.name, "Service"),
    };
  });
};

const respondApprovalRequest = async (
  requestId: string,
  vendorId: string,
  action: "approve" | "reject",
  vendorMessage?: string,
) => {
  const gqlAction = action === "approve" ? "APPROVE" : "REJECT";
  return graphQlRequest(
    `
      mutation RespondApprovalRequestForMobile($input: RespondApprovalRequestInput!) {
        respondPackageApprovalRequest(input: $input) {
          id
          status
          vendorMessage
          approvedAt
          expiresAt
          isExpired
          secondsRemaining
        }
      }
    `,
    {
      input: {
        requestId,
        vendorId,
        action: gqlAction,
        vendorMessage: vendorMessage?.trim() || undefined,
      },
    },
  );
};

const formatAmount = (amount: number) =>
  `LKR ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const buildMonthCells = (month: Date, reservationsByDate: ReservationMap) => {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekDay = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells: Array<
    | { type: "empty"; key: string }
    | {
        type: "day";
        key: string;
        day: number;
        hasReservations: boolean;
        count: number;
      }
  > = [];

  for (let i = 0; i < firstWeekDay; i += 1) {
    cells.push({ type: "empty", key: `e-${i}` });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = dateKey(new Date(year, monthIndex, day));
    const reservations = reservationsByDate[key] || [];
    cells.push({
      type: "day",
      key,
      day,
      hasReservations: reservations.length > 0,
      count: reservations.length,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ type: "empty", key: `tail-${cells.length}` });
  }

  return cells;
};

export default function ReservationsScreen() {
  const { colors, isDark } = useAppTheme();
  const vendorSession = getVendorSession();
  const params = useGlobalSearchParams<{
    id?: string;
    vendor_id?: string;
    vendorId?: string;
    email?: string;
    vendor_email?: string;
    tab?: string;
  }>();

  const [activeTab, setActiveTab] = useState<"calendar" | "approvals">(
    params.tab === "approvals" ? "approvals" : "calendar",
  );
  const [approvalFilter, setApprovalFilter] = useState<
    "all" | "pending" | "approved"
  >("all");
  const [resolvedVendorId, setResolvedVendorId] = useState("");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [monthCursor, setMonthCursor] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    dateKey(new Date()),
  );

  const [activeApprovalModal, setActiveApprovalModal] = useState<{
    request: ApprovalRequest;
    action: "approve" | "reject";
  } | null>(null);
  const [responseNote, setResponseNote] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (params.tab === "approvals") {
      setActiveTab("approvals");
    }
  }, [params.tab]);

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
      const targetVendorId =
        resolvedVendorId ||
        vendorId ||
        vendorSession.vendorId ||
        getVendorSession().vendorId ||
        (await loadVendorIdByEmail(vendorEmail)) ||
        readVendorIdFromCookie();
      if (!targetVendorId) {
        throw new Error("Could not resolve vendor id for reservations.");
      }
      setResolvedVendorId(targetVendorId);
      setVendorSession({
        vendorId: targetVendorId,
        email: vendorEmail || vendorSession.email,
      });

      const [reservationsResult, approvalsResult] = await Promise.all([
        loadVendorReservations(targetVendorId),
        loadVendorApprovalRequests(targetVendorId).catch(() => []),
      ]);
      setReservations(reservationsResult);
      setApprovalRequests(approvalsResult);
    } catch (error) {
      setReservations([]);
      setApprovalRequests([]);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load reservations right now.",
      );
    } finally {
      setLoading(false);
    }
  }, [resolvedVendorId, vendorEmail, vendorId]);

  const handleConfirmApprovalAction = async () => {
    if (!activeApprovalModal) return;
    const targetVendorId =
      resolvedVendorId ||
      vendorId ||
      vendorSession.vendorId ||
      getVendorSession().vendorId ||
      (await loadVendorIdByEmail(vendorEmail)) ||
      readVendorIdFromCookie();

    if (!targetVendorId) {
      Alert.alert(
        "Account Error",
        "Could not identify your vendor account. Please sign out and sign in again.",
      );
      return;
    }

    setActionLoading(true);
    try {
      await respondApprovalRequest(
        activeApprovalModal.request.id,
        targetVendorId,
        activeApprovalModal.action,
        responseNote,
      );

      // Mark notification as seen
      setNotificationReadState(targetVendorId, {
        seenApprovalIds: {
          [activeApprovalModal.request.id]: true,
        },
      });

      Alert.alert(
        activeApprovalModal.action === "approve"
          ? "Request Approved"
          : "Request Declined",
        activeApprovalModal.action === "approve"
          ? "Request approved! The couple has 24 hours to pay advance."
          : "Request rejected.",
      );
      setActiveApprovalModal(null);
      setResponseNote("");
      void loadData();
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Failed to respond to request.",
      );
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const reservationsByDate = useMemo(() => {
    const map: ReservationMap = {};
    for (const reservation of reservations) {
      if (reservation.status === "failed") continue;
      const parsed = parseDate(reservation.bookingDate);
      if (!parsed) continue;
      const key = dateKey(parsed);
      if (!map[key]) map[key] = [];
      map[key].push(reservation);
    }
    return map;
  }, [reservations]);

  const monthCells = useMemo(
    () => buildMonthCells(monthCursor, reservationsByDate),
    [monthCursor, reservationsByDate],
  );

  const monthWeeks = useMemo(() => {
    const weeks: Array<typeof monthCells> = [];
    for (let i = 0; i < monthCells.length; i += 7) {
      weeks.push(monthCells.slice(i, i + 7));
    }
    return weeks;
  }, [monthCells]);

  const selectedReservations = selectedDateKey
    ? reservationsByDate[selectedDateKey] || []
    : [];
  const todayKey = dateKey(new Date());

  const pendingApprovalsCount = useMemo(() => {
    return approvalRequests.filter(
      (r) => (r.status || "").toLowerCase() === "pending",
    ).length;
  }, [approvalRequests]);

  const approvedApprovalsCount = useMemo(() => {
    return approvalRequests.filter(
      (r) => (r.status || "").toLowerCase() === "approved" && !r.isExpired,
    ).length;
  }, [approvalRequests]);

  const filteredApprovalRequests = useMemo(() => {
    return approvalRequests.filter((r) => {
      const status = (r.status || "").toLowerCase();
      if (approvalFilter === "pending") return status === "pending";
      if (approvalFilter === "approved")
        return status === "approved" && !r.isExpired;
      return true;
    });
  }, [approvalFilter, approvalRequests]);

  const upcomingBookings = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return [...reservations]
      .filter((b) => {
        if ((b.status || "").toLowerCase() === "failed") return false;
        const d = parseDate(b.bookingDate);
        return d && d >= today;
      })
      .sort((a, b) => {
        const dateA = parseDate(a.bookingDate)?.getTime() || 0;
        const dateB = parseDate(b.bookingDate)?.getTime() || 0;
        return dateA - dateB;
      });
  }, [reservations]);

  const moveMonth = (step: number) => {
    setMonthCursor(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + step, 1),
    );
  };

  if (loading) {
    return <ReservationsSkeleton />;
  }

  if (errorMessage) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View
          style={[styles.centerState, { backgroundColor: colors.background }]}
        >
          <Text style={[styles.errorTitle, { color: colors.text }]}>
            Could not load reservations
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
        <Text style={[styles.title, { color: colors.text }]}>Bookings</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {activeTab === "calendar"
            ? "Calendar & upcoming booked packages for your wedding services"
            : "Review package booking approval requests from couples"}
        </Text>

        <View
          style={[
            styles.segmentContainer,
            { backgroundColor: isDark ? colors.cardSubtle : "#E5E7EB" },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              activeTab === "calendar" && [
                styles.segmentBtnActive,
                { backgroundColor: isDark ? colors.card : "#FFFFFF" },
              ],
            ]}
            onPress={() => setActiveTab("calendar")}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.segmentBtnText,
                { color: colors.textSecondary },
                activeTab === "calendar" && [
                  styles.segmentBtnTextActive,
                  { color: colors.text },
                ],
              ]}
            >
              Calendar & Bookings
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              activeTab === "approvals" && [
                styles.segmentBtnActive,
                { backgroundColor: isDark ? colors.card : "#FFFFFF" },
              ],
            ]}
            onPress={() => setActiveTab("approvals")}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.segmentBtnText,
                { color: colors.textSecondary },
                activeTab === "approvals" && [
                  styles.segmentBtnTextActive,
                  { color: colors.text },
                ],
              ]}
            >
              Approval Requests{" "}
              {pendingApprovalsCount > 0 ? `(${pendingApprovalsCount})` : ""}
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === "calendar" ? (
          <>
            <View
              style={[
                styles.calendarCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.calendarHeader}>
                <TouchableOpacity
                  style={[
                    styles.monthButton,
                    { backgroundColor: isDark ? colors.cardSubtle : "#F3F4F6" },
                  ]}
                  onPress={() => moveMonth(-1)}
                >
                  <Text
                    style={[styles.monthButtonText, { color: colors.text }]}
                  >
                    {"<"}
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.monthTitle, { color: colors.text }]}>
                  {monthLabel(monthCursor)}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.monthButton,
                    { backgroundColor: isDark ? colors.cardSubtle : "#F3F4F6" },
                  ]}
                  onPress={() => moveMonth(1)}
                >
                  <Text
                    style={[styles.monthButtonText, { color: colors.text }]}
                  >
                    {">"}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.weekdayRow}>
                {weekdayLabels.map((label) => (
                  <Text
                    key={label}
                    style={[
                      styles.weekdayText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {label}
                  </Text>
                ))}
              </View>

              <View style={styles.calendarBody}>
                {monthWeeks.map((week, weekIdx) => (
                  <View key={`week-${weekIdx}`} style={styles.weekRow}>
                    {week.map((cell) => {
                      if (cell.type === "empty") {
                        return <View key={cell.key} style={styles.dayCell} />;
                      }

                      const selected = selectedDateKey === cell.key;
                      const isToday = todayKey === cell.key;
                      return (
                        <TouchableOpacity
                          key={cell.key}
                          style={[
                            styles.dayCell,
                            isToday && styles.dayCellToday,
                            selected && [
                              styles.dayCellSelected,
                              {
                                backgroundColor: isDark
                                  ? "rgba(252, 123, 84, 0.22)"
                                  : "#FFE8E1",
                              },
                            ],
                          ]}
                          onPress={() => setSelectedDateKey(cell.key)}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.dayText,
                              { color: colors.text },
                              cell.hasReservations && styles.dayTextBooked,
                            ]}
                          >
                            {cell.day}
                          </Text>
                          {cell.hasReservations && (
                            <View style={styles.dayCountBadge}>
                              <Text style={styles.dayCountText}>
                                {cell.count}
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>

            {/* Selected Date Bookings Section */}
            <View
              style={[
                styles.sectionCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {selectedDateKey
                  ? `Bookings for ${formatDateString(selectedDateKey)}`
                  : "Selected Date"}
              </Text>
              {selectedReservations.length === 0 ? (
                <Text
                  style={[styles.emptyText, { color: colors.textSecondary }]}
                >
                  No bookings on this date.
                </Text>
              ) : (
                selectedReservations.map((reservation) => (
                  <View
                    key={reservation.id}
                    style={[
                      styles.reservationCard,
                      { borderTopColor: isDark ? colors.border : "#F3F4F6" },
                    ]}
                  >
                    <View style={styles.rowBetween}>
                      <Text
                        style={[styles.packageName, { color: colors.text }]}
                      >
                        {reservation.packageName}
                      </Text>
                      <Text style={[styles.amount, { color: colors.text }]}>
                        {formatAmount(reservation.amount)}
                      </Text>
                    </View>
                    <View style={styles.packageBadgeRow}>
                      {reservation.requiresApproval ? (
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
                      ) : reservation.requiresReservation ? (
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
                      <Text
                        style={[
                          styles.statusBadgeSmall,
                          isDark && {
                            backgroundColor: colors.cardSubtle,
                            color: colors.textSecondary,
                          },
                        ]}
                      >
                        {reservation.status.toUpperCase()}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.metaService,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {reservation.serviceName}
                    </Text>
                    <View style={styles.coupleRow}>
                      <Text
                        style={[
                          styles.coupleLabel,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Couple:
                      </Text>
                      <Text
                        style={[styles.coupleValue, { color: colors.text }]}
                      >
                        {reservation.visitorName}{" "}
                        {reservation.visitorEmail
                          ? `(${reservation.visitorEmail})`
                          : ""}
                      </Text>
                    </View>
                    {reservation.visitorPhone ? (
                      <Text
                        style={[
                          styles.phoneMeta,
                          { color: colors.textSecondary },
                        ]}
                      >
                        📞 {reservation.visitorPhone}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>

            {selectedDateKey === todayKey && (
              <View
                style={[
                  styles.sectionCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={styles.rowBetween}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Upcoming Bookings
                  </Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>
                      {upcomingBookings.length}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[styles.sectionSub, { color: colors.textSecondary }]}
                >
                  Chronological list of all upcoming booked packages across all
                  services
                </Text>

                {upcomingBookings.length === 0 ? (
                  <Text
                    style={[styles.emptyText, { color: colors.textSecondary }]}
                  >
                    No upcoming bookings scheduled yet.
                  </Text>
                ) : (
                  upcomingBookings.map((booking) => (
                    <View
                      key={`upcoming-${booking.id}`}
                      style={[
                        styles.reservationCard,
                        { borderTopColor: isDark ? colors.border : "#F3F4F6" },
                      ]}
                    >
                      <View style={styles.rowBetween}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text
                            style={[styles.packageName, { color: colors.text }]}
                          >
                            {booking.packageName}
                          </Text>
                          <Text
                            style={[
                              styles.metaService,
                              { color: colors.textSecondary },
                            ]}
                          >
                            {booking.serviceName}
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={[styles.amount, { color: colors.text }]}>
                            {formatAmount(booking.amount)}
                          </Text>
                          <Text style={styles.upcomingDateText}>
                            📅 {formatDateString(booking.bookingDate)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.packageBadgeRow}>
                        {booking.requiresApproval ? (
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
                        ) : booking.requiresReservation ? (
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
                        <Text
                          style={[
                            styles.statusBadgeSmall,
                            isDark && {
                              backgroundColor: colors.cardSubtle,
                              color: colors.textSecondary,
                            },
                          ]}
                        >
                          {booking.status.toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.coupleRow}>
                        <Text
                          style={[
                            styles.coupleLabel,
                            { color: colors.textSecondary },
                          ]}
                        >
                          Couple:
                        </Text>
                        <Text
                          style={[styles.coupleValue, { color: colors.text }]}
                        >
                          {booking.visitorName}{" "}
                          {booking.visitorEmail
                            ? `(${booking.visitorEmail})`
                            : ""}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </>
        ) : (
          <View style={styles.approvalsContainer}>
            {/* Header with Title and Filter Switcher */}
            <View style={styles.approvalsHeaderBlock}>
              <View style={styles.approvalsTitleRow}>
                <Text style={[styles.approvalsTitle, { color: colors.text }]}>
                  Approval Requests
                </Text>
                {pendingApprovalsCount > 0 && (
                  <View style={styles.newBadge}>
                    <Text style={styles.newBadgeText}>
                      {pendingApprovalsCount} new
                    </Text>
                  </View>
                )}
              </View>
              <Text
                style={[
                  styles.approvalsSubtitle,
                  { color: colors.textSecondary },
                ]}
              >
                Review couples requesting prior approval for your packages
              </Text>

              {/* Filter Pills */}
              <View
                style={[
                  styles.filterPillsContainer,
                  {
                    backgroundColor: isDark
                      ? "rgba(255, 255, 255, 0.05)"
                      : "#F1F5F9",
                    borderColor: colors.border,
                  },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.filterPill,
                    approvalFilter === "all" && [
                      styles.filterPillActive,
                      {
                        backgroundColor: colors.card,
                        shadowColor: isDark ? "#000000" : "#0F172A",
                      },
                    ],
                  ]}
                  onPress={() => setApprovalFilter("all")}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      {
                        color:
                          approvalFilter === "all"
                            ? colors.primary
                            : colors.textSecondary,
                        fontFamily:
                          approvalFilter === "all"
                            ? "Montserrat_600SemiBold"
                            : "Montserrat_500Medium",
                      },
                    ]}
                  >
                    All ({approvalRequests.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.filterPill,
                    approvalFilter === "pending" && [
                      styles.filterPillActive,
                      {
                        backgroundColor: colors.card,
                        shadowColor: isDark ? "#000000" : "#0F172A",
                      },
                    ],
                  ]}
                  onPress={() => setApprovalFilter("pending")}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      {
                        color:
                          approvalFilter === "pending"
                            ? colors.primary
                            : colors.textSecondary,
                        fontFamily:
                          approvalFilter === "pending"
                            ? "Montserrat_600SemiBold"
                            : "Montserrat_500Medium",
                      },
                    ]}
                  >
                    Pending ({pendingApprovalsCount})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.filterPill,
                    approvalFilter === "approved" && [
                      styles.filterPillActive,
                      {
                        backgroundColor: colors.card,
                        shadowColor: isDark ? "#000000" : "#0F172A",
                      },
                    ],
                  ]}
                  onPress={() => setApprovalFilter("approved")}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      {
                        color:
                          approvalFilter === "approved"
                            ? colors.primary
                            : colors.textSecondary,
                        fontFamily:
                          approvalFilter === "approved"
                            ? "Montserrat_600SemiBold"
                            : "Montserrat_500Medium",
                      },
                    ]}
                  >
                    Approved ({approvedApprovalsCount})
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {filteredApprovalRequests.length === 0 ? (
              <View
                style={[
                  styles.emptyApprovalsCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View
                  style={[
                    styles.emptyIconCircle,
                    {
                      backgroundColor: isDark
                        ? "rgba(255, 255, 255, 0.06)"
                        : "#F3F4F6",
                    },
                  ]}
                >
                  <ShieldCheck size={28} color={colors.textSecondary} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  No approval requests found
                </Text>
                <Text
                  style={[styles.emptyText, { color: colors.textSecondary }]}
                >
                  When couples select packages that require your prior approval,
                  their date requests will appear here.
                </Text>
              </View>
            ) : (
              filteredApprovalRequests.map((req) => {
                const status = (req.status || "").toLowerCase();
                const isPending = status === "pending";
                const isApproved = status === "approved" && !req.isExpired;
                const isRejected = status === "rejected";
                const isExpired = status === "expired" || req.isExpired;
                const isPurchased = status === "purchased";
                const initial = (req.visitorName?.trim() || "C")
                  .charAt(0)
                  .toUpperCase();

                return (
                  <View
                    key={req.id}
                    style={[
                      styles.approvalCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    {/* Requester & Status Row */}
                    <View style={styles.approvalHeader}>
                      <View style={styles.requesterInfoRow}>
                        <View
                          style={[
                            styles.avatarCircle,
                            {
                              backgroundColor: isDark
                                ? "rgba(249, 115, 22, 0.15)"
                                : "#FFEDD5",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.avatarText,
                              { color: isDark ? "#FB923C" : "#EA580C" },
                            ]}
                          >
                            {initial}
                          </Text>
                        </View>
                        <View style={styles.requesterTextCol}>
                          <Text
                            style={[
                              styles.approvalCoupleName,
                              { color: colors.text },
                            ]}
                            numberOfLines={1}
                          >
                            {req.visitorName}
                          </Text>
                          <View style={styles.contactItemsRow}>
                            {req.visitorEmail ? (
                              <View style={styles.contactItem}>
                                <Mail
                                  size={11}
                                  color={colors.textSecondary}
                                  style={{ marginRight: 3 }}
                                />
                                <Text
                                  style={[
                                    styles.contactItemText,
                                    { color: colors.textSecondary },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {req.visitorEmail}
                                </Text>
                              </View>
                            ) : null}
                            {req.visitorPhone ? (
                              <View style={styles.contactItem}>
                                <Phone
                                  size={11}
                                  color={colors.textSecondary}
                                  style={{ marginRight: 3 }}
                                />
                                <Text
                                  style={[
                                    styles.contactItemText,
                                    { color: colors.textSecondary },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {req.visitorPhone}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </View>

                      {/* Status Badge */}
                      <View style={styles.statusBadgeCol}>
                        <View
                          style={[
                            styles.statusBadge,
                            isPending && styles.badgePending,
                            isApproved && styles.badgeApproved,
                            isRejected && styles.badgeRejected,
                            isExpired && styles.badgeExpired,
                            isPurchased && styles.badgePurchased,
                          ]}
                        >
                          {isPending && (
                            <Clock
                              size={11}
                              color="#B45309"
                              style={{ marginRight: 4 }}
                            />
                          )}
                          {isApproved && (
                            <CheckCircle2
                              size={11}
                              color="#047857"
                              style={{ marginRight: 4 }}
                            />
                          )}
                          {isRejected && (
                            <XCircle
                              size={11}
                              color="#B91C1C"
                              style={{ marginRight: 4 }}
                            />
                          )}
                          {isPurchased && (
                            <CheckCircle2
                              size={11}
                              color="#15803D"
                              style={{ marginRight: 4 }}
                            />
                          )}
                          {isExpired && (
                            <Clock
                              size={11}
                              color="#4B5563"
                              style={{ marginRight: 4 }}
                            />
                          )}
                          <Text
                            style={[
                              styles.statusBadgeText,
                              isPending && styles.badgeTextPending,
                              isApproved && styles.badgeTextApproved,
                              isRejected && styles.badgeTextRejected,
                              isExpired && styles.badgeTextExpired,
                              isPurchased && styles.badgeTextPurchased,
                            ]}
                          >
                            {isPending
                              ? "Pending Review"
                              : isApproved
                                ? "Approved"
                                : isRejected
                                  ? "Declined"
                                  : isPurchased
                                    ? "Paid & Confirmed"
                                    : "24h Window Expired"}
                          </Text>
                        </View>
                        {isApproved && (
                          <Text style={styles.countdownPillText}>
                            {formatRemaining(req.secondsRemaining)}
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* Package & Pricing Box */}
                    <View
                      style={[
                        styles.packagePricingBox,
                        {
                          backgroundColor: isDark
                            ? "rgba(255, 255, 255, 0.04)"
                            : "#F8FAFC",
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <View style={styles.packageRow}>
                        <Text
                          style={[
                            styles.packageBoxLabel,
                            { color: colors.textSecondary },
                          ]}
                        >
                          Requested Package:
                        </Text>
                        <Text
                          style={[
                            styles.packageBoxValue,
                            { color: colors.text },
                          ]}
                          numberOfLines={1}
                        >
                          {req.packageName}
                        </Text>
                      </View>
                      {req.packagePricing > 0 ? (
                        <View style={styles.pricingRow}>
                          <Text
                            style={[
                              styles.packageBoxLabel,
                              { color: colors.textSecondary },
                            ]}
                          >
                            Pricing / Advance:
                          </Text>
                          <Text
                            style={[
                              styles.packageBoxValue,
                              { color: colors.text },
                            ]}
                          >
                            LKR {req.packagePricing.toLocaleString()} (Advance 20%:{" "}
                            <Text
                              style={{
                                fontFamily: "Outfit_700Bold",
                                color: colors.text,
                              }}
                            >
                              LKR{" "}
                              {Math.round(
                                req.packagePricing * 0.2,
                              ).toLocaleString()}
                            </Text>
                            )
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Requested Event Date Box (Web style blue banner) */}
                    <View
                      style={[
                        styles.eventDateBanner,
                        {
                          backgroundColor: isDark
                            ? "rgba(37, 99, 235, 0.12)"
                            : "#EFF6FF",
                          borderColor: isDark
                            ? "rgba(59, 130, 246, 0.25)"
                            : "#DBEAFE",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.eventDateLabel,
                          { color: isDark ? "#93C5FD" : "#1D4ED8" },
                        ]}
                      >
                        REQUESTED EVENT DATE
                      </Text>
                      <View style={styles.eventDateContentRow}>
                        <Calendar
                          size={13}
                          color={isDark ? "#60A5FA" : "#2563EB"}
                          style={{ marginRight: 5 }}
                        />
                        <Text
                          style={[
                            styles.eventDateText,
                            { color: isDark ? "#DBEAFE" : "#1E3A8A" },
                          ]}
                        >
                          {formatFullDate(req.bookingDate)}
                        </Text>
                      </View>
                    </View>

                    {/* Couple's Note (if provided) */}
                    {req.userNote ? (
                      <View
                        style={[
                          styles.userNoteBox,
                          {
                            backgroundColor: isDark
                              ? "rgba(245, 158, 11, 0.1)"
                              : "#FFFBEB",
                            borderColor: isDark
                              ? "rgba(245, 158, 11, 0.25)"
                              : "#FDE68A",
                          },
                        ]}
                      >
                        <View style={styles.noteHeaderRow}>
                          <MessageSquare
                            size={12}
                            color={isDark ? "#FBBF24" : "#B45309"}
                            style={{ marginRight: 4 }}
                          />
                          <Text
                            style={[
                              styles.userNoteLabel,
                              { color: isDark ? "#FBBF24" : "#B45309" },
                            ]}
                          >
                            COUPLE'S NOTE:
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.userNoteText,
                            { color: isDark ? "#FDE68A" : "#78350F" },
                          ]}
                        >
                          "{req.userNote}"
                        </Text>
                      </View>
                    ) : null}

                    {/* Vendor's Response (if already responded) */}
                    {req.vendorMessage ? (
                      <View
                        style={[
                          styles.vendorResponseBox,
                          {
                            backgroundColor: isDark
                              ? "rgba(59, 130, 246, 0.12)"
                              : "#EFF6FF",
                            borderColor: isDark
                              ? "rgba(59, 130, 246, 0.25)"
                              : "#BFDBFE",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.vendorResponseLabel,
                            { color: isDark ? "#93C5FD" : "#1D4ED8" },
                          ]}
                        >
                          YOUR NOTE TO COUPLE:
                        </Text>
                        <Text
                          style={[
                            styles.vendorResponseText,
                            { color: isDark ? "#DBEAFE" : "#1E3A8A" },
                          ]}
                        >
                          "{req.vendorMessage}"
                        </Text>
                      </View>
                    ) : null}

                    {/* Action Buttons for Pending Requests */}
                    {isPending && (
                      <View style={styles.approvalActionRow}>
                        <TouchableOpacity
                          style={[
                            styles.actionBtn,
                            styles.declineBtn,
                            isDark && {
                              backgroundColor: "rgba(239, 68, 68, 0.15)",
                              borderColor: "rgba(239, 68, 68, 0.35)",
                            },
                          ]}
                          onPress={() => {
                            setResponseNote("");
                            setActiveApprovalModal({
                              request: req,
                              action: "reject",
                            });
                          }}
                          activeOpacity={0.8}
                        >
                          <XCircle
                            size={14}
                            color={isDark ? "#F87171" : "#DC2626"}
                            style={{ marginRight: 5 }}
                          />
                          <Text
                            style={[
                              styles.declineBtnText,
                              isDark && { color: "#F87171" },
                            ]}
                          >
                            Decline
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionBtn, styles.approveBtn]}
                          onPress={() => {
                            setResponseNote("");
                            setActiveApprovalModal({
                              request: req,
                              action: "approve",
                            });
                          }}
                          activeOpacity={0.8}
                        >
                          <CheckCircle2
                            size={14}
                            color="#FFFFFF"
                            style={{ marginRight: 5 }}
                          />
                          <Text style={styles.approveBtnText}>Approve</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={!!activeApprovalModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!actionLoading) {
            setActiveApprovalModal(null);
            setResponseNote("");
          }
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => {
                if (!actionLoading) {
                  setActiveApprovalModal(null);
                  setResponseNote("");
                }
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              disabled={actionLoading}
            >
              <X size={18} color={isDark ? "#94A3B8" : "#9CA3AF"} />
            </TouchableOpacity>

            <View style={styles.modalHeaderRow}>
              <View
                style={[
                  styles.modalIconBadge,
                  activeApprovalModal?.action === "approve"
                    ? styles.modalIconBadgeApprove
                    : styles.modalIconBadgeDecline,
                  isDark &&
                    (activeApprovalModal?.action === "approve"
                      ? { backgroundColor: "rgba(16, 185, 129, 0.15)" }
                      : { backgroundColor: "rgba(239, 68, 68, 0.15)" }),
                ]}
              >
                {activeApprovalModal?.action === "approve" ? (
                  <CheckCircle2
                    size={20}
                    color={isDark ? "#34D399" : "#059669"}
                  />
                ) : (
                  <XCircle size={20} color={isDark ? "#F87171" : "#DC2626"} />
                )}
              </View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {activeApprovalModal?.action === "approve"
                  ? "Approve Booking Request"
                  : "Decline Booking Request"}
              </Text>
            </View>

            <Text
              style={[styles.modalSubtitle, { color: colors.textSecondary }]}
            >
              {activeApprovalModal?.action === "approve" ? (
                <>
                  Approving this request for{" "}
                  <Text
                    style={{
                      fontFamily: "Outfit_700Bold",
                      color: colors.text,
                    }}
                  >
                    {formatFullDate(
                      activeApprovalModal?.request.bookingDate || "",
                    )}
                  </Text>{" "}
                  will notify the couple and unlock a{" "}
                  <Text
                    style={{
                      fontFamily: "Outfit_700Bold",
                      color: colors.text,
                    }}
                  >
                    24-hour payment window
                  </Text>{" "}
                  for them to pay the advance.
                </>
              ) : (
                <>
                  Are you sure you want to decline this request for{" "}
                  <Text
                    style={{
                      fontFamily: "Outfit_700Bold",
                      color: colors.text,
                    }}
                  >
                    {formatFullDate(
                      activeApprovalModal?.request.bookingDate || "",
                    )}
                  </Text>
                  ? The couple will be notified.
                </>
              )}
            </Text>

            <Text style={[styles.inputLabel, { color: colors.text }]}>
              Message to Couple (Optional)
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              placeholder={
                activeApprovalModal?.action === "approve"
                  ? "e.g. We are excited to be part of your special day! Looking forward to your confirmation."
                  : "e.g. Unfortunately we are unavailable on this date, but we have availability the following week."
              }
              placeholderTextColor={isDark ? "#64748B" : "#9CA3AF"}
              multiline
              numberOfLines={3}
              value={responseNote}
              onChangeText={setResponseNote}
              editable={!actionLoading}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => {
                  setActiveApprovalModal(null);
                  setResponseNote("");
                }}
                disabled={actionLoading}
              >
                <Text
                  style={[
                    styles.modalCancelText,
                    { color: colors.textSecondary },
                  ]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmBtn,
                  activeApprovalModal?.action === "reject"
                    ? styles.modalRejectBtn
                    : styles.modalApproveBtn,
                ]}
                onPress={handleConfirmApprovalAction}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <View style={styles.btnContentRow}>
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text style={[styles.modalConfirmText, { marginLeft: 6 }]}>
                      Processing...
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.modalConfirmText}>
                    {activeApprovalModal?.action === "approve"
                      ? "Confirm Approval"
                      : "Confirm Decline"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
    padding: 20,
    paddingBottom: 40,
    flexGrow: 1,
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
  calendarCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EDF5",
    padding: 14,
    marginBottom: 12,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 1,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  monthButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  monthButtonText: {
    fontFamily: "Outfit_700Bold",
    color: "#111827",
    fontSize: 16,
  },
  monthTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: "#111827",
  },
  weekdayRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  weekdayText: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#6B7280",
  },
  calendarBody: {
    width: "100%",
  },
  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  dayCell: {
    flex: 1,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    marginHorizontal: 2,
  },
  dayCellToday: {
    borderWidth: 1.5,
    borderColor: "#FC7B54",
    backgroundColor: "transparent",
  },
  dayCellSelected: {
    backgroundColor: "#FFE8E1",
  },
  dayText: {
    fontFamily: "Montserrat_400Regular",
    color: "#111827",
    fontSize: 13,
  },
  dayTextBooked: {
    fontFamily: "Montserrat_600SemiBold",
    color: "#FC7B54",
  },
  dayCountBadge: {
    marginTop: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#FC7B54",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  dayCountText: {
    fontFamily: "Montserrat_600SemiBold",
    color: "#FFFFFF",
    fontSize: 9,
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EDF5",
    padding: 14,
    marginBottom: 12,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 1,
  },
  sectionTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: "#111827",
    marginBottom: 10,
  },
  emptyText: {
    fontFamily: "Montserrat_400Regular",
    color: "#6B7280",
  },
  reservationCard: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  packageName: {
    fontFamily: "Montserrat_600SemiBold",
    color: "#111827",
    fontSize: 15,
    flex: 1,
  },
  amount: {
    fontFamily: "Outfit_700Bold",
    color: "#111827",
    fontSize: 14,
  },
  meta: {
    marginTop: 4,
    fontFamily: "Montserrat_400Regular",
    color: "#6B7280",
    fontSize: 13,
  },
  status: {
    marginTop: 6,
    fontFamily: "Montserrat_600SemiBold",
    color: "#FC7B54",
    fontSize: 12,
  },
  segmentContainer: {
    flexDirection: "row",
    backgroundColor: "#E5E7EB",
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  segmentBtnActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentBtnText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: "#6B7280",
  },
  segmentBtnTextActive: {
    fontFamily: "Outfit_700Bold",
    color: "#111827",
  },
  approvalsContainer: {
    gap: 12,
    marginBottom: 20,
  },
  approvalsHeaderBlock: {
    marginBottom: 4,
  },
  approvalsTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  approvalsTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 20,
    color: "#111827",
  },
  newBadge: {
    backgroundColor: "#EA580C",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  newBadgeText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 11,
    color: "#FFFFFF",
  },
  approvalsSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12.5,
    color: "#6B7280",
    marginTop: 2,
    marginBottom: 12,
  },
  filterPillsContainer: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 4,
    marginBottom: 8,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  filterPillActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  filterPillText: {
    fontSize: 12,
  },
  emptyApprovalsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EDF5",
    padding: 24,
    alignItems: "center",
    marginTop: 8,
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 15,
    color: "#111827",
    marginBottom: 4,
    textAlign: "center",
  },
  approvalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EDF5",
    padding: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  approvalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 8,
  },
  requesterInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFEDD5",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
    color: "#EA580C",
  },
  requesterTextCol: {
    flex: 1,
  },
  approvalCoupleName: {
    fontFamily: "Outfit_700Bold",
    fontSize: 15,
    color: "#111827",
  },
  contactItemsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 3,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  contactItemText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: "#6B7280",
  },
  statusBadgeCol: {
    alignItems: "flex-end",
    gap: 4,
  },
  approvalPackageTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
    color: "#111827",
  },
  approvalServiceTitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 11,
  },
  badgePending: {
    backgroundColor: "#FEF3C7",
  },
  badgeTextPending: {
    color: "#D97706",
  },
  badgeApproved: {
    backgroundColor: "#DCFCE7",
  },
  badgeTextApproved: {
    color: "#16A34A",
  },
  badgeRejected: {
    backgroundColor: "#FEE2E2",
  },
  badgeTextRejected: {
    color: "#DC2626",
  },
  badgeExpired: {
    backgroundColor: "#F3F4F6",
  },
  badgeTextExpired: {
    color: "#6B7280",
  },
  badgePurchased: {
    backgroundColor: "#DBEAFE",
  },
  badgeTextPurchased: {
    color: "#2563EB",
  },
  countdownPillText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 10.5,
    color: "#059669",
  },
  packagePricingBox: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    gap: 4,
  },
  packageRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pricingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  packageBoxLabel: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 12,
    color: "#64748B",
  },
  packageBoxValue: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#0F172A",
  },
  eventDateBanner: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  eventDateLabel: {
    fontFamily: "Outfit_700Bold",
    fontSize: 10,
    letterSpacing: 0.5,
    color: "#1D4ED8",
    marginBottom: 2,
  },
  eventDateContentRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  eventDateText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: "#1E3A8A",
  },
  userNoteBox: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  noteHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
  },
  userNoteLabel: {
    fontFamily: "Outfit_700Bold",
    fontSize: 10,
    letterSpacing: 0.5,
    color: "#B45309",
  },
  userNoteText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: "#78350F",
    fontStyle: "italic",
    lineHeight: 16,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  detailLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: "#6B7280",
    width: 120,
  },
  detailValue: {
    flex: 1,
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#111827",
  },
  detailValueHighlight: {
    flex: 1,
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: "#FC7B54",
  },
  noteBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  vendorResponseBox: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  vendorResponseLabel: {
    fontFamily: "Outfit_700Bold",
    fontSize: 10,
    letterSpacing: 0.5,
    color: "#1D4ED8",
    marginBottom: 3,
  },
  vendorResponseText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: "#1E3A8A",
    fontStyle: "italic",
    lineHeight: 16,
  },
  noteBoxLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#4B5563",
    marginBottom: 2,
  },
  noteBoxContent: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#1F2937",
    fontStyle: "italic",
  },
  countdownBox: {
    backgroundColor: "#ECFDF5",
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
    alignItems: "center",
  },
  countdownText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#059669",
  },
  approvalActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  declineBtn: {
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  declineBtnText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 14,
    color: "#DC2626",
  },
  approveBtn: {
    backgroundColor: "#059669",
  },
  approveBtnText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 14,
    color: "#FFFFFF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    width: "100%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    position: "relative",
  },
  modalCloseButton: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 4,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
    paddingRight: 28,
  },
  modalIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  modalIconBadgeApprove: {
    backgroundColor: "#ECFDF5",
  },
  modalIconBadgeDecline: {
    backgroundColor: "#FEF2F2",
  },
  modalTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: "#111827",
    flex: 1,
  },
  modalSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 18,
    marginBottom: 14,
  },
  inputLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#374151",
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 10,
    minHeight: 70,
    textAlignVertical: "top",
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#111827",
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  modalCancelText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "#6B7280",
  },
  modalConfirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    minWidth: 130,
    alignItems: "center",
    justifyContent: "center",
  },
  modalApproveBtn: {
    backgroundColor: "#059669",
  },
  modalRejectBtn: {
    backgroundColor: "#DC2626",
  },
  btnContentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  modalConfirmText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 14,
    color: "#FFFFFF",
  },
  // Pending Alert Card
  pendingAlertCard: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  pendingAlertHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  pendingAlertTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D97706",
  },
  pendingAlertTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 14,
    color: "#92400E",
  },
  pendingAlertViewAll: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12.5,
    color: "#D97706",
    textDecorationLine: "underline",
  },
  pendingAlertSub: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: "#B45309",
    marginBottom: 10,
  },
  miniApprovalItem: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FEF3C7",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  miniApprovalCouple: {
    fontFamily: "Outfit_700Bold",
    fontSize: 13,
    color: "#111827",
  },
  miniApprovalMeta: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11.5,
    color: "#6B7280",
    marginTop: 2,
  },
  miniActionRow: {
    flexDirection: "row",
    gap: 6,
  },
  miniBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  miniDeclineBtn: {
    backgroundColor: "#FEE2E2",
  },
  miniDeclineText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 11,
    color: "#DC2626",
  },
  miniApproveBtn: {
    backgroundColor: "#10B981",
  },
  miniApproveText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 11,
    color: "#FFFFFF",
  },
  // Package Badges
  packageBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 5,
    marginBottom: 4,
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
  miniBadgeTextNormal: {
    color: "#059669",
  },
  miniBadgeTextApproval: {
    color: "#1D4ED8",
  },
  statusBadgeSmall: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 10,
    color: "#6B7280",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  metaService: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12.5,
    color: "#4B5563",
    marginTop: 2,
  },
  coupleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 4,
  },
  coupleLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#6B7280",
  },
  coupleValue: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: "#111827",
    flex: 1,
  },
  phoneMeta: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11.5,
    color: "#6B7280",
    marginTop: 2,
  },
  countBadge: {
    backgroundColor: "#FC7B54",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  countBadgeText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 11,
    color: "#FFFFFF",
  },
  sectionSub: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12.5,
    color: "#6B7280",
    marginTop: -4,
    marginBottom: 10,
  },
  upcomingDateText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#FC7B54",
    marginTop: 2,
  },
});
