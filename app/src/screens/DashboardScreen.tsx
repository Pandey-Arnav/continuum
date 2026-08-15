import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { EntryRow, fetchEntries, subscribeToEntries } from "../lib/entries";
import { FlagBadge } from "../components/FlagBadge";

const SOURCE_ICON: Record<string, string> = {
  chw_voice_visit: "🎙️",
  discharge_photo: "📄",
};

const SOURCE_LABEL: Record<string, string> = {
  chw_voice_visit: "Community health worker visit",
  discharge_photo: "Hospital discharge sheet",
};

type SourceFilter = "all" | "chw_voice_visit" | "discharge_photo";

export function DashboardScreen({ patientId }: { patientId: string }) {
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = await fetchEntries(patientId);
    setEntries(rows);
  }, [patientId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));

    const unsubscribe = subscribeToEntries(patientId, (row) => {
      setEntries((prev) => (prev.some((e) => e.id === row.id) ? prev : [row, ...prev]));
    });
    return unsubscribe;
  }, [patientId, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filtered = useMemo(
    () => (filter === "all" ? entries : entries.filter((e) => e.source_type === filter)),
    [entries, filter]
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Unified Timeline</Text>
      <Text style={styles.subtitle}>One engine, two entry points — every flag traces to its input and rule.</Text>

      <View style={styles.filterRow}>
        {(["all", "chw_voice_visit", "discharge_photo"] as SourceFilter[]).map((f) => (
          <Pressable key={f} onPress={() => setFilter(f)} style={[styles.filterChip, filter === f && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f === "all" ? "All sources" : SOURCE_ICON[f] + " " + SOURCE_LABEL[f]}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No entries yet for this filter.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isExpanded = expandedId === item.id;
          return (
            <Pressable style={styles.card} onPress={() => setExpandedId(isExpanded ? null : item.id)}>
              <View style={styles.cardHeader}>
                <Text style={styles.sourceIcon}>{SOURCE_ICON[item.source_type]}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sourceLabel}>{SOURCE_LABEL[item.source_type]}</Text>
                  <Text style={styles.timestamp}>{new Date(item.created_at).toLocaleString()}</Text>
                </View>
                <FlagBadge level={item.flag_level} compact />
              </View>

              <Text style={styles.reason}>{item.flag_reason}</Text>
              <Text style={styles.ruleId}>rule: {item.rule_id}</Text>

              {isExpanded && (
                <View style={styles.detail}>
                  <Text style={styles.detailHeading}>Handoff summary (for {item.recipient.replace(/_/g, " ")})</Text>
                  <Text style={styles.detailText}>{item.handoff_summary}</Text>

                  <Text style={styles.detailHeading}>Raw input (evidence)</Text>
                  <Text style={styles.detailText}>{item.raw_text}</Text>

                  <Text style={styles.detailHeading}>Structured extraction + flags</Text>
                  {item.flagged_data.map((fact, i) => (
                    <View key={i} style={styles.factRow}>
                      <FlagBadge level={fact.flagLevel} compact />
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={styles.factCategory}>
                          {fact.category.replace(/_/g, " ")}: {String(fact.value)} {fact.unit ?? ""}
                        </Text>
                        <Text style={styles.factReason}>{fact.flagReason}</Text>
                        <Text style={styles.factRule}>rule: {fact.ruleId}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <Text style={styles.expandHint}>{isExpanded ? "Tap to collapse" : "Tap to see evidence + all rules"}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC", paddingTop: 16, paddingHorizontal: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "700", color: "#0F172A" },
  subtitle: { fontSize: 13, color: "#64748B", marginTop: 2, marginBottom: 12 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "#E2E8F0" },
  filterChipActive: { backgroundColor: "#0F172A" },
  filterChipText: { fontSize: 12, color: "#334155", fontWeight: "600" },
  filterChipTextActive: { color: "#fff" },
  emptyText: { color: "#64748B" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  sourceIcon: { fontSize: 20, marginRight: 8 },
  sourceLabel: { fontSize: 14, fontWeight: "600", color: "#0F172A" },
  timestamp: { fontSize: 11, color: "#94A3B8" },
  reason: { fontSize: 13, color: "#1E293B", marginBottom: 2 },
  ruleId: { fontSize: 11, color: "#94A3B8", fontFamily: "Courier" },
  expandHint: { fontSize: 11, color: "#3B82F6", marginTop: 8 },
  detail: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  detailHeading: { fontSize: 12, fontWeight: "700", color: "#0F172A", marginTop: 8 },
  detailText: { fontSize: 13, color: "#334155", marginTop: 2 },
  factRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 8 },
  factCategory: { fontSize: 13, fontWeight: "600", color: "#0F172A" },
  factReason: { fontSize: 12, color: "#475569" },
  factRule: { fontSize: 11, color: "#94A3B8", fontFamily: "Courier" },
});
