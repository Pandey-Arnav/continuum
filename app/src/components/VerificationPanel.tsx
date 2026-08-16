import { Pressable, StyleSheet, Text, View } from "react-native";
import type { FlaggedEntry } from "@continuum/engine";
import { Card } from "./Card";
import { colors, radius, spacing, typography } from "../theme";

export function VerificationPanel({
  facts,
  confirmed,
  onToggle,
}: {
  facts: FlaggedEntry[];
  confirmed: Set<number>;
  onToggle: (index: number) => void;
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
          <Pressable
            key={`${fact.category}-${index}`}
            onPress={() => onToggle(index)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={`Verify ${fact.category.replace(/_/g, " ")}`}
            style={({ pressed }) => [styles.fact, checked && styles.factChecked, pressed && { opacity: 0.75 }]}
          >
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
              <Text style={styles.checkmark}>{checked ? "✓" : ""}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.factValue}>{fact.category.replace(/_/g, " ")}: {String(fact.value)} {fact.unit ?? ""}</Text>
              <Text style={[styles.evidenceLabel, !fact.evidenceVerified && styles.evidenceWarning]}>
                {fact.evidenceVerified ? "SOURCE MATCHED" : "SOURCE NEEDS REVIEW"}
              </Text>
              <Text style={styles.evidenceText}>“{fact.note || "No exact source snippet was returned—review the raw capture before confirming."}”</Text>
              <Text style={styles.ruleText}>rule · {fact.ruleId}</Text>
            </View>
          </Pressable>
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
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: colors.flag.green.dot, borderColor: colors.flag.green.dot },
  checkmark: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  factValue: { color: colors.ink, fontSize: 12.5, fontWeight: "800" },
  evidenceLabel: { color: colors.inkFaint, fontSize: 7.5, fontWeight: "900", letterSpacing: 0.8, marginTop: 7 },
  evidenceWarning: { color: colors.flag.amber.fg },
  evidenceText: { color: colors.inkMuted, fontSize: 10.5, lineHeight: 15, marginTop: 2 },
  ruleText: { ...typography.mono, marginTop: 5 },
});
