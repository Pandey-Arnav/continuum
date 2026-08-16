// Smoke test: runs both scenarios through the SAME runPipeline() with the
// SAME mock providers, proving the one-engine claim end to end without any
// live API keys. Not a full test suite — just enough to catch regressions
// before wiring the app up.
import { runPipeline } from "../pipeline";
import { MockLLMProvider, MockOCRProvider, MockSTTProvider } from "../providers/mock";
import { antenatalNcdProtocol, antenatalNcdSchemaCategories } from "../protocols/antenatalNcd";
import { dischargeRedFlagsProtocol, dischargeSchemaCategories } from "../protocols/dischargeRedFlags";
import { buildDeterministicHandoff } from "../handoff";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`ok - ${message}`);
  }
}

async function scenarioA() {
  console.log("\n=== Scenario A: community health worker voice visit ===");
  const result = await runPipeline({
    input: { kind: "voice", audio: {}, sttProvider: MockSTTProvider },
    schemaContext: {
      protocolId: antenatalNcdProtocol.id,
      categories: antenatalNcdSchemaCategories,
      instructions: "Extract antenatal/NCD screening facts only.",
    },
    protocol: antenatalNcdProtocol,
    recipientRole: "supervising_health_worker",
    llmProvider: MockLLMProvider,
  });

  console.log("raw transcript:", result.rawCapture.translatedText);
  console.log("structured entries:", JSON.stringify(result.structuredEntries, null, 2));
  console.log("flagged entries:", JSON.stringify(result.flaggedEntries, null, 2));
  console.log("handoff:", result.handoffResult);

  assert(result.structuredEntries.length > 0, "scenario A extracts at least one structured entry");
  assert(
    result.flaggedEntries.some((e) => e.flagLevel === "red"),
    "scenario A produces at least one red flag (severe headache / reduced fetal movement / high BP)"
  );
  assert(result.handoffResult.recipientRole === "supervising_health_worker", "scenario A handoff addressed to health worker");
}

async function scenarioB() {
  console.log("\n=== Scenario B: hospital discharge photo ===");
  const result = await runPipeline({
    input: { kind: "photo", image: {}, ocrProvider: MockOCRProvider },
    schemaContext: {
      protocolId: dischargeRedFlagsProtocol.id,
      categories: dischargeSchemaCategories,
      instructions: "Extract the diagnosis, medication changes, follow-up dates, and red-flag symptoms.",
    },
    protocol: dischargeRedFlagsProtocol,
    recipientRole: "patient",
    llmProvider: MockLLMProvider,
  });

  console.log("raw OCR text:", result.rawCapture.text);
  console.log("structured entries:", JSON.stringify(result.structuredEntries, null, 2));
  console.log("flagged entries:", JSON.stringify(result.flaggedEntries, null, 2));
  console.log("handoff:", result.handoffResult);

  assert(result.structuredEntries.length > 0, "scenario B extracts at least one structured entry");
  assert(
    result.flaggedEntries.some((e) => e.category === "medication_change"),
    "scenario B extracts a medication change"
  );
  assert(
    result.flaggedEntries.some((e) => e.flagLevel === "red"),
    "scenario B produces at least one red flag (red-flag symptom)"
  );
  assert(result.handoffResult.recipientRole === "patient", "scenario B handoff addressed to patient");
  const offlineHandoff = buildDeterministicHandoff(result.flaggedEntries, "patient");
  assert(offlineHandoff.highestFlagLevel === "red", "offline-safe corrected handoff preserves deterministic severity");
  assert(offlineHandoff.summary.includes("not a diagnosis"), "offline-safe patient handoff preserves the limitation");
}

async function main() {
  await scenarioA();
  await scenarioB();
  if (process.exitCode === 1) {
    console.error("\nSMOKE TEST FAILED");
  } else {
    console.log("\nSMOKE TEST PASSED — same runPipeline(), same providers, two unrelated scenarios.");
  }
}

main();
