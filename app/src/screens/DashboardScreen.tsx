import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { detectLongitudinalSignals, LongitudinalSignal } from "@continuum/engine";
import { EntryRow, fetchEntries, subscribeToEntries } from "../lib/entries";
import { FlagBadge } from "../components/FlagBadge";
import { ScreenHeader } from "../components/ScreenHeader";
import { SegmentedControl } from "../components/SegmentedControl";
import { Button } from "../components/Button";
import { haptics } from "../lib/haptics";
import { supabase } from "../lib/supabase";
import { colors, radius, shadow, spacing, typography, CATEGORY_ICON } from "../theme";

const NEW_ENTRY_HIGHLIGHT_MS = 6000;

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SOURCE_ICON: Record<string, string> = {
  chw_voice_visit: "🎙️",
  discharge_photo: "📄",
};

const SOURCE_LABEL: Record<string, string> = {
  chw_voice_visit: "Community health worker visit",
  discharge_photo: "Hospital discharge sheet",
};

type SourceFilter = "all" | "chw_voice_visit" | "discharge_photo";
type SeverityFilter = "all" | "red" | "amber" | "green";
type InviteRole = "patient" | "family_member" | "doctor" | "supervising_health_worker";

// --- time formatting helpers, kept local since this is the only screen that needs them ---

function dayLabel(date: Date): string {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return date.toLocaleDateString([], { weekday: "long" });
  return date.toLocaleDateString([], {
    month: "long",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function timeAgo(date: Date): string {
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Pulls a clean one-line "what happened" out of the plain-language handoff summary. */
function leadSentence(summary: string): string {
  const idx = summary.indexOf(". ");
  const lead = idx === -1 ? summary : summary.slice(0, idx);
  return lead.replace(/^[^:]{0,60}:\s*/, "").trim() || summary.trim();
}

interface Section {
  title: string;
  data: EntryRow[];
}

function groupByDay(entries: EntryRow[]): Section[] {
  const sections: Section[] = [];
  for (const entry of entries) {
    const label = dayLabel(new Date(entry.created_at));
    const last = sections[sections.length - 1];
    if (last && last.title === label) {
      last.data.push(entry);
    } else {
      sections.push({ title: label, data: [entry] });
    }
  }
  return sections;
}

export function DashboardScreen({ patientId }: { patientId: string }) {
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [query, setQuery] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("patient");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [justArrivedIds, setJustArrivedIds] = useState<Set<string>>(new Set());
  const [, forceTick] = useState(0);

  const load = useCallback(async () => {
    const rows = await fetchEntries(patientId);
    setEntries(rows);
  }, [patientId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));

    const unsubscribe = subscribeToEntries(patientId, (row) => {
      setEntries((prev) => {
        if (prev.some((e) => e.id === row.id)) return prev;
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        return [row, ...prev];
      });
      haptics.light();
      setJustArrivedIds((prev) => new Set(prev).add(row.id));
      setTimeout(() => {
        setJustArrivedIds((prev) => {
          if (!prev.has(row.id)) return prev;
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
      }, NEW_ENTRY_HIGHLIGHT_MS);
    });
    return unsubscribe;
  }, [patientId, load]);

  // Keeps "3m ago" chips honest without a full data refetch.
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filter !== "all" && entry.source_type !== filter) return false;
      if (severityFilter !== "all" && entry.flag_level !== severityFilter) return false;
      if (!normalizedQuery) return true;
      return [entry.raw_text, entry.handoff_summary, entry.category, entry.flag_reason, entry.rule_id]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [entries, filter, severityFilter, query]);

  const sections = useMemo(() => groupByDay(filtered), [filtered]);

  const stats = useMemo(() => {
    const counts = { red: 0, amber: 0, green: 0, chw: 0, discharge: 0, traceable: 0 };
    for (const e of entries) {
      counts[e.flag_level]++;
      if (e.source_type === "chw_voice_visit") counts.chw++;
      if (e.source_type === "discharge_photo") counts.discharge++;
      if (e.rule_id) counts.traceable++;
    }
    return counts;
  }, [entries]);

  const longitudinalSignals = useMemo(
    () => detectLongitudinalSignals(entries.map((entry) => ({
      id: entry.id,
      createdAt: entry.created_at,
      sourceType: entry.source_type,
      flaggedEntries: entry.flagged_data,
    }))),
    [entries]
  );

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(expandedId === id ? null : id);
  };

  async function createInvite() {
    setCreatingInvite(true);
    try {
      const { data, error } = await supabase.rpc("create_patient_invite", {
        target_patient_id: patientId,
        granted_role: inviteRole,
      });
      if (error) throw error;
      setInviteCode(String(data));
      haptics.success();
    } catch (error) {
      haptics.error();
      Alert.alert("Invite unavailable", "Apply migration 0004 and use a clinician/CHW account to create patient access codes.\n\n" + (error instanceof Error ? error.message : String(error)));
    } finally {
      setCreatingInvite(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader
          icon="🗂️"
          iconTint={colors.primarySoft}
          title="Timeline"
          subtitle="One engine, two entry points — every flag traces to its input and rule."
        />
        <View style={{ paddingTop: spacing.md }}>
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="🗂️"
        iconTint={colors.primarySoft}
        title="Timeline"
        subtitle="One engine, two entry points — every flag traces to its input and rule."
      />

      {entries.length > 0 && (
        <View style={styles.statsRow}>
          <StatTile count={entries.length} label="Total entries" icon="▦" color={colors.primary} badge="Timeline" />
          <StatTile count={stats.red} label="Needs attention" icon="!" color={colors.danger} badge="Priority" />
          <StatTile count={stats.amber} label="Worth review" icon="◆" color="#F5A400" badge="Review" />
          <StatTile count={stats.green} label="Stable" icon="✓" color="#22BFAE" badge="On track" />
          <StatTile count={stats.chw} label="CHW visits" icon="♬" color={colors.accent} badge="Voice" />
          <StatTile count={stats.discharge} label="Discharges" icon="▤" color="#EC537A" badge="Documents" />
        </View>
      )}

      {entries.length > 0 && (
        <View style={styles.insightsRow}>
          <SeverityPanel red={stats.red} amber={stats.amber} green={stats.green} />
          <SourcePanel chw={stats.chw} discharge={stats.discharge} />
          <TracePanel traceable={stats.traceable} total={entries.length} />
        </View>
      )}

      {longitudinalSignals.length > 0 && <LongitudinalPanel signals={longitudinalSignals} />}

      <View style={styles.accessPanel}>
        <View style={styles.accessCopy}>
          <Text style={styles.longitudinalEyebrow}>ROLE-BASED ACCESS</Text>
          <Text style={styles.accessTitle}>Create a one-time patient access code</Text>
          <Text style={styles.accessSubtitle}>Only a related clinician or CHW can create a code. It expires after seven days and can be claimed once.</Text>
        </View>
        <SegmentedControl
          value={inviteRole}
          onChange={(role) => { setInviteRole(role); setInviteCode(null); }}
          options={[
            { value: "patient", label: "Patient" },
            { value: "family_member", label: "Caregiver" },
            { value: "doctor", label: "Doctor" },
            { value: "supervising_health_worker", label: "CHW" },
          ]}
        />
        <Button label={creatingInvite ? "Creating code…" : "Create access code"} onPress={createInvite} loading={creatingInvite} fullWidth={false} />
        {inviteCode && <View style={styles.inviteCode}><Text style={styles.inviteCodeLabel}>ONE-TIME CODE</Text><Text selectable style={styles.inviteCodeText}>{inviteCode}</Text></View>}
      </View>

      <View style={styles.activityToolbar}>
        <View style={styles.activityHeading}>
          <Text style={styles.activityTitle}>Recent care activity</Text>
          <Text style={styles.activitySubtitle}>Live entries from every capture pathway</Text>
        </View>
        <View style={styles.searchBox}>
          <Text style={styles.searchGlyph}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search evidence, category, or rule"
            placeholderTextColor={colors.inkFaint}
            style={styles.searchInput}
            accessibilityLabel="Search timeline"
          />
        </View>
        <View style={styles.filterRow}>
          <SegmentedControl
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All sources" },
              { value: "chw_voice_visit", label: "CHW", icon: "🎙️" },
              { value: "discharge_photo", label: "Discharge", icon: "📄" },
            ]}
          />
          <SegmentedControl
            value={severityFilter}
            onChange={setSeverityFilter}
            options={[
              { value: "all", label: "Any flag" },
              { value: "red", label: "Red" },
              { value: "amber", label: "Amber" },
              { value: "green", label: "Green" },
            ]}
          />
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingBottom: 40, paddingTop: spacing.md }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🗂️</Text>
            <Text style={styles.emptyTitle}>No entries yet</Text>
            <Text style={styles.emptyText}>
              {filter === "all"
                ? "Run a CHW visit or discharge capture and it will appear here in real time."
                : "Nothing from this source yet — switch filters or capture a new entry."}
            </Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{section.title}</Text>
            <View style={styles.sectionHeaderLine} />
          </View>
        )}
        renderItem={({ item }) => {
          const isExpanded = expandedId === item.id;
          const isNew = justArrivedIds.has(item.id);
          const palette = colors.flag[item.flag_level];
          const created = new Date(item.created_at);
          const headlineIcon = CATEGORY_ICON[item.category] ?? "📌";
          const whatHappened = leadSentence(item.handoff_summary);

          return (
            <Pressable
              style={({ pressed }) => [styles.card, isNew && styles.cardNew, pressed && styles.cardPressed]}
              onPress={() => toggleExpand(item.id)}
              accessibilityRole="button"
              accessibilityLabel={`${SOURCE_LABEL[item.source_type]} at ${formatTime(created)}, ${item.flag_level} flag. ${whatHappened}`}
            >
              <View style={[styles.accentBar, { backgroundColor: palette.dot }]} />
              <View style={styles.cardBody}>
                <View style={styles.cardHeader}>
                  <View style={styles.sourceIconWrap}>
                    <Text style={styles.sourceIcon}>{SOURCE_ICON[item.source_type]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sourceLabel}>{SOURCE_LABEL[item.source_type]}</Text>
                    <Text style={styles.timeMeta}>
                      {formatTime(created)} · {timeAgo(created)}
                    </Text>
                  </View>
                  {isNew && (
                    <View style={styles.newPill}>
                      <Text style={styles.newPillText}>NEW</Text>
                    </View>
                  )}
                  <FlagBadge level={item.flag_level} compact />
                </View>

                <View style={styles.whatRow}>
                  <Text style={styles.whatIcon}>{headlineIcon}</Text>
                  <Text style={styles.whatText} numberOfLines={isExpanded ? undefined : 2}>
                    {whatHappened}
                  </Text>
                </View>

                <Text style={styles.whyText} numberOfLines={isExpanded ? undefined : 1}>
                  Why: {item.flag_reason}
                </Text>

                {isExpanded && (
                  <View style={styles.detail}>
                    <Text style={styles.detailHeading}>Full handoff (for {item.recipient.replace(/_/g, " ")})</Text>
                    <Text style={styles.detailText}>{item.handoff_summary}</Text>

                    <Text style={styles.detailHeading}>Raw input (evidence)</Text>
                    <Text style={styles.detailText}>{item.raw_text}</Text>

                    <Text style={styles.detailHeading}>Structured extraction + flags</Text>
                    {item.flagged_data.map((fact, i) => (
                      <View key={i} style={styles.factRow}>
                        <FlagBadge level={fact.flagLevel} compact />
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={styles.factCategory}>
                            {CATEGORY_ICON[fact.category] ?? "📌"} {fact.category.replace(/_/g, " ")}: {String(fact.value)}{" "}
                            {fact.unit ?? ""}
                          </Text>
                          <Text style={styles.factReason}>{fact.flagReason}</Text>
                          <Text style={styles.factRule}>rule · {fact.ruleId}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.footerRow}>
                  <Text style={styles.ruleId}>rule · {item.rule_id}</Text>
                  <Text style={styles.expandHint}>{isExpanded ? "▲ Collapse" : "▼ Evidence"}</Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function LongitudinalPanel({ signals }: { signals: LongitudinalSignal[] }) {
  return (
    <View style={styles.longitudinalPanel}>
      <View style={styles.longitudinalHeader}>
        <View>
          <Text style={styles.longitudinalEyebrow}>DETERMINISTIC LONGITUDINAL RULES</Text>
          <Text style={styles.longitudinalTitle}>Continuity signals</Text>
          <Text style={styles.longitudinalSubtitle}>Patterns across encounters—computed from existing rule results, never inferred by a model.</Text>
        </View>
        <View style={styles.longitudinalCount}><Text style={styles.longitudinalCountText}>{signals.length} SIGNALS</Text></View>
      </View>
      <View style={styles.longitudinalGrid}>
        {signals.slice(0, 4).map((signal) => (
          <View key={signal.id} style={styles.longitudinalSignal}>
            <FlagBadge level={signal.level} compact />
            <View style={{ flex: 1 }}>
              <Text style={styles.longitudinalSignalTitle}>{signal.title}</Text>
              <Text style={styles.longitudinalSignalText}>{signal.detail}</Text>
              <Text style={styles.longitudinalEvidence}>{signal.evidenceCount} linked capture{signal.evidenceCount === 1 ? "" : "s"}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function StatTile({ count, label, icon, color, badge }: { count: number; label: string; icon: string; color: string; badge: string }) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statIcon, { backgroundColor: `${color}18` }]}>
        <Text style={[styles.statIconText, { color }]}>{icon}</Text>
      </View>
      <Text style={styles.statCount}>{count.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={[styles.statBadge, { backgroundColor: color }]}><Text style={styles.statBadgeText}>{badge}</Text></View>
    </View>
  );
}

function SeverityPanel({ red, amber, green }: { red: number; amber: number; green: number }) {
  const data = [
    { label: "Priority", value: red, color: colors.danger },
    { label: "Review", value: amber, color: "#F5A400" },
    { label: "Stable", value: green, color: "#22BFAE" },
  ];
  const max = Math.max(1, ...data.map((item) => item.value));
  return (
    <View style={styles.insightCard}>
      <View style={styles.insightHeader}><Text style={styles.insightTitle}>Flag overview</Text><Text style={styles.insightDelta}>LIVE</Text></View>
      <View style={styles.miniChart}>
        {data.map((item) => (
          <View key={item.label} style={styles.chartColumn}>
            <Text style={styles.chartValue}>{item.value}</Text>
            <View style={[styles.chartBar, { height: 18 + (item.value / max) * 48, backgroundColor: item.color }]} />
            <Text style={styles.chartLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SourcePanel({ chw, discharge }: { chw: number; discharge: number }) {
  const total = Math.max(1, chw + discharge);
  return (
    <View style={styles.insightCard}>
      <View style={styles.insightHeader}><Text style={styles.insightTitle}>Source mix</Text><Text style={[styles.insightDelta, { color: colors.primary }]}>REAL TIME</Text></View>
      <ProgressLine label="CHW voice visits" value={chw} percent={(chw / total) * 100} color={colors.accent} />
      <ProgressLine label="Discharge sheets" value={discharge} percent={(discharge / total) * 100} color={colors.primary} />
      <View style={styles.insightFooter}><Text style={styles.insightFooterLabel}>Unified total</Text><Text style={styles.insightFooterValue}>{chw + discharge} entries</Text></View>
    </View>
  );
}

function TracePanel({ traceable, total }: { traceable: number; total: number }) {
  const percent = total ? Math.round((traceable / total) * 100) : 0;
  return (
    <View style={[styles.insightCard, styles.traceCard]}>
      <View style={styles.insightHeader}><Text style={[styles.insightTitle, { color: colors.onAccent }]}>Explainability</Text><Text style={[styles.insightDelta, { color: "#9FF8E9" }]}>VERIFIED</Text></View>
      <View style={styles.traceBody}>
        <View><Text style={styles.tracePercent}>{percent}%</Text><Text style={styles.traceLabel}>rule-linked entries</Text></View>
        <View style={styles.traceMark}><Text style={styles.traceMarkText}>✓</Text></View>
      </View>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: colors.primary }]} /></View>
      <Text style={styles.traceNote}>Every flag remains connected to its evidence and rule ID.</Text>
    </View>
  );
}

function ProgressLine({ label, value, percent, color }: { label: string; value: number; percent: number; color: string }) {
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressHeader}><Text style={styles.progressLabel}>{label}</Text><Text style={styles.progressValue}>{value}</Text></View>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: color }]} /></View>
    </View>
  );
}

function SkeletonCard() {
  return (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonAccent} />
      <View style={styles.skeletonBody}>
        <View style={styles.skeletonHeaderRow}>
          <View style={styles.skeletonIcon} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={[styles.skeletonBlock, { width: "55%" }]} />
            <View style={[styles.skeletonBlock, { width: "30%", height: 8 }]} />
          </View>
        </View>
        <View style={[styles.skeletonBlock, { width: "85%", marginTop: 14 }]} />
        <View style={[styles.skeletonBlock, { width: "40%", marginTop: 8, height: 8 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
    backgroundColor: colors.bg,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },

  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: spacing.md },
  statTile: {
    flexGrow: 1,
    flexBasis: 128,
    minWidth: 118,
    minHeight: 116,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    ...(shadow.sm as object),
  },
  statIcon: { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", marginBottom: 5 },
  statIconText: { fontSize: 17, fontWeight: "900" },
  statCount: { fontSize: 21, fontWeight: "800", color: colors.ink, letterSpacing: -0.5 },
  statLabel: { fontSize: 9.5, fontWeight: "700", color: colors.inkMuted, marginTop: 1 },
  statBadge: { borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2, marginTop: 5 },
  statBadgeText: { color: "#FFFFFF", fontSize: 7.5, fontWeight: "800" },

  insightsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: spacing.md },
  insightCard: {
    flex: 1,
    flexBasis: 240,
    minWidth: 220,
    minHeight: 158,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...(shadow.sm as object),
  },
  traceCard: { backgroundColor: colors.accent, borderColor: colors.accent },
  insightHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  insightTitle: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  insightDelta: { color: colors.danger, fontSize: 7.5, fontWeight: "900", letterSpacing: 0.5 },
  miniChart: { height: 102, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around", borderBottomWidth: 1, borderBottomColor: colors.border },
  chartColumn: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  chartValue: { color: colors.ink, fontSize: 9, fontWeight: "800", marginBottom: 3 },
  chartBar: { width: 26, minHeight: 18, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  chartLabel: { color: colors.inkFaint, fontSize: 7.5, fontWeight: "700", marginTop: 4, marginBottom: 2 },
  progressRow: { marginTop: 7 },
  progressHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 5 },
  progressLabel: { color: colors.inkMuted, fontSize: 9.5, fontWeight: "700" },
  progressValue: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  progressTrack: { width: "100%", height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  insightFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 13, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  insightFooterLabel: { color: colors.inkFaint, fontSize: 8.5 },
  insightFooterValue: { color: colors.ink, fontSize: 9, fontWeight: "800" },
  traceBody: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2, marginBottom: 12 },
  tracePercent: { color: colors.onAccent, fontSize: 30, fontWeight: "800", letterSpacing: -1 },
  traceLabel: { color: "rgba(255,255,255,0.72)", fontSize: 9.5, marginTop: 1 },
  traceMark: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  traceMarkText: { color: colors.onAccent, fontSize: 20, fontWeight: "900" },
  traceNote: { color: "rgba(255,255,255,0.78)", fontSize: 8.5, lineHeight: 12, marginTop: 9 },
  longitudinalPanel: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md, ...(shadow.sm as object) },
  longitudinalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md, marginBottom: spacing.sm },
  longitudinalEyebrow: { color: colors.accent, fontSize: 7.5, fontWeight: "900", letterSpacing: 0.8 },
  longitudinalTitle: { color: colors.ink, fontSize: 13.5, fontWeight: "800", marginTop: 2 },
  longitudinalSubtitle: { color: colors.inkFaint, fontSize: 9.5, lineHeight: 14, marginTop: 2 },
  longitudinalCount: { backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 5 },
  longitudinalCountText: { color: colors.accent, fontSize: 7.5, fontWeight: "900" },
  longitudinalGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  longitudinalSignal: { flex: 1, flexBasis: 240, minWidth: 220, flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.border },
  longitudinalSignalTitle: { color: colors.ink, fontSize: 10.5, fontWeight: "800" },
  longitudinalSignalText: { color: colors.inkMuted, fontSize: 9, lineHeight: 13, marginTop: 2 },
  longitudinalEvidence: { color: colors.primaryDark, fontSize: 8, fontWeight: "800", marginTop: 4 },
  accessPanel: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md, ...(shadow.sm as object) },
  accessCopy: { flex: 1, flexBasis: 250, minWidth: 220 },
  accessTitle: { color: colors.ink, fontSize: 12.5, fontWeight: "800", marginTop: 2 },
  accessSubtitle: { color: colors.inkMuted, fontSize: 9.5, lineHeight: 14, marginTop: 2 },
  inviteCode: { backgroundColor: colors.primarySoft, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 7, minWidth: 150 },
  inviteCodeLabel: { color: colors.primaryDark, fontSize: 7, fontWeight: "900", letterSpacing: 0.8 },
  inviteCodeText: { color: colors.ink, fontFamily: typography.mono.fontFamily, fontSize: 11, fontWeight: "800", marginTop: 2 },
  activityToolbar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...(shadow.sm as object) },
  activityHeading: { flexGrow: 1 },
  activityTitle: { color: colors.ink, fontSize: 12.5, fontWeight: "800" },
  activitySubtitle: { color: colors.inkFaint, fontSize: 9.5, marginTop: 2 },
  searchBox: { flexDirection: "row", alignItems: "center", width: 270, maxWidth: "100%", minHeight: 38, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceMuted, paddingHorizontal: 10 },
  searchGlyph: { color: colors.inkMuted, fontSize: 16, marginRight: 6 },
  searchInput: { flex: 1, color: colors.ink, fontSize: 11, paddingVertical: 8 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: 10,
  },
  sectionHeaderText: { fontSize: 12.5, fontWeight: "800", color: colors.primaryDark, letterSpacing: 0.5 },
  sectionHeaderLine: { flex: 1, height: 1, backgroundColor: colors.border },

  emptyState: { alignItems: "center", padding: spacing.xxxl, marginTop: spacing.lg },
  emptyIcon: { fontSize: 34, marginBottom: spacing.sm, opacity: 0.5 },
  emptyTitle: { ...typography.bodyStrong, marginBottom: 4 },
  emptyText: { ...typography.caption, textAlign: "center", maxWidth: 260 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    flexDirection: "row",
    ...(shadow.sm as object),
  },
  cardNew: { borderColor: colors.accent, ...(shadow.md as object) },
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  accentBar: { width: 4 },
  cardBody: { flex: 1, padding: spacing.md },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  newPill: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginRight: 8,
  },
  newPillText: { fontSize: 9, fontWeight: "800", color: colors.onAccent, letterSpacing: 0.4 },
  sourceIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  sourceIcon: { fontSize: 15 },
  sourceLabel: { fontSize: 12.5, fontWeight: "800", color: colors.ink },
  timeMeta: { fontSize: 10.5, color: colors.inkFaint, marginTop: 1, fontWeight: "600" },

  whatRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  whatIcon: { fontSize: 16, marginTop: 1 },
  whatText: { flex: 1, fontSize: 13.5, fontWeight: "600", color: colors.ink, lineHeight: 19 },
  whyText: { fontSize: 10.5, color: colors.inkMuted, marginBottom: 2, lineHeight: 15 },

  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  ruleId: {
    fontFamily: typography.mono.fontFamily,
    fontSize: 10.5,
    color: colors.inkFaint,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  expandHint: { fontSize: 11, fontWeight: "700", color: colors.primary },

  detail: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  detailHeading: { ...typography.label, marginTop: 8, marginBottom: 2 },
  detailText: { fontSize: 13, color: colors.ink, lineHeight: 18 },
  factRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 8 },
  factCategory: { fontSize: 13, fontWeight: "700", color: colors.ink },
  factReason: { fontSize: 12, color: colors.inkMuted, marginTop: 1 },
  factRule: { ...typography.mono, marginTop: 2 },

  skeletonCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    flexDirection: "row",
  },
  skeletonAccent: { width: 4, backgroundColor: colors.surfaceMuted },
  skeletonBody: { flex: 1, padding: spacing.md },
  skeletonHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  skeletonIcon: { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  skeletonBlock: { height: 11, borderRadius: 4, backgroundColor: colors.surfaceMuted },
});
