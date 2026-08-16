import { structure } from "../structure";
import { LLMProvider } from "../providers/types";

const provider: LLMProvider = {
  name: "validation-test",
  async complete() {
    return JSON.stringify([
      { category: "blood_pressure_systolic", value: 148, unit: "mmHg", timestamp: "not-a-date", note: "BP was 148" },
      { category: "blood_pressure_systolic", value: "", note: "empty value" },
      { category: "invented_category", value: "bad", note: "invented" },
      { category: "severe_headache", value: "present", note: "This sentence was never in the input" },
    ]);
  },
};

async function main() {
const result = await structure(
  "BP was 148 over 96. Patient reports a severe headache.",
  {
    protocolId: "test",
    categories: [
      { category: "blood_pressure_systolic", description: "Systolic blood pressure", unit: "mmHg" },
      { category: "severe_headache", description: "Severe headache" },
    ],
    instructions: "Extract explicit facts only.",
  },
  provider
);

if (result.length !== 2) throw new Error(`Expected two valid facts, got ${result.length}`);
if (!result[0].evidenceVerified || result[0].extractionConfidence !== "high") throw new Error("Expected source-matched evidence to be high confidence");
if (result[1].evidenceVerified || result[1].extractionConfidence !== "review") throw new Error("Expected unmatched evidence to require review");
if (Number.isNaN(Date.parse(result[0].timestamp))) throw new Error("Invalid timestamp was not repaired");

console.log("STRUCTURE TEST PASSED — schema, timestamp, and source-evidence validation verified.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
