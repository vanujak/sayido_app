import { Tabs } from "expo-router";
import {
  BriefcaseBusiness,
  CalendarDays,
  LayoutDashboard,
  MessageSquare,
  User,
} from "lucide-react-native";
import React from "react";
import { Platform } from "react-native";

import { HapticTab } from "@/components/haptic-tab";

export default function TabLayout() {
  // Design system colors
  const activeColor = "#FC7B54"; // Brand Orange
  const inactiveColor = "#9CA3AF"; // Gray

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarShowLabel: false,
        headerShown: false,
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
            height: 70,
            borderTopWidth: 0,
            borderRadius: 22,
            backgroundColor: "#FFFFFF",
            shadowColor: "#111827",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.1,
            shadowRadius: 18,
          },
          default: {
            height: 70,
            borderTopWidth: 1,
            borderTopColor: "#EEF1F5",
            backgroundColor: "#FFFFFF",
            elevation: 8,
            shadowColor: "#111827",
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.08,
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
          title: "Resavation",
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
