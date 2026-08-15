import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../theme";
import { haptics } from "../lib/haptics";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  wrap = true,
}: {
  options: { value: T; label: string; icon?: string }[];
  value: T;
  onChange: (v: T) => void;
  wrap?: boolean;
}) {
  return (
    <View style={[styles.row, wrap && styles.wrap]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              if (!active) haptics.tap();
              onChange(opt.value);
            }}
            style={[styles.chip, active && styles.chipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
          >
            <Text style={[styles.text, active && styles.textActive]}>
              {opt.icon ? `${opt.icon} ` : ""}
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  wrap: { flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.surfaceMuted,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  text: { fontSize: 12.5, fontWeight: "700", color: colors.inkMuted },
  textActive: { color: "#FFFFFF" },
});
