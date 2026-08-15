// Real OCR provider using Google Cloud Vision's TEXT_DETECTION.
// https://cloud.google.com/vision/docs/ocr
import { ImageInput, OCRProvider, OCRResult } from "./types";

export function createGoogleVisionOCRProvider(apiKey: string): OCRProvider {
  return {
    name: "google-vision-ocr",
    async extractText(image: ImageInput): Promise<OCRResult> {
      const base64 = image.base64 ?? (image.uri ? await uriToBase64(image.uri) : undefined);
      if (!base64) {
        throw new Error("createGoogleVisionOCRProvider: image.base64 or image.uri is required");
      }

      const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64 },
              features: [{ type: "TEXT_DETECTION" }],
            },
          ],
        }),
      });

      if (!res.ok) {
        throw new Error(`Google Vision OCR failed: ${res.status} ${await res.text()}`);
      }

      const json = await res.json();
      const text = json.responses?.[0]?.fullTextAnnotation?.text ?? "";
      return { text };
    },
  };
}

async function uriToBase64(uri: string): Promise<string> {
  const res = await fetch(uri);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
