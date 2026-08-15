import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { hasSupabaseConfig } from "./src/lib/env";
import { ensureDemoSession, DemoSession } from "./src/lib/session";
import { SetupNeededScreen } from "./src/screens/SetupNeededScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { CommunityVisitScreen } from "./src/screens/CommunityVisitScreen";
import { DischargeScreen } from "./src/screens/DischargeScreen";
import { colors, radius, shadow, spacing } from "./src/theme";
import { haptics } from "./src/lib/haptics";

type Tab = "dashboard" | "chw" | "discharge";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "dashboard", label: "Timeline", icon: "🗂️" },
  { key: "chw", label: "CHW Visit", icon: "🎙️" },
  { key: "discharge", label: "Discharge", icon: "📄" },
];

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
        <View style={styles.loadingMark}>
          <Text style={styles.loadingMarkText}>C</Text>
        </View>
        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 18 }} />
        <Text style={styles.loadingText}>Setting up your demo session…</Text>
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
        {TABS.map((t) => (
          <TabButton
            key={t.key}
            label={t.label}
            icon={t.icon}
            active={tab === t.key}
            onPress={() => {
              if (tab !== t.key) haptics.tap();
              setTab(t.key);
            }}
          />
        ))}
      </View>
    </SafeAreaView>
  );
}

function TabButton({ label, icon, active, onPress }: { label: string; icon: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.tabButton, pressed && styles.tabButtonPressed]}
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <View style={[styles.tabIconWrap, active && styles.tabIconWrapActive]}>
        <Text style={{ fontSize: 17, opacity: active ? 1 : 0.55 }}>{icon}</Text>
      </View>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  loadingMark: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...(shadow.md as object),
  },
  loadingMarkText: { color: colors.onPrimary, fontSize: 24, fontWeight: "800" },
  loadingText: { marginTop: 14, color: colors.inkMuted, fontSize: 13, fontWeight: "500" },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingBottom: 10,
    paddingTop: 8,
    paddingHorizontal: spacing.sm,
  },
  tabButton: { flex: 1, alignItems: "center", gap: 3 },
  tabButtonPressed: { opacity: 0.6 },
  tabIconWrap: {
    width: 40,
    height: 30,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  tabIconWrapActive: { backgroundColor: colors.primarySoft },
  tabLabel: { fontSize: 10.5, color: colors.inkFaint, fontWeight: "700" },
  tabLabelActive: { color: colors.primary },
});
