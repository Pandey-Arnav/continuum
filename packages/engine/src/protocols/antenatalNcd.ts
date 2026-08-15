// Hardcoded antenatal / NCD community screening protocol.
// Thresholds are illustrative, loosely based on common ASHA/ANM screening
// checklists (WHO ANC + India NCD screening) — NOT medical advice, and not
// tunable at runtime on purpose: every threshold here is inspectable code,
// not a model weight.
import { Protocol, Rule, StructuredEntry, FlagResult } from "../types";

function numeric(entry: StructuredEntry): number | null {
  const n = typeof entry.value === "number" ? entry.value : parseFloat(entry.value);
  return Number.isFinite(n) ? n : null;
}

const rules: Rule[] = [
  {
    id: "anc.bp.systolic.high",
    category: "blood_pressure_systolic",
    description: "Systolic BP >= 140 mmHg is amber (pre-eclampsia watch); >= 160 is red.",
    evaluate: (entry): FlagResult | null => {
      const v = numeric(entry);
      if (v == null) return null;
      if (v >= 160) {
        return { flagLevel: "red", flagReason: `Systolic BP ${v} mmHg is >= 160 (severe hypertension range)`, ruleId: "anc.bp.systolic.high" };
      }
      if (v >= 140) {
        return { flagLevel: "amber", flagReason: `Systolic BP ${v} mmHg is >= 140 (above normal antenatal threshold)`, ruleId: "anc.bp.systolic.high" };
      }
      return null;
    },
  },
  {
    id: "anc.bp.diastolic.high",
    category: "blood_pressure_diastolic",
    description: "Diastolic BP >= 90 mmHg is amber; >= 110 is red.",
    evaluate: (entry): FlagResult | null => {
      const v = numeric(entry);
      if (v == null) return null;
      if (v >= 110) {
        return { flagLevel: "red", flagReason: `Diastolic BP ${v} mmHg is >= 110 (severe hypertension range)`, ruleId: "anc.bp.diastolic.high" };
      }
      if (v >= 90) {
        return { flagLevel: "amber", flagReason: `Diastolic BP ${v} mmHg is >= 90 (above normal antenatal threshold)`, ruleId: "anc.bp.diastolic.high" };
      }
      return null;
    },
  },
  {
    id: "anc.fever.high",
    category: "temperature_f",
    description: "Temperature >= 100.4F is amber; >= 103F is red.",
    evaluate: (entry): FlagResult | null => {
      const v = numeric(entry);
      if (v == null) return null;
      if (v >= 103) {
        return { flagLevel: "red", flagReason: `Temperature ${v} F is >= 103 (high fever)`, ruleId: "anc.fever.high" };
      }
      if (v >= 100.4) {
        return { flagLevel: "amber", flagReason: `Temperature ${v} F is >= 100.4 (fever)`, ruleId: "anc.fever.high" };
      }
      return null;
    },
  },
  {
    id: "anc.blood_sugar.high",
    category: "blood_sugar_random_mgdl",
    description: "Random blood sugar >= 140 mg/dL is amber; >= 200 is red.",
    evaluate: (entry): FlagResult | null => {
      const v = numeric(entry);
      if (v == null) return null;
      if (v >= 200) {
        return { flagLevel: "red", flagReason: `Random blood sugar ${v} mg/dL is >= 200 (possible diabetic emergency range)`, ruleId: "anc.blood_sugar.high" };
      }
      if (v >= 140) {
        return { flagLevel: "amber", flagReason: `Random blood sugar ${v} mg/dL is >= 140 (above normal range)`, ruleId: "anc.blood_sugar.high" };
      }
      return null;
    },
  },
  {
    id: "anc.symptom.bleeding",
    category: "vaginal_bleeding",
    description: "Any reported vaginal bleeding is red.",
    evaluate: (entry): FlagResult | null => {
      if (entry.value === "present" || entry.value === true || entry.value === "yes") {
        return { flagLevel: "red", flagReason: "Vaginal bleeding reported", ruleId: "anc.symptom.bleeding" };
      }
      return null;
    },
  },
  {
    id: "anc.symptom.reduced_fetal_movement",
    category: "reduced_fetal_movement",
    description: "Reduced or absent fetal movement is red.",
    evaluate: (entry): FlagResult | null => {
      if (entry.value === "present" || entry.value === true || entry.value === "yes") {
        return { flagLevel: "red", flagReason: "Reduced or absent fetal movement reported", ruleId: "anc.symptom.reduced_fetal_movement" };
      }
      return null;
    },
  },
  {
    id: "anc.symptom.severe_swelling",
    category: "severe_swelling",
    description: "Severe swelling of face/hands is amber.",
    evaluate: (entry): FlagResult | null => {
      if (entry.value === "present" || entry.value === true || entry.value === "yes") {
        return { flagLevel: "amber", flagReason: "Severe swelling of face/hands reported", ruleId: "anc.symptom.severe_swelling" };
      }
      return null;
    },
  },
  {
    id: "anc.symptom.severe_headache",
    category: "severe_headache",
    description: "Severe/persistent headache with visual disturbance is red (pre-eclampsia warning sign).",
    evaluate: (entry): FlagResult | null => {
      if (entry.value === "present" || entry.value === true || entry.value === "yes") {
        return { flagLevel: "red", flagReason: "Severe headache with visual disturbance reported", ruleId: "anc.symptom.severe_headache" };
      }
      return null;
    },
  },
  {
    id: "anc.info.weight",
    category: "weight_kg",
    description: "Weight is recorded as informational (green) with no threshold judgment.",
    evaluate: (entry): FlagResult | null => {
      const v = numeric(entry);
      if (v == null) return null;
      return { flagLevel: "green", flagReason: `Weight recorded: ${v} kg`, ruleId: "anc.info.weight" };
    },
  },
];

export const antenatalNcdProtocol: Protocol = {
  id: "antenatal_ncd_v1",
  name: "Antenatal / NCD Community Screening Protocol",
  description:
    "Hardcoded screening checklist used by community health workers during home visits, covering antenatal danger signs and basic NCD (hypertension/diabetes) screening.",
  rules,
};

export const antenatalNcdSchemaCategories = [
  { category: "blood_pressure_systolic", description: "Systolic blood pressure reading", unit: "mmHg" },
  { category: "blood_pressure_diastolic", description: "Diastolic blood pressure reading", unit: "mmHg" },
  { category: "temperature_f", description: "Body temperature", unit: "F" },
  { category: "blood_sugar_random_mgdl", description: "Random blood glucose reading", unit: "mg/dL" },
  { category: "weight_kg", description: "Body weight", unit: "kg" },
  { category: "vaginal_bleeding", description: "Vaginal bleeding reported (present/absent)" },
  { category: "reduced_fetal_movement", description: "Reduced or absent fetal movement reported (present/absent)" },
  { category: "severe_swelling", description: "Severe swelling of face or hands reported (present/absent)" },
  { category: "severe_headache", description: "Severe headache with visual disturbance reported (present/absent)" },
];
