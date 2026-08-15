import { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import {
  FlaggedEntry,
  HandoffResult,
  RawCapture,
  StructuredEntry,
  dischargeRedFlagsProtocol,
  dischargeSchemaCategories,
  runPipeline,
} from "@continuum/engine";
import { ocrProvider, llmProvider, usingMocks } from "../lib/providers";
import { supabase } from "../lib/supabase";
import { insertEntryFromPipeline } from "../lib/entries";
import { FlagBadge } from "../components/FlagBadge";

const SAMPLE_SHEETS = [
  {
    label: "Pneumonia discharge — medication change + red flags",
    text:
      "DISCHARGE SUMMARY\nDiagnosis: Community-acquired pneumonia, resolved.\nMedications: Stop Azithromycin. Start Amoxicillin 500mg three times daily for 5 days.\nFollow-up: Review in OPD on 2026-08-17.\nWatch for: chest pain, shortness of breath, or high fever above 103F — return to hospital immediately if these occur.",
  },
  {
    label: "Diabetes discharge — new medication",
    text:
      "DISCHARGE SUMMARY\nDiagnosis: Type 2 diabetes, newly diagnosed, stabilized.\nMedications: Start Metformin 500mg twice daily. Increased Insulin Glargine to 12 units at night.\nFollow-up: Endocrinology review on 2026-09-01.\nWatch for: confusion, fainting, or blurred vision which may indicate low blood sugar.",
  },
];

export function DischargeScreen({ patientId, userId }: { patientId: string; userId: string }) {
  const [imageUri, setImageUri] = useState<string | null>(null);
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

  async function pickImage(fromCamera: boolean) {
    const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Grant camera/photo access to capture a discharge sheet, or use a sample below.");
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, base64: true });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setUseSample(false);
      setResult(null);
      setSaved(false);
    }
  }

  async function runDischarge() {
    setRunning(true);
    setResult(null);
    setSaved(false);
    try {
      const sample = SAMPLE_SHEETS[selectedSample];
      const pipelineResult = await runPipeline({
        input: {
          kind: "photo",
          image: useSample ? { simulatedText: sample.text } : { uri: imageUri ?? undefined },
          ocrProvider,
        },
        schemaContext: {
          protocolId: dischargeRedFlagsProtocol.id,
          categories: dischargeSchemaCategories,
          instructions: "Extract medication changes, follow-up dates, and red-flag symptoms only.",
        },
        protocol: dischargeRedFlagsProtocol,
        recipientRole: "patient",
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
      if (!useSample && imageUri) {
        mediaRef = await tryUploadPhoto(patientId, imageUri);
      }
      await insertEntryFromPipeline({
        patientId,
        userId,
        rawCapture: result.rawCapture,
        structuredEntries: result.structuredEntries,
        flaggedEntries: result.flaggedEntries,
        handoffResult: result.handoffResult,
        protocolId: dischargeRedFlagsProtocol.id,
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
      <Text style={styles.title}>📄 Hospital Discharge Sheet</Text>
      <Text style={styles.subtitle}>
        Photograph a discharge summary → OCR → structure against the discharge protocol → compare → flag → handoff to
        the patient.
      </Text>
      {usingMocks.ocr && (
        <Text style={styles.mockNote}>Using mock OCR (no GOOGLE_VISION_API_KEY set) — content comes from the sample sheet text.</Text>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1. Capture</Text>
        <View style={styles.row}>
          <Pressable style={[styles.pill, useSample && styles.pillActive]} onPress={() => setUseSample(true)}>
            <Text style={[styles.pillText, useSample && styles.pillTextActive]}>Use sample sheet</Text>
          </Pressable>
          <Pressable style={[styles.pill, !useSample && styles.pillActive]} onPress={() => pickImage(true)}>
            <Text style={[styles.pillText, !useSample && styles.pillTextActive]}>Take photo</Text>
          </Pressable>
          <Pressable style={styles.pill} onPress={() => pickImage(false)}>
            <Text style={styles.pillText}>Choose from library</Text>
          </Pressable>
        </View>

        {useSample ? (
          <View style={{ marginTop: 10 }}>
            {SAMPLE_SHEETS.map((s, i) => (
              <Pressable key={i} style={[styles.sampleCard, selectedSample === i && styles.sampleCardActive]} onPress={() => setSelectedSample(i)}>
                <Text style={styles.sampleLabel}>{s.label}</Text>
                <Text style={styles.sampleText} numberOfLines={4}>
                  {s.text}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          imageUri && <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
        )}
      </View>

      <Pressable style={[styles.runButton, (running || (!useSample && !imageUri)) && styles.runButtonDisabled]} onPress={runDischarge} disabled={running || (!useSample && !imageUri)}>
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
                  {f.category.replace(/_/g, " ")}: {String(f.value)}
                </Text>
                <Text style={styles.factReason}>{f.flagReason}</Text>
              </View>
            </View>
          ))}

          <Text style={styles.sectionTitle}>3. Handoff (to patient, plain language)</Text>
          <Text style={styles.handoffText}>{result.handoffResult.summary}</Text>

          <Pressable style={[styles.runButton, saved && styles.runButtonDisabled]} onPress={save} disabled={saving || saved}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.runButtonText}>{saved ? "Saved to timeline ✓" : "Save to timeline"}</Text>}
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

async function tryUploadPhoto(patientId: string, uri: string): Promise<string | null> {
  try {
    const path = `${patientId}/${Crypto.randomUUID()}.jpg`;
    const response = await fetch(uri);
    const blob = await response.blob();
    const { error } = await supabase.storage.from("raw-evidence").upload(path, blob, { contentType: "image/jpeg" });
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
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "#E2E8F0" },
  pillActive: { backgroundColor: "#0F172A" },
  pillText: { fontSize: 12, fontWeight: "600", color: "#334155" },
  pillTextActive: { color: "#fff" },
  sampleCard: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, padding: 10, marginBottom: 8, backgroundColor: "#fff" },
  sampleCardActive: { borderColor: "#0F172A", backgroundColor: "#F1F5F9" },
  sampleLabel: { fontSize: 12, fontWeight: "700", color: "#0F172A" },
  sampleText: { fontSize: 12, color: "#475569", marginTop: 4 },
  previewImage: { width: "100%", height: 200, marginTop: 10, borderRadius: 10, backgroundColor: "#E2E8F0" },
  runButton: { backgroundColor: "#0F172A", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 16 },
  runButtonDisabled: { opacity: 0.5 },
  runButtonText: { color: "#fff", fontWeight: "700" },
  factRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  factCategory: { fontSize: 13, fontWeight: "600", color: "#0F172A" },
  factReason: { fontSize: 12, color: "#475569" },
  handoffText: { fontSize: 13, color: "#1E293B", backgroundColor: "#fff", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0" },
});
