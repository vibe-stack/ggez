import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, Settings, X } from "lucide-react";
import type { CodexModelId, CopilotSettings } from "@/lib/copilot/types";
import { loadCopilotSettings, saveCopilotSettings } from "@/lib/copilot/settings";

type CodexStatus = { available: boolean; version?: string; error?: string } | null;

export function CopilotSettingsDialog({ onSaved }: { onSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<CopilotSettings>(loadCopilotSettings);
  const [codexStatus, setCodexStatus] = useState<CodexStatus>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSettings(loadCopilotSettings());
    void fetchCodexStatus();
  }, [open]);

  async function fetchCodexStatus() {
    try {
      const response = await fetch("/api/codex/status");
      setCodexStatus(await response.json());
    } catch {
      setCodexStatus({ available: false, error: "Could not check Codex status" });
    }
  }

  function handleSave() {
    saveCopilotSettings(settings);
    setOpen(false);
    onSaved?.();
  }

  return (
    <>
      <button
        type="button"
        className="flex size-7 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/6 hover:text-zinc-200"
        onClick={() => setOpen(true)}
        aria-label="Open Codex settings"
      >
        <Settings className="size-3.5" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-white/8 bg-[#091012]/96 p-5 shadow-[0_32px_120px_rgba(0,0,0,0.6)]">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">Codex Settings</h2>
                <p className="mt-1 text-sm text-zinc-500">Choose the model used for browser-side VFX authoring.</p>
              </div>
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-white/6 hover:text-zinc-200"
                onClick={() => setOpen(false)}
                aria-label="Close settings"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Model</label>
                <select
                  className="h-11 w-full rounded-2xl border border-white/8 bg-[#0d1718]/92 px-3 text-sm text-zinc-100 outline-none"
                  disabled={!codexStatus?.available}
                  onChange={(event) => setSettings({ codex: { model: event.target.value as CodexModelId } })}
                  value={settings.codex.model}
                >
                  <option value="gpt-5.4">GPT-5.4</option>
                  <option value="gpt-5.3-codex">GPT-5.3 Codex</option>
                  <option value="gpt-5.1-codex-max">GPT-5.1 Codex Max</option>
                  <option value="gpt-4.1">GPT-4.1</option>
                  <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
                  <option value="o3">o3</option>
                  <option value="o4-mini">o4-mini</option>
                  <option value="codex-mini-latest">Codex Mini</option>
                </select>
              </div>

              <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
                {codexStatus === null ? (
                  <p className="text-[11px] text-zinc-500">Checking Codex CLI...</p>
                ) : codexStatus.available ? (
                  <div className="flex items-center gap-2 text-[11px] text-emerald-300">
                    <CheckCircle className="size-3.5" />
                    Codex CLI detected {codexStatus.version ? `(${codexStatus.version})` : ""}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[11px] text-amber-300">
                      <AlertTriangle className="size-3.5" />
                      Codex CLI not found
                    </div>
                    <p className="text-[11px] text-zinc-500">Install with: npm install -g @openai/codex</p>
                    {codexStatus.error ? <p className="text-[11px] text-zinc-600">{codexStatus.error}</p> : null}
                  </div>
                )}
                <p className="mt-2 text-[11px] text-zinc-500">Codex uses your local login session. Run codex login in your terminal to authenticate.</p>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/6"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-2xl bg-emerald-400 px-4 py-2 text-sm font-medium text-[#06100d] transition hover:bg-emerald-300"
                  onClick={handleSave}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}