import { StyleSheet, Text, View } from "react-native";

const FLAG_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  green: { bg: "#DCFCE7", fg: "#166534", label: "Informational" },
  amber: { bg: "#FEF3C7", fg: "#92400E", label: "Worth a look" },
  red: { bg: "#FEE2E2", fg: "#991B1B", label: "Immediate concern" },
};

export function FlagBadge({ level, compact }: { level: string; compact?: boolean }) {
  const colors = FLAG_COLORS[level] ?? FLAG_COLORS.green;
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <View style={[styles.dot, { backgroundColor: colors.fg }]} />
      <Text style={[styles.text, { color: colors.fg }]}>{compact ? level.toUpperCase() : colors.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
  },
});
