// Demo session bootstrap: anonymous sign-in + auto-create a demo patient the
// signed-in device is related to under every recipient role (so one demo
// account can see the whole dashboard), then seed a few realistic entries
// per scenario so the timeline is never empty on first launch.
import {
  MockLLMProvider,
  MockOCRProvider,
  MockSTTProvider,
  antenatalNcdProtocol,
  antenatalNcdSchemaCategories,
  dischargeRedFlagsProtocol,
  dischargeSchemaCategories,
  runPipeline,
} from "@continuum/engine";
import * as Crypto from "expo-crypto";
import { supabase } from "./supabase";
import { insertEntryFromPipeline } from "./entries";

const DEMO_PATIENT_NAME = "Sunita Devi (demo)";

export interface DemoSession {
  userId: string;
  patientId: string;
}

export type WorkspaceAccessState =
  | { status: "signed_out" }
  | { status: "needs_access"; userId: string }
  | { status: "ready"; session: DemoSession };

export async function inspectWorkspaceSession(): Promise<WorkspaceAccessState> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session) return { status: "signed_out" };

  const { data: relationships, error: relationshipError } = await supabase
    .from("patient_relationships")
    .select("patient_id")
    .eq("user_id", session.user.id)
    .limit(1);
  if (relationshipError) throw relationshipError;
  if (!relationships?.length) return { status: "needs_access", userId: session.user.id };

  return {
    status: "ready",
    session: { userId: session.user.id, patientId: relationships[0].patient_id as string },
  };
}

export async function ensureDemoSession(): Promise<DemoSession> {
  const {
    data: { session: existing },
  } = await supabase.auth.getSession();

  const session = existing ?? (await signInAnonymously());
  const userId = session.user.id;

  const { data: rels, error: relErr } = await supabase
    .from("patient_relationships")
    .select("patient_id")
    .eq("user_id", userId)
    .limit(1);
  if (relErr) throw relErr;

  if (rels && rels.length > 0) {
    return { userId, patientId: rels[0].patient_id as string };
  }

  const { data: patientId, error: workspaceError } = await supabase.rpc("create_care_workspace", {
    patient_display_name: DEMO_PATIENT_NAME,
  });
  if (workspaceError) {
    throw new Error(
      `Demo workspace creation failed (${workspaceError.message}). Apply migration 0004, or use the existing demo database relationship.`
    );
  }

  await seedDemoEntries(String(patientId), userId);

  return { userId, patientId: String(patientId) };
}

async function signInAnonymously() {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error(
      `Anonymous sign-in failed (${error.message}). In the Supabase dashboard, enable Authentication -> Providers -> Anonymous Sign-Ins.`
    );
  }
  if (!data.session) throw new Error("Anonymous sign-in returned no session");
  return data.session;
}

const SCENARIO_A_SAMPLES = [
  {
    text: "Aaj Sunita ki home visit ki. BP 150 over 95 tha. Usne bataya ki severe headache hai aur vision thoda blurry hai. Baby ka movement bhi kam mehsoos ho raha hai. Weight 62 kg record kiya.",
    translated:
      "Did Sunita's home visit today. BP was 150 over 95. She reported severe headache and slightly blurred vision. Also feeling reduced baby movement. Recorded weight as 62 kg.",
  },
  {
    text: "Ramesh ka NCD screening kiya. Blood sugar 210 tha fasting ke baad. Koi aur symptom nahi bataya. Weight 78 kg tha.",
    translated:
      "Did Ramesh's NCD screening. Blood sugar was 210 after fasting. No other symptoms reported. Weight was 78 kg.",
  },
  {
    text: "Priya ki routine antenatal check ki. BP 118 over 76 tha, normal range mein. Temperature normal. Weight 58 kg. Koi complaint nahi.",
    translated:
      "Did Priya's routine antenatal check. BP was 118 over 76, within normal range. Temperature normal. Weight 58 kg. No complaints.",
  },
];

const SCENARIO_B_SAMPLES = [
  "DISCHARGE SUMMARY\nDiagnosis: Community-acquired pneumonia, resolved.\nMedications: Stop Azithromycin. Start Amoxicillin 500mg three times daily for 5 days.\nFollow-up: Review in OPD on 2026-08-17.\nWatch for: chest pain, shortness of breath, or high fever above 103F — return to hospital immediately if these occur.",
  "DISCHARGE SUMMARY\nDiagnosis: Appendectomy, uncomplicated recovery.\nMedications: Start Paracetamol 500mg as needed for pain. Stop IV antibiotics.\nFollow-up: Suture removal on 2026-08-24.\nWatch for: wound redness, fever, or severe abdominal pain.",
  "DISCHARGE SUMMARY\nDiagnosis: Type 2 diabetes, newly diagnosed, stabilized.\nMedications: Start Metformin 500mg twice daily. Increased Insulin Glargine to 12 units at night.\nFollow-up: Endocrinology review on 2026-09-01.\nWatch for: confusion, fainting, or blurred vision which may indicate low blood sugar.",
];

async function seedDemoEntries(patientId: string, userId: string) {
  for (const sample of SCENARIO_A_SAMPLES) {
    const result = await runPipeline({
      input: {
        kind: "voice",
        audio: { simulatedText: sample.text, simulatedTranslatedText: sample.translated, simulatedLanguage: "hi" },
        sttProvider: MockSTTProvider,
      },
      schemaContext: {
        protocolId: antenatalNcdProtocol.id,
        categories: antenatalNcdSchemaCategories,
        instructions: "Extract antenatal/NCD screening facts only.",
      },
      protocol: antenatalNcdProtocol,
      recipientRole: "supervising_health_worker",
      llmProvider: MockLLMProvider,
    });

    await insertEntryFromPipeline({
      patientId,
      userId,
      rawCapture: result.rawCapture,
      structuredEntries: result.structuredEntries,
      flaggedEntries: result.flaggedEntries,
      handoffResult: result.handoffResult,
      protocolId: antenatalNcdProtocol.id,
      clientEventId: Crypto.randomUUID(),
      review: { status: "demo_seeded", extractionProvider: "mock" },
    });
  }

  for (const text of SCENARIO_B_SAMPLES) {
    const result = await runPipeline({
      input: { kind: "photo", image: { simulatedText: text }, ocrProvider: MockOCRProvider },
      schemaContext: {
        protocolId: dischargeRedFlagsProtocol.id,
        categories: dischargeSchemaCategories,
        instructions: "Extract the diagnosis, medication changes, follow-up dates, and red-flag symptoms.",
      },
      protocol: dischargeRedFlagsProtocol,
      recipientRole: "patient",
      llmProvider: MockLLMProvider,
    });

    await insertEntryFromPipeline({
      patientId,
      userId,
      rawCapture: result.rawCapture,
      structuredEntries: result.structuredEntries,
      flaggedEntries: result.flaggedEntries,
      handoffResult: result.handoffResult,
      protocolId: dischargeRedFlagsProtocol.id,
      clientEventId: Crypto.randomUUID(),
      review: { status: "demo_seeded", extractionProvider: "mock" },
    });
  }
}
