import type { FlaggedEntry, HandoffResult, RawCapture, RecipientRole, SourceType, StructuredEntry } from "@continuum/engine";
import { supabase } from "./supabase";
import { enqueueOutbox, flushOutbox, QueuedCorrection } from "./outbox";

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
  protocol_version_id?: string | null;
  captured_offline_at?: string | null;
  synced_at?: string | null;
  sync_status?: "synced" | "queued";
}

export type EntryCorrectionDraft = QueuedCorrection;

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
  protocolVersionId?: string | null;
  capturedOfflineAt?: string | null;
  corrections?: EntryCorrectionDraft[];
  allowOfflineQueue?: boolean;
  review?: {
    status: "human_verified" | "demo_seeded";
    reviewedBy?: string | null;
    reviewedAt?: string | null;
    extractionProvider?: string | null;
  };
}) {
  if (args.flaggedEntries.length === 0) throw new Error("Cannot save an entry with no extracted facts");
  const headline = headlineFact(args.flaggedEntries);

  const row: Record<string, unknown> = {
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
    protocol_version_id: args.protocolVersionId ?? args.protocolId,
    captured_offline_at: args.capturedOfflineAt ?? null,
  };

  try {
    const entry = await deliverPreparedEntry(row, args.corrections ?? []);
    return { ...entry, sync_status: "synced" as const };
  } catch (error) {
    if ((args.allowOfflineQueue ?? true) && isRetryableNetworkError(error)) {
      const queuedRow = { ...row, captured_offline_at: new Date().toISOString() };
      await enqueueOutbox({ entry: queuedRow, corrections: args.corrections ?? [] });
      return {
        ...(queuedRow as unknown as EntryRow),
        id: `offline:${String(args.clientEventId ?? Date.now())}`,
        created_at: new Date().toISOString(),
        sync_status: "queued" as const,
      };
    }
    throw error;
  }
}

function isRetryableNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  return /failed to fetch|network request failed|networkerror|timeout|timed out|connection|offline/i.test(message);
}

function withoutYearOneColumns(row: Record<string, unknown>): Record<string, unknown> {
  const {
    protocol_version_id,
    captured_offline_at,
    synced_at,
    ...preYearOneRow
  } = row;
  return preYearOneRow;
}

function withoutSecureWorkflowColumns(row: Record<string, unknown>): Record<string, unknown> {
  const {
    client_event_id,
    review_status,
    reviewed_by,
    reviewed_at,
    extraction_provider,
    protocol_version_id,
    captured_offline_at,
    ...legacyRow
  } = row;
  return legacyRow;
}

async function deliverPreparedEntry(row: Record<string, unknown>, corrections: EntryCorrectionDraft[]): Promise<EntryRow> {
  let response = await supabase.from("entries").insert(row).select().single();

  if (response.error && /protocol_version_id|captured_offline_at|synced_at/i.test(response.error.message)) {
    response = await supabase.from("entries").insert(withoutYearOneColumns(row)).select().single();
  }

  if (response.error && /client_event_id|review_status|reviewed_by|reviewed_at|extraction_provider/i.test(response.error.message)) {
    response = await supabase.from("entries").insert(withoutSecureWorkflowColumns(row)).select().single();
  }

  if (response.error && /duplicate key|entries_client_event_id_key|23505/i.test(response.error.message) && row.client_event_id) {
    response = await supabase.from("entries").select("*").eq("client_event_id", row.client_event_id).single();
  }

  if (response.error) throw response.error;
  const entry = response.data as EntryRow;

  if (corrections.length > 0) {
    const correctionRows = corrections.map((correction) => ({
      client_correction_id: correction.clientCorrectionId,
      entry_id: entry.id,
      patient_id: entry.patient_id,
      fact_index: correction.factIndex,
      original_fact: correction.originalFact,
      corrected_fact: correction.correctedFact,
      reason: correction.reason,
      corrected_by: correction.correctedBy,
    }));
    const { error } = await supabase.from("entry_corrections").upsert(correctionRows, { onConflict: "client_correction_id", ignoreDuplicates: true });
    if (error) throw error;
  }

  return entry;
}

export async function syncPendingEntries(): Promise<{ delivered: number; remaining: number }> {
  return flushOutbox(async (payload) => {
    await deliverPreparedEntry(payload.entry, payload.corrections);
  });
}

export async function recordWorkflowEvent(args: {
  patientId?: string | null;
  userId: string;
  eventName: string;
  success: boolean;
  durationMs?: number;
  clientEventId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  const { error } = await supabase.from("workflow_events").insert({
    patient_id: args.patientId ?? null,
    actor_id: args.userId,
    event_name: args.eventName,
    success: args.success,
    duration_ms: args.durationMs ?? null,
    client_event_id: args.clientEventId ?? null,
    metadata: args.metadata ?? {},
  });
  if (error && !/workflow_events|schema cache|does not exist/i.test(error.message)) throw error;
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
