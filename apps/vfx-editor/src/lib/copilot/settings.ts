import type { CopilotSettings, CodexModelId } from "./types";

const STORAGE_KEY = "web-hammer:vfx-editor:copilot";

const CODEX_MODELS: CodexModelId[] = [
  "gpt-5.4",
  "gpt-5.3-codex",
  "gpt-5.1-codex-max",
  "gpt-4.1",
  "gpt-4.1-mini",
  "codex-mini-latest",
  "o3",
  "o4-mini"
];

const DEFAULT_SETTINGS: CopilotSettings = {
  codex: { model: "gpt-5.4" }
};

export function loadCopilotSettings(): CopilotSettings {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return DEFAULT_SETTINGS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CopilotSettings>;
    return {
      codex: {
        model: isCodexModel(parsed.codex?.model) ? parsed.codex.model : DEFAULT_SETTINGS.codex.model
      }
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveCopilotSettings(settings: CopilotSettings): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function isCopilotConfigured(): boolean {
  return true;
}

function isCodexModel(value: unknown): value is CodexModelId {
  return typeof value === "string" && (CODEX_MODELS as string[]).includes(value);
}