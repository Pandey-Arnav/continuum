import type { FlaggedEntry, HandoffResult, RawCapture, RecipientRole, SourceType, StructuredEntry } from "@continuum/engine";
import { supabase } from "./supabase";

export interface EntryRow {
  id: string;
  patient_id: string;
  source_type: SourceType;
  raw_input_ref: string | null;
  raw_text: string;
  structured_data: StructuredEntry[];
  flagged_data: FlaggedEntry[];
  category: string;
  flag_level: "green" | "amber" | "red";
  flag_reason: string;
  rule_id: string;
  recipient: RecipientRole;
  handoff_summary: string;
  protocol_id: string;
  created_at: string;
  created_by: string | null;
}

const FLAG_RANK: Record<EntryRow["flag_level"], number> = { green: 0, amber: 1, red: 2 };

function headlineFact(flagged: FlaggedEntry[]): FlaggedEntry {
  if (flagged.length === 0) {
    throw new Error(
      "Nothing was extracted from this capture — no facts matched the protocol's categories, so there's nothing to save. Try a different sample, or describe specific vitals/symptoms."
    );
  }
  return flagged.reduce((worst, next) => (FLAG_RANK[next.flagLevel] > FLAG_RANK[worst.flagLevel] ? next : worst));
}

export async function insertEntryFromPipeline(args: {
  patientId: string;
  userId: string;
  rawCapture: RawCapture;
  structuredEntries: StructuredEntry[];
  flaggedEntries: FlaggedEntry[];
  handoffResult: HandoffResult;
  protocolId: string;
  mediaRef?: string | null;
}) {
  const headline = headlineFact(args.flaggedEntries);

  const row = {
    patient_id: args.patientId,
    source_type: args.rawCapture.sourceType,
    raw_input_ref: args.mediaRef ?? null,
    raw_text: args.rawCapture.translatedText ?? args.rawCapture.text,
    structured_data: args.structuredEntries,
    flagged_data: args.flaggedEntries,
    category: headline.category,
    flag_level: headline.flagLevel,
    flag_reason: headline.flagReason,
    rule_id: headline.ruleId,
    recipient: args.handoffResult.recipientRole,
    handoff_summary: args.handoffResult.summary,
    protocol_id: args.protocolId,
    created_by: args.userId,
  };

  const { data, error } = await supabase.from("entries").insert(row).select().single();
  if (error) throw error;
  return data as EntryRow;
}

export async function fetchEntries(patientId: string): Promise<EntryRow[]> {
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EntryRow[];
}

export function subscribeToEntries(patientId: string, onInsert: (row: EntryRow) => void) {
  const channel = supabase
    .channel(`entries-${patientId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "entries", filter: `patient_id=eq.${patientId}` },
      (payload) => onInsert(payload.new as EntryRow)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
