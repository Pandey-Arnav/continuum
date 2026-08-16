import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { buildFhirBundle } from "@continuum/engine";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { FlagBadge } from "../components/FlagBadge";
import { ScreenHeader } from "../components/ScreenHeader";
import { EntryRow, fetchEntries } from "../lib/entries";
import { haptics } from "../lib/haptics";
import { supabase } from "../lib/supabase";
import { colors, radius, spacing, typography } from "../theme";

export function PatientSummaryScreen({ patientId, patientName, userId }: { patientId: string; patientName: string; userId: string }) {
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await fetchEntries(patientId));
    } catch (error) {
      Alert.alert("Summary unavailable", error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const latestPriority = useMemo(() => entries.find((entry) => entry.flag_level === "red"), [entries]);
  const latest = entries[0];

  async function exportFhir() {
    setExporting(true);
    try {
      const { data: patient } = await supabase
        .from("patients")
        .select("display_name,date_of_birth,external_identifier")
        .eq("id", patientId)
        .single();

      const bundle = buildFhirBundle({
        patient: {
          id: patientId,
          displayName: String(patient?.display_name ?? patientName),
          birthDate: patient?.date_of_birth ?? null,
          externalIdentifier: patient?.external_identifier ?? null,
        },
        entries: entries.map((entry) => ({
          id: entry.id,
          sourceType: entry.source_type,
          createdAt: entry.created_at,
          protocolId: entry.protocol_version_id ?? entry.protocol_id,
          facts: entry.flagged_data,
        })),
      });
      const json = JSON.stringify(bundle, null, 2);
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(json);
        Alert.alert("FHIR bundle copied", "Pilot JSON was copied to the clipboard. Validate it against the receiving system's implementation guide before import.");
      } else {
        await Share.share({ message: json, title: `Continuum FHIR export — ${patientName}` });
      }

      const { error } = await supabase.from("fhir_export_events").insert({
        patient_id: patientId,
        exported_by: userId,
        resource_count: bundle.entry.length,
        fhir_version: "R5-pilot",
        destination: Platform.OS === "web" ? "clipboard" : "native-share-sheet",
      });
      if (error && !/fhir_export_events|schema cache|does not exist/i.test(error.message)) throw error;
      haptics.success();
    } catch (error) {
      haptics.error();
      Alert.alert("Export failed", error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader
        icon="🧾"
        iconTint={colors.accentSoft}
        title={`${patientName} · care summary`}
        subtitle="A lower-complexity view for handoff conversations. It does not replace the full evidence timeline or clinical judgment."
      />

      <View style={styles.safetyNotice} accessibilityRole="alert">
        <Text style={styles.safetyTitle}>Not continuously monitored</Text>
        <Text style={styles.safetyText}>If someone may be seriously unwell, use the local emergency pathway now. Do not wait for this app or a notification.</Text>
      </View>

      {latestPriority ? (
        <Card style={styles.priorityCard} accentColor={colors.danger}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>MOST RECENT PRIORITY ITEM</Text>
              <Text style={styles.title}>{latestPriority.category.replace(/_/g, " ")}</Text>
            </View>
            <FlagBadge level="red" />
          </View>
          <Text style={styles.body}>{latestPriority.handoff_summary}</Text>
          <Text style={styles.meta}>{new Date(latestPriority.created_at).toLocaleString()} · human review: {latestPriority.review_status ?? "not recorded"}</Text>
        </Card>
      ) : (
        <Card style={styles.priorityCard} accentColor={colors.flag.green.dot}>
          <Text style={styles.eyebrow}>CURRENT STATUS</Text>
          <Text style={styles.title}>{loading ? "Loading recent care information…" : "No priority item is recorded"}</Text>
          <Text style={styles.body}>This only describes what has been captured in Continuum. It is not a statement that the person is clinically well.</Text>
        </Card>
      )}

      <View style={styles.grid}>
        <Card style={styles.gridCard}>
          <Text style={styles.eyebrow}>LATEST HANDOFF</Text>
          <Text style={styles.title}>{latest ? latest.source_type.replace(/_/g, " ") : "No handoff yet"}</Text>
          <Text style={styles.body}>{latest?.handoff_summary ?? "Capture a verified visit or discharge document to create a handoff summary."}</Text>
        </Card>
        <Card style={styles.gridCard}>
          <Text style={styles.eyebrow}>RECENT RECORD</Text>
          <Text style={styles.bigNumber}>{entries.length}</Text>
          <Text style={styles.body}>verified or demo encounters in this workspace</Text>
          <Text style={styles.meta}>{entries.filter((entry) => entry.review_status === "human_verified").length} marked human verified</Text>
        </Card>
      </View>

      <Card style={styles.exportCard} accentColor={colors.primary}>
        <View style={styles.exportCopy}>
          <Text style={styles.eyebrow}>INTEROPERABILITY PILOT</Text>
          <Text style={styles.title}>Export a FHIR collection bundle</Text>
          <Text style={styles.body}>Includes Patient, Observation, and Provenance resources. This is a standards-aligned pilot—not a certified EHR integration—and must be validated against the destination profile.</Text>
        </View>
        <Button label="Export pilot FHIR JSON" onPress={exportFhir} loading={exporting} fullWidth={false} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, width: "100%", maxWidth: 1180, alignSelf: "center", backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  content: { paddingBottom: 70 },
  safetyNotice: { borderRadius: radius.lg, borderWidth: 2, borderColor: colors.danger, backgroundColor: colors.dangerSoft, padding: spacing.md, marginBottom: spacing.md },
  safetyTitle: { color: colors.danger, fontSize: 14, fontWeight: "900" },
  safetyText: { color: colors.ink, fontSize: 12, lineHeight: 18, marginTop: 3 },
  priorityCard: { marginBottom: spacing.md },
  rowBetween: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  eyebrow: { ...typography.label, color: colors.primary, marginBottom: 4 },
  title: { color: colors.ink, fontSize: 17, fontWeight: "800", textTransform: "capitalize" },
  body: { color: colors.inkMuted, fontSize: 12.5, lineHeight: 19, marginTop: spacing.sm },
  meta: { color: colors.inkFaint, fontSize: 10, fontWeight: "700", marginTop: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  gridCard: { flex: 1, flexBasis: 320, minWidth: 260, marginBottom: spacing.md },
  bigNumber: { color: colors.accent, fontSize: 40, fontWeight: "900", letterSpacing: -1 },
  exportCard: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.lg },
  exportCopy: { flex: 1, flexBasis: 360, minWidth: 260 },
});
