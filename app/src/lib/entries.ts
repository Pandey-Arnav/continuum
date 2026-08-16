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
  review_status?: "unreviewed" | "human_verified" | "demo_seeded";
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  extraction_provider?: string | null;
  client_event_id?: string | null;
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
  clientEventId?: string | null;
  review?: {
    status: "human_verified" | "demo_seeded";
    reviewedBy?: string | null;
    reviewedAt?: string | null;
    extractionProvider?: string | null;
  };
}) {
  if (args.flaggedEntries.length === 0) throw new Error("Cannot save an entry with no extracted facts");
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
    client_event_id: args.clientEventId ?? null,
    review_status: args.review?.status ?? "unreviewed",
    reviewed_by: args.review?.reviewedBy ?? null,
    reviewed_at: args.review?.reviewedAt ?? null,
    extraction_provider: args.review?.extractionProvider ?? null,
  };

  const firstAttempt = await supabase.from("entries").insert(row).select().single();
  if (!firstAttempt.error) return firstAttempt.data as EntryRow;

  // Backward-compatible demo fallback while migration 0004 is pending.
  if (/client_event_id|review_status|reviewed_by|reviewed_at|extraction_provider/i.test(firstAttempt.error.message)) {
    const { client_event_id, review_status, reviewed_by, reviewed_at, extraction_provider, ...legacyRow } = row;
    const retry = await supabase.from("entries").insert(legacyRow).select().single();
    if (retry.error) throw retry.error;
    return retry.data as EntryRow;
  }

  throw firstAttempt.error;
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
