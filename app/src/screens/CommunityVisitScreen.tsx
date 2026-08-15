import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Audio } from "expo-av";
import * as Crypto from "expo-crypto";
import {
  FlaggedEntry,
  HandoffResult,
  RawCapture,
  StructuredEntry,
  antenatalNcdProtocol,
  antenatalNcdSchemaCategories,
  runPipeline,
} from "@continuum/engine";
import { sttProvider, llmProvider, usingMocks } from "../lib/providers";
import { supabase } from "../lib/supabase";
import { insertEntryFromPipeline } from "../lib/entries";
import { FlagBadge } from "../components/FlagBadge";

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
  const [useSample, setUseSample] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    rawCapture: RawCapture;
    structuredEntries: StructuredEntry[];
    flaggedEntries: FlaggedEntry[];
    handoffResult: HandoffResult;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
      setUseSample(false);
      setResult(null);
      setSaved(false);
    } catch (e) {
      Alert.alert("Could not start recording", String(e));
    }
  }

  async function stopRecording() {
    if (!recording) return;
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecordedUri(uri);
    setRecording(null);
  }

  async function runVisit() {
    setRunning(true);
    setResult(null);
    setSaved(false);
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
    } catch (e) {
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
    } catch (e) {
      Alert.alert("Save failed", String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <Text style={styles.title}>🎙️ Community Health Worker Visit</Text>
      <Text style={styles.subtitle}>
        Capture a voice note → structure against the antenatal/NCD protocol → compare → flag → handoff to the
        supervising health worker.
      </Text>
      {usingMocks.stt && (
        <Text style={styles.mockNote}>Using mock speech-to-text (no SARVAM_API_KEY set) — content comes from the sample note text.</Text>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1. Capture</Text>
        <View style={styles.row}>
          <Pressable style={[styles.pill, useSample && styles.pillActive]} onPress={() => setUseSample(true)}>
            <Text style={[styles.pillText, useSample && styles.pillTextActive]}>Use sample note</Text>
          </Pressable>
          <Pressable style={[styles.pill, !useSample && styles.pillActive]} onPress={() => setUseSample(false)}>
            <Text style={[styles.pillText, !useSample && styles.pillTextActive]}>Record real audio</Text>
          </Pressable>
        </View>

        {useSample ? (
          <View style={{ marginTop: 10 }}>
            {SAMPLE_NOTES.map((s, i) => (
              <Pressable key={i} style={[styles.sampleCard, selectedSample === i && styles.sampleCardActive]} onPress={() => setSelectedSample(i)}>
                <Text style={styles.sampleLabel}>{s.label}</Text>
                <Text style={styles.sampleText}>{s.text}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={{ marginTop: 10, alignItems: "flex-start" }}>
            {!recording ? (
              <Pressable style={styles.recordButton} onPress={startRecording}>
                <Text style={styles.recordButtonText}>● Start recording</Text>
              </Pressable>
            ) : (
              <Pressable style={[styles.recordButton, styles.recordButtonStop]} onPress={stopRecording}>
                <Text style={styles.recordButtonText}>■ Stop recording</Text>
              </Pressable>
            )}
            {recordedUri && !recording && <Text style={styles.recordedNote}>Recorded ✓ ready to run</Text>}
          </View>
        )}
      </View>

      <Pressable
        style={[styles.runButton, (running || (!useSample && !recordedUri)) && styles.runButtonDisabled]}
        onPress={runVisit}
        disabled={running || (!useSample && !recordedUri)}
      >
        {running ? <ActivityIndicator color="#fff" /> : <Text style={styles.runButtonText}>Run capture → structure → compare → flag → handoff</Text>}
      </Pressable>

      {result && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Structured + Flagged</Text>
          {result.flaggedEntries.map((f, i) => (
            <View key={i} style={styles.factRow}>
              <FlagBadge level={f.flagLevel} compact />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.factCategory}>
                  {f.category.replace(/_/g, " ")}: {String(f.value)} {f.unit ?? ""}
                </Text>
                <Text style={styles.factReason}>{f.flagReason}</Text>
              </View>
            </View>
          ))}

          <Text style={styles.sectionTitle}>3. Handoff (to supervising health worker)</Text>
          <Text style={styles.handoffText}>{result.handoffResult.summary}</Text>

          <Pressable style={[styles.runButton, saved && styles.runButtonDisabled]} onPress={save} disabled={saving || saved}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.runButtonText}>{saved ? "Saved to timeline ✓" : "Save to timeline"}</Text>}
          </Pressable>
        </View>
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
  container: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16, paddingTop: 16 },
  title: { fontSize: 20, fontWeight: "700", color: "#0F172A" },
  subtitle: { fontSize: 13, color: "#64748B", marginTop: 4 },
  mockNote: { fontSize: 12, color: "#B45309", marginTop: 8, backgroundColor: "#FEF3C7", padding: 8, borderRadius: 8 },
  section: { marginTop: 18 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#0F172A", marginBottom: 8 },
  row: { flexDirection: "row", gap: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "#E2E8F0" },
  pillActive: { backgroundColor: "#0F172A" },
  pillText: { fontSize: 12, fontWeight: "600", color: "#334155" },
  pillTextActive: { color: "#fff" },
  sampleCard: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, padding: 10, marginBottom: 8, backgroundColor: "#fff" },
  sampleCardActive: { borderColor: "#0F172A", backgroundColor: "#F1F5F9" },
  sampleLabel: { fontSize: 12, fontWeight: "700", color: "#0F172A" },
  sampleText: { fontSize: 12, color: "#475569", marginTop: 4 },
  recordButton: { backgroundColor: "#DC2626", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  recordButtonStop: { backgroundColor: "#334155" },
  recordButtonText: { color: "#fff", fontWeight: "700" },
  recordedNote: { marginTop: 8, color: "#166534", fontSize: 12, fontWeight: "600" },
  runButton: { backgroundColor: "#0F172A", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 16 },
  runButtonDisabled: { opacity: 0.5 },
  runButtonText: { color: "#fff", fontWeight: "700" },
  factRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  factCategory: { fontSize: 13, fontWeight: "600", color: "#0F172A" },
  factReason: { fontSize: 12, color: "#475569" },
  handoffText: { fontSize: 13, color: "#1E293B", backgroundColor: "#fff", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0" },
});
