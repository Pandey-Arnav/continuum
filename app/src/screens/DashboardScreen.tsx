import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { EntryRow, fetchEntries, subscribeToEntries } from "../lib/entries";
import { FlagBadge } from "../components/FlagBadge";
import { ScreenHeader } from "../components/ScreenHeader";
import { SegmentedControl } from "../components/SegmentedControl";
import { haptics } from "../lib/haptics";
import { colors, radius, shadow, spacing, typography } from "../theme";

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

const CATEGORY_ICON: Record<string, string> = {
  blood_pressure_systolic: "🩺",
  blood_pressure_diastolic: "🩺",
  temperature_f: "🌡️",
  blood_sugar_random_mgdl: "🩸",
  weight_kg: "⚖️",
  vaginal_bleeding: "🩸",
  reduced_fetal_movement: "👶",
  severe_swelling: "💧",
  severe_headache: "🤕",
  medication_change: "💊",
  red_flag_symptom: "⚠️",
  follow_up_appointment: "📅",
  diagnosis_note: "📋",
};

type SourceFilter = "all" | "chw_voice_visit" | "discharge_photo";

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

  const filtered = useMemo(
    () => (filter === "all" ? entries : entries.filter((e) => e.source_type === filter)),
    [entries, filter]
  );

  const sections = useMemo(() => groupByDay(filtered), [filtered]);

  const stats = useMemo(() => {
    const counts = { red: 0, amber: 0, green: 0 };
    for (const e of entries) counts[e.flag_level]++;
    return counts;
  }, [entries]);

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(expandedId === id ? null : id);
  };

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
          <StatPill count={stats.red} level="red" label="Needs attention" />
          <StatPill count={stats.amber} level="amber" label="Worth a look" />
          <StatPill count={stats.green} level="green" label="Stable" />
        </View>
      )}

      <SegmentedControl
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All sources" },
          { value: "chw_voice_visit", label: "CHW visit", icon: "🎙️" },
          { value: "discharge_photo", label: "Discharge", icon: "📄" },
        ]}
      />

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

function StatPill({ count, level, label }: { count: number; level: "red" | "amber" | "green"; label: string }) {
  const palette = colors.flag[level];
  return (
    <View style={[styles.statPill, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[styles.statCount, { color: palette.fg }]}>{count}</Text>
      <Text style={[styles.statLabel, { color: palette.fg }]}>{label}</Text>
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
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: spacing.lg, paddingHorizontal: spacing.lg },

  statsRow: { flexDirection: "row", gap: 8, marginBottom: spacing.md },
  statPill: { flex: 1, borderRadius: radius.md, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 10 },
  statCount: { fontSize: 18, fontWeight: "800" },
  statLabel: { fontSize: 10.5, fontWeight: "700", marginTop: 1 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: 10,
  },
  sectionHeaderText: { fontSize: 12.5, fontWeight: "800", color: colors.inkMuted, letterSpacing: 0.3 },
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
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  sourceIcon: { fontSize: 15 },
  sourceLabel: { fontSize: 13, fontWeight: "700", color: colors.ink },
  timeMeta: { fontSize: 11.5, color: colors.inkFaint, marginTop: 1, fontWeight: "600" },

  whatRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  whatIcon: { fontSize: 16, marginTop: 1 },
  whatText: { flex: 1, fontSize: 14.5, fontWeight: "600", color: colors.ink, lineHeight: 20 },
  whyText: { fontSize: 12, color: colors.inkMuted, marginBottom: 2, lineHeight: 16 },

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
