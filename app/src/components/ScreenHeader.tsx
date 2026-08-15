import { StyleSheet, Text, View } from "react-native";
import { radius, spacing, typography } from "../theme";

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
        <Text style={typography.display}>{title}</Text>
        <Text style={[typography.subtitle, styles.subtitle]}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, marginBottom: spacing.lg },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { fontSize: 21 },
  textCol: { flex: 1, paddingTop: 2 },
  subtitle: { marginTop: 3 },
});
