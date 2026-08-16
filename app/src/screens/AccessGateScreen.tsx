import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../lib/supabase";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { colors, radius, spacing, typography } from "../theme";

export function AccessGateScreen({
  mode,
  onRefresh,
}: {
  mode: "sign-in" | "claim-access";
  onRefresh: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [patientName, setPatientName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      await onRefresh();
    } catch (error) {
      Alert.alert("Sign-in failed", error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function createAccount() {
    setBusy(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: email.trim().split("@")[0] || "Continuum user" } },
      });
      if (error) throw error;
      if (!data.session) {
        setMessage("Account created. Confirm the email, then return here to sign in.");
      } else {
        await onRefresh();
      }
    } catch (error) {
      Alert.alert("Account creation failed", error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function claimAccess() {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("claim_patient_access", { invite_token: inviteCode.trim() });
      if (error) throw error;
      await onRefresh();
    } catch (error) {
      Alert.alert("Invite could not be claimed", error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    await onRefresh();
  }

  async function createWorkspace() {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("create_care_workspace", {
        patient_display_name: patientName.trim(),
      });
      if (error) throw error;
      await onRefresh();
    } catch (error) {
      Alert.alert(
        "Workspace could not be created",
        `${error instanceof Error ? error.message : String(error)}\n\nA Supabase administrator must first set this profile role to clinician, CHW, or admin.`
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.brandMark}><View style={styles.markVertical} /><View style={styles.markHorizontal} /></View>
      <Text style={styles.eyebrow}>CONTINUUM SECURE ACCESS</Text>
      <Text style={styles.title}>{mode === "sign-in" ? "Sign in to your care workspace" : "Connect to a patient"}</Text>
      <Text style={styles.body}>
        {mode === "sign-in"
          ? "Use a separate account for each clinician, community health worker, patient, or caregiver."
          : "This account does not have patient access yet. Enter the one-time invite code created by the care team."}
      </Text>

      <Card style={styles.form}>
        {mode === "sign-in" ? (
          <>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="name@example.com" placeholderTextColor={colors.inkFaint} style={styles.input} />
            <Text style={styles.label}>PASSWORD</Text>
            <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 8 characters" placeholderTextColor={colors.inkFaint} style={styles.input} />
            {message && <Text style={styles.message}>{message}</Text>}
            <Button label="Sign in" onPress={signIn} loading={busy} disabled={!email.trim() || password.length < 8} />
            <View style={{ height: spacing.sm }} />
            <Button label="Create account" onPress={createAccount} disabled={busy || !email.trim() || password.length < 8} variant="secondary" />
          </>
        ) : (
          <>
            <Text style={styles.label}>PATIENT INVITE CODE</Text>
            <TextInput value={inviteCode} onChangeText={setInviteCode} autoCapitalize="characters" placeholder="Enter one-time code" placeholderTextColor={colors.inkFaint} style={styles.input} />
            <Button label="Claim patient access" onPress={claimAccess} loading={busy} disabled={inviteCode.trim().length < 6} />
            <View style={styles.divider} />
            <Text style={styles.helperTitle}>SETTING UP THE FIRST CARE WORKSPACE?</Text>
            <Text style={styles.helperText}>After an administrator approves this account as a clinician or CHW, create the first patient workspace here.</Text>
            <TextInput value={patientName} onChangeText={setPatientName} placeholder="Patient display name" placeholderTextColor={colors.inkFaint} style={styles.input} />
            <Button label="Create approved workspace" onPress={createWorkspace} disabled={busy || patientName.trim().length < 2} variant="secondary" />
            <View style={{ height: spacing.sm }} />
            <Button label="Sign out" onPress={signOut} disabled={busy} variant="ghost" />
          </>
        )}
      </Card>
      <Text style={styles.footer}>Access is enforced by Supabase Auth, patient relationships, and Row Level Security.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg, padding: spacing.xl },
  brandMark: { width: 50, height: 50, borderRadius: radius.lg, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  markVertical: { position: "absolute", width: 7, height: 26, borderRadius: 4, backgroundColor: colors.primary },
  markHorizontal: { position: "absolute", width: 26, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  eyebrow: { ...typography.label, color: colors.primary, marginBottom: spacing.sm },
  title: { ...typography.display, textAlign: "center" },
  body: { ...typography.body, color: colors.inkMuted, textAlign: "center", maxWidth: 520, marginTop: spacing.sm, marginBottom: spacing.xl },
  form: { width: "100%", maxWidth: 440 },
  label: { ...typography.label, color: colors.inkMuted, marginBottom: 5, marginTop: spacing.sm },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceMuted, color: colors.ink, paddingHorizontal: 12, fontSize: 14, marginBottom: spacing.md },
  message: { color: colors.primaryDark, fontSize: 11, lineHeight: 16, backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.md },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  helperTitle: { ...typography.label, color: colors.primaryDark, marginBottom: spacing.xs },
  helperText: { ...typography.body, color: colors.inkMuted, fontSize: 11, lineHeight: 16, marginBottom: spacing.sm },
  footer: { color: colors.inkFaint, fontSize: 9.5, textAlign: "center", marginTop: spacing.lg },
});
