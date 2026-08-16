import { StyleSheet, Text, View } from "react-native";
import { colors, radius, shadow, spacing } from "../theme";

export function ScreenHeader({
  icon,
  iconTint,
  title,
  subtitle,
}: {
  icon: string;
  iconTint: string;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: iconTint }]}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <View style={styles.textCol}>
        <Text style={styles.eyebrow}>CONTINUUM WORKSPACE</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <View style={styles.headerMeta}>
        <View style={styles.liveDot} />
        <Text style={styles.headerMetaText}>LIVE</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    minHeight: 96,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...(shadow.sm as object),
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: { fontSize: 21 },
  textCol: { flex: 1 },
  eyebrow: { color: colors.primary, fontSize: 8.5, fontWeight: "800", letterSpacing: 1.2, marginBottom: 4 },
  title: { color: colors.ink, fontSize: 23, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { color: colors.inkMuted, fontSize: 11.5, fontWeight: "500", lineHeight: 17, marginTop: 3, maxWidth: 760 },
  headerMeta: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.primarySoft, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.pill },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  headerMetaText: { color: colors.primaryDark, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
});
