import { Redirect, Tabs } from "expo-router";
import {
  BriefcaseBusiness,
  CalendarDays,
  LayoutDashboard,
  MessageSquare,
  User,
} from "lucide-react-native";
import React from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { getVendorSession } from "@/lib/vendor-session";
import { useAppTheme } from "@/context/ThemeContext";

export default function TabLayout() {
  const session = getVendorSession();
  if (!session.vendorId && !session.email) {
    return <Redirect href="/login" />;
  }

  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const activeColor = colors.tabIconSelected;
  const inactiveColor = colors.tabIconDefault;
  const bottomInset = Math.max(insets.bottom, Platform.OS === "android" ? 16 : 0);
  const tabBarHeight = 64 + bottomInset;

  return (
    <Tabs
      initialRouteName="index"
      backBehavior="initialRoute"
      screenOptions={{
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarShowLabel: false,
        headerShown: false,
        sceneStyle: {
          backgroundColor: colors.background,
        },
        tabBarButton: HapticTab,
        tabBarItemStyle: {
          paddingTop: 8,
        },
        tabBarStyle: Platform.select({
          ios: {
            position: "absolute",
            left: 14,
            right: 14,
            bottom: 12,
            height: tabBarHeight,
            paddingBottom: bottomInset,
            borderTopWidth: 0,
            borderRadius: 22,
            backgroundColor: colors.tabBarBackground,
            shadowColor: isDark ? "#000000" : "#111827",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: isDark ? 0.35 : 0.1,
            shadowRadius: 18,
          },
          default: {
            height: tabBarHeight,
            paddingBottom: bottomInset,
            borderTopWidth: 1,
            borderTopColor: colors.tabBarBorder,
            backgroundColor: colors.tabBarBackground,
            elevation: 8,
            shadowColor: isDark ? "#000000" : "#111827",
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: isDark ? 0.25 : 0.08,
            shadowRadius: 8,
          },
        }),
      }}
    >
      <Tabs.Screen
        name="explore"
        options={{
          title: "Packages",
          tabBarIcon: ({ color }) => (
            <BriefcaseBusiness size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="resavations"
        options={{
          title: "Bookings",
          tabBarIcon: ({ color }) => <CalendarDays size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color }) => (
            <LayoutDashboard size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ color }) => <MessageSquare size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Vendor Profile",
          tabBarIcon: ({ color }) => <User size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
