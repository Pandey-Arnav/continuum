// Mock providers. These exist so the whole capture -> structure -> compare ->
// flag -> handoff pipeline runs end to end with zero live API keys, per the
// "mock-first" requirement. Swap any of these for a real provider (see
// sarvam.ts / googleVision.ts / claude.ts) by changing what gets passed into
// the engine functions — nothing else in the app or the engine has to change.
import { AudioInput, ImageInput, LLMProvider, OCRProvider, OCRResult, STTProvider, STTResult } from "./types";

// IMPORTANT: these providers must never fabricate medical content for a real
// recording/photo just because no live provider is configured. A caller that
// passes `simulatedText` is explicitly asking for canned demo/seed content
// (sample notes, seed data, tests) — that's an honest, labeled substitution.
// A caller with NO `simulatedText` is handing us real captured audio/image
// that this mock genuinely cannot process; returning invented antenatal
// findings for that case would silently misrepresent what the patient said.
const NO_LIVE_STT_TEXT =
  "(Demo mode: no live speech-to-text provider is configured, so this recording could not be transcribed. Nothing below reflects what was actually said.)";
const NO_LIVE_OCR_TEXT =
  "(Demo mode: no live OCR provider is configured, so this photo could not be read. Nothing below reflects the actual document.)";

export const MockSTTProvider: STTProvider = {
  name: "mock-stt",
  async transcribe(audio: AudioInput): Promise<STTResult> {
    if (audio.simulatedText !== undefined) {
      return {
        text: audio.simulatedText,
        translatedText: audio.simulatedTranslatedText ?? audio.simulatedText,
        detectedLanguage: audio.simulatedLanguage ?? audio.languageHint ?? "unknown",
      };
    }
    return {
      text: NO_LIVE_STT_TEXT,
      translatedText: NO_LIVE_STT_TEXT,
      detectedLanguage: audio.languageHint ?? "unknown",
    };
  },
};

export const MockOCRProvider: OCRProvider = {
  name: "mock-ocr",
  async extractText(image: ImageInput): Promise<OCRResult> {
    return { text: image.simulatedText ?? NO_LIVE_OCR_TEXT };
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

// ---- Heuristic follow-up questions used by MockLLMProvider for the "followUp" task ----
// Canned Hinglish/English question bank, same "not a model" caveat as heuristicStructure.

const FOLLOWUP_PHRASES_HI: Record<string, { question: string; englishGloss: string }> = {
  blood_pressure_systolic: { question: "Kya aapne BP naapa hai?", englishGloss: "Did you measure blood pressure?" },
  blood_pressure_diastolic: { question: "Kya aapne BP naapa hai?", englishGloss: "Did you measure blood pressure?" },
  temperature_f: { question: "Kya bukhar hai?", englishGloss: "Is there any fever?" },
  blood_sugar_random_mgdl: { question: "Kya blood sugar test hua hai?", englishGloss: "Has a blood sugar test been done?" },
  weight_kg: { question: "Kya weight naapa gaya?", englishGloss: "Was weight recorded?" },
  vaginal_bleeding: { question: "Kya koi bleeding hui hai?", englishGloss: "Has there been any bleeding?" },
  reduced_fetal_movement: { question: "Baby ka movement kaisa mehsoos ho raha hai?", englishGloss: "How does the baby's movement feel?" },
  severe_swelling: { question: "Haath ya chehre par sujan hai kya?", englishGloss: "Is there swelling in the hands or face?" },
  severe_headache: { question: "Sar dard ya dhundhla dikhna jaisa kuch hai kya?", englishGloss: "Any headache or blurry vision?" },
};

// The canned phrase bank above is Hindi/Hinglish only — it cannot honestly
// localize into whatever language was actually spoken (this mock is regex
// heuristics, not a translator). Rather than silently mislabel English or
// Tamil or Swahili audio as "asked in Hindi", this only uses the localized
// phrases when the visit was actually in Hindi/Marathi (which share enough
// vocabulary that the canned Hinglish reads naturally for both); every other
// language gets an honest English question instead of a wrong-language one.
function heuristicFollowUp(
  missing: { category: string }[],
  concerning: { category: string; flagLevel: string; flagReason: string }[],
  language: string
): { question: string; englishGloss: string }[] {
  const canLocalize = /^(hi|mr)(-|$)/i.test(language ?? "");
  const out: { question: string; englishGloss: string }[] = [];

  for (const c of concerning.slice(0, 2)) {
    const localized = canLocalize ? FOLLOWUP_PHRASES_HI[c.category]?.question : undefined;
    out.push({
      question: localized ? `${localized} (${c.flagReason})` : `Can you tell me more about this: ${c.flagReason}`,
      englishGloss: `Get more detail — ${c.flagReason}`,
    });
  }

  for (const m of missing) {
    if (out.length >= 4) break;
    const phrase = FOLLOWUP_PHRASES_HI[m.category];
    if (!phrase) continue;
    out.push(canLocalize ? phrase : { question: phrase.englishGloss, englishGloss: phrase.englishGloss });
  }

  return out.slice(0, 4);
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

    if (input.task === "followUp") {
      return JSON.stringify(heuristicFollowUp(input.missing ?? [], input.concerning ?? [], input.language ?? ""));
    }

    return "[]";
  },
};
