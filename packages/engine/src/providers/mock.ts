// Mock providers. These exist so the whole capture -> structure -> compare ->
// flag -> handoff pipeline runs end to end with zero live API keys, per the
// "mock-first" requirement. Swap any of these for a real provider (see
// sarvam.ts / googleVision.ts / claude.ts) by changing what gets passed into
// the engine functions — nothing else in the app or the engine has to change.
import { AudioInput, ImageInput, LLMProvider, OCRProvider, OCRResult, STTProvider, STTResult } from "./types";

const DEFAULT_HI_TRANSCRIPT =
  "Aaj Sunita ki home visit ki. BP 150 over 95 tha. Temperature normal tha. Usne bataya ki severe headache hai aur vision thoda blurry hai. Baby ka movement bhi kam mehsoos ho raha hai. Weight 62 kg record kiya.";
const DEFAULT_HI_TRANSLATION =
  "Did Sunita's home visit today. BP was 150 over 95. Temperature was normal. She reported severe headache and slightly blurred vision. Also feeling reduced baby movement. Recorded weight as 62 kg.";

export const MockSTTProvider: STTProvider = {
  name: "mock-stt",
  async transcribe(audio: AudioInput): Promise<STTResult> {
    return {
      text: audio.simulatedText ?? DEFAULT_HI_TRANSCRIPT,
      translatedText: audio.simulatedTranslatedText ?? DEFAULT_HI_TRANSLATION,
      detectedLanguage: audio.simulatedLanguage ?? audio.languageHint ?? "hi",
    };
  },
};

const DEFAULT_DISCHARGE_TEXT =
  "DISCHARGE SUMMARY\nDiagnosis: Community-acquired pneumonia, resolved.\n" +
  "Medications: Stop Azithromycin. Start Amoxicillin 500mg three times daily for 5 days.\n" +
  "Follow-up: Review in OPD on 2026-08-17.\n" +
  "Watch for: chest pain, shortness of breath, or high fever above 103F — return to hospital immediately if these occur.";

export const MockOCRProvider: OCRProvider = {
  name: "mock-ocr",
  async extractText(image: ImageInput): Promise<OCRResult> {
    return { text: image.simulatedText ?? DEFAULT_DISCHARGE_TEXT };
  },
};

// ---- Heuristic extraction used by MockLLMProvider for the "structure" task ----
// This is intentionally simple regex/keyword matching, NOT a model. It exists
// purely so the demo works offline; a real LLMProvider (claude.ts) replaces
// this wholesale without touching structure.ts or compare.ts.

interface ExtractedFact {
  category: string;
  value: string | number;
  unit?: string;
  note?: string;
}

function extractAntenatalNcd(rawText: string): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const text = rawText;

  const bp = text.match(/(\d{2,3})\s*(?:\/|over)\s*(\d{2,3})/i);
  if (bp) {
    facts.push({ category: "blood_pressure_systolic", value: Number(bp[1]), unit: "mmHg", note: bp[0] });
    facts.push({ category: "blood_pressure_diastolic", value: Number(bp[2]), unit: "mmHg", note: bp[0] });
  }

  const temp = text.match(/temp(?:erature)?\D{0,6}(\d{2,3}(?:\.\d)?)/i);
  if (temp) {
    facts.push({ category: "temperature_f", value: Number(temp[1]), unit: "F", note: temp[0] });
  }

  const sugar = text.match(/(?:blood\s*)?sugar\D{0,8}(\d{2,3})/i);
  if (sugar) {
    facts.push({ category: "blood_sugar_random_mgdl", value: Number(sugar[1]), unit: "mg/dL", note: sugar[0] });
  }

  const weight = text.match(/weight\D{0,8}(\d{2,3}(?:\.\d)?)\s*kg/i);
  if (weight) {
    facts.push({ category: "weight_kg", value: Number(weight[1]), unit: "kg", note: weight[0] });
  }

  if (/bleed/i.test(text)) {
    facts.push({ category: "vaginal_bleeding", value: "present", note: matchSnippet(text, /[^.]*bleed[^.]*/i) });
  }

  if (/(no|reduced|less|kam)[^.]{0,20}(movement|moving|hal[- ]?chal)/i.test(text)) {
    facts.push({
      category: "reduced_fetal_movement",
      value: "present",
      note: matchSnippet(text, /[^.]*(movement|moving|hal[- ]?chal)[^.]*/i),
    });
  }

  if (/swelling|sujan|edema/i.test(text)) {
    facts.push({ category: "severe_swelling", value: "present", note: matchSnippet(text, /[^.]*(swelling|sujan|edema)[^.]*/i) });
  }

  if (/(severe|bad|blinding)[^.]{0,15}headache|headache[^.]{0,20}(vision|blurr)/i.test(text)) {
    facts.push({ category: "severe_headache", value: "present", note: matchSnippet(text, /[^.]*headache[^.]*/i) });
  }

  return facts;
}

function extractDischargeRedFlags(rawText: string): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const sentences = rawText.split(/\n|(?<=\.)\s+/).map((s) => s.trim()).filter(Boolean);

  const medKeyword = /\b(start(ed)?|stop(ped)?|discontinu(ed)?|increas(ed)?|decreas(ed)?)\b/i;
  const dosageHint = /\d+\s?(mg|mcg|ml)\b|tablet|capsule|dose/i;

  const RED_FLAG_PHRASES = [
    "chest pain",
    "shortness of breath",
    "difficulty breathing",
    "severe headache",
    "blurred vision",
    "fainting",
    "seizure",
    "heavy bleeding",
    "high fever",
    "confusion",
  ];

  for (const sentence of sentences) {
    if (medKeyword.test(sentence) && (dosageHint.test(sentence) || /medication/i.test(rawText))) {
      facts.push({ category: "medication_change", value: sentence, note: sentence });
    }

    if (/diagnos/i.test(sentence)) {
      const value = sentence.replace(/^diagnosis\s*:?\s*/i, "").trim();
      if (value) facts.push({ category: "diagnosis_note", value, note: sentence });
    }

    if (/follow[- ]?up|next appointment|review/i.test(sentence)) {
      const dateMatch =
        sentence.match(/\d{4}-\d{2}-\d{2}/) ||
        sentence.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/) ||
        sentence.match(/\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i);
      if (dateMatch) {
        facts.push({ category: "follow_up_appointment", value: dateMatch[0], note: sentence });
      }
    }

    for (const phrase of RED_FLAG_PHRASES) {
      if (sentence.toLowerCase().includes(phrase)) {
        facts.push({ category: "red_flag_symptom", value: phrase, note: sentence });
      }
    }
  }

  return facts;
}

function matchSnippet(text: string, re: RegExp): string {
  const m = text.match(re);
  return m ? m[0].trim() : text.slice(0, 60);
}

function heuristicStructure(rawText: string, protocolId: string): ExtractedFact[] {
  if (protocolId === "antenatal_ncd_v1") return extractAntenatalNcd(rawText);
  if (protocolId === "discharge_red_flags_v1") return extractDischargeRedFlags(rawText);
  return [];
}

function heuristicHandoff(entries: { category: string; value: unknown; flagLevel: string; flagReason: string }[], recipientRole: string): string {
  if (entries.length === 0) {
    return "No entries were recorded in this visit/document.";
  }
  const rank: Record<string, number> = { green: 0, amber: 1, red: 2 };
  const worst = entries.reduce((a, b) => (rank[b.flagLevel] > rank[a.flagLevel] ? b : a));
  const reds = entries.filter((e) => e.flagLevel === "red");
  const ambers = entries.filter((e) => e.flagLevel === "amber");

  const audience =
    recipientRole === "patient"
      ? "Here is a plain summary of what was found: "
      : recipientRole === "supervising_health_worker"
      ? "Field visit summary for review: "
      : "Summary: ";

  const parts: string[] = [audience.trim()];

  if (worst.flagLevel === "red") {
    parts.push(
      `${reds.length} finding(s) need prompt attention — most urgent: ${worst.flagReason}.`
    );
  } else if (worst.flagLevel === "amber") {
    parts.push(`${ambers.length} finding(s) are worth a closer look — most notable: ${worst.flagReason}.`);
  } else {
    parts.push("All recorded values were within the expected range.");
  }

  const others = entries.filter((e) => e !== worst);
  if (others.length > 0) {
    parts.push(
      "Other recorded items: " +
        others.map((e) => `${e.category.replace(/_/g, " ")} (${e.flagLevel})`).join(", ") +
        "."
    );
  }

  parts.push(
    recipientRole === "patient"
      ? "This is not a diagnosis — please contact your doctor if anything here concerns you."
      : "This summary was phrased by a language model from findings decided entirely by rule-based checks; every flag is traceable to its triggering rule."
  );

  return parts.join(" ");
}

export const MockLLMProvider: LLMProvider = {
  name: "mock-llm",
  async complete(prompt: string): Promise<string> {
    const match = prompt.match(/INPUT_JSON:\s*(\{[\s\S]*\})\s*$/);
    if (!match) {
      return "[]";
    }
    const input = JSON.parse(match[1]);

    if (input.task === "structure") {
      const facts = heuristicStructure(input.rawText, input.schemaContext?.protocolId ?? "");
      return JSON.stringify(
        facts.map((f) => ({ ...f, timestamp: new Date().toISOString() }))
      );
    }

    if (input.task === "handoff") {
      return heuristicHandoff(input.entries, input.recipientRole);
    }

    return "[]";
  },
};
