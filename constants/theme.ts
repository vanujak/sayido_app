import { Platform } from "react-native";

export const Colors = {
  light: {
    background: "#FFF8F3",
    card: "#FFFFFF",
    cardElevated: "#FFFFFF",
    cardSubtle: "#FAFAFA",
    border: "#E8EDF5",
    borderLight: "#F3F4F6",
    primary: "#FC7B54",
    primaryLight: "#FFE8E1",
    primaryDark: "#E0623B",
    text: "#111827",
    textSecondary: "#607089",
    textMuted: "#9CA3AF",
    inputBackground: "#FFFFFF",
    inputBorder: "#E5E7EB",
    tabBarBackground: "#FFFFFF",
    tabBarBorder: "#EEF1F5",
    tabIconDefault: "#9CA3AF",
    tabIconSelected: "#FC7B54",
    badgeBackground: "#EF4444",
    insightCardBg: "#1C2A43",
    tint: "#FC7B54",
    icon: "#687076",
  },
  dark: {
    background: "#0F172A",
    card: "#1E293B",
    cardElevated: "#283548",
    cardSubtle: "#162032",
    border: "#334155",
    borderLight: "#243044",
    primary: "#FC7B54",
    primaryLight: "#3D2218",
    primaryDark: "#E0623B",
    text: "#F8FAFC",
    textSecondary: "#94A3B8",
    textMuted: "#64748B",
    inputBackground: "#1E293B",
    inputBorder: "#334155",
    tabBarBackground: "#0B1120",
    tabBarBorder: "#1E293B",
    tabIconDefault: "#64748B",
    tabIconSelected: "#FC7B54",
    badgeBackground: "#EF4444",
    insightCardBg: "#1A2333",
    tint: "#FC7B54",
    icon: "#94A3B8",
  },
} as const;

export type ThemeColors = {
  readonly [K in keyof typeof Colors.light]: string;
};
export type ColorSchemeType = "light" | "dark";
export type ThemeMode = "system" | "light" | "dark";

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
