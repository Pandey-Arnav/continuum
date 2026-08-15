// Provider interfaces the engine depends on. Every phase of the pipeline that
// touches a model or external API goes through one of these, so a mock
// implementation and a real implementation are interchangeable at the call site.

export interface AudioInput {
  uri?: string; // local/expo file uri
  base64?: string;
  languageHint?: string; // e.g. "hi-IN", "mr-IN"
  /** Demo-only: lets the app hand a mock provider a canned transcript instead of running real STT. Ignored by real providers. */
  simulatedText?: string;
  simulatedTranslatedText?: string;
  simulatedLanguage?: string;
}

export interface STTResult {
  text: string; // transcript in original language
  translatedText: string; // English translation
  detectedLanguage: string;
}

export interface STTProvider {
  name: string;
  transcribe: (audio: AudioInput) => Promise<STTResult>;
}

export interface ImageInput {
  uri?: string;
  base64?: string;
  /** Demo-only: lets the app hand a mock provider canned OCR text instead of running real OCR. Ignored by real providers. */
  simulatedText?: string;
}

export interface OCRResult {
  text: string;
}

export interface OCRProvider {
  name: string;
  extractText: (image: ImageInput) => Promise<OCRResult>;
}

/**
 * Generic text-completion provider. The engine only ever asks it to (a) pull
 * structured facts out of text, and (b) phrase a plain-language summary.
 * It never asks it to make a flagging/medical judgment — that stays in compare().
 */
export interface LLMProvider {
  name: string;
  complete: (prompt: string, opts?: { json?: boolean }) => Promise<string>;
}
