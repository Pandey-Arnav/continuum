import { Platform } from "react-native";

export const colors = {
  bg: "#F1F5F9",
  surface: "#FFFFFF",
  surfaceMuted: "#F5F8FB",
  border: "#E1E9F0",
  borderStrong: "#CBD8E3",
  ink: "#21304E",
  inkMuted: "#5E6C82",
  inkFaint: "#93A0B4",
  onDark: "#F8FAFF",

  primary: "#12BFC2",
  primaryDark: "#087E88",
  primarySoft: "#E1FAF9",
  onPrimary: "#FFFFFF",

  accent: "#3F4DDB",
  accentSoft: "#E8EAFF",
  onAccent: "#FFFFFF",

  hero: "#004744",
  utility: "#00756F",
  aqua: "#48E4DC",
  aquaPale: "#CFF7F3",

  danger: "#D6304A",
  dangerSoft: "#FCEAEC",

  flag: {
    green: { bg: "#E2F5EC", fg: "#176843", border: "#B9E4D0", dot: "#218B5B", label: "Stable" },
    amber: { bg: "#FFF3D9", fg: "#805006", border: "#EED79F", dot: "#C37D0A", label: "Worth a look" },
    red: { bg: "#FBE8EA", fg: "#A42137", border: "#EDC0C6", dot: "#C92B43", label: "Needs attention" },
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
  sm: 5,
  md: 8,
  lg: 11,
  xl: 13,
  pill: 999,
};

const monoFont = Platform.select({ ios: "Menlo", android: "monospace", default: "Courier" });

export const typography = {
  display: { fontSize: 24, fontWeight: "800" as const, color: colors.ink, letterSpacing: -0.5 },
  title: { fontSize: 17, fontWeight: "700" as const, color: colors.ink },
  subtitle: { fontSize: 13, fontWeight: "500" as const, color: colors.inkMuted, lineHeight: 19 },
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
    ios: { shadowColor: "#23375B", shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    android: { elevation: 2 },
    default: { boxShadow: "0 2px 8px rgba(35,55,91,0.07)" },
  }),
  md: Platform.select({
    ios: { shadowColor: "#23375B", shadowOpacity: 0.11, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 5 },
    default: { boxShadow: "0 7px 20px rgba(35,55,91,0.10)" },
  }),
};

export const PIPELINE_STAGES = [
  { key: "capture", label: "Capture", icon: "①" },
  { key: "structure", label: "Structure", icon: "②" },
  { key: "compare", label: "Compare", icon: "③" },
  { key: "flag", label: "Flag", icon: "④" },
  { key: "handoff", label: "Handoff", icon: "⑤" },
] as const;
