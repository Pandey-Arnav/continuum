import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { ScreenHeader } from "../components/ScreenHeader";
import { PatientWorkspace } from "../lib/session";
import { supabase } from "../lib/supabase";
import { haptics } from "../lib/haptics";
import { colors, radius, spacing, typography } from "../theme";

type ConsentKind = "capture_processing" | "raw_evidence_storage" | "provider_processing" | "research_use";
type ConsentState = "granted" | "declined" | "revoked";
type DataRequestType = "export" | "correction" | "deletion";

const CONSENT_KINDS: Array<{ key: ConsentKind; label: string }> = [
  { key: "capture_processing", label: "Capture processing" },
  { key: "raw_evidence_storage", label: "Raw evidence storage" },
  { key: "provider_processing", label: "External provider processing" },
  { key: "research_use", label: "Research use" },
];

export function WorkspaceScreen({
  userId,
  selectedPatientId,
  workspaces,
  onSelectPatient,
  onWorkspacesChanged,
}: {
  userId: string;
  selectedPatientId: string;
  workspaces: PatientWorkspace[];
  onSelectPatient: (patientId: string) => void;
  onWorkspacesChanged: (preferredPatientId?: string) => Promise<void>;
}) {
  const [newPatientName, setNewPatientName] = useState("");
  const [retentionDate, setRetentionDate] = useState("");
  const [consentKind, setConsentKind] = useState<ConsentKind>("capture_processing");
  const [consentState, setConsentState] = useState<ConsentState>("granted");
  const [policyVersion, setPolicyVersion] = useState("pilot-privacy-v1");
  const [dataRequestType, setDataRequestType] = useState<DataRequestType>("export");
  const [latestConsents, setLatestConsents] = useState<Record<string, ConsentState>>({});
  const [assignments, setAssignments] = useState<Array<{ id: string; priority: string; status: string; due_at?: string | null }>>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const loadGovernance = useCallback(async () => {
    const [consentResponse, assignmentResponse] = await Promise.all([
      supabase
        .from("consent_records")
        .select("kind,state,recorded_at")
        .eq("patient_id", selectedPatientId)
        .order("recorded_at", { ascending: false }),
      supabase
        .from("patient_assignments")
        .select("id,priority,status,due_at")
        .eq("patient_id", selectedPatientId)
        .order("created_at", { ascending: false }),
    ]);

    if (!consentResponse.error) {
      const latest: Record<string, ConsentState> = {};
      for (const record of consentResponse.data ?? []) {
        if (!(record.kind in latest)) latest[record.kind] = record.state as ConsentState;
      }
      setLatestConsents(latest);
    }
    if (!assignmentResponse.error) setAssignments(assignmentResponse.data ?? []);
  }, [selectedPatientId]);

  useEffect(() => {
    void loadGovernance();
  }, [loadGovernance]);

  async function runAction(name: string, action: () => Promise<void>) {
    setBusyAction(name);
    try {
      await action();
      haptics.success();
    } catch (error) {
      haptics.error();
      const detail = error instanceof Error ? error.message : String(error);
      Alert.alert("Year-one feature unavailable", `${detail}\n\nApply Supabase migration 0005_year_one_foundation.sql if this database has not been upgraded.`);
    } finally {
      setBusyAction(null);
    }
  }

  function createPatient() {
    const displayName = newPatientName.trim();
    if (displayName.length < 2) {
      Alert.alert("Name required", "Enter a patient or family workspace name.");
      return;
    }
    void runAction("create", async () => {
      const { data, error } = await supabase.rpc("create_care_workspace", { patient_display_name: displayName });
      if (error) throw error;
      setNewPatientName("");
      await onWorkspacesChanged(String(data));
    });
  }

  function assignToMe() {
    void runAction("assign", async () => {
      const { error } = await supabase.from("patient_assignments").insert({
        patient_id: selectedPatientId,
        assignee_id: userId,
        assigned_by: userId,
        priority: "amber",
        notes: "Self-assigned from the Continuum operations workspace",
      });
      if (error) throw error;
      await loadGovernance();
    });
  }

  function completeAssignment(assignmentId: string) {
    void runAction(`assignment-${assignmentId}`, async () => {
      const { error } = await supabase.rpc("set_patient_assignment_status", {
        target_assignment_id: assignmentId,
        assignment_status_value: "completed",
      });
      if (error) throw error;
      await loadGovernance();
    });
  }

  function recordConsent() {
    if (!policyVersion.trim()) {
      Alert.alert("Policy version required", "Consent must reference the exact policy shown to the person.");
      return;
    }
    void runAction("consent", async () => {
      const { error } = await supabase.rpc("record_patient_consent", {
        target_patient_id: selectedPatientId,
        consent_kind_value: consentKind,
        consent_state_value: consentState,
        policy_version_value: policyVersion.trim(),
        consent_notes: "Recorded in the Continuum governance workspace",
      });
      if (error) throw error;
      await loadGovernance();
    });
  }

  function saveRetention() {
    if (retentionDate && !/^\d{4}-\d{2}-\d{2}$/.test(retentionDate)) {
      Alert.alert("Use YYYY-MM-DD", "For example: 2027-08-16.");
      return;
    }
    void runAction("retention", async () => {
      const { error } = await supabase.rpc("set_patient_retention", {
        target_patient_id: selectedPatientId,
        retention_date: retentionDate || null,
      });
      if (error) throw error;
      Alert.alert("Retention updated", retentionDate ? `Review or archive on ${retentionDate}.` : "No patient-specific date is set.");
    });
  }

  function requestDataAction() {
    void runAction("request", async () => {
      const { error } = await supabase.from("data_subject_requests").insert({
        patient_id: selectedPatientId,
        requested_by: userId,
        request_type: dataRequestType,
        detail: `Requested from the Continuum governance workspace (${dataRequestType}).`,
      });
      if (error) throw error;
      Alert.alert("Request recorded", "The request is now in the append-only operations queue for review.");
    });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader
        icon="👥"
        iconTint={colors.primarySoft}
        title="Patient workspaces"
        subtitle="Switch between assigned patients, create a governed workspace, and manage consent, retention, and data-rights requests."
      />

      <Text style={styles.sectionLabel}>ASSIGNED PATIENTS</Text>
      <View style={styles.workspaceGrid} accessibilityRole="radiogroup">
        {workspaces.map((workspace) => {
          const selected = workspace.patientId === selectedPatientId;
          return (
            <Pressable
              key={workspace.patientId}
              onPress={() => onSelectPatient(workspace.patientId)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`Open ${workspace.displayName}`}
              style={({ pressed }) => [styles.workspaceCard, selected && styles.workspaceCardSelected, pressed && styles.pressed]}
            >
              <View style={[styles.avatar, selected && styles.avatarSelected]}><Text style={styles.avatarText}>{workspace.displayName.slice(0, 2).toUpperCase()}</Text></View>
              <Text style={styles.workspaceName}>{workspace.displayName}</Text>
              <Text style={styles.workspaceRole}>{workspace.role.replace(/_/g, " ")}</Text>
              <Text style={[styles.workspaceState, selected && styles.workspaceStateSelected]}>{selected ? "CURRENT" : "OPEN"}</Text>
            </Pressable>
          );
        })}
      </View>

      <Card style={styles.card}>
        <Text style={styles.cardEyebrow}>CONTROLLED ONBOARDING</Text>
        <Text style={styles.cardTitle}>Create another care workspace</Text>
        <Text style={styles.cardText}>Use a local program identifier where possible. Avoid putting sensitive details in the display name.</Text>
        <View style={styles.inlineForm}>
          <TextInput
            value={newPatientName}
            onChangeText={setNewPatientName}
            placeholder="Patient or family label"
            placeholderTextColor={colors.inkFaint}
            accessibilityLabel="New patient workspace display name"
            style={styles.input}
          />
          <Button label="Create workspace" onPress={createPatient} loading={busyAction === "create"} fullWidth={false} />
        </View>
      </Card>

      <View style={styles.twoColumn}>
        <Card style={styles.columnCard} accentColor={colors.primary}>
          <Text style={styles.cardEyebrow}>CONSENT LEDGER</Text>
          <Text style={styles.cardTitle}>Record a consent decision</Text>
          <Text style={styles.cardText}>Every decision is appended with a policy version. Revocation does not erase history.</Text>
          <ChoiceRow
            values={CONSENT_KINDS.map((item) => ({ key: item.key, label: item.label }))}
            selected={consentKind}
            onSelect={(value) => setConsentKind(value as ConsentKind)}
          />
          <ChoiceRow
            values={[
              { key: "granted", label: "Granted" },
              { key: "declined", label: "Declined" },
              { key: "revoked", label: "Revoked" },
            ]}
            selected={consentState}
            onSelect={(value) => setConsentState(value as ConsentState)}
          />
          <TextInput
            value={policyVersion}
            onChangeText={setPolicyVersion}
            placeholder="Policy version"
            placeholderTextColor={colors.inkFaint}
            accessibilityLabel="Consent policy version"
            style={styles.input}
          />
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Latest state</Text><Text style={styles.summaryValue}>{latestConsents[consentKind] ?? "not recorded"}</Text></View>
          <Button label="Append consent decision" onPress={recordConsent} loading={busyAction === "consent"} />
        </Card>

        <Card style={styles.columnCard} accentColor={colors.accent}>
          <Text style={styles.cardEyebrow}>OPERATIONS</Text>
          <Text style={styles.cardTitle}>Assignment and retention</Text>
          <Text style={styles.cardText}>Create a visible work item and set a review date for the patient record.</Text>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Open assignments</Text><Text style={styles.summaryValue}>{assignments.filter((item) => item.status === "active").length}</Text></View>
          <Button label="Assign this patient to me" onPress={assignToMe} loading={busyAction === "assign"} variant="secondary" />
          {assignments.filter((item) => item.status === "active").slice(0, 3).map((assignment) => (
            <View key={assignment.id} style={styles.assignmentRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.assignmentTitle}>{assignment.priority} priority work item</Text>
                <Text style={styles.assignmentMeta}>{assignment.due_at ? `Due ${new Date(assignment.due_at).toLocaleString()}` : "No due date"}</Text>
              </View>
              <Pressable
                onPress={() => completeAssignment(assignment.id)}
                disabled={busyAction === `assignment-${assignment.id}`}
                accessibilityRole="button"
                accessibilityLabel="Mark assignment complete"
                style={styles.completeButton}
              >
                <Text style={styles.completeButtonText}>Complete</Text>
              </Pressable>
            </View>
          ))}
          <TextInput
            value={retentionDate}
            onChangeText={setRetentionDate}
            placeholder="Retention review date (YYYY-MM-DD)"
            placeholderTextColor={colors.inkFaint}
            accessibilityLabel="Retention review date"
            style={styles.input}
          />
          <Button label="Save retention review date" onPress={saveRetention} loading={busyAction === "retention"} />
        </Card>
      </View>

      <Card style={styles.card} accentColor={colors.danger}>
        <Text style={styles.cardEyebrow}>DATA RIGHTS</Text>
        <Text style={styles.cardTitle}>Request export, correction, or deletion review</Text>
        <Text style={styles.cardText}>Deletion is a governed request—not an instant destructive action—because clinical, legal, and retention duties must be checked.</Text>
        <ChoiceRow
          values={[
            { key: "export", label: "Export" },
            { key: "correction", label: "Correction" },
            { key: "deletion", label: "Deletion review" },
          ]}
          selected={dataRequestType}
          onSelect={(value) => setDataRequestType(value as DataRequestType)}
        />
        <Button label="Record data-rights request" onPress={requestDataAction} loading={busyAction === "request"} variant="danger" />
      </Card>
    </ScrollView>
  );
}

function ChoiceRow({ values, selected, onSelect }: { values: Array<{ key: string; label: string }>; selected: string; onSelect: (value: string) => void }) {
  return (
    <View style={styles.choiceRow}>
      {values.map((value) => {
        const active = value.key === selected;
        return (
          <Pressable
            key={value.key}
            onPress={() => onSelect(value.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={[styles.choice, active && styles.choiceActive]}
          >
            <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{value.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, width: "100%", maxWidth: 1180, alignSelf: "center", backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  content: { paddingBottom: 70 },
  sectionLabel: { ...typography.label, color: colors.primaryDark, marginBottom: spacing.sm },
  workspaceGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg },
  workspaceCard: { width: 190, minHeight: 142, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md },
  workspaceCardSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft, marginBottom: spacing.sm },
  avatarSelected: { backgroundColor: colors.primary },
  avatarText: { fontSize: 12, fontWeight: "900", color: colors.ink },
  workspaceName: { color: colors.ink, fontSize: 13.5, fontWeight: "800" },
  workspaceRole: { color: colors.inkMuted, fontSize: 10, marginTop: 3, textTransform: "capitalize" },
  workspaceState: { color: colors.primaryDark, fontSize: 8, fontWeight: "900", marginTop: 10 },
  workspaceStateSelected: { color: colors.primaryDark },
  pressed: { opacity: 0.78 },
  card: { marginBottom: spacing.md },
  twoColumn: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  columnCard: { flex: 1, flexBasis: 360, minWidth: 280, marginBottom: spacing.md, gap: spacing.sm },
  cardEyebrow: { ...typography.label, color: colors.primary },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  cardText: { color: colors.inkMuted, fontSize: 11.5, lineHeight: 17, marginBottom: spacing.sm },
  inlineForm: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
  input: { flexGrow: 1, minWidth: 220, minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceMuted, color: colors.ink, paddingHorizontal: spacing.md, fontSize: 12.5 },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing.xs },
  choice: { minHeight: 42, justifyContent: "center", paddingHorizontal: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  choiceActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  choiceText: { color: colors.inkMuted, fontSize: 10.5, fontWeight: "700" },
  choiceTextActive: { color: colors.onAccent },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.sm },
  summaryLabel: { color: colors.inkMuted, fontSize: 10.5 },
  summaryValue: { color: colors.ink, fontSize: 11, fontWeight: "800", textTransform: "capitalize" },
  assignmentRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm },
  assignmentTitle: { color: colors.ink, fontSize: 10.5, fontWeight: "800", textTransform: "capitalize" },
  assignmentMeta: { color: colors.inkFaint, fontSize: 9, marginTop: 2 },
  completeButton: { minHeight: 40, justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.sm },
  completeButtonText: { color: colors.primaryDark, fontSize: 9.5, fontWeight: "800" },
});
