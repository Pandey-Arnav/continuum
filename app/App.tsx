import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { hasSupabaseConfig } from "./src/lib/env";
import { ensureDemoSession, DemoSession } from "./src/lib/session";
import { SetupNeededScreen } from "./src/screens/SetupNeededScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { CommunityVisitScreen } from "./src/screens/CommunityVisitScreen";
import { DischargeScreen } from "./src/screens/DischargeScreen";

type Tab = "dashboard" | "chw" | "discharge";

export default function App() {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    ensureDemoSession()
      .then(setSession)
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  if (!hasSupabaseConfig) {
    return (
      <SafeAreaView style={styles.flex}>
        <SetupNeededScreen />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.flex}>
        <SetupNeededScreen detail={error} />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={[styles.flex, styles.center]}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12, color: "#64748B" }}>Setting up demo session…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex}>
      <StatusBar style="dark" />
      <View style={styles.flex}>
        {tab === "dashboard" && <DashboardScreen patientId={session.patientId} />}
        {tab === "chw" && <CommunityVisitScreen patientId={session.patientId} userId={session.userId} />}
        {tab === "discharge" && <DischargeScreen patientId={session.patientId} userId={session.userId} />}
      </View>
      <View style={styles.tabBar}>
        <TabButton label="Timeline" icon="🗂️" active={tab === "dashboard"} onPress={() => setTab("dashboard")} />
        <TabButton label="CHW Visit" icon="🎙️" active={tab === "chw"} onPress={() => setTab("chw")} />
        <TabButton label="Discharge" icon="📄" active={tab === "discharge"} onPress={() => setTab("discharge")} />
      </View>
    </SafeAreaView>
  );
}

function TabButton({ label, icon, active, onPress }: { label: string; icon: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.tabButton} onPress={onPress}>
      <Text style={{ fontSize: 18, opacity: active ? 1 : 0.4 }}>{icon}</Text>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#F8FAFC" },
  center: { alignItems: "center", justifyContent: "center" },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#fff",
    paddingBottom: 8,
    paddingTop: 8,
  },
  tabButton: { flex: 1, alignItems: "center", gap: 2 },
  tabLabel: { fontSize: 11, color: "#94A3B8", fontWeight: "600" },
  tabLabelActive: { color: "#0F172A" },
});
