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
        tabBarStyle: Platform.select({
          ios: {
            position: "absolute",
          },
          default: {},
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
