// Hardcoded hospital-discharge review protocol: flags medication changes,
// documented red-flag symptoms to watch for, and missed/near-term follow-ups.
import { Protocol, Rule, StructuredEntry, FlagResult } from "../types";

function daysUntil(dateStr: string): number | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

const rules: Rule[] = [
  {
    id: "discharge.medication_change",
    category: "medication_change",
    description: "Any new, stopped, or dose-changed medication is amber — the patient/family should confirm they understood it.",
    evaluate: (entry): FlagResult | null => {
      return {
        flagLevel: "amber",
        flagReason: `Medication change documented: ${entry.value}`,
        ruleId: "discharge.medication_change",
      };
    },
  },
  {
    id: "discharge.red_flag_symptom",
    category: "red_flag_symptom",
    description: "Any symptom documented on the discharge sheet as a red-flag warning sign is red.",
    evaluate: (entry): FlagResult | null => {
      return {
        flagLevel: "red",
        flagReason: `Discharge sheet lists this as a red-flag symptom to watch for: ${entry.value}`,
        ruleId: "discharge.red_flag_symptom",
      };
    },
  },
  {
    id: "discharge.follow_up.soon",
    category: "follow_up_appointment",
    description: "Follow-up appointment within 3 days is amber (easy to miss right after discharge); further out or unparsable date is green.",
    evaluate: (entry): FlagResult | null => {
      const days = daysUntil(String(entry.value));
      if (days == null) {
        return { flagLevel: "green", flagReason: `Follow-up appointment noted: ${entry.value}`, ruleId: "discharge.follow_up.soon" };
      }
      if (days <= 3) {
        return { flagLevel: "amber", flagReason: `Follow-up appointment is in ${days} day(s) (${entry.value})`, ruleId: "discharge.follow_up.soon" };
      }
      return { flagLevel: "green", flagReason: `Follow-up appointment on ${entry.value}`, ruleId: "discharge.follow_up.soon" };
    },
  },
  {
    id: "discharge.info.diagnosis",
    category: "diagnosis_note",
    description: "Discharge diagnosis is recorded as informational (green) with no interpretation.",
    evaluate: (entry): FlagResult | null => {
      return { flagLevel: "green", flagReason: `Discharge diagnosis note recorded: ${entry.value}`, ruleId: "discharge.info.diagnosis" };
    },
  },
];

export const dischargeRedFlagsProtocol: Protocol = {
  id: "discharge_red_flags_v1",
  name: "Hospital Discharge Review Protocol",
  description:
    "Hardcoded checklist applied to a photographed hospital discharge summary: surfaces medication changes, documented red-flag symptoms, and near-term follow-ups.",
  rules,
};

export const dischargeSchemaCategories = [
  { category: "medication_change", description: "A medication that was started, stopped, or had its dose changed at discharge" },
  { category: "red_flag_symptom", description: "A symptom the discharge sheet explicitly says to watch for / seek care if it occurs" },
  { category: "follow_up_appointment", description: "A follow-up appointment date mentioned on the discharge sheet", unit: "date" },
  { category: "diagnosis_note", description: "The discharge diagnosis as written" },
];
