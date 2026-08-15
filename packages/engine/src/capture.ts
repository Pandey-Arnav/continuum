// capture(): turns a voice note or a photographed document into plain text.
// The only job here is "get text out of messy input" — no interpretation.
import { RawCapture, SourceType } from "./types";
import { AudioInput, ImageInput, OCRProvider, STTProvider } from "./providers/types";

export async function captureVoice(
  audio: AudioInput,
  sttProvider: STTProvider,
  mediaRef?: string
): Promise<RawCapture> {
  const result = await sttProvider.transcribe(audio);
  return {
    sourceType: "chw_voice_visit" as SourceType,
    text: result.text,
    translatedText: result.translatedText,
    language: result.detectedLanguage,
    mediaRef,
  };
}

export async function capturePhoto(
  image: ImageInput,
  ocrProvider: OCRProvider,
  mediaRef?: string
): Promise<RawCapture> {
  const result = await ocrProvider.extractText(image);
  return {
    sourceType: "discharge_photo" as SourceType,
    text: result.text,
    mediaRef,
  };
}
