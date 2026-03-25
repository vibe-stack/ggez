import type { CopilotProviderId, CopilotSettings, CodexModelId, GeminiModelId } from "./types";

const STORAGE_KEY = "web-hammer:copilot";

const GEMINI_MODELS: GeminiModelId[] = ["gemini-3-flash-preview", "gemini-3.1-pro-preview"];
const CODEX_MODELS: CodexModelId[] = ["gpt-5.4", "gpt-5.3-codex", "gpt-5.1-codex-max", "gpt-4.1", "gpt-4.1-mini", "codex-mini-latest", "o3", "o4-mini"];

const DEFAULT_SETTINGS: CopilotSettings = {
  provider: "codex",
  gemini: { apiKey: "", model: "gemini-3-flash-preview" },
  codex: { model: "gpt-5.4" },
  openai: { apiKey: "", baseUrl: "https://api.openai.com/v1", model: "gpt-4-turbo" },
  temperature: 0.3
};

export function loadCopilotSettings(): CopilotSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };

    const parsed = JSON.parse(raw);

    // Migration: detect old flat format { apiKey, model, temperature }
    if (typeof parsed.apiKey === "string" && !parsed.provider) {
      return {
        provider: "gemini",
        gemini: {
          apiKey: parsed.apiKey,
          model: isGeminiModel(parsed.model) ? parsed.model : DEFAULT_SETTINGS.gemini.model
        },
        codex: { ...DEFAULT_SETTINGS.codex },
        openai: { ...DEFAULT_SETTINGS.openai },
        temperature: validTemperature(parsed.temperature)
      };
    }

    // New format
    return {
      provider: isValidProvider(parsed.provider) ? parsed.provider : DEFAULT_SETTINGS.provider,
      gemini: {
        apiKey: typeof parsed.gemini?.apiKey === "string" ? parsed.gemini.apiKey : DEFAULT_SETTINGS.gemini.apiKey,
        model: isGeminiModel(parsed.gemini?.model) ? parsed.gemini.model : DEFAULT_SETTINGS.gemini.model
      },
      codex: {
        model: typeof parsed.codex?.model === "string" ? parsed.codex.model : DEFAULT_SETTINGS.codex.model
      },
      openai: {
        apiKey: typeof parsed.openai?.apiKey === "string" ? parsed.openai.apiKey : DEFAULT_SETTINGS.openai.apiKey,
        baseUrl: typeof parsed.openai?.baseUrl === "string" ? parsed.openai.baseUrl : DEFAULT_SETTINGS.openai.baseUrl,
        model: typeof parsed.openai?.model === "string" ? parsed.openai.model : DEFAULT_SETTINGS.openai.model
      },
      temperature: validTemperature(parsed.temperature)
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveCopilotSettings(settings: CopilotSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function isCopilotConfigured(settings?: CopilotSettings): boolean {
  const s = settings ?? loadCopilotSettings();

  if (s.provider === "gemini") {
    return s.gemini.apiKey.length > 0;
  }
  
  if (s.provider === "openai") {
    return s.openai.apiKey.length > 0;
  }

  // Codex uses local login — always "configured" from the browser's perspective
  // (auth is checked server-side on connect)
  return true;
}

function isValidProvider(v: unknown): v is CopilotProviderId {
  return v === "gemini" || v === "codex" || v === "openai";
}

function isGeminiModel(v: unknown): v is GeminiModelId {
  return typeof v === "string" && (GEMINI_MODELS as string[]).includes(v);
}

function isCodexModel(v: unknown): v is CodexModelId {
  return typeof v === "string";
}

function validTemperature(v: unknown): number {
  return typeof v === "number" && v >= 0 && v <= 1 ? v : DEFAULT_SETTINGS.temperature;
}
