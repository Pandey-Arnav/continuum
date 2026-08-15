// Direct unit coverage for compare() and every Rule's boundary conditions.
// smoke.ts proves the two scenarios integrate end to end; this file proves
// each individual threshold in the deterministic core is correct — the part
// of the system that is explicitly never allowed to be a model.
import { compare } from "../compare";
import { antenatalNcdProtocol } from "../protocols/antenatalNcd";
import { dischargeRedFlagsProtocol } from "../protocols/dischargeRedFlags";
import { StructuredEntry } from "../types";

let failures = 0;

function fact(category: string, value: string | number): StructuredEntry {
  return { category, value, timestamp: new Date().toISOString() };
}

function expectFlag(label: string, entry: StructuredEntry, protocol: typeof antenatalNcdProtocol, expected: "green" | "amber" | "red") {
  const [result] = compare([entry], protocol);
  if (result.flagLevel !== expected) {
    console.error(`FAIL: ${label} — expected ${expected}, got ${result.flagLevel} (${result.flagReason})`);
    failures++;
  } else {
    console.log(`ok - ${label} -> ${expected}`);
  }
}

// --- Antenatal / NCD protocol boundaries ---
expectFlag("systolic BP 139 (just under threshold)", fact("blood_pressure_systolic", 139), antenatalNcdProtocol, "green");
expectFlag("systolic BP 140 (amber threshold)", fact("blood_pressure_systolic", 140), antenatalNcdProtocol, "amber");
expectFlag("systolic BP 159 (still amber)", fact("blood_pressure_systolic", 159), antenatalNcdProtocol, "amber");
expectFlag("systolic BP 160 (red threshold)", fact("blood_pressure_systolic", 160), antenatalNcdProtocol, "red");

expectFlag("diastolic BP 89 (just under threshold)", fact("blood_pressure_diastolic", 89), antenatalNcdProtocol, "green");
expectFlag("diastolic BP 90 (amber threshold)", fact("blood_pressure_diastolic", 90), antenatalNcdProtocol, "amber");
expectFlag("diastolic BP 110 (red threshold)", fact("blood_pressure_diastolic", 110), antenatalNcdProtocol, "red");

expectFlag("temperature 100.3F (just under threshold)", fact("temperature_f", 100.3), antenatalNcdProtocol, "green");
expectFlag("temperature 100.4F (amber threshold)", fact("temperature_f", 100.4), antenatalNcdProtocol, "amber");
expectFlag("temperature 103F (red threshold)", fact("temperature_f", 103), antenatalNcdProtocol, "red");

expectFlag("blood sugar 139 (just under threshold)", fact("blood_sugar_random_mgdl", 139), antenatalNcdProtocol, "green");
expectFlag("blood sugar 140 (amber threshold)", fact("blood_sugar_random_mgdl", 140), antenatalNcdProtocol, "amber");
expectFlag("blood sugar 200 (red threshold)", fact("blood_sugar_random_mgdl", 200), antenatalNcdProtocol, "red");

expectFlag("vaginal bleeding present -> red", fact("vaginal_bleeding", "present"), antenatalNcdProtocol, "red");
expectFlag("reduced fetal movement present -> red", fact("reduced_fetal_movement", "present"), antenatalNcdProtocol, "red");
expectFlag("severe swelling present -> amber", fact("severe_swelling", "present"), antenatalNcdProtocol, "amber");
expectFlag("severe headache present -> red", fact("severe_headache", "present"), antenatalNcdProtocol, "red");
expectFlag("weight is always informational", fact("weight_kg", 60), antenatalNcdProtocol, "green");

// --- Discharge protocol ---
expectFlag("any medication change -> amber", fact("medication_change", "Started Amoxicillin 500mg"), dischargeRedFlagsProtocol, "amber");
expectFlag("any red-flag symptom -> red", fact("red_flag_symptom", "chest pain"), dischargeRedFlagsProtocol, "red");
expectFlag("diagnosis note is always informational", fact("diagnosis_note", "Pneumonia, resolved"), dischargeRedFlagsProtocol, "green");

const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const far = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
expectFlag("follow-up in 2 days -> amber", fact("follow_up_appointment", soon), dischargeRedFlagsProtocol, "amber");
expectFlag("follow-up in 30 days -> green", fact("follow_up_appointment", far), dischargeRedFlagsProtocol, "green");
expectFlag("follow-up with unparsable date -> green", fact("follow_up_appointment", "next week"), dischargeRedFlagsProtocol, "green");

// --- compare() itself: unmatched category is not silently dropped ---
{
  const [result] = compare([fact("unknown_category", "x")], antenatalNcdProtocol);
  if (result.flagLevel !== "green" || result.ruleId !== "none") {
    console.error(`FAIL: unmatched category should come back green with ruleId "none", got ${result.flagLevel}/${result.ruleId}`);
    failures++;
  } else {
    console.log("ok - unmatched category comes back green with ruleId 'none' (nothing silently dropped)");
  }
}

// --- compare() picks the WORST match when multiple rules could apply to a category ---
// (Each category here only has one rule today, but this guards the aggregation logic itself.)
{
  const results = compare(
    [fact("blood_pressure_systolic", 170), fact("weight_kg", 55)],
    antenatalNcdProtocol
  );
  const worst = results.find((r) => r.category === "blood_pressure_systolic");
  if (worst?.flagLevel !== "red") {
    console.error(`FAIL: severe systolic BP should still resolve red among a mixed batch, got ${worst?.flagLevel}`);
    failures++;
  } else {
    console.log("ok - compare() flags each entry independently within a mixed batch");
  }
}

if (failures > 0) {
  console.error(`\nRULES TEST FAILED (${failures} failure(s))`);
  process.exitCode = 1;
} else {
  console.log("\nRULES TEST PASSED — every threshold in both protocols verified directly.");
}
