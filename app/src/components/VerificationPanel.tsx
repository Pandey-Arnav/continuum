import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { FlaggedEntry } from "@continuum/engine";
import { Card } from "./Card";
import { colors, radius, spacing, typography } from "../theme";

export function VerificationPanel({
  facts,
  confirmed,
  onToggle,
  onEdit,
  correctionReasons = {},
  onCorrectionReasonChange,
}: {
  facts: FlaggedEntry[];
  confirmed: Set<number>;
  onToggle: (index: number) => void;
  onEdit?: (index: number, value: string) => void;
  correctionReasons?: Record<number, string>;
  onCorrectionReasonChange?: (index: number, reason: string) => void;
}) {
  const complete = facts.length > 0 && confirmed.size === facts.length;
  return (
    <Card style={styles.card} accentColor={complete ? colors.flag.green.dot : colors.primary}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>HUMAN-IN-THE-LOOP</Text>
          <Text style={styles.title}>Verify every extracted fact</Text>
          <Text style={styles.subtitle}>Compare each value with its source evidence before saving it to the patient timeline.</Text>
        </View>
        <View style={[styles.status, complete && styles.statusComplete]}>
          <Text style={[styles.statusText, complete && styles.statusTextComplete]}>{confirmed.size}/{facts.length} VERIFIED</Text>
        </View>
      </View>

      {facts.map((fact, index) => {
        const checked = confirmed.has(index);
        return (
          <View
            key={`${fact.category}-${index}`}
            style={[styles.fact, checked && styles.factChecked]}
          >
            <Pressable
              onPress={() => onToggle(index)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={`Verify ${fact.category.replace(/_/g, " ")}`}
              hitSlop={10}
              style={({ pressed }) => [styles.checkboxButton, pressed && styles.pressed]}
            >
              <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                <Text style={styles.checkmark}>{checked ? "✓" : ""}</Text>
              </View>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.factCategory}>{fact.category.replace(/_/g, " ")}</Text>
              {onEdit ? (
                <View style={styles.valueRow}>
                  <TextInput
                    value={String(fact.value)}
                    onChangeText={(value) => onEdit(index, value)}
                    accessibilityLabel={`Correct ${fact.category.replace(/_/g, " ")} value`}
                    style={styles.valueInput}
                  />
                  {fact.unit && <Text style={styles.unit}>{fact.unit}</Text>}
                </View>
              ) : (
                <Text style={styles.factValue}>{String(fact.value)} {fact.unit ?? ""}</Text>
              )}
              <Text style={[styles.evidenceLabel, !fact.evidenceVerified && styles.evidenceWarning]}>
                {fact.evidenceVerified ? "SOURCE MATCHED" : "SOURCE NEEDS REVIEW"}
              </Text>
              <Text style={styles.evidenceText}>“{fact.note || "No exact source snippet was returned—review the raw capture before confirming."}”</Text>
              <Text style={styles.ruleText}>rule · {fact.ruleId}</Text>
              {onCorrectionReasonChange && Object.prototype.hasOwnProperty.call(correctionReasons, index) && (
                <View style={styles.correctionBox}>
                  <Text style={styles.correctionLabel}>CORRECTION REASON · REQUIRED</Text>
                  <TextInput
                    value={correctionReasons[index]}
                    onChangeText={(reason) => onCorrectionReasonChange(index, reason)}
                    placeholder="Why was the extracted value changed?"
                    placeholderTextColor={colors.inkFaint}
                    accessibilityLabel={`Correction reason for ${fact.category.replace(/_/g, " ")}`}
                    style={styles.reasonInput}
                  />
                </View>
              )}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, marginBottom: spacing.md },
  eyebrow: { ...typography.label, color: colors.primary, marginBottom: 3 },
  title: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  subtitle: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 3, maxWidth: 620 },
  status: { borderRadius: radius.pill, backgroundColor: colors.primarySoft, paddingHorizontal: 8, paddingVertical: 5 },
  statusComplete: { backgroundColor: colors.flag.green.bg },
  statusText: { color: colors.primaryDark, fontSize: 8, fontWeight: "900" },
  statusTextComplete: { color: colors.flag.green.fg },
  fact: { flexDirection: "row", gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm, backgroundColor: colors.surface },
  factChecked: { borderColor: colors.flag.green.border, backgroundColor: colors.flag.green.bg },
  checkboxButton: { width: 36, height: 44, alignItems: "center", justifyContent: "flex-start", paddingTop: 1 },
  pressed: { opacity: 0.7 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: colors.flag.green.dot, borderColor: colors.flag.green.dot },
  checkmark: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  factCategory: { color: colors.inkFaint, fontSize: 8.5, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5 },
  factValue: { color: colors.ink, fontSize: 12.5, fontWeight: "800", marginTop: 3 },
  valueRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 4 },
  valueInput: { minWidth: 120, minHeight: 44, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.ink, fontSize: 13, fontWeight: "800", paddingHorizontal: spacing.sm },
  unit: { color: colors.inkMuted, fontSize: 11, fontWeight: "700" },
  evidenceLabel: { color: colors.inkFaint, fontSize: 7.5, fontWeight: "900", letterSpacing: 0.8, marginTop: 7 },
  evidenceWarning: { color: colors.flag.amber.fg },
  evidenceText: { color: colors.inkMuted, fontSize: 10.5, lineHeight: 15, marginTop: 2 },
  ruleText: { ...typography.mono, marginTop: 5 },
  correctionBox: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.flag.amber.border, paddingTop: spacing.sm },
  correctionLabel: { color: colors.flag.amber.fg, fontSize: 7.5, fontWeight: "900", letterSpacing: 0.7 },
  reasonInput: { minHeight: 44, marginTop: 4, borderWidth: 1, borderColor: colors.flag.amber.border, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.ink, fontSize: 11, paddingHorizontal: spacing.sm },
});
