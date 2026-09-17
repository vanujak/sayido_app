import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme as useDeviceColorScheme } from "react-native";
import { Colors, ColorSchemeType, ThemeColors, ThemeMode } from "@/constants/theme";
import { getVendorSession, setVendorSession } from "@/lib/vendor-session";

type ThemeContextType = {
  theme: ColorSchemeType;
  themeMode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  themeMode: "system",
  isDark: false,
  colors: Colors.light,
  setThemeMode: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const deviceColorScheme = useDeviceColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    return getVendorSession().themeMode || "system";
  });

  // Sync with session storage on mount
  useEffect(() => {
    const saved = getVendorSession().themeMode;
    if (saved && saved !== themeMode) {
      setThemeModeState(saved);
    }
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    setVendorSession({ themeMode: mode });
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeModeState((current) => {
      const active =
        current === "system"
          ? deviceColorScheme === "dark"
            ? "dark"
            : "light"
          : current;
      const nextMode: ThemeMode = active === "dark" ? "light" : "dark";
      setVendorSession({ themeMode: nextMode });
      return nextMode;
    });
  }, [deviceColorScheme]);

  const effectiveTheme: ColorSchemeType = useMemo(() => {
    if (themeMode === "dark") return "dark";
    if (themeMode === "light") return "light";
    return deviceColorScheme === "dark" ? "dark" : "light";
  }, [themeMode, deviceColorScheme]);

  const isDark = effectiveTheme === "dark";
  const colors = Colors[effectiveTheme];

  const value = useMemo<ThemeContextType>(
    () => ({
      theme: effectiveTheme,
      themeMode,
      isDark,
      colors,
      setThemeMode,
      toggleTheme,
    }),
    [effectiveTheme, themeMode, isDark, colors, setThemeMode, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useAppTheme must be used within a ThemeProvider");
  }
  return context;
}
