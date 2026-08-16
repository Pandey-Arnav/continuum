import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme";

type Variant = "primary" | "accent" | "secondary" | "danger" | "ghost";

export function Button({
  label,
  onPress,
  disabled,
  loading,
  variant = "primary",
  icon,
  fullWidth = true,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: Variant;
  icon?: string;
  fullWidth?: boolean;
}) {
  const isDisabled = disabled || loading;
  const palette = VARIANTS[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: palette.bg, borderColor: palette.border, borderWidth: palette.border ? 1 : 0 },
        !fullWidth && styles.inline,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.content}>
          {icon && <Text style={[styles.icon, { color: palette.fg }]}>{icon}</Text>}
          <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const VARIANTS: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.accent, fg: colors.onAccent },
  accent: { bg: colors.primary, fg: colors.onPrimary },
  secondary: { bg: colors.surface, fg: colors.ink, border: colors.borderStrong },
  danger: { bg: colors.danger, fg: "#FFFFFF" },
  ghost: { bg: "transparent", fg: colors.primary },
};

const styles = StyleSheet.create({
  base: {
    paddingVertical: 13,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  inline: { alignSelf: "flex-start", paddingHorizontal: spacing.lg },
  content: { flexDirection: "row", alignItems: "center", gap: 8 },
  icon: { fontSize: 15 },
  label: { fontSize: 14.5, fontWeight: "800", letterSpacing: 0.1 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});
