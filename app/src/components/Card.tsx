import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { colors, radius, shadow, spacing } from "../theme";

export function Card({
  children,
  style,
  accentColor,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accentColor?: string;
  padded?: boolean;
}) {
  return (
    <View style={[styles.card, padded && styles.padded, style]}>
      {accentColor && <View style={[styles.accentBar, { backgroundColor: accentColor }]} />}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...(shadow.sm as object),
  },
  padded: { padding: spacing.lg },
  accentBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
});
