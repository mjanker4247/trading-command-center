export type ResponseLanguage = "en-US" | "zh-TW" | "zh-CN" | "ja-JP" | "ko-KR" | "de-DE";

export const DEFAULT_RESPONSE_LANGUAGE: ResponseLanguage = "en-US";

export const RESPONSE_LANGUAGE_OPTIONS: Array<{ value: ResponseLanguage; label: string }> = [
  { value: "en-US", label: "English (US)" },
  { value: "zh-TW", label: "Traditional Chinese" },
  { value: "zh-CN", label: "Simplified Chinese" },
  { value: "ja-JP", label: "Japanese" },
  { value: "ko-KR", label: "Korean" },
  { value: "de-DE", label: "German" },
];

export function responseLanguageLabel(value: string | null | undefined): string {
  return RESPONSE_LANGUAGE_OPTIONS.find((option) => option.value === value)?.label ?? value ?? "English (US)";
}
