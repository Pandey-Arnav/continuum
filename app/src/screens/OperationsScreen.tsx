import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { antenatalNcdProtocol, dischargeRedFlagsProtocol } from "@continuum/engine";
import { Card } from "../components/Card";
import { ScreenHeader } from "../components/ScreenHeader";
import { EntryRow, fetchEntries } from "../lib/entries";
import { getOutboxState, OutboxState, subscribeOutbox } from "../lib/outbox";
import { supabase } from "../lib/supabase";
import { haptics } from "../lib/haptics";
import { colors, radius, spacing, typography } from "../theme";

interface CareNotification {
  id: string;
  title: string;
  message: string;
  status: "unread" | "read" | "acknowledged";
  created_at: string;
}

interface ProtocolVersionRow {
  id: string;
  name: string;
  version: string;
  status: "draft_unapproved" | "clinically_approved" | "retired";
  source_title?: string | null;
  approved_at?: string | null;
}

export function OperationsScreen({ patientId }: { patientId: string }) {
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [correctionCount, setCorrectionCount] = useState(0);
  const [workflowEvents, setWorkflowEvents] = useState<Array<{ success: boolean; duration_ms?: number | null }>>([]);
  const [notifications, setNotifications] = useState<CareNotification[]>([]);
  const [protocols, setProtocols] = useState<ProtocolVersionRow[]>([]);
  const [outbox, setOutbox] = useState<OutboxState>({ count: 0, bytes: 0, syncing: false, storage: "volatile-web" });
  const [refreshing, setRefreshing] = useState(false);
  const [migrationNeeded, setMigrationNeeded] = useState(false);

  const load = useCallback(async () => {
    const [entryRows, corrections, workflows, noticeRows, protocolRows] = await Promise.all([
      fetchEntries(patientId),
      supabase.from("entry_corrections").select("id", { count: "exact", head: true }).eq("patient_id", patientId),
      supabase.from("workflow_events").select("success,duration_ms").eq("patient_id", patientId).limit(500),
      supabase.from("care_notifications").select("id,title,message,status,created_at").eq("patient_id", patientId).order("created_at", { ascending: false }).limit(20),
      supabase.from("protocol_versions").select("id,name,version,status,source_title,approved_at").order("name"),
    ]);
    setEntries(entryRows);
    setMigrationNeeded(Boolean(corrections.error || workflows.error || noticeRows.error || protocolRows.error));
    if (!corrections.error) setCorrectionCount(corrections.count ?? 0);
    if (!workflows.error) setWorkflowEvents(workflows.data ?? []);
    if (!noticeRows.error) setNotifications((noticeRows.data ?? []) as CareNotification[]);
    if (!protocolRows.error) setProtocols((protocolRows.data ?? []) as ProtocolVersionRow[]);
    else {
      setProtocols([
        { id: antenatalNcdProtocol.id, name: antenatalNcdProtocol.name, version: antenatalNcdProtocol.governance.version, status: antenatalNcdProtocol.governance.status, source_title: antenatalNcdProtocol.governance.sourceTitle },
        { id: dischargeRedFlagsProtocol.id, name: dischargeRedFlagsProtocol.name, version: dischargeRedFlagsProtocol.governance.version, status: dischargeRedFlagsProtocol.governance.status, source_title: dischargeRedFlagsProtocol.governance.sourceTitle },
      ]);
    }
  }, [patientId]);

  useEffect(() => {
    void load().catch((error) => Alert.alert("Operations unavailable", error instanceof Error ? error.message : String(error)));
    void getOutboxState().then(setOutbox);
    return subscribeOutbox(setOutbox);
  }, [load]);

  const metrics = useMemo(() => {
    const facts = entries.flatMap((entry) => entry.flagged_data ?? []);
    const verified = entries.filter((entry) => entry.review_status === "human_verified").length;
    const evidenceMatched = facts.filter((fact) => fact.evidenceVerified).length;
    const successfulWorkflows = workflowEvents.filter((event) => event.success).length;
    const durations = workflowEvents.map((event) => event.duration_ms).filter((duration): duration is number => typeof duration === "number");
    return {
      reviewRate: entries.length ? Math.round((verified / entries.length) * 100) : 0,
      evidenceRate: facts.length ? Math.round((evidenceMatched / facts.length) * 100) : 0,
      workflowRate: workflowEvents.length ? Math.round((successfulWorkflows / workflowEvents.length) * 100) : 0,
      medianDuration: median(durations),
    };
  }, [entries, workflowEvents]);

  async function refresh() {
    setRefreshing(true);
    await Promise.all([load(), getOutboxState().then(setOutbox)]).catch(() => undefined);
    setRefreshing(false);
  }

  async function acknowledge(notificationId: string) {
    const { error } = await supabase.rpc("acknowledge_care_notification", { target_notification_id: notificationId });
    if (error) {
      Alert.alert("Could not acknowledge", error.message);
      return;
    }
    haptics.success();
    setNotifications((current) => current.map((notice) => notice.id === notificationId ? { ...notice, status: "acknowledged" } : notice));
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      <ScreenHeader
        icon="📈"
        iconTint={colors.primarySoft}
        title="Safety & operations"
        subtitle="Product telemetry, red-flag acknowledgements, protocol governance, and explicit readiness gates for this patient workspace."
      />

      {migrationNeeded && (
        <View style={styles.migrationNotice} accessibilityRole="alert">
          <Text style={styles.migrationTitle}>Year-one database upgrade pending</Text>
          <Text style={styles.migrationText}>Apply migration 0005 to enable corrections, notifications, operational telemetry, and protocol registry data.</Text>
        </View>
      )}

      <View style={styles.metricsGrid}>
        <Metric value={`${metrics.reviewRate}%`} label="Human review rate" note={`${entries.length} total entries`} tone={colors.primary} />
        <Metric value={`${metrics.evidenceRate}%`} label="Evidence match rate" note="Exact source-snippet matches" tone={colors.accent} />
        <Metric value={String(correctionCount)} label="Corrections appended" note="Original facts remain immutable" tone={colors.danger} />
        <Metric value={String(outbox.count)} label="Pending offline sync" note={`${formatBytes(outbox.bytes)} · ${outbox.storage}`} tone="#C37D0A" />
        <Metric value={`${metrics.workflowRate}%`} label="Workflow success" note={`${workflowEvents.length} measured runs`} tone="#218B5B" />
        <Metric value={metrics.medianDuration ? `${(metrics.medianDuration / 1000).toFixed(1)}s` : "—"} label="Median workflow time" note="Measured, not estimated" tone="#00756F" />
      </View>

      <Text style={styles.sectionLabel}>PROTOCOL GOVERNANCE</Text>
      <View style={styles.protocolGrid}>
        {protocols.map((protocol) => {
          const approved = protocol.status === "clinically_approved" && Boolean(protocol.approved_at);
          return (
            <Card key={protocol.id} style={styles.protocolCard} accentColor={approved ? colors.flag.green.dot : colors.danger}>
              <View style={styles.rowBetween}>
                <Text style={styles.protocolVersion}>VERSION {protocol.version}</Text>
                <View style={[styles.statusPill, approved ? styles.approvedPill : styles.draftPill]}>
                  <Text style={[styles.statusText, approved ? styles.approvedText : styles.draftText]}>{approved ? "CLINICALLY APPROVED" : "DRAFT — CLINICAL USE BLOCKED"}</Text>
                </View>
              </View>
              <Text style={styles.protocolName}>{protocol.name}</Text>
              <Text style={styles.protocolSource}>{protocol.source_title ?? "Clinical source and owner required before release."}</Text>
            </Card>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
      <Card style={styles.noticeCard}>
        {notifications.length === 0 ? (
          <Text style={styles.emptyText}>No red-entry notifications are visible for this signed-in user.</Text>
        ) : notifications.map((notice, index) => (
          <View key={notice.id} style={[styles.notification, index > 0 && styles.notificationBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.notificationTitle}>{notice.title}</Text>
              <Text style={styles.notificationText}>{notice.message}</Text>
              <Text style={styles.notificationMeta}>{new Date(notice.created_at).toLocaleString()} · {notice.status}</Text>
            </View>
            {notice.status !== "acknowledged" && (
              <Pressable onPress={() => void acknowledge(notice.id)} accessibilityRole="button" accessibilityLabel={`Acknowledge ${notice.title}`} style={styles.ackButton}>
                <Text style={styles.ackButtonText}>Acknowledge</Text>
              </Pressable>
            )}
          </View>
        ))}
      </Card>

      <View style={styles.releaseGate} accessibilityRole="text">
        <Text style={styles.releaseGateTitle}>Production release is intentionally blocked</Text>
        <Text style={styles.releaseGateText}>Required evidence still includes local clinical approval, threat-model review, accessibility acceptance, target-FHIR validation, incident-response rehearsal, and a consented partner pilot.</Text>
      </View>
    </ScrollView>
  );
}

function Metric({ value, label, note, tone }: { value: string; label: string; note: string; tone: string }) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricMark, { backgroundColor: tone }]} />
      <Text style={[styles.metricValue, { color: tone }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricNote}>{note}</Text>
    </View>
  );
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const styles = StyleSheet.create({
  container: { flex: 1, width: "100%", maxWidth: 1180, alignSelf: "center", backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  content: { paddingBottom: 70 },
  migrationNotice: { borderWidth: 1, borderColor: colors.flag.amber.border, backgroundColor: colors.flag.amber.bg, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  migrationTitle: { color: colors.flag.amber.fg, fontSize: 13, fontWeight: "900" },
  migrationText: { color: colors.ink, fontSize: 11, lineHeight: 16, marginTop: 3 },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg },
  metricCard: { flexGrow: 1, flexBasis: 165, minWidth: 150, minHeight: 122, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  metricMark: { width: 24, height: 4, borderRadius: 2, marginBottom: spacing.sm },
  metricValue: { fontSize: 25, fontWeight: "900", letterSpacing: -0.5 },
  metricLabel: { color: colors.ink, fontSize: 11.5, fontWeight: "800", marginTop: 2 },
  metricNote: { color: colors.inkFaint, fontSize: 9.5, marginTop: 3 },
  sectionLabel: { ...typography.label, color: colors.primaryDark, marginBottom: spacing.sm, marginTop: spacing.sm },
  protocolGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing.md },
  protocolCard: { flex: 1, flexBasis: 420, minWidth: 280 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  protocolVersion: { color: colors.inkFaint, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 5 },
  approvedPill: { backgroundColor: colors.flag.green.bg },
  draftPill: { backgroundColor: colors.dangerSoft },
  statusText: { fontSize: 7.5, fontWeight: "900" },
  approvedText: { color: colors.flag.green.fg },
  draftText: { color: colors.danger },
  protocolName: { color: colors.ink, fontSize: 14, fontWeight: "800", marginTop: spacing.md },
  protocolSource: { color: colors.inkMuted, fontSize: 10.5, lineHeight: 15, marginTop: 4 },
  noticeCard: { marginBottom: spacing.md },
  notification: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  notificationBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  notificationTitle: { color: colors.ink, fontSize: 12.5, fontWeight: "800" },
  notificationText: { color: colors.inkMuted, fontSize: 10.5, lineHeight: 15, marginTop: 2 },
  notificationMeta: { color: colors.inkFaint, fontSize: 9, marginTop: 4, textTransform: "capitalize" },
  ackButton: { minHeight: 44, justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.accent, paddingHorizontal: spacing.md },
  ackButtonText: { color: colors.onAccent, fontSize: 10.5, fontWeight: "800" },
  emptyText: { color: colors.inkMuted, fontSize: 11.5 },
  releaseGate: { borderRadius: radius.lg, backgroundColor: colors.accent, padding: spacing.lg },
  releaseGateTitle: { color: colors.onAccent, fontSize: 14, fontWeight: "900" },
  releaseGateText: { color: "rgba(255,255,255,0.82)", fontSize: 11.5, lineHeight: 18, marginTop: 4 },
});
