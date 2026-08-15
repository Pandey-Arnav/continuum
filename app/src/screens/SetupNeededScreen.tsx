import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Card } from "../components/Card";
import { colors, radius, spacing, typography } from "../theme";

export function SetupNeededScreen({ detail }: { detail?: string }) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.mark}>
        <Text style={styles.markText}>C</Text>
      </View>
      <Text style={styles.title}>Almost there</Text>
      <Text style={styles.body}>
        Continuum needs a Supabase project to store the unified timeline. Copy{" "}
        <Text style={styles.code}>app/.env.example</Text> to <Text style={styles.code}>app/.env</Text> and fill in
        two values:
      </Text>

      <Card style={styles.list}>
        <EnvRow name="EXPO_PUBLIC_SUPABASE_URL" note="Project URL" />
        <View style={styles.divider} />
        <EnvRow name="EXPO_PUBLIC_SUPABASE_ANON_KEY" note="Anon public key" />
      </Card>

      <Text style={styles.body}>
        Then run the SQL in <Text style={styles.code}>backend/supabase/migrations</Text> against that project (SQL
        editor or <Text style={styles.code}>supabase db push</Text>), enable Authentication → Providers → Anonymous
        Sign-Ins, and restart the app. Full steps are in the root README.
      </Text>

      {detail && (
        <Card style={styles.errorCard} accentColor={colors.danger}>
          <Text style={styles.errorLabel}>Session error</Text>
          <Text style={styles.errorText}>{detail}</Text>
        </Card>
      )}
    </ScrollView>
  );
}

function EnvRow({ name, note }: { name: string; note: string }) {
  return (
    <View style={styles.envRow}>
      <Text style={styles.code}>{name}</Text>
      <Text style={styles.envNote}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: spacing.xl, backgroundColor: colors.bg },
  mark: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  markText: { color: colors.onPrimary, fontSize: 22, fontWeight: "800" },
  title: { ...typography.display, marginBottom: spacing.sm },
  body: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.lg },
  list: { marginBottom: spacing.lg },
  envRow: { paddingVertical: spacing.xs },
  envNote: { ...typography.caption, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  code: {
    fontFamily: typography.mono.fontFamily,
    fontSize: 13,
    color: colors.primaryDark,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  errorCard: { marginTop: spacing.sm },
  errorLabel: { ...typography.label, color: colors.danger, marginBottom: 4 },
  errorText: { ...typography.caption, color: colors.ink },
});
