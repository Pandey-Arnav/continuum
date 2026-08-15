import { ScrollView, StyleSheet, Text, View } from "react-native";

export function SetupNeededScreen({ detail }: { detail?: string }) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Setup needed</Text>
      <Text style={styles.body}>
        Continuum needs a Supabase project to store the unified timeline. Copy{" "}
        <Text style={styles.code}>app/.env.example</Text> to <Text style={styles.code}>app/.env</Text> and fill in:
      </Text>
      <View style={styles.list}>
        <Text style={styles.code}>EXPO_PUBLIC_SUPABASE_URL</Text>
        <Text style={styles.code}>EXPO_PUBLIC_SUPABASE_ANON_KEY</Text>
      </View>
      <Text style={styles.body}>
        Then run the SQL in <Text style={styles.code}>backend/supabase/migrations</Text> against that project (SQL
        editor or `supabase db push`), enable Authentication → Providers → Anonymous Sign-Ins, and restart the app.
        See the root README for full setup steps.
      </Text>
      {detail && <Text style={styles.error}>{detail}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: 24, backgroundColor: "#F8FAFC" },
  title: { fontSize: 22, fontWeight: "700", color: "#0F172A", marginBottom: 12 },
  body: { fontSize: 14, color: "#334155", marginBottom: 12, lineHeight: 20 },
  list: { marginBottom: 12, gap: 4 },
  code: { fontFamily: "Courier", backgroundColor: "#E2E8F0", paddingHorizontal: 4, borderRadius: 4 },
  error: { fontSize: 12, color: "#991B1B", marginTop: 12 },
});
