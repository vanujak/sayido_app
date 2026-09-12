import { useCallback, useEffect, useMemo, useState } from "react";
import { ReservationsSkeleton } from "@/components/ui/skeletons";
import { useGlobalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { getVendorSession, setVendorSession } from "@/lib/vendor-session";
import { apiCredentials, graphQlUrl } from "@/lib/api-config";
import { formatCoupleName } from "@/lib/formatCoupleName";

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
  offeringName: string;
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
  offeringName: string;
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

const graphQlRequest = async <TData extends unknown>(
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
    { email: email.trim() }
  );

  return toText(data.findVendorByEmail?.id);
};

const loadVendorReservations = async (vendorId: string): Promise<Reservation[]> => {
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
            offering {
              name
            }
          }
        }
      }
    `,
    { vendorId }
  );

  const rows = Array.isArray(data.vendorPayments) ? data.vendorPayments : [];
  return rows
    .map((item) => {
      const visitor = (item.visitor as Record<string, unknown> | undefined) || {};
      const pkg = (item.package as Record<string, unknown> | undefined) || {};
      const offering = (pkg.offering as Record<string, unknown> | undefined) || {};

      const visitorName = formatCoupleName(
        {
          visitor_fname: toText(visitor.visitor_fname),
          visitor_lname: toText(visitor.visitor_lname),
          partner_fname: toText(visitor.partner_fname),
        },
        "Guest"
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
        offeringName: toText(offering.name, "Offering"),
        requiresReservation: Boolean(pkg.requiresReservation ?? pkg.requires_reservation),
        requiresApproval: Boolean(pkg.requiresApproval ?? pkg.requires_approval),
      };
    })
    .filter((reservation) => !!reservation.id && !!reservation.bookingDate);
};

const loadVendorApprovalRequests = async (vendorId: string): Promise<ApprovalRequest[]> => {
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
            offering {
              name
            }
          }
        }
      }
    `,
    { vendorId }
  );

  const rows = Array.isArray(data.getVendorApprovalRequests) ? data.getVendorApprovalRequests : [];
  return rows.map((item) => {
    const visitor = (item.visitor as Record<string, unknown> | undefined) || {};
    const pkg = (item.package as Record<string, unknown> | undefined) || {};
    const offering = (pkg.offering as Record<string, unknown> | undefined) || {};

    const visitorName = formatCoupleName(
      {
        visitor_fname: toText(visitor.visitor_fname),
        visitor_lname: toText(visitor.visitor_lname),
        partner_fname: toText(visitor.partner_fname),
      },
      "Couple"
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
      offeringName: toText(offering.name, "Offering"),
    };
  });
};

const respondApprovalRequest = async (
  requestId: string,
  vendorId: string,
  action: "approve" | "reject",
  vendorMessage?: string
) => {
  return graphQlRequest(
    `
      mutation RespondApprovalRequestForMobile($input: RespondApprovalRequestInput!) {
        respondPackageApprovalRequest(input: $input) {
          id
          status
          vendorMessage
        }
      }
    `,
    {
      input: {
        requestId,
        vendorId,
        action,
        vendorMessage: vendorMessage?.trim() || undefined,
      },
    }
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
    | { type: "day"; key: string; day: number; hasReservations: boolean; count: number }
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
    params.tab === "approvals" ? "approvals" : "calendar"
  );
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [monthCursor, setMonthCursor] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [selectedDateKey, setSelectedDateKey] = useState(() => dateKey(new Date()));

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
      const resolvedVendorId =
        vendorId || (await loadVendorIdByEmail(vendorEmail)) || readVendorIdFromCookie();
      if (!resolvedVendorId) {
        throw new Error("Could not resolve vendor id for reservations.");
      }
      setVendorSession({ vendorId: resolvedVendorId, email: vendorEmail || vendorSession.email });

      const [reservationsResult, approvalsResult] = await Promise.all([
        loadVendorReservations(resolvedVendorId),
        loadVendorApprovalRequests(resolvedVendorId).catch(() => []),
      ]);
      setReservations(reservationsResult);
      setApprovalRequests(approvalsResult);
    } catch (error) {
      setReservations([]);
      setApprovalRequests([]);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load reservations right now."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [vendorEmail, vendorId]);

  const handleConfirmApprovalAction = async () => {
    if (!activeApprovalModal) return;
    const resolvedVendorId =
      vendorId || vendorSession.vendorId || readVendorIdFromCookie();
    if (!resolvedVendorId) return;

    setActionLoading(true);
    try {
      await respondApprovalRequest(
        activeApprovalModal.request.id,
        resolvedVendorId,
        activeApprovalModal.action,
        responseNote
      );
      Alert.alert(
        activeApprovalModal.action === "approve" ? "Request Approved" : "Request Declined",
        activeApprovalModal.action === "approve"
          ? "The couple has been notified and has 24 hours to pay advance."
          : "The couple has been notified that you declined the request."
      );
      setActiveApprovalModal(null);
      setResponseNote("");
      loadData();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to respond");
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
    [monthCursor, reservationsByDate]
  );

  const selectedReservations = selectedDateKey ? reservationsByDate[selectedDateKey] || [] : [];

  const pendingApprovalsCount = useMemo(() => {
    return approvalRequests.filter((r) => (r.status || "").toLowerCase() === "pending").length;
  }, [approvalRequests]);

  const upcomingBookings = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return [...reservations]
      .filter((b) => {
        const d = parseDate(b.bookingDate);
        return d && d >= today;
      })
      .sort((a, b) => {
        const dateA = parseDate(a.bookingDate)?.getTime() || 0;
        const dateB = parseDate(b.bookingDate)?.getTime() || 0;
        return dateA - dateB;
      });
  }, [reservations]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const moveMonth = (step: number) => {
    setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + step, 1));
  };

  if (loading) {
    return <ReservationsSkeleton />;
  }

  if (errorMessage) {
    return (
      <View style={styles.screen}>
        <View style={styles.centerState}>
          <Text style={styles.errorTitle}>Could not load reservations</Text>
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
        <Text style={styles.title}>Bookings</Text>
        <Text style={styles.subtitle}>
          {activeTab === "calendar"
            ? "Calendar & upcoming booked packages for your wedding services"
            : "Review package booking approval requests from couples"}
        </Text>

        <View style={styles.segmentContainer}>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === "calendar" && styles.segmentBtnActive]}
            onPress={() => setActiveTab("calendar")}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.segmentBtnText,
                activeTab === "calendar" && styles.segmentBtnTextActive,
              ]}
            >
              Calendar & Bookings
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === "approvals" && styles.segmentBtnActive]}
            onPress={() => setActiveTab("approvals")}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.segmentBtnText,
                activeTab === "approvals" && styles.segmentBtnTextActive,
              ]}
            >
              Approval Requests {pendingApprovalsCount > 0 ? `(${pendingApprovalsCount})` : ""}
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === "calendar" ? (
          <>
            {/* Inline Pending Approvals Action Banner */}
            {pendingApprovalsCount > 0 && (
              <View style={styles.pendingAlertCard}>
                <View style={styles.pendingAlertHeader}>
                  <View style={styles.pendingAlertTitleRow}>
                    <View style={styles.pendingDot} />
                    <Text style={styles.pendingAlertTitle}>
                      {pendingApprovalsCount} Approval Request{pendingApprovalsCount > 1 ? "s" : ""} Pending
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setActiveTab("approvals")}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.pendingAlertViewAll}>View All</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.pendingAlertSub}>
                  Couples are waiting for your approval to purchase these packages.
                </Text>

                {approvalRequests
                  .filter((r) => (r.status || "").toLowerCase() === "pending")
                  .slice(0, 3)
                  .map((req) => (
                    <View key={`quick-${req.id}`} style={styles.miniApprovalItem}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={styles.miniApprovalCouple} numberOfLines={1}>
                          {req.visitorName}
                        </Text>
                        <Text style={styles.miniApprovalMeta} numberOfLines={1}>
                          {req.packageName} • {formatDateString(req.bookingDate)}
                        </Text>
                      </View>
                      <View style={styles.miniActionRow}>
                        <TouchableOpacity
                          style={[styles.miniBtn, styles.miniDeclineBtn]}
                          onPress={() => {
                            setResponseNote("");
                            setActiveApprovalModal({ request: req, action: "reject" });
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.miniDeclineText}>Decline</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.miniBtn, styles.miniApproveBtn]}
                          onPress={() => {
                            setResponseNote("");
                            setActiveApprovalModal({ request: req, action: "approve" });
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.miniApproveText}>Approve</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
              </View>
            )}

            <View style={styles.calendarCard}>
              <View style={styles.calendarHeader}>
                <TouchableOpacity style={styles.monthButton} onPress={() => moveMonth(-1)}>
                  <Text style={styles.monthButtonText}>{"<"}</Text>
                </TouchableOpacity>
                <Text style={styles.monthTitle}>{monthLabel(monthCursor)}</Text>
                <TouchableOpacity style={styles.monthButton} onPress={() => moveMonth(1)}>
                  <Text style={styles.monthButtonText}>{">"}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.weekdayRow}>
                {weekdayLabels.map((label) => (
                  <Text key={label} style={styles.weekdayText}>
                    {label}
                  </Text>
                ))}
              </View>

              <View style={styles.daysGrid}>
                {monthCells.map((cell) => {
                  if (cell.type === "empty") {
                    return <View key={cell.key} style={styles.dayCell} />;
                  }

                  const selected = selectedDateKey === cell.key;
                  return (
                    <TouchableOpacity
                      key={cell.key}
                      style={[styles.dayCell, selected && styles.dayCellSelected]}
                      onPress={() => setSelectedDateKey(cell.key)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.dayText, cell.hasReservations && styles.dayTextBooked]}>
                        {cell.day}
                      </Text>
                      {cell.hasReservations && (
                        <View style={styles.dayCountBadge}>
                          <Text style={styles.dayCountText}>{cell.count}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Selected Date Bookings Section */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>
                {selectedDateKey ? `Bookings for ${formatDateString(selectedDateKey)}` : "Selected Date"}
              </Text>
              {selectedReservations.length === 0 ? (
                <Text style={styles.emptyText}>No bookings on this date.</Text>
              ) : (
                selectedReservations.map((reservation) => (
                  <View key={reservation.id} style={styles.reservationCard}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.packageName}>{reservation.packageName}</Text>
                      <Text style={styles.amount}>{formatAmount(reservation.amount)}</Text>
                    </View>
                    <View style={styles.packageBadgeRow}>
                      {reservation.requiresApproval ? (
                        <View style={[styles.miniBadge, styles.miniBadgeApproval]}>
                          <Text style={[styles.miniBadgeText, styles.miniBadgeTextApproval]}>
                            Requires Approval
                          </Text>
                        </View>
                      ) : reservation.requiresReservation ? (
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
                      <Text style={styles.statusBadgeSmall}>{reservation.status.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.metaOffering}>{reservation.offeringName}</Text>
                    <View style={styles.coupleRow}>
                      <Text style={styles.coupleLabel}>Couple:</Text>
                      <Text style={styles.coupleValue}>
                        {reservation.visitorName}{" "}
                        {reservation.visitorEmail ? `(${reservation.visitorEmail})` : ""}
                      </Text>
                    </View>
                    {reservation.visitorPhone ? (
                      <Text style={styles.phoneMeta}>📞 {reservation.visitorPhone}</Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>

            {/* Upcoming Bookings Section */}
            <View style={styles.sectionCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle}>Upcoming Bookings</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{upcomingBookings.length}</Text>
                </View>
              </View>
              <Text style={styles.sectionSub}>
                Chronological list of all upcoming booked packages across all services
              </Text>

              {upcomingBookings.length === 0 ? (
                <Text style={styles.emptyText}>No upcoming bookings scheduled yet.</Text>
              ) : (
                upcomingBookings.map((booking) => (
                  <View key={`upcoming-${booking.id}`} style={styles.reservationCard}>
                    <View style={styles.rowBetween}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={styles.packageName}>{booking.packageName}</Text>
                        <Text style={styles.metaOffering}>{booking.offeringName}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={styles.amount}>{formatAmount(booking.amount)}</Text>
                        <Text style={styles.upcomingDateText}>
                          📅 {formatDateString(booking.bookingDate)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.packageBadgeRow}>
                      {booking.requiresApproval ? (
                        <View style={[styles.miniBadge, styles.miniBadgeApproval]}>
                          <Text style={[styles.miniBadgeText, styles.miniBadgeTextApproval]}>
                            Requires Approval
                          </Text>
                        </View>
                      ) : booking.requiresReservation ? (
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
                      <Text style={styles.statusBadgeSmall}>{booking.status.toUpperCase()}</Text>
                    </View>
                    <View style={styles.coupleRow}>
                      <Text style={styles.coupleLabel}>Couple:</Text>
                      <Text style={styles.coupleValue}>
                        {booking.visitorName}{" "}
                        {booking.visitorEmail ? `(${booking.visitorEmail})` : ""}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        ) : (
          <View style={styles.approvalsContainer}>
            {approvalRequests.length === 0 ? (
              <View style={styles.emptyApprovalsCard}>
                <Text style={styles.emptyText}>No approval requests found.</Text>
              </View>
            ) : (
              approvalRequests.map((req) => {
                const status = (req.status || "").toLowerCase();
                const isPending = status === "pending";
                const isApproved = status === "approved";
                const isRejected = status === "rejected";
                const isExpired = status === "expired" || req.isExpired;
                const isPurchased = status === "purchased";

                return (
                  <View key={req.id} style={styles.approvalCard}>
                    <View style={styles.approvalHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.approvalPackageTitle}>{req.packageName}</Text>
                        <Text style={styles.approvalOfferingTitle}>{req.offeringName}</Text>
                      </View>
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
                          {isExpired ? "EXPIRED" : status.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Couple:</Text>
                      <Text style={styles.detailValue}>
                        {req.visitorName} {req.visitorEmail ? `(${req.visitorEmail})` : ""}
                      </Text>
                    </View>

                    {req.visitorPhone ? (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Phone:</Text>
                        <Text style={styles.detailValue}>{req.visitorPhone}</Text>
                      </View>
                    ) : null}

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Requested Date:</Text>
                      <Text style={styles.detailValueHighlight}>
                        {formatDateString(req.bookingDate)}
                      </Text>
                    </View>

                    {req.userNote ? (
                      <View style={styles.noteBox}>
                        <Text style={styles.noteBoxLabel}>Couple's Note:</Text>
                        <Text style={styles.noteBoxContent}>"{req.userNote}"</Text>
                      </View>
                    ) : null}

                    {req.vendorMessage ? (
                      <View style={styles.vendorResponseBox}>
                        <Text style={styles.noteBoxLabel}>Your Response:</Text>
                        <Text style={styles.noteBoxContent}>"{req.vendorMessage}"</Text>
                      </View>
                    ) : null}

                    {isApproved && !isExpired && (
                      <View style={styles.countdownBox}>
                        <Text style={styles.countdownText}>
                          Couple has 24h from approval to pay advance.
                        </Text>
                      </View>
                    )}

                    {isPending && (
                      <View style={styles.approvalActionRow}>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.declineBtn]}
                          onPress={() => {
                            setResponseNote("");
                            setActiveApprovalModal({ request: req, action: "reject" });
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.declineBtnText}>Decline</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.approveBtn]}
                          onPress={() => {
                            setResponseNote("");
                            setActiveApprovalModal({ request: req, action: "approve" });
                          }}
                          activeOpacity={0.8}
                        >
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
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {activeApprovalModal?.action === "approve" ? "Approve Request" : "Decline Request"}
            </Text>
            <Text style={styles.modalSubtitle}>
              {activeApprovalModal?.action === "approve"
                ? `Approve booking for ${activeApprovalModal?.request.visitorName} on ${formatDateString(
                    activeApprovalModal?.request.bookingDate || ""
                  )}? The couple will have 24 hours to pay the advance.`
                : `Are you sure you want to decline this booking request for ${activeApprovalModal?.request.visitorName}?`}
            </Text>

            <Text style={styles.inputLabel}>Message to Couple (Optional):</Text>
            <TextInput
              style={styles.modalInput}
              placeholder={
                activeApprovalModal?.action === "approve"
                  ? "e.g. Happy to accommodate you! Looking forward to meeting."
                  : "e.g. Sorry, we are not available on this date."
              }
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              value={responseNote}
              onChangeText={setResponseNote}
              editable={!actionLoading}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setActiveApprovalModal(null);
                  setResponseNote("");
                }}
                disabled={actionLoading}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmBtn,
                  activeApprovalModal?.action === "reject" && styles.modalRejectBtn,
                ]}
                onPress={handleConfirmApprovalAction}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>
                    {activeApprovalModal?.action === "approve" ? "Approve" : "Decline"}
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
    justifyContent: "space-between",
    marginBottom: 8,
  },
  weekdayText: {
    width: `${100 / 7}%`,
    textAlign: "center",
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#6B7280",
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    marginBottom: 4,
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
    marginTop: 3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FC7B54",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  dayCountText: {
    fontFamily: "Montserrat_600SemiBold",
    color: "#FFFFFF",
    fontSize: 10,
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
  emptyApprovalsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EDF5",
    padding: 24,
    alignItems: "center",
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
  approvalPackageTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
    color: "#111827",
  },
  approvalOfferingTitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  statusBadge: {
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
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
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
    backgroundColor: "#10B981",
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
  },
  modalTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: "#111827",
    marginBottom: 6,
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
    backgroundColor: "#10B981",
    minWidth: 90,
    alignItems: "center",
  },
  modalRejectBtn: {
    backgroundColor: "#DC2626",
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
  metaOffering: {
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
