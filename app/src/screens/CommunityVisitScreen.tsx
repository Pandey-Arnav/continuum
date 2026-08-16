import { useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as Crypto from "expo-crypto";
import {
  FlaggedEntry,
  FollowUpQuestion,
  HandoffResult,
  RawCapture,
  StructuredEntry,
  antenatalNcdProtocol,
  antenatalNcdSchemaCategories,
  buildDeterministicHandoff,
  compare,
  highestFlagLevel,
  runPipeline,
} from "@continuum/engine";
import { sttProvider, llmProvider, providerMode, usingMocks } from "../lib/providers";
import { supabase } from "../lib/supabase";
import { EntryCorrectionDraft, insertEntryFromPipeline, recordWorkflowEvent } from "../lib/entries";
import { haptics } from "../lib/haptics";
import { TOP_LANGUAGES } from "../lib/languages";
import { FlagBadge } from "../components/FlagBadge";
import { Button } from "../components/Button";
import { ScreenHeader } from "../components/ScreenHeader";
import { SegmentedControl } from "../components/SegmentedControl";
import { PipelineSteps } from "../components/PipelineSteps";
import { SectionCard } from "../components/SectionCard";
import { FadeSlideIn } from "../components/FadeSlideIn";
import { VerificationPanel } from "../components/VerificationPanel";
import { colors, spacing, CATEGORY_ICON, PIPELINE_STAGES } from "../theme";

const SAMPLE_NOTES = [
  {
    label: "Antenatal — danger signs (Hindi)",
    lang: "hi",
    text: "Aaj Meena ki home visit ki. BP 148 over 96 tha. Usne bataya ki severe headache hai aur vision blurry hai. Bleeding bhi thoda hua hai.",
    translated:
      "Did Meena's home visit today. BP was 148 over 96. She reported severe headache and blurry vision. There was also some bleeding.",
  },
  {
    label: "NCD screening — normal (Marathi)",
    lang: "mr",
    text: "Rajesh cha NCD screening kela. Blood sugar 130 hota, fasting nantar. Weight 74 kg. Kuthlihi tak nahi.",
    translated: "Did Rajesh's NCD screening. Blood sugar was 130 after fasting. Weight 74 kg. No complaints.",
  },
  {
    label: "Antenatal — mild concern (Swahili)",
    lang: "sw",
    text: "Nilimtembelea Amina nyumbani leo. Shinikizo la damu lilikuwa 142 juu ya 88. Alisema ana maumivu ya kichwa kidogo, si makali. Uzito wake ni kilo 65.",
    translated:
      "Visited Amina at home today. Blood pressure was 142 over 88. She said she has a mild headache, not severe. Her weight is 65 kg.",
  },
  {
    label: "NCD screening — danger (Bengali)",
    lang: "bn",
    text: "আজ করিমের এনসিডি স্ক্রিনিং করেছি। উপবাসের পর রক্তে শর্করা ছিল ২২০। ওজন ছিল ৮২ কেজি। আর কোনো উপসর্গ জানাননি।",
    translated:
      "Did Karim's NCD screening today. Blood sugar was 220 after fasting. Weight was 82 kg. No other symptoms reported.",
  },
  {
    label: "Antenatal — danger signs (Tamil)",
    lang: "ta",
    text: "இன்று லதாவின் வீட்டு வருகையை மேற்கொண்டேன். இரத்த அழுத்தம் 152/98 இருந்தது. கடுமையான தலைவலியும் பார்வை மங்கலும் இருப்பதாகக் கூறினார்.",
    translated: "Did Latha's home visit today. Blood pressure was 152/98. She reported severe headache and blurred vision.",
  },
  {
    label: "Antenatal — routine, normal (Spanish)",
    lang: "es",
    text: "Visité a Rosa en su casa hoy. La presión arterial fue 118 sobre 76, dentro del rango normal. Temperatura normal. Peso 60 kilos. Sin quejas.",
    translated:
      "Visited Rosa at home today. Blood pressure was 118 over 76, within normal range. Temperature normal. Weight 60 kg. No complaints.",
  },
];

export function CommunityVisitScreen({ patientId, userId }: { patientId: string; userId: string }) {
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [selectedSample, setSelectedSample] = useState(0);
  const [captureMode, setCaptureMode] = useState<"sample" | "record">("sample");
  const [languageCode, setLanguageCode] = useState("hi-IN");
  const [running, setRunning] = useState(false);
  const [stepStatus, setStepStatus] = useState(-1);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [result, setResult] = useState<{
    rawCapture: RawCapture;
    structuredEntries: StructuredEntry[];
    flaggedEntries: FlaggedEntry[];
    handoffResult: HandoffResult;
    followUpQuestions: FollowUpQuestion[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "queued">("idle");
  const [confirmedFacts, setConfirmedFacts] = useState<Set<number>>(new Set());
  const [clientEventId, setClientEventId] = useState<string | null>(null);
  const [originalFacts, setOriginalFacts] = useState<FlaggedEntry[]>([]);
  const [correctionReasons, setCorrectionReasons] = useState<Record<number, string>>({});
  const [correctionIds, setCorrectionIds] = useState<Record<number, string>>({});
  const runStartedAt = useRef(0);

  const useSample = captureMode === "sample";

  async function startRecording() {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Microphone permission needed", "Grant microphone access to record a voice note, or use a sample note below.");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setCaptureMode("record");
      setResult(null);
      setSaveState("idle");
      haptics.medium();
    } catch (e) {
      haptics.error();
      Alert.alert("Could not start recording", String(e));
    }
  }

  async function stopRecording() {
    if (!recorderState.isRecording) return;
    await audioRecorder.stop();
    setRecordedUri(audioRecorder.uri);
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
    runStartedAt.current = Date.now();
    const eventId = Crypto.randomUUID();
    setRunning(true);
    setResult(null);
    setSaveState("idle");
    setConfirmedFacts(new Set());
    setClientEventId(eventId);
    setOriginalFacts([]);
    setCorrectionReasons({});
    setCorrectionIds({});
    beginStepAnimation();
    try {
      const sample = SAMPLE_NOTES[selectedSample];
      const pipelineResult = await runPipeline({
        input: {
          kind: "voice",
          audio: useSample
            ? { simulatedText: sample.text, simulatedTranslatedText: sample.translated, simulatedLanguage: sample.lang }
            : { uri: recordedUri ?? undefined, languageHint: languageCode },
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
      setOriginalFacts(pipelineResult.flaggedEntries.map((fact) => ({ ...fact })));
      setConfirmedFacts(new Set());
      endStepAnimation(PIPELINE_STAGES.length);
      const worst = highestFlagLevel(pipelineResult.flaggedEntries);
      if (worst === "red") haptics.warning();
      else haptics.success();
      await recordWorkflowEvent({
        patientId,
        userId,
        eventName: "chw_pipeline",
        success: true,
        durationMs: Date.now() - runStartedAt.current,
        clientEventId: eventId,
        metadata: { provider: providerMode, fact_count: pipelineResult.flaggedEntries.length },
      }).catch(() => undefined);
    } catch (e) {
      endStepAnimation(-1);
      haptics.error();
      await recordWorkflowEvent({ patientId, userId, eventName: "chw_pipeline", success: false, durationMs: Date.now() - runStartedAt.current, metadata: { provider: providerMode } }).catch(() => undefined);
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
      const corrections: EntryCorrectionDraft[] = result.flaggedEntries.flatMap((fact, index) => {
        const original = originalFacts[index];
        if (!original || String(original.value) === String(fact.value)) return [];
        return [{
          clientCorrectionId: correctionIds[index] ?? Crypto.randomUUID(),
          factIndex: index,
          originalFact: original as unknown as Record<string, unknown>,
          correctedFact: fact as unknown as Record<string, unknown>,
          reason: correctionReasons[index].trim(),
          correctedBy: userId,
        }];
      });
      const currentHandoff = corrections.length > 0
        ? buildDeterministicHandoff(result.flaggedEntries, "supervising_health_worker")
        : result.handoffResult;
      const savedEntry = await insertEntryFromPipeline({
        patientId,
        userId,
        rawCapture: result.rawCapture,
        structuredEntries: result.structuredEntries,
        flaggedEntries: result.flaggedEntries,
        handoffResult: currentHandoff,
        protocolId: antenatalNcdProtocol.id,
        protocolVersionId: antenatalNcdProtocol.id,
        mediaRef,
        clientEventId,
        corrections,
        review: {
          status: "human_verified",
          reviewedBy: userId,
          reviewedAt: new Date().toISOString(),
          extractionProvider: providerMode,
        },
      });
      setResult((current) => current ? { ...current, handoffResult: currentHandoff } : current);
      setSaveState(savedEntry.sync_status === "queued" ? "queued" : "saved");
      haptics.success();
    } catch (e) {
      haptics.error();
      Alert.alert("Save failed", String(e));
    } finally {
      setSaving(false);
    }
  }

  const canRun = useSample || !!recordedUri;
  const correctionReasonsComplete = Object.values(correctionReasons).every((reason) => reason.trim().length >= 3);
  const verificationComplete = Boolean(result && result.flaggedEntries.length > 0 && confirmedFacts.size === result.flaggedEntries.length && correctionReasonsComplete);

  function editFact(index: number, rawValue: string) {
    setResult((current) => {
      if (!current) return current;
      const original = originalFacts[index];
      const value = typeof original?.value === "number" && rawValue.trim() !== "" && Number.isFinite(Number(rawValue)) ? Number(rawValue) : rawValue;
      const structuredEntries = current.structuredEntries.map((entry, entryIndex) => entryIndex === index ? { ...entry, value, evidenceVerified: false, extractionConfidence: "review" as const } : entry);
      const flaggedEntries = compare(structuredEntries, antenatalNcdProtocol);
      return { ...current, structuredEntries, flaggedEntries };
    });
    setConfirmedFacts((current) => {
      const next = new Set(current);
      next.delete(index);
      return next;
    });
    setCorrectionReasons((current) => {
      if (String(originalFacts[index]?.value) === rawValue) {
        const next = { ...current };
        delete next[index];
        return next;
      }
      return Object.prototype.hasOwnProperty.call(current, index) ? current : { ...current, [index]: "" };
    });
    setCorrectionIds((current) => Object.prototype.hasOwnProperty.call(current, index) ? current : { ...current, [index]: Crypto.randomUUID() });
    setSaveState("idle");
  }

  function toggleConfirmedFact(index: number) {
    setConfirmedFacts((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

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
          <Text style={styles.mockNoteIcon}>ℹ️</Text>
          <Text style={styles.mockNoteText}>
            Mock provider mode is active. Deploy the secure provider function and enable the proxy to process real
            recordings.
          </Text>
        </View>
      )}

      <View style={styles.flow}>
        <SectionCard index={1} title="Capture">
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
            <View style={{ marginTop: spacing.md }}>
              <Text style={styles.subLabel}>Spoken language ({TOP_LANGUAGES.length})</Text>
              <ScrollView
                style={styles.languageScroll}
                contentContainerStyle={styles.languageGrid}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {TOP_LANGUAGES.map((l) => {
                  const active = languageCode === l.code;
                  return (
                    <Pressable
                      key={l.code}
                      onPress={() => {
                        if (!active) haptics.tap();
                        setLanguageCode(l.code);
                      }}
                      style={[styles.langChip, active && styles.langChipActive]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={l.name}
                    >
                      <Text style={[styles.langChipText, active && styles.langChipTextActive]}>{l.native}</Text>
                      <Text style={[styles.langChipSubtext, active && styles.langChipTextActive]}> · {l.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={{ marginTop: spacing.md, alignItems: "flex-start" }}>
                {!recorderState.isRecording ? (
                  <Button label="● Start recording" onPress={startRecording} variant="danger" fullWidth={false} />
                ) : (
                  <Button label="■ Stop recording" onPress={stopRecording} variant="secondary" fullWidth={false} />
                )}
                {recorderState.isRecording && <Text style={styles.recordingNote}>● Recording…</Text>}
                {recordedUri && !recorderState.isRecording && <Text style={styles.recordedNote}>✓ Recorded — ready to run</Text>}
              </View>
            </View>
          )}
        </SectionCard>

        <Button
          label={running ? "Running pipeline…" : "▶ Run the pipeline"}
          onPress={runVisit}
          loading={running}
          disabled={!canRun}
          caption="capture → structure → compare → flag → handoff → follow-up"
        />

        {(running || result) && <PipelineSteps status={stepStatus} />}

        {result && result.flaggedEntries.length === 0 && (
          <FadeSlideIn trigger={result}>
            <SectionCard index={2} title="Nothing extracted" tint={colors.flag.amber.bg}>
              <Text style={styles.emptyResultText}>
                No antenatal/NCD facts (blood pressure, temperature, symptoms, weight, etc.) were found in
                "{result.rawCapture.translatedText ?? result.rawCapture.text}". There's nothing to save from this
                capture — try a sample note, or mention specific vitals/symptoms when recording.
              </Text>
            </SectionCard>
          </FadeSlideIn>
        )}

        {result && result.flaggedEntries.length > 0 && (
          <FadeSlideIn trigger={result}>
            <View style={styles.flow}>
              <SectionCard index={2} title="Structured & flagged">
                {result.flaggedEntries.map((f, i) => (
                  <View key={i} style={[styles.factRow, i > 0 && styles.factRowBorder]}>
                    <FlagBadge level={f.flagLevel} compact />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.factCategory}>
                        {CATEGORY_ICON[f.category] ?? "📌"} {f.category.replace(/_/g, " ")}: {String(f.value)} {f.unit ?? ""}
                      </Text>
                      <Text style={styles.factReason}>{f.flagReason}</Text>
                    </View>
                  </View>
                ))}
              </SectionCard>

              <SectionCard index={3} title="Handoff · to supervising health worker" tint={colors.accentSoft}>
                <Text style={styles.handoffText}>{result.handoffResult.summary}</Text>
              </SectionCard>

              {result.followUpQuestions.length > 0 && (
                <SectionCard
                  index={4}
                  title={`Follow-up questions · ask in ${languageLabel(result.rawCapture.language)}`}
                  tint={colors.flag.amber.bg}
                >
                  {result.followUpQuestions.map((q, i) => (
                    <View key={i} style={[styles.followUpRow, i > 0 && styles.factRowBorder]}>
                      <Text style={styles.followUpQuestion}>{q.question}</Text>
                      {!!q.englishGloss && <Text style={styles.followUpGloss}>{q.englishGloss}</Text>}
                    </View>
                  ))}
                </SectionCard>
              )}

              <VerificationPanel
                facts={result.flaggedEntries}
                confirmed={confirmedFacts}
                onToggle={toggleConfirmedFact}
                onEdit={editFact}
                correctionReasons={correctionReasons}
                onCorrectionReasonChange={(index, reason) => {
                  setCorrectionReasons((current) => ({ ...current, [index]: reason }));
                  setConfirmedFacts((current) => {
                    const next = new Set(current);
                    next.delete(index);
                    return next;
                  });
                  setSaveState("idle");
                }}
              />

              <Button
                label={saveState === "saved" ? "✓ Saved to timeline" : saveState === "queued" ? "✓ Encrypted and queued for sync" : verificationComplete ? "Save verified entry" : "Verify every fact and explain corrections"}
                onPress={save}
                loading={saving}
                disabled={saveState !== "idle" || !verificationComplete}
                variant={saveState !== "idle" ? "secondary" : "primary"}
              />
            </View>
          </FadeSlideIn>
        )}
      </View>
    </ScrollView>
  );
}

function languageLabel(code: string | undefined): string {
  if (!code) return "the spoken language";
  const lower = code.toLowerCase();
  const match = TOP_LANGUAGES.find((l) => l.code.toLowerCase() === lower || l.code.toLowerCase().startsWith(`${lower}-`));
  return match?.name ?? code;
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
  container: {
    flex: 1,
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  flow: { gap: spacing.xl },
  mockNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.flag.amber.bg,
    borderRadius: 10,
    padding: spacing.sm,
    marginBottom: spacing.lg,
  },
  mockNoteIcon: { fontSize: 13 },
  mockNoteText: { flex: 1, fontSize: 12, color: colors.flag.amber.fg, fontWeight: "600", lineHeight: 16 },
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
  subLabel: { fontSize: 11.5, fontWeight: "700", color: colors.inkMuted, marginBottom: spacing.sm },
  languageScroll: {
    maxHeight: 160,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.bg,
  },
  languageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: spacing.sm },
  langChip: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  langChipText: { fontSize: 12.5, fontWeight: "700", color: colors.ink },
  langChipSubtext: { fontSize: 11, fontWeight: "500", color: colors.inkMuted },
  langChipTextActive: { color: colors.onAccent },
  factRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: spacing.sm },
  factRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  factCategory: { fontSize: 13, fontWeight: "700", color: colors.ink },
  factReason: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  handoffText: { fontSize: 13.5, color: colors.ink, lineHeight: 20 },
  followUpRow: { paddingVertical: spacing.sm },
  followUpQuestion: { fontSize: 13.5, fontWeight: "700", color: colors.ink, lineHeight: 19 },
  followUpGloss: { fontSize: 12, color: colors.inkMuted, marginTop: 2, fontStyle: "italic" },
  emptyResultText: { fontSize: 13, color: colors.flag.amber.fg, lineHeight: 19 },
});
