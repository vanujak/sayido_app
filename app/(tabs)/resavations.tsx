import { useCallback, useEffect, useMemo, useState } from "react";
import { useGlobalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getVendorSession, setVendorSession } from "@/lib/vendor-session";

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
};

type ReservationMap = Record<string, Reservation[]>;

const graphQlUrl = process.env.EXPO_PUBLIC_GRAPHQL_URL || "";
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

const graphQlRequest = async <TData>(
  query: string,
  variables: Record<string, unknown>
): Promise<TData> => {
  if (!graphQlUrl) {
    throw new Error("Missing EXPO_PUBLIC_GRAPHQL_URL");
  }

  const response = await fetch(graphQlUrl, {
    method: "POST",
    credentials: "include",
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
  const data = await graphQlRequest<{
    findAllVendors?: Array<{ id?: string; email?: string }>;
  }>(
    `
      query FindAllVendorsForLookup {
        findAllVendors {
          id
          email
        }
      }
    `,
    {}
  );

  const vendors = Array.isArray(data.findAllVendors) ? data.findAllVendors : [];
  if (!email.trim()) {
    return toText(vendors[0]?.id);
  }

  const target = email.trim().toLowerCase();
  const matched = vendors.find((vendor) => toText(vendor.email).toLowerCase() === target);
  return toText(matched?.id) || toText(vendors[0]?.id);
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

  const rows = Array.isArray(data.vendorPayments) ? data.vendorPayments : [];
  return rows
    .map((item) => {
      const visitor = (item.visitor as Record<string, unknown> | undefined) || {};
      const pkg = (item.package as Record<string, unknown> | undefined) || {};
      const offering = (pkg.offering as Record<string, unknown> | undefined) || {};

      const firstName = toText(visitor.visitor_fname);
      const lastName = toText(visitor.visitor_lname);
      const fullName = `${firstName} ${lastName}`.trim();

      return {
        id: toText(item.id),
        amount: toNumber(item.amount, 0),
        status: toText(item.status, "pending"),
        bookingDate: toText(item.bookingDate),
        createdAt: toText(item.createdAt),
        visitorName: fullName || "Guest",
        visitorEmail: toText(visitor.email),
        visitorPhone: toText(visitor.phone),
        packageName: toText(pkg.name, "Package"),
        offeringName: toText(offering.name, "Offering"),
      };
    })
    .filter((reservation) => !!reservation.id && !!reservation.bookingDate);
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
  }>();

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [monthCursor, setMonthCursor] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [selectedDateKey, setSelectedDateKey] = useState(() => dateKey(new Date()));

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

      const result = await loadVendorReservations(resolvedVendorId);
      setReservations(result);
    } catch (error) {
      setReservations([]);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load reservations right now."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [vendorEmail, vendorId]);

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

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const moveMonth = (step: number) => {
    setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + step, 1));
  };

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color="#FC7B54" />
        <Text style={styles.stateText}>Loading reservations...</Text>
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.errorTitle}>Could not load reservations</Text>
        <Text style={styles.errorText}>{errorMessage}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadData} activeOpacity={0.8}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Reservations</Text>
      <Text style={styles.subtitle}>Calendar view for your booking dates</Text>

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

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>
          {selectedDateKey ? `Selected Date: ${selectedDateKey}` : "Selected Date"}
        </Text>
        {selectedReservations.length === 0 ? (
          <Text style={styles.emptyText}>No reservations on this date.</Text>
        ) : (
          selectedReservations.map((reservation) => (
            <View key={reservation.id} style={styles.reservationCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.packageName}>{reservation.packageName}</Text>
                <Text style={styles.amount}>{formatAmount(reservation.amount)}</Text>
              </View>
              <Text style={styles.meta}>{reservation.offeringName}</Text>
              <Text style={styles.meta}>
                {reservation.visitorName} {reservation.visitorEmail ? `(${reservation.visitorEmail})` : ""}
              </Text>
              <Text style={styles.status}>{reservation.status.toUpperCase()}</Text>
            </View>
          ))
        )}
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: "#F5F7FA",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F5F7FA",
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
    borderColor: "#EEF1F5",
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
    borderColor: "#EEF1F5",
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
});
