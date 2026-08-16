import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { syncPendingEntries } from "../lib/entries";
import { getOutboxState, OutboxState, subscribeOutbox } from "../lib/outbox";
import { colors, radius, spacing } from "../theme";

const EMPTY_STATE: OutboxState = { count: 0, bytes: 0, syncing: false, storage: "volatile-web" };

export function OfflineSyncBar() {
  const [state, setState] = useState<OutboxState>(EMPTY_STATE);
  const inFlight = useRef(false);

  const sync = useCallback(async (announce = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const result = await syncPendingEntries();
      if (announce && result.delivered > 0) {
        AccessibilityInfo.announceForAccessibility(`${result.delivered} offline record${result.delivered === 1 ? "" : "s"} synced`);
      }
    } finally {
      inFlight.current = false;
      setState(await getOutboxState());
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeOutbox(setState);
    const interval = setInterval(() => {
      void getOutboxState().then((next) => {
        setState(next);
        if (next.count > 0 && !next.syncing) void sync(false);
      });
    }, 15000);
    const appStateSubscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void sync(false);
    });
    return () => {
      unsubscribe();
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [sync]);

  if (state.count === 0 && !state.lastError) return null;

  return (
    <View style={[styles.bar, state.lastError && styles.errorBar]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <View style={styles.copy}>
        <Text style={styles.title}>{state.lastError ? "Offline sync needs attention" : `${state.count} capture${state.count === 1 ? "" : "s"} waiting to sync`}</Text>
        <Text style={styles.note}>
          {state.lastError ?? `${formatBytes(state.bytes)} · ${state.storage === "device-keystore" ? "encrypted on this device" : "kept only in this browser tab"}`}
        </Text>
      </View>
      <Pressable
        onPress={() => void sync(true)}
        disabled={state.syncing}
        accessibilityRole="button"
        accessibilityLabel="Sync offline captures now"
        accessibilityState={{ disabled: state.syncing, busy: state.syncing }}
        style={({ pressed }) => [styles.button, pressed && styles.pressed, state.syncing && styles.disabled]}
      >
        <Text style={styles.buttonText}>{state.syncing ? "Syncing…" : "Sync now"}</Text>
      </Pressable>
    </View>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const styles = StyleSheet.create({
  bar: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.flag.amber.bg, borderBottomWidth: 1, borderBottomColor: colors.flag.amber.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  errorBar: { backgroundColor: colors.dangerSoft, borderBottomColor: colors.danger },
  copy: { flex: 1 },
  title: { color: colors.ink, fontSize: 11.5, fontWeight: "800" },
  note: { color: colors.inkMuted, fontSize: 9.5, marginTop: 2 },
  button: { minHeight: 40, justifyContent: "center", backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: spacing.md },
  buttonText: { color: colors.onAccent, fontSize: 10.5, fontWeight: "800" },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.55 },
});
