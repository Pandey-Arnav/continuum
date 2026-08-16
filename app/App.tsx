import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { env, hasSupabaseConfig } from "./src/lib/env";
import { ensureDemoSession, DemoSession, inspectWorkspaceSession } from "./src/lib/session";
import { SetupNeededScreen } from "./src/screens/SetupNeededScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { CommunityVisitScreen } from "./src/screens/CommunityVisitScreen";
import { DischargeScreen } from "./src/screens/DischargeScreen";
import { AccessGateScreen } from "./src/screens/AccessGateScreen";
import { colors, radius, shadow, spacing } from "./src/theme";
import { haptics } from "./src/lib/haptics";

type Tab = "dashboard" | "chw" | "discharge";

const TABS: { key: Tab; label: string; icon: string; note: string }[] = [
  { key: "dashboard", label: "Care Dashboard", icon: "▣", note: "Unified timeline" },
  { key: "chw", label: "CHW Visit", icon: "♬", note: "Voice capture" },
  { key: "discharge", label: "Discharge", icon: "▤", note: "Document capture" },
];

export default function App() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 820;
  const [session, setSession] = useState<DemoSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [accessStage, setAccessStage] = useState<"loading" | "signed_out" | "needs_access" | "ready">("loading");

  const refreshWorkspace = useCallback(async () => {
    if (!hasSupabaseConfig) return;
    setError(null);
    try {
      if (env.demoMode) {
        setSession(await ensureDemoSession());
        setAccessStage("ready");
        return;
      }
      const access = await inspectWorkspaceSession();
      setAccessStage(access.status);
      setSession(access.status === "ready" ? access.session : null);
    } catch (e) {
      setError(String((e as { message?: string })?.message ?? e));
    }
  }, []);

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

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

  if (accessStage === "signed_out") {
    return <SafeAreaView style={styles.flex}><AccessGateScreen mode="sign-in" onRefresh={refreshWorkspace} /></SafeAreaView>;
  }

  if (accessStage === "needs_access") {
    return <SafeAreaView style={styles.flex}><AccessGateScreen mode="claim-access" onRefresh={refreshWorkspace} /></SafeAreaView>;
  }

  if (!session) {
    return (
      <SafeAreaView style={[styles.flex, styles.center]}>
        <View style={styles.loadingMark}>
          <View style={styles.markVertical} />
          <View style={styles.markHorizontal} />
        </View>
        <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: 18 }} />
        <Text style={styles.loadingText}>Preparing care dashboard…</Text>
      </SafeAreaView>
    );
  }

  const selectTab = (next: Tab) => {
    if (tab !== next) haptics.tap();
    setTab(next);
  };

  const content = (
    <View style={styles.content}>
      {tab === "dashboard" && <DashboardScreen patientId={session.patientId} />}
      {tab === "chw" && <CommunityVisitScreen patientId={session.patientId} userId={session.userId} />}
      {tab === "discharge" && <DischargeScreen patientId={session.patientId} userId={session.userId} />}
    </View>
  );

  return (
    <SafeAreaView style={styles.flex}>
      <StatusBar style="dark" />
      {isDesktop ? (
        <View style={styles.desktopShell}>
          <Sidebar activeTab={tab} onSelect={selectTab} />
          <View style={styles.workspace}>
            <TopBar />
            {content}
          </View>
        </View>
      ) : (
        <>
          <MobileHeader />
          {content}
          <View style={styles.tabBar}>
            {TABS.map((item) => (
              <BottomTab
                key={item.key}
                label={item.key === "dashboard" ? "Dashboard" : item.label}
                icon={item.icon}
                active={tab === item.key}
                onPress={() => selectTab(item.key)}
              />
            ))}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.brandMark, compact && styles.brandMarkCompact]}>
      <View style={styles.markVertical} />
      <View style={styles.markHorizontal} />
    </View>
  );
}

function Sidebar({ activeTab, onSelect }: { activeTab: Tab; onSelect: (tab: Tab) => void }) {
  return (
    <View style={styles.sidebar}>
      <View style={styles.sidebarBrand}>
        <BrandMark compact />
        <View>
          <Text style={styles.sidebarBrandName}>Continuum</Text>
          <Text style={styles.sidebarBrandRole}>CARE ADMIN</Text>
        </View>
      </View>

      <View style={styles.priorityCard}>
        <View style={styles.priorityIcon}><Text style={styles.priorityIconText}>!</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.priorityTitle}>Care continuity</Text>
          <Text style={styles.priorityText}>Capture → compare → handoff</Text>
        </View>
      </View>

      <Text style={styles.menuLabel}>WORKSPACE</Text>
      <View style={styles.sidebarMenu} accessibilityRole="tablist">
        {TABS.map((item) => {
          const active = activeTab === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => onSelect(item.key)}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [styles.sidebarItem, active && styles.sidebarItemActive, pressed && styles.pressed]}
            >
              <View style={[styles.sidebarItemIcon, active && styles.sidebarItemIconActive]}>
                <Text style={[styles.sidebarItemIconText, active && styles.sidebarItemIconTextActive]}>{item.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sidebarItemText, active && styles.sidebarItemTextActive]}>{item.label}</Text>
                <Text style={styles.sidebarItemNote}>{item.note}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.menuLabel, { marginTop: spacing.xl }]}>SYSTEM</Text>
      <View style={styles.passiveItem}><Text style={styles.passiveIcon}>◎</Text><Text style={styles.passiveText}>Protocols</Text><Text style={styles.soonPill}>2 ACTIVE</Text></View>
      <View style={styles.passiveItem}><Text style={styles.passiveIcon}>⌁</Text><Text style={styles.passiveText}>Audit trail</Text><Text style={styles.soonPill}>MIGRATION 0004</Text></View>
      <View style={styles.passiveItem}><Text style={styles.passiveIcon}>⚙</Text><Text style={styles.passiveText}>Settings</Text><Text style={styles.soonPill}>COMING SOON</Text></View>

      <View style={styles.sidebarCallout}>
        <Text style={styles.calloutEmoji}>🩺</Text>
        <Text style={styles.calloutTitle}>Explainable by design</Text>
        <Text style={styles.calloutText}>Every care flag links back to evidence and a deterministic rule.</Text>
      </View>
      <Text style={styles.sidebarFooter}>Continuum Clinical Demo · v1.0</Text>
    </View>
  );
}

function TopBar() {
  return (
    <View style={styles.topBar}>
      <View style={styles.menuButton}><Text style={styles.menuButtonText}>☰</Text></View>
      <View style={styles.searchBox}>
        <Text style={styles.searchText}>Search patient timeline</Text>
        <Text style={styles.searchIcon}>⌕</Text>
      </View>
      <View style={styles.topSpacer} />
      <View style={styles.topAction}><Text>▦</Text></View>
      <View style={styles.topAction}><Text>♢</Text><View style={styles.notificationDot} /></View>
      <View style={styles.topAction}><Text>⚙</Text></View>
      <View style={styles.profile}>
        <View style={styles.profileText}>
          <Text style={styles.profileName}>Demo Clinician</Text>
          <Text style={styles.profileRole}>CARE ADMIN</Text>
        </View>
        <View style={styles.avatar}><Text style={styles.avatarText}>DC</Text></View>
      </View>
    </View>
  );
}

function MobileHeader() {
  return (
    <View style={styles.mobileHeader}>
      <BrandMark compact />
      <View style={{ flex: 1 }}>
        <Text style={styles.mobileBrandName}>Continuum Admin</Text>
        <Text style={styles.mobileBrandNote}>Care continuity workspace</Text>
      </View>
      <View style={styles.topAction}><Text>♢</Text><View style={styles.notificationDot} /></View>
    </View>
  );
}

function BottomTab({ label, icon, active, onPress }: { label: string; icon: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <View style={[styles.tabIconWrap, active && styles.tabIconWrapActive]}>
        <Text style={[styles.tabIcon, active && styles.tabIconActive]}>{icon}</Text>
      </View>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  content: { flex: 1, backgroundColor: colors.bg },
  desktopShell: { flex: 1, flexDirection: "row", backgroundColor: colors.bg },
  workspace: { flex: 1, minWidth: 0 },
  loadingMark: { width: 56, height: 56, borderRadius: radius.lg, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 14, color: colors.inkMuted, fontSize: 13, fontWeight: "600" },
  brandMark: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  brandMarkCompact: { width: 36, height: 36, borderRadius: 10 },
  markVertical: { position: "absolute", width: 6, height: 22, borderRadius: 3, backgroundColor: colors.primary },
  markHorizontal: { position: "absolute", width: 22, height: 6, borderRadius: 3, backgroundColor: colors.primary },

  sidebar: { width: 236, backgroundColor: "#F6FAFD", borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 14, paddingBottom: 14 },
  sidebarBrand: { height: 70, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 6 },
  sidebarBrandName: { fontSize: 16, fontWeight: "800", color: colors.ink, letterSpacing: -0.3 },
  sidebarBrandRole: { fontSize: 8, color: colors.inkFaint, fontWeight: "800", letterSpacing: 1, marginTop: 1 },
  priorityCard: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 20, ...(shadow.sm as object) },
  priorityIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" },
  priorityIconText: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" },
  priorityTitle: { color: colors.ink, fontSize: 11.5, fontWeight: "800" },
  priorityText: { color: colors.inkFaint, fontSize: 9.5, marginTop: 2 },
  menuLabel: { color: colors.inkFaint, fontSize: 8.5, fontWeight: "800", letterSpacing: 1.2, marginHorizontal: 8, marginBottom: 7 },
  sidebarMenu: { gap: 5 },
  sidebarItem: { flexDirection: "row", alignItems: "center", minHeight: 50, paddingHorizontal: 9, borderRadius: radius.md, borderWidth: 1, borderColor: "transparent" },
  sidebarItemActive: { backgroundColor: colors.surface, borderColor: colors.border, ...(shadow.sm as object) },
  sidebarItemIcon: { width: 27, height: 27, borderRadius: 7, alignItems: "center", justifyContent: "center", marginRight: 8, backgroundColor: colors.surfaceMuted },
  sidebarItemIconActive: { backgroundColor: colors.primarySoft },
  sidebarItemIconText: { color: colors.inkFaint, fontSize: 13, fontWeight: "800" },
  sidebarItemIconTextActive: { color: colors.primary },
  sidebarItemText: { color: colors.inkMuted, fontSize: 11.5, fontWeight: "700" },
  sidebarItemTextActive: { color: colors.primaryDark },
  sidebarItemNote: { color: colors.inkFaint, fontSize: 8.5, marginTop: 1 },
  chevron: { color: colors.inkFaint, fontSize: 15 },
  passiveItem: { flexDirection: "row", alignItems: "center", minHeight: 38, paddingHorizontal: 9, gap: 10 },
  passiveIcon: { width: 18, color: colors.inkFaint, fontSize: 12, textAlign: "center" },
  passiveText: { flex: 1, color: colors.inkMuted, fontSize: 11 },
  soonPill: { fontSize: 7, color: colors.accent, backgroundColor: colors.accentSoft, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2, fontWeight: "800" },
  sidebarCallout: { marginTop: "auto", borderRadius: radius.lg, backgroundColor: colors.primarySoft, padding: 14, alignItems: "center" },
  calloutEmoji: { fontSize: 34, marginBottom: 5 },
  calloutTitle: { color: colors.primaryDark, fontSize: 11.5, fontWeight: "800" },
  calloutText: { color: colors.inkMuted, fontSize: 9.5, lineHeight: 14, textAlign: "center", marginTop: 4 },
  sidebarFooter: { color: colors.inkFaint, fontSize: 8.5, textAlign: "center", marginTop: 12 },

  topBar: { height: 64, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", paddingHorizontal: 18, gap: 10 },
  menuButton: { width: 34, height: 34, borderRadius: 8, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  menuButtonText: { color: colors.primaryDark, fontSize: 15, fontWeight: "800" },
  searchBox: { width: 320, height: 36, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 },
  searchText: { flex: 1, color: colors.inkFaint, fontSize: 11 },
  searchIcon: { color: colors.inkMuted, fontSize: 17 },
  topSpacer: { flex: 1 },
  topAction: { width: 34, height: 34, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  notificationDot: { position: "absolute", right: 5, top: 5, width: 5, height: 5, borderRadius: 3, backgroundColor: colors.danger },
  profile: { flexDirection: "row", alignItems: "center", marginLeft: 4, gap: 9 },
  profileText: { alignItems: "flex-end" },
  profileName: { color: colors.primaryDark, fontSize: 10.5, fontWeight: "800" },
  profileRole: { color: colors.inkFaint, fontSize: 7, fontWeight: "800", letterSpacing: 0.8, marginTop: 1 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surface },
  avatarText: { color: colors.accent, fontSize: 9.5, fontWeight: "900" },

  mobileHeader: { minHeight: 66, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 10 },
  mobileBrandName: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  mobileBrandNote: { color: colors.inkFaint, fontSize: 9.5, marginTop: 1 },
  tabBar: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, paddingBottom: 10, paddingTop: 7, paddingHorizontal: spacing.sm },
  tabButton: { flex: 1, alignItems: "center", gap: 3 },
  tabIconWrap: { width: 38, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  tabIconWrapActive: { backgroundColor: colors.primarySoft },
  tabIcon: { fontSize: 14, color: colors.inkFaint, fontWeight: "800" },
  tabIconActive: { color: colors.primary },
  tabLabel: { fontSize: 9.5, color: colors.inkFaint, fontWeight: "700" },
  tabLabelActive: { color: colors.primaryDark },
  pressed: { opacity: 0.65 },
});
