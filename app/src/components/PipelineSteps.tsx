import { StyleSheet, Text, View } from "react-native";
import { colors, PIPELINE_STAGES } from "../theme";

// status: -1 = idle (nothing started), 0..4 = that stage currently running,
// PIPELINE_STAGES.length = fully complete.
export function PipelineSteps({ status }: { status: number }) {
  return (
    <View style={styles.row}>
      {PIPELINE_STAGES.map((stage, i) => {
        const done = status > i || status >= PIPELINE_STAGES.length;
        const active = status === i;
        return (
          <View key={stage.key} style={styles.stepWrap}>
            <View style={styles.nodeRow}>
              <View
                style={[
                  styles.node,
                  done && styles.nodeDone,
                  active && styles.nodeActive,
                ]}
              >
                <Text style={[styles.nodeText, (done || active) && styles.nodeTextOn]}>
                  {done ? "✓" : i + 1}
                </Text>
              </View>
              {i < PIPELINE_STAGES.length - 1 && (
                <View style={[styles.connector, done && styles.connectorDone]} />
              )}
            </View>
            <Text style={[styles.label, (active || done) && styles.labelOn]}>{stage.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const NODE_SIZE = 24;

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start" },
  stepWrap: { alignItems: "center", flex: 1 },
  nodeRow: { flexDirection: "row", alignItems: "center", width: "100%" },
  node: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -2,
  },
  nodeActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  nodeDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  nodeText: { fontSize: 11, fontWeight: "800", color: colors.inkFaint },
  nodeTextOn: { color: colors.onPrimary },
  connector: { flex: 1, height: 2, backgroundColor: colors.border },
  connectorDone: { backgroundColor: colors.primary },
  label: { fontSize: 9.5, fontWeight: "700", color: colors.inkFaint, marginTop: 5 },
  labelOn: { color: colors.ink },
});
