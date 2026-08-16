// Top 40 world languages by speaker count, as BCP-47 locale tags for
// STTProvider's `languageHint` (see packages/engine/src/providers/types.ts).
// Sarvam/ElevenLabs auto-detect language regardless, but Gemini's STT prompt
// uses the hint to bias transcription — and it's useful context for a CHW
// picking their own spoken language even when auto-detect gets it right.
export interface Language {
  code: string;
  name: string;
  native: string;
}

export const TOP_LANGUAGES: Language[] = [
  { code: "en-US", name: "English", native: "English" },
  { code: "zh-CN", name: "Mandarin Chinese", native: "中文" },
  { code: "hi-IN", name: "Hindi", native: "हिन्दी" },
  { code: "es-ES", name: "Spanish", native: "Español" },
  { code: "fr-FR", name: "French", native: "Français" },
  { code: "ar-SA", name: "Standard Arabic", native: "العربية" },
  { code: "bn-BD", name: "Bengali", native: "বাংলা" },
  { code: "pt-BR", name: "Portuguese", native: "Português" },
  { code: "ru-RU", name: "Russian", native: "Русский" },
  { code: "ur-PK", name: "Urdu", native: "اردو" },
  { code: "id-ID", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "de-DE", name: "German", native: "Deutsch" },
  { code: "ja-JP", name: "Japanese", native: "日本語" },
  { code: "sw-KE", name: "Swahili", native: "Kiswahili" },
  { code: "mr-IN", name: "Marathi", native: "मराठी" },
  { code: "te-IN", name: "Telugu", native: "తెలుగు" },
  { code: "tr-TR", name: "Turkish", native: "Türkçe" },
  { code: "ta-IN", name: "Tamil", native: "தமிழ்" },
  { code: "zh-HK", name: "Cantonese", native: "廣東話" },
  { code: "vi-VN", name: "Vietnamese", native: "Tiếng Việt" },
  { code: "fil-PH", name: "Filipino", native: "Filipino" },
  { code: "ko-KR", name: "Korean", native: "한국어" },
  { code: "fa-IR", name: "Persian", native: "فارسی" },
  { code: "ha-NG", name: "Hausa", native: "Hausa" },
  { code: "ar-EG", name: "Egyptian Arabic", native: "العربية المصرية" },
  { code: "jv-ID", name: "Javanese", native: "Basa Jawa" },
  { code: "it-IT", name: "Italian", native: "Italiano" },
  { code: "pa-PK", name: "Western Punjabi", native: "پنجابی" },
  { code: "gu-IN", name: "Gujarati", native: "ગુજરાતી" },
  { code: "kn-IN", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "bho-IN", name: "Bhojpuri", native: "भोजपुरी" },
  { code: "th-TH", name: "Thai", native: "ไทย" },
  { code: "am-ET", name: "Amharic", native: "አማርኛ" },
  { code: "sd-PK", name: "Sindhi", native: "سنڌي" },
  { code: "ml-IN", name: "Malayalam", native: "മലയാളം" },
  { code: "my-MM", name: "Burmese", native: "မြန်မာဘာသာ" },
  { code: "pl-PL", name: "Polish", native: "Polski" },
  { code: "uk-UA", name: "Ukrainian", native: "Українська" },
  { code: "yo-NG", name: "Yoruba", native: "Yorùbá" },
  { code: "or-IN", name: "Odia", native: "ଓଡ଼ିଆ" },
];
