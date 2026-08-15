import { Platform } from "react-native";

export const colors = {
  bg: "#F6F7FB",
  surface: "#FFFFFF",
  surfaceMuted: "#F1F3F9",
  border: "#E6E9F2",
  borderStrong: "#D3D8E4",
  ink: "#12172B",
  inkMuted: "#5C6376",
  inkFaint: "#98A0B3",
  onDark: "#F8FAFF",

  primary: "#0C7C74",
  primaryDark: "#075E58",
  primarySoft: "#E3F5F2",
  onPrimary: "#FFFFFF",

  accent: "#4F46E5",
  accentSoft: "#EEEDFC",
  onAccent: "#FFFFFF",

  danger: "#D6304A",
  dangerSoft: "#FCEAEC",

  flag: {
    green: { bg: "#E9F7EE", fg: "#177A43", border: "#BFE8CE", dot: "#1E9450", label: "Stable" },
    amber: { bg: "#FDF3E0", fg: "#9A5B06", border: "#F5DBA0", dot: "#D98C0E", label: "Worth a look" },
    red: { bg: "#FBE9EA", fg: "#B0233A", border: "#F2C1C6", dot: "#D6304A", label: "Needs attention" },
  } as const,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
};

const monoFont = Platform.select({ ios: "Menlo", android: "monospace", default: "Courier" });

export const typography = {
  display: { fontSize: 24, fontWeight: "800" as const, color: colors.ink, letterSpacing: -0.4 },
  title: { fontSize: 17, fontWeight: "700" as const, color: colors.ink },
  subtitle: { fontSize: 13, fontWeight: "500" as const, color: colors.inkMuted, lineHeight: 18 },
  body: { fontSize: 14, fontWeight: "400" as const, color: colors.ink, lineHeight: 20 },
  bodyStrong: { fontSize: 14, fontWeight: "700" as const, color: colors.ink },
  label: {
    fontSize: 11,
    fontWeight: "800" as const,
    color: colors.inkFaint,
    letterSpacing: 0.6,
  },
  caption: { fontSize: 12, fontWeight: "500" as const, color: colors.inkMuted },
  mono: { fontFamily: monoFont, fontSize: 11, color: colors.inkFaint },
};

export const shadow = {
  sm: Platform.select({
    ios: { shadowColor: "#101426", shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    android: { elevation: 2 },
    default: { boxShadow: "0 1px 4px rgba(16,20,38,0.06)" },
  }),
  md: Platform.select({
    ios: { shadowColor: "#101426", shadowOpacity: 0.09, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 5 },
    default: { boxShadow: "0 6px 18px rgba(16,20,38,0.09)" },
  }),
};

export const PIPELINE_STAGES = [
  { key: "capture", label: "Capture", icon: "①" },
  { key: "structure", label: "Structure", icon: "②" },
  { key: "compare", label: "Compare", icon: "③" },
  { key: "flag", label: "Flag", icon: "④" },
  { key: "handoff", label: "Handoff", icon: "⑤" },
] as const;
