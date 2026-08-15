import { useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Audio } from "expo-av";
import * as Crypto from "expo-crypto";
import {
  FlaggedEntry,
  HandoffResult,
  RawCapture,
  StructuredEntry,
  antenatalNcdProtocol,
  antenatalNcdSchemaCategories,
  highestFlagLevel,
  runPipeline,
} from "@continuum/engine";
import { sttProvider, llmProvider, usingMocks } from "../lib/providers";
import { supabase } from "../lib/supabase";
import { insertEntryFromPipeline } from "../lib/entries";
import { haptics } from "../lib/haptics";
import { FlagBadge } from "../components/FlagBadge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ScreenHeader } from "../components/ScreenHeader";
import { SegmentedControl } from "../components/SegmentedControl";
import { PipelineSteps } from "../components/PipelineSteps";
import { colors, spacing, typography, PIPELINE_STAGES } from "../theme";

const SAMPLE_NOTES = [
  {
    label: "Antenatal — danger signs (Hindi)",
    text: "Aaj Meena ki home visit ki. BP 148 over 96 tha. Usne bataya ki severe headache hai aur vision blurry hai. Bleeding bhi thoda hua hai.",
    translated:
      "Did Meena's home visit today. BP was 148 over 96. She reported severe headache and blurry vision. There was also some bleeding.",
  },
  {
    label: "NCD screening — normal (Marathi)",
    text: "Rajesh cha NCD screening kela. Blood sugar 130 hota, fasting nantar. Weight 74 kg. Kuthlihi tak nahi.",
    translated: "Did Rajesh's NCD screening. Blood sugar was 130 after fasting. Weight 74 kg. No complaints.",
  },
];

export function CommunityVisitScreen({ patientId, userId }: { patientId: string; userId: string }) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [selectedSample, setSelectedSample] = useState(0);
  const [captureMode, setCaptureMode] = useState<"sample" | "record">("sample");
  const [running, setRunning] = useState(false);
  const [stepStatus, setStepStatus] = useState(-1);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [result, setResult] = useState<{
    rawCapture: RawCapture;
    structuredEntries: StructuredEntry[];
    flaggedEntries: FlaggedEntry[];
    handoffResult: HandoffResult;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const useSample = captureMode === "sample";

  async function startRecording() {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Microphone permission needed", "Grant microphone access to record a voice note, or use a sample note below.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(rec);
      setCaptureMode("record");
      setResult(null);
      setSaved(false);
      haptics.medium();
    } catch (e) {
      haptics.error();
      Alert.alert("Could not start recording", String(e));
    }
  }

  async function stopRecording() {
    if (!recording) return;
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecordedUri(uri);
    setRecording(null);
    haptics.light();
  }

  function beginStepAnimation() {
    setStepStatus(0);
    stepTimer.current = setInterval(() => {
      setStepStatus((s) => (s < PIPELINE_STAGES.length - 1 ? s + 1 : s));
    }, 420);
  }

  function endStepAnimation(finalStatus: number) {
    if (stepTimer.current) clearInterval(stepTimer.current);
    setStepStatus(finalStatus);
  }

  async function runVisit() {
    setRunning(true);
    setResult(null);
    setSaved(false);
    beginStepAnimation();
    try {
      const sample = SAMPLE_NOTES[selectedSample];
      const pipelineResult = await runPipeline({
        input: {
          kind: "voice",
          audio: useSample
            ? { simulatedText: sample.text, simulatedTranslatedText: sample.translated, simulatedLanguage: "hi" }
            : { uri: recordedUri ?? undefined, languageHint: "hi-IN" },
          sttProvider,
        },
        schemaContext: {
          protocolId: antenatalNcdProtocol.id,
          categories: antenatalNcdSchemaCategories,
          instructions: "Extract antenatal/NCD screening facts only.",
        },
        protocol: antenatalNcdProtocol,
        recipientRole: "supervising_health_worker",
        llmProvider,
      });
      setResult(pipelineResult);
      endStepAnimation(PIPELINE_STAGES.length);
      const worst = highestFlagLevel(pipelineResult.flaggedEntries);
      if (worst === "red") haptics.warning();
      else haptics.success();
    } catch (e) {
      endStepAnimation(-1);
      haptics.error();
      Alert.alert("Pipeline failed", String(e));
    } finally {
      setRunning(false);
    }
  }

  async function save() {
    if (!result) return;
    setSaving(true);
    try {
      let mediaRef: string | null = null;
      if (!useSample && recordedUri) {
        mediaRef = await tryUploadAudio(patientId, recordedUri);
      }
      await insertEntryFromPipeline({
        patientId,
        userId,
        rawCapture: result.rawCapture,
        structuredEntries: result.structuredEntries,
        flaggedEntries: result.flaggedEntries,
        handoffResult: result.handoffResult,
        protocolId: antenatalNcdProtocol.id,
        mediaRef,
      });
      setSaved(true);
      haptics.success();
    } catch (e) {
      haptics.error();
      Alert.alert("Save failed", String(e));
    } finally {
      setSaving(false);
    }
  }

  const canRun = useSample || !!recordedUri;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <ScreenHeader
        icon="🎙️"
        iconTint={colors.accentSoft}
        title="CHW Visit"
        subtitle="Capture a voice note → structure against the antenatal/NCD protocol → compare → flag → handoff to the supervising health worker."
      />

      {usingMocks.stt && (
        <View style={styles.mockNote}>
          <Text style={styles.mockNoteText}>Using mock speech-to-text — no SARVAM_API_KEY set. Content comes from the sample note text.</Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>1 · Capture</Text>
      <Card style={styles.section}>
        <SegmentedControl
          value={captureMode}
          onChange={(v) => setCaptureMode(v)}
          options={[
            { value: "sample", label: "Use sample note" },
            { value: "record", label: "Record real audio" },
          ]}
        />

        {useSample ? (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {SAMPLE_NOTES.map((s, i) => (
              <Pressable
                key={i}
                style={[styles.sampleCard, selectedSample === i && styles.sampleCardActive]}
                onPress={() => {
                  haptics.tap();
                  setSelectedSample(i);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: selectedSample === i }}
                accessibilityLabel={s.label}
              >
                <View style={[styles.radio, selectedSample === i && styles.radioActive]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sampleLabel}>{s.label}</Text>
                  <Text style={styles.sampleText}>{s.text}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={{ marginTop: spacing.md, alignItems: "flex-start" }}>
            {!recording ? (
              <Button label="● Start recording" onPress={startRecording} variant="danger" fullWidth={false} />
            ) : (
              <Button label="■ Stop recording" onPress={stopRecording} variant="secondary" fullWidth={false} />
            )}
            {recording && <Text style={styles.recordingNote}>● Recording…</Text>}
            {recordedUri && !recording && <Text style={styles.recordedNote}>✓ Recorded — ready to run</Text>}
          </View>
        )}
      </Card>

      <Button
        label={running ? "Running pipeline…" : "Run capture → structure → compare → flag → handoff"}
        onPress={runVisit}
        loading={running}
        disabled={!canRun}
      />

      {(running || result) && (
        <View style={styles.stepsWrap}>
          <PipelineSteps status={stepStatus} />
        </View>
      )}

      {result && (
        <>
          <Text style={styles.sectionLabel}>2 · Structured + Flagged</Text>
          <Card style={styles.section}>
            {result.flaggedEntries.map((f, i) => (
              <View key={i} style={[styles.factRow, i > 0 && styles.factRowBorder]}>
                <FlagBadge level={f.flagLevel} compact />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.factCategory}>
                    {f.category.replace(/_/g, " ")}: {String(f.value)} {f.unit ?? ""}
                  </Text>
                  <Text style={styles.factReason}>{f.flagReason}</Text>
                </View>
              </View>
            ))}
          </Card>

          <Text style={styles.sectionLabel}>3 · Handoff (to supervising health worker)</Text>
          <Card style={styles.section} accentColor={colors.accent}>
            <Text style={styles.handoffText}>{result.handoffResult.summary}</Text>
          </Card>

          <Button
            label={saved ? "✓ Saved to timeline" : "Save to timeline"}
            onPress={save}
            loading={saving}
            disabled={saved}
            variant={saved ? "secondary" : "primary"}
          />
        </>
      )}
    </ScrollView>
  );
}

async function tryUploadAudio(patientId: string, uri: string): Promise<string | null> {
  try {
    const path = `${patientId}/${Crypto.randomUUID()}.m4a`;
    const response = await fetch(uri);
    const blob = await response.blob();
    const { error } = await supabase.storage.from("raw-evidence").upload(path, blob, { contentType: "audio/m4a" });
    if (error) throw error;
    return path;
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  mockNote: { backgroundColor: "#FDF3E0", borderRadius: 10, padding: spacing.sm, marginBottom: spacing.lg },
  mockNoteText: { fontSize: 12, color: "#9A5B06", fontWeight: "600" },
  sectionLabel: { ...typography.label, marginBottom: spacing.sm, marginTop: spacing.xl },
  section: { marginBottom: 0 },
  sampleCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.sm,
    backgroundColor: colors.bg,
  },
  sampleCardActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    marginTop: 2,
  },
  radioActive: { borderColor: colors.accent, backgroundColor: colors.accent },
  sampleLabel: { fontSize: 12.5, fontWeight: "700", color: colors.ink },
  sampleText: { fontSize: 12, color: colors.inkMuted, marginTop: 3, lineHeight: 16 },
  recordingNote: { marginTop: spacing.sm, color: colors.danger, fontSize: 12, fontWeight: "700" },
  recordedNote: { marginTop: spacing.sm, color: colors.flag.green.fg, fontSize: 12, fontWeight: "700" },
  stepsWrap: { marginTop: spacing.lg, paddingHorizontal: spacing.xs },
  factRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: spacing.sm },
  factRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  factCategory: { fontSize: 13, fontWeight: "700", color: colors.ink },
  factReason: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  handoffText: { fontSize: 13.5, color: colors.ink, lineHeight: 20 },
});
