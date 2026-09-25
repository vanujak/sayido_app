import { useAppTheme } from "@/context/ThemeContext";
import {
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Shimmer, ShimmerCircle, ShimmerText } from "./shimmer";

/**
 * Dashboard / Analytics Skeleton
 */
export function DashboardSkeleton() {
  const { colors, isDark } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isShortScreen = height < 740;
  const isTallScreen = height >= 820;
  const isWideScreen = width >= 860;
  const metricCardWidth = isWideScreen ? "24%" : "48.6%";

  const metricCardMinHeight = isShortScreen ? 86 : isTallScreen ? 106 : 96;
  const insightCardMinHeight = isShortScreen ? 84 : isTallScreen ? 100 : 92;
  const chartCardHeight = isShortScreen ? 136 : isTallScreen ? 170 : 152;
  const chartBarsHeight = isShortScreen ? 72 : isTallScreen ? 94 : 82;
  const chartTrackHeight = isShortScreen ? 52 : isTallScreen ? 72 : 62;
  const dynamicBottomPadding = Math.max(
    2,
    Math.min(16, Math.round((height - 720) * 0.1)),
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.dashboardScrollView}
        contentContainerStyle={[
          styles.dashboardContainer,
          {
            paddingTop: Platform.OS === "web" ? 14 : Math.min(insets.top, 6),
            paddingBottom: dynamicBottomPadding,
          },
          isShortScreen && styles.dashboardContainerShort,
        ]}
        scrollEnabled={height < 640}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerTitleContainer}>
            <View
              style={[
                styles.welcomePill,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Shimmer width={76} height={12} borderRadius={6} />
            </View>
            <Shimmer
              width={140}
              height={28}
              borderRadius={6}
              style={{ marginTop: 2 }}
            />
          </View>
          <View style={styles.headerActions}>
            <View
              style={[
                styles.iconButton,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <ShimmerCircle size={20} />
            </View>
          </View>
        </View>

        {/* Timeframe Selector */}
        <View
          style={[
            styles.timeframeContainer,
            {
              backgroundColor: isDark
                ? "rgba(255, 255, 255, 0.05)"
                : "#F1F5F9",
              borderColor: colors.border,
            },
          ]}
        >
          {["30D", "3M", "6M", "1Y"].map((tf, index) => (
            <View
              key={tf}
              style={[
                styles.timeframeButton,
                index === 2 && [
                  styles.timeframeButtonActive,
                  {
                    backgroundColor: colors.card,
                    shadowColor: isDark ? "#000000" : "#0F172A",
                  },
                ],
              ]}
            >
              <Shimmer width={24} height={12} borderRadius={4} />
            </View>
          ))}
        </View>

        {/* 2x2 Metric Cards */}
        <View style={styles.metricGrid}>
          {[1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[
                styles.metricCard,
                {
                  width: metricCardWidth,
                  minHeight: metricCardMinHeight,
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.metricHeader}>
                <Shimmer width={72} height={13} borderRadius={4} />
                <ShimmerCircle size={18} />
              </View>
              {i === 3 ? (
                <View style={styles.revenueValueBlock}>
                  <Shimmer
                    width={30}
                    height={11}
                    borderRadius={3}
                    style={{ marginBottom: 2 }}
                  />
                  <Shimmer width={94} height={24} borderRadius={6} />
                </View>
              ) : (
                <Shimmer
                  width={52}
                  height={26}
                  borderRadius={6}
                  style={{ marginTop: 2 }}
                />
              )}
              <View style={styles.metricFooter}>
                <Shimmer width={46} height={16} borderRadius={6} />
              </View>
            </View>
          ))}
        </View>

        {/* Insight Row */}
        <View style={styles.insightRow}>
          {[1, 2].map((i) => (
            <View
              key={i}
              style={[
                styles.insightCard,
                {
                  backgroundColor: colors.insightCardBg,
                  borderColor: isDark
                    ? "rgba(255, 255, 255, 0.08)"
                    : "transparent",
                  borderWidth: isDark ? 1 : 0,
                  minHeight: insightCardMinHeight,
                },
              ]}
            >
              <View style={styles.insightHeader}>
                <Shimmer width={64} height={11} borderRadius={4} />
                <ShimmerCircle size={14} />
              </View>
              <View style={{ minHeight: 34, justifyContent: "center" }}>
                <Shimmer
                  width={i === 1 ? "82%" : "60%"}
                  height={14}
                  borderRadius={4}
                />
              </View>
              <Shimmer
                width="65%"
                height={10}
                borderRadius={3}
                style={{ marginTop: 1 }}
              />
              <Shimmer
                width="48%"
                height={13}
                borderRadius={4}
                style={{ marginTop: 4 }}
              />
            </View>
          ))}
        </View>

        {/* Chart Grid */}
        <View style={styles.chartGrid}>
          {[1, 2].map((chartIndex) => (
            <View
              key={chartIndex}
              style={[
                styles.chartCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  height: chartCardHeight,
                },
              ]}
            >
              <View style={styles.chartHeaderRow}>
                <Shimmer width={68} height={12} borderRadius={4} />
                <Shimmer width={32} height={10} borderRadius={3} />
              </View>
              <View style={[styles.chartBars, { height: chartBarsHeight }]}>
                {[0.42, 0.72, 0.58, 0.88, 0.65, 0.82].map(
                  (factor, barIndex) => (
                    <View key={barIndex} style={styles.chartColumn}>
                      <View
                        style={[
                          styles.chartTrack,
                          {
                            backgroundColor: isDark
                              ? "rgba(255, 255, 255, 0.08)"
                              : "#EEF2F7",
                            height: chartTrackHeight,
                          },
                        ]}
                      >
                        <Shimmer
                          width="100%"
                          height={Math.max(
                            12,
                            Math.round(chartTrackHeight * factor),
                          )}
                          borderRadius={8}
                        />
                      </View>
                      <Shimmer
                        width={16}
                        height={9}
                        borderRadius={3}
                        style={{ marginTop: 4 }}
                      />
                    </View>
                  ),
                )}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Explore / Services & Packages Skeleton
 */
export function ExploreSkeleton() {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Shimmer width={210} height={28} borderRadius={6} style={styles.mb6} />
        <ShimmerText width={250} height={15} style={styles.mb20} />

        {[1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.serviceCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.serviceHeader}>
              <View style={styles.flex1}>
                <View style={styles.badgeRow}>
                  <Shimmer
                    width={76}
                    height={20}
                    borderRadius={10}
                    style={styles.mr8}
                  />
                  <Shimmer width={88} height={20} borderRadius={10} />
                </View>
                <Shimmer
                  width="70%"
                  height={20}
                  borderRadius={6}
                  style={styles.mb8}
                />
                <ShimmerText width="85%" height={13} />
              </View>
              <ShimmerCircle size={32} />
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * Reservations Calendar & Details Skeleton
 */
export function ReservationsSkeleton() {
  const { colors, isDark } = useAppTheme();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Shimmer width={160} height={28} borderRadius={6} style={styles.mb6} />
        <ShimmerText width={240} height={15} style={styles.mb20} />

        {/* Calendar Box */}
        <View
          style={[
            styles.calendarCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {/* Month controls */}
          <View style={styles.calendarHeader}>
            <ShimmerCircle size={30} />
            <Shimmer width={130} height={20} borderRadius={4} />
            <ShimmerCircle size={30} />
          </View>

          {/* Weekday labels */}
          <View style={styles.calendarWeekdays}>
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Shimmer key={i} width={30} height={12} borderRadius={4} />
            ))}
          </View>

          {/* Days Grid */}
          <View style={styles.calendarGrid}>
            {Array.from({ length: 35 }).map((_, i) => (
              <View key={i} style={styles.calendarDayCell}>
                <Shimmer width={32} height={32} borderRadius={8} />
              </View>
            ))}
          </View>
        </View>

        {/* Selected Date Card */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Shimmer
            width={180}
            height={18}
            borderRadius={4}
            style={styles.mb14}
          />
          {[1, 2].map((i) => (
            <View
              key={i}
              style={[
                styles.reservationItemCard,
                {
                  backgroundColor: isDark ? colors.cardSubtle : "#FBFBFD",
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.rowBetween}>
                <Shimmer width={140} height={16} borderRadius={4} />
                <Shimmer width={80} height={16} borderRadius={4} />
              </View>
              <ShimmerText width={110} height={12} style={styles.mt8} />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Chat List Skeleton
 */
export function ChatSkeleton() {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.chatListContainer}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <View
            key={i}
            style={[
              styles.chatCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <ShimmerCircle size={48} style={styles.mr12} />
            <View style={styles.chatContent}>
              <View style={styles.chatRowHeader}>
                <Shimmer width={130} height={16} borderRadius={4} />
                <Shimmer width={50} height={12} borderRadius={4} />
              </View>
              <View style={styles.mt6}>
                <Shimmer
                  width={95}
                  height={18}
                  borderRadius={9}
                  style={styles.mb6}
                />
                <ShimmerText width="80%" height={13} />
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Profile Screen Skeleton
 */
export function ProfileSkeleton() {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar & Identity Card */}
        <View
          style={[
            styles.profileHeaderCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <ShimmerCircle size={96} style={styles.mb14} />
          <Shimmer
            width={180}
            height={22}
            borderRadius={6}
            style={styles.mb8}
          />
          <Shimmer
            width={140}
            height={16}
            borderRadius={4}
            style={styles.mb6}
          />
          <ShimmerText width={190} height={14} />
        </View>

        {/* Contact Section */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Shimmer
            width={90}
            height={18}
            borderRadius={4}
            style={styles.mb14}
          />
          {[1, 2, 3].map((i) => (
            <View
              key={i}
              style={[
                styles.infoRow,
                { borderBottomColor: colors.borderLight },
              ]}
            >
              <Shimmer width={70} height={14} borderRadius={4} />
              <Shimmer width={130} height={14} borderRadius={4} />
            </View>
          ))}
        </View>

        {/* Business Section */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Shimmer
            width={90}
            height={18}
            borderRadius={4}
            style={styles.mb14}
          />
          <View
            style={[styles.infoRow, { borderBottomColor: colors.borderLight }]}
          >
            <Shimmer width={60} height={14} borderRadius={4} />
            <View style={styles.flex1}>
              <ShimmerText width="100%" height={13} style={styles.mb6} />
              <ShimmerText width="90%" height={13} style={styles.mb6} />
              <ShimmerText width="60%" height={13} />
            </View>
          </View>
        </View>

        {/* Logout Button */}
        <Shimmer
          width="100%"
          height={48}
          borderRadius={14}
          style={styles.mt12}
        />
      </ScrollView>
    </View>
  );
}

/**
 * Notification List Skeleton (for Notifications Modal)
 */
export function NotificationListSkeleton() {
  const { colors } = useAppTheme();
  return (
    <View style={styles.notificationList}>
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={[
            styles.notificationCard,
            { borderBottomColor: colors.borderLight },
          ]}
        >
          <ShimmerCircle size={36} style={styles.mr12} />
          <View style={styles.flex1}>
            <View style={styles.rowBetween}>
              <Shimmer width={110} height={14} borderRadius={4} />
              <Shimmer width={40} height={10} borderRadius={3} />
            </View>
            <ShimmerText width="90%" height={12} style={styles.mt6} />
            <ShimmerText width="60%" height={12} style={styles.mt4} />
            <View style={styles.notificationActions}>
              <Shimmer
                width={85}
                height={26}
                borderRadius={13}
                style={styles.mr8}
              />
              <Shimmer width={85} height={26} borderRadius={13} />
            </View>
          </View>
        </View>
      ))}
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
    paddingBottom: 36,
  },
  chatListContainer: {
    padding: 16,
  },
  flex1: {
    flex: 1,
  },
  mr8: {
    marginRight: 8,
  },
  mr12: {
    marginRight: 12,
  },
  mb6: {
    marginBottom: 6,
  },
  mb8: {
    marginBottom: 8,
  },
  mb14: {
    marginBottom: 14,
  },
  mb20: {
    marginBottom: 20,
  },
  mt4: {
    marginTop: 4,
  },
  mt6: {
    marginTop: 6,
  },
  mt8: {
    marginTop: 8,
  },
  mt12: {
    marginTop: 12,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  // Dashboard styles
  dashboardScrollView: {
    flex: 1,
  },
  dashboardContainer: {
    flexGrow: 1,
    paddingHorizontal: 16,
    justifyContent: "space-between",
  },
  dashboardContainerShort: {
    paddingBottom: 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 3,
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
  welcomePill: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E3EAF5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    marginBottom: 2,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
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
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1.5,
    zIndex: 10,
  },
  timeframeContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    padding: 2,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "transparent",
  },
  timeframeButton: {
    flex: 1,
    paddingVertical: 5,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  timeframeButtonActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  metricCard: {
    width: "48.6%",
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "#E8EDF5",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1.5,
  },
  metricHeader: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  revenueValueBlock: {
    marginTop: 1,
    width: "100%",
  },
  metricFooter: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    marginTop: 4,
  },
  insightRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  },
  insightCard: {
    width: "48.6%",
    backgroundColor: "#1C2A43",
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 9,
    justifyContent: "space-between",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 1.5,
  },
  insightHeader: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chartGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 2,
    marginBottom: 0,
  },
  chartCard: {
    width: "48.6%",
    borderRadius: 15,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingTop: 8,
    paddingBottom: 8,
    justifyContent: "space-between",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1.5,
  },
  chartHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    minHeight: 18,
  },
  chartBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    width: "100%",
  },
  chartColumn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  chartTrack: {
    width: 18,
    justifyContent: "flex-end",
    borderRadius: 8,
    backgroundColor: "#EEF2F7",
    overflow: "hidden",
  },

  // Explore styles
  serviceCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EEF1F5",
    marginBottom: 14,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  serviceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },

  // Reservations styles
  calendarCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EEF1F5",
    marginBottom: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  calendarWeekdays: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 12,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
  },
  calendarDayCell: {
    width: "13.5%",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EEF1F5",
    marginBottom: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  reservationItemCard: {
    backgroundColor: "#FBFBFD",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ECEEF2",
    padding: 12,
    marginBottom: 10,
  },

  // Chat styles
  chatCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    padding: 14,
    marginBottom: 10,
    minHeight: 104,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  chatContent: {
    flex: 1,
  },
  chatRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  // Profile styles
  profileHeaderCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "#EEF1F5",
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },

  // Notifications modal styles
  notificationList: {
    paddingVertical: 8,
  },
  notificationCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F2F5",
  },
  notificationActions: {
    flexDirection: "row",
    marginTop: 10,
  },
});
