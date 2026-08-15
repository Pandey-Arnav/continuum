import { StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../theme";

const GLYPH: Record<string, string> = { green: "✓", amber: "!", red: "‼" };

export function FlagBadge({ level, compact }: { level: string; compact?: boolean }) {
  const palette = colors.flag[level as keyof typeof colors.flag] ?? colors.flag.green;
  return (
    <View
      style={[styles.badge, { backgroundColor: palette.bg, borderColor: palette.border }]}
      accessible
      accessibilityLabel={`Flag: ${palette.label}`}
    >
      <View style={[styles.glyphWrap, { backgroundColor: palette.dot }]}>
        <Text style={styles.glyph}>{GLYPH[level] ?? "•"}</Text>
      </View>
      <Text style={[styles.text, { color: palette.fg }]}>{compact ? level.toUpperCase() : palette.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 4,
    paddingRight: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  glyphWrap: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  glyph: { fontSize: 9, fontWeight: "800", color: "#FFFFFF" },
  text: { fontSize: 11.5, fontWeight: "700", letterSpacing: 0.2 },
});
