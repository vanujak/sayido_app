import { useAppTheme } from "@/context/ThemeContext";
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Shimmer, ShimmerCircle, ShimmerText } from "./shimmer";

/**
 * Dashboard / Analytics Skeleton
 */
export function DashboardSkeleton() {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 380;
  const cardWidth = Math.max((width - 40 - 12) / 2, 140);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Shimmer
              width={100}
              height={22}
              borderRadius={11}
              style={styles.mb8}
            />
            <Shimmer width={170} height={28} borderRadius={6} />
          </View>
          <View style={styles.headerActions}>
            <ShimmerCircle size={40} style={styles.mr8} />
            <ShimmerCircle size={40} />
          </View>
        </View>

        {/* 2x2 Metric Cards */}
        <View style={styles.metricGrid}>
          {[1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[
                styles.metricCard,
                {
                  width: cardWidth,
                  minHeight: isCompact ? 160 : 180,
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.metricHeader}>
                <ShimmerText width="55%" height={14} />
                <ShimmerCircle size={28} />
              </View>
              <View style={styles.metricValueContainer}>
                <Shimmer width="75%" height={28} borderRadius={6} />
              </View>
            </View>
          ))}
        </View>

        {/* Insights Row */}
        <View style={styles.insightRow}>
          {[1, 2].map((i) => (
            <View
              key={i}
              style={[
                styles.insightCard,
                {
                  backgroundColor: colors.insightCardBg,
                  borderColor: colors.border,
                },
              ]}
            >
              <ShimmerText width={70} height={12} style={styles.mb8} />
              <Shimmer
                width="85%"
                height={18}
                borderRadius={4}
                style={styles.mb6}
              />
              <ShimmerText width="60%" height={12} style={styles.mb6} />
              <Shimmer width="45%" height={14} borderRadius={4} />
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 22,
  },
  headerLeft: {
    flex: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EEF1F5",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    justifyContent: "space-between",
  },
  metricHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metricValueContainer: {
    marginTop: 18,
  },
  insightRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  insightCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EEF1F5",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
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
