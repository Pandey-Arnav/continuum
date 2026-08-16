import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Card } from "./Card";
import { colors, spacing, typography } from "../theme";

// A numbered card section (1 Capture / 2 Structured / 3 Handoff) — the
// number badge echoes PipelineSteps' node style so the two visually read as
// the same system instead of two different UI languages.
export function SectionCard({
  index,
  title,
  tint,
  style,
  children,
}: {
  index: number;
  title: string;
  tint?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  return (
    <Card style={[styles.card, tint && { backgroundColor: tint }, style]}>
      <View style={styles.header}>
        <View style={[styles.badge, tint && { backgroundColor: colors.surface }]}>
          <Text style={[styles.badgeText, tint && { color: colors.ink }]}>{index}</Text>
        </View>
        <Text style={typography.bodyStrong}>{title}</Text>
      </View>
      {children}
    </Card>
  );
}

const BADGE_SIZE = 22;

const styles = StyleSheet.create({
  card: { marginBottom: 0 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 11.5, fontWeight: "800", color: colors.onPrimary },
});
