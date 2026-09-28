export type ThemeMode = "dark" | "light";

export type AppColors = {
  background: string;
  surface: string;
  surfaceRaised: string;
  ink: string;
  inkBright: string;
  muted: string;
  accent: string;
  accentDim: string;
  accentGlow: string;
  info: string;
  warning: string;
  danger: string;
  dangerDim: string;
  line: string;
  lineSubtle: string;
  success: string;
  inputBg: string;
  chipBg: string;
  chipText: string;
  headerBg: string;
  drawerBg: string;
  drawerActiveBg: string;
  overlay: string;
  footerMuted: string;
};

export const darkColors: AppColors = {
  background: "#0B1220",
  surface: "#121A2B",
  surfaceRaised: "#1A2438",
  ink: "#CBD5E1",
  inkBright: "#F8FAFC",
  muted: "#94A3B8",
  accent: "#0D9488",
  accentDim: "rgba(13, 148, 136, 0.18)",
  accentGlow: "rgba(13, 148, 136, 0.28)",
  info: "#38BDF8",
  warning: "#FBBF24",
  danger: "#F87171",
  dangerDim: "rgba(248, 113, 113, 0.14)",
  line: "#243044",
  lineSubtle: "#162033",
  success: "#0D9488",
  inputBg: "#1A2438",
  chipBg: "#1A2438",
  chipText: "#CBD5E1",
  headerBg: "#121A2B",
  drawerBg: "#0B1220",
  drawerActiveBg: "rgba(13, 148, 136, 0.14)",
  overlay: "rgba(0,0,0,0.55)",
  footerMuted: "#64748B",
};

export const lightColors: AppColors = {
  background: "#F4F7FB",
  surface: "#FFFFFF",
  surfaceRaised: "#F8FAFC",
  ink: "#475569",
  inkBright: "#0F172A",
  muted: "#64748B",
  accent: "#0F766E",
  accentDim: "rgba(15, 118, 110, 0.10)",
  accentGlow: "rgba(15, 118, 110, 0.22)",
  info: "#0369A1",
  warning: "#D97706",
  danger: "#DC2626",
  dangerDim: "rgba(220, 38, 38, 0.10)",
  line: "#E2E8F0",
  lineSubtle: "#EEF2F7",
  success: "#0F766E",
  inputBg: "#FFFFFF",
  chipBg: "#EEF2F7",
  chipText: "#334155",
  headerBg: "#FFFFFF",
  drawerBg: "#FFFFFF",
  drawerActiveBg: "rgba(15, 118, 110, 0.10)",
  overlay: "rgba(15, 23, 42, 0.35)",
  footerMuted: "#94A3B8",
};

/** @deprecated use useTheme().colors */
export const colors = darkColors;
