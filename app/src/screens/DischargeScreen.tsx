import { useRef, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import {
  FlaggedEntry,
  HandoffResult,
  RawCapture,
  StructuredEntry,
  dischargeRedFlagsProtocol,
  dischargeSchemaCategories,
  highestFlagLevel,
  runPipeline,
} from "@continuum/engine";
import { ocrProvider, llmProvider, usingMocks } from "../lib/providers";
import { supabase } from "../lib/supabase";
import { insertEntryFromPipeline } from "../lib/entries";
import { haptics } from "../lib/haptics";
import { FlagBadge } from "../components/FlagBadge";
import { Button } from "../components/Button";
import { ScreenHeader } from "../components/ScreenHeader";
import { PipelineSteps } from "../components/PipelineSteps";
import { SectionCard } from "../components/SectionCard";
import { FadeSlideIn } from "../components/FadeSlideIn";
import { colors, radius, spacing, CATEGORY_ICON, PIPELINE_STAGES } from "../theme";

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
      haptics.light();
    }
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

  async function runDischarge() {
    setRunning(true);
    setResult(null);
    setSaved(false);
    beginStepAnimation();
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
          instructions: "Extract the diagnosis, medication changes, follow-up dates, and red-flag symptoms.",
        },
        protocol: dischargeRedFlagsProtocol,
        recipientRole: "patient",
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
      haptics.success();
    } catch (e) {
      haptics.error();
      Alert.alert("Save failed", String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <ScreenHeader
        icon="📄"
        iconTint={colors.primarySoft}
        title="Discharge Sheet"
        subtitle="Photograph a discharge summary → OCR → structure against the discharge protocol → compare → flag → handoff to the patient."
      />

      {usingMocks.ocr && (
        <View style={styles.mockNote}>
          <Text style={styles.mockNoteIcon}>ℹ️</Text>
          <Text style={styles.mockNoteText}>Using mock OCR — no GOOGLE_VISION_API_KEY set. Content comes from the sample sheet text.</Text>
        </View>
      )}

      <View style={styles.flow}>
        <SectionCard index={1} title="Capture">
          <View style={styles.row}>
            <Pressable
              style={[styles.pill, useSample && styles.pillActive]}
              onPress={() => {
                if (!useSample) haptics.tap();
                setUseSample(true);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: useSample }}
            >
              <Text style={[styles.pillText, useSample && styles.pillTextActive]}>Use sample sheet</Text>
            </Pressable>
            <Pressable style={styles.pill} onPress={() => pickImage(true)} accessibilityRole="button" accessibilityLabel="Take photo">
              <Text style={styles.pillText}>📷 Take photo</Text>
            </Pressable>
            <Pressable style={styles.pill} onPress={() => pickImage(false)} accessibilityRole="button" accessibilityLabel="Choose from library">
              <Text style={styles.pillText}>🖼️ Choose from library</Text>
            </Pressable>
          </View>

          {useSample ? (
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              {SAMPLE_SHEETS.map((s, i) => (
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
                    <Text style={styles.sampleText} numberOfLines={4}>
                      {s.text}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            imageUri && <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
          )}
        </SectionCard>

        <Button
          label={running ? "Running pipeline…" : "▶ Run the pipeline"}
          onPress={runDischarge}
          loading={running}
          disabled={!useSample && !imageUri}
          caption="capture → structure → compare → flag → handoff"
        />

        {(running || result) && <PipelineSteps status={stepStatus} />}

        {result && (
          <FadeSlideIn trigger={result}>
            <View style={styles.flow}>
              <SectionCard index={2} title="Structured & flagged">
                {result.flaggedEntries.map((f, i) => (
                  <View key={i} style={[styles.factRow, i > 0 && styles.factRowBorder]}>
                    <FlagBadge level={f.flagLevel} compact />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.factCategory}>
                        {CATEGORY_ICON[f.category] ?? "📌"} {f.category.replace(/_/g, " ")}: {String(f.value)}
                      </Text>
                      <Text style={styles.factReason}>{f.flagReason}</Text>
                    </View>
                  </View>
                ))}
              </SectionCard>

              <SectionCard index={3} title="Handoff · to patient, plain language" tint={colors.primarySoft}>
                <Text style={styles.handoffText}>{result.handoffResult.summary}</Text>
              </SectionCard>

              <Button
                label={saved ? "✓ Saved to timeline" : "Save to timeline"}
                onPress={save}
                loading={saving}
                disabled={saved}
                variant={saved ? "secondary" : "primary"}
              />
            </View>
          </FadeSlideIn>
        )}
      </View>
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
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
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
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pill: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
  pillActive: { backgroundColor: colors.ink },
  pillText: { fontSize: 12, fontWeight: "700", color: colors.inkMuted },
  pillTextActive: { color: "#fff" },
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
  sampleCardActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    marginTop: 2,
  },
  radioActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  sampleLabel: { fontSize: 12.5, fontWeight: "700", color: colors.ink },
  sampleText: { fontSize: 12, color: colors.inkMuted, marginTop: 3, lineHeight: 16 },
  previewImage: { width: "100%", height: 200, marginTop: spacing.md, borderRadius: 10, backgroundColor: colors.surfaceMuted },
  factRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: spacing.sm },
  factRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  factCategory: { fontSize: 13, fontWeight: "700", color: colors.ink },
  factReason: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  handoffText: { fontSize: 13.5, color: colors.ink, lineHeight: 20 },
});
