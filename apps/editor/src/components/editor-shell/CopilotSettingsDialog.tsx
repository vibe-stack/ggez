import { useEffect, useState } from "react";
import { Settings, Eye, EyeOff, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import type { CopilotSettings, CopilotProviderId, GeminiModelId, CodexModelId } from "@/lib/copilot/types";
import { loadCopilotSettings, saveCopilotSettings } from "@/lib/copilot/settings";

type CodexStatus = { available: boolean; version?: string; error?: string } | null;

export function CopilotSettingsDialog({ onSaved }: { onSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<CopilotSettings>(loadCopilotSettings);
  const [showKey, setShowKey] = useState(false);
  const [codexStatus, setCodexStatus] = useState<CodexStatus>(null);
  const [codexModels, setCodexModels] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setSettings(loadCopilotSettings());
      fetchCodexStatus();
    }
  }, [open]);

  const fetchCodexStatus = async () => {
    try {
      const res = await fetch("/api/codex/status");
      setCodexStatus(await res.json());

      const resModels = await fetch("/api/codex/models");
      const modelsData = await resModels.json();
      if (modelsData.models && modelsData.models.length > 0) {
        setCodexModels(modelsData.models);
      }
    } catch {
      setCodexStatus({ available: false, error: "Could not check Codex status" });
    }
  };

  const handleSave = () => {
    saveCopilotSettings(settings);
    setOpen(false);
    onSaved?.();
  };

  const setProvider = (provider: CopilotProviderId) => {
    setSettings({ ...settings, provider });
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button className="size-7 rounded-lg text-foreground/48 hover:text-foreground" size="icon-sm" variant="ghost" />
        }
      >
        <Settings className="size-3.5" />
      </DialogTrigger>
      <DialogContent className="border-white/10 bg-[#0a1510] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vibe Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Provider selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium tracking-[0.18em] text-foreground/52 uppercase">
              Provider
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                className={`h-9 rounded-xl text-xs ${settings.provider === "codex" ? "bg-emerald-500/18 text-emerald-200" : "text-foreground/60"}`}
                onClick={() => setProvider("codex")}
                variant="ghost"
              >
                Codex CLI
              </Button>
              <Button
                className={`h-9 rounded-xl text-xs ${settings.provider === "gemini" ? "bg-emerald-500/18 text-emerald-200" : "text-foreground/60"}`}
                onClick={() => setProvider("gemini")}
                variant="ghost"
              >
                Gemini API
              </Button>
              <Button
                className={`h-9 col-span-2 mt-1 rounded-xl text-xs ${settings.provider === "openai" ? "bg-emerald-500/18 text-emerald-200" : "text-foreground/60"}`}
                onClick={() => setProvider("openai")}
                variant="ghost"
              >
                OpenAI Compatible / Custom API
              </Button>
            </div>
          </div>

          {/* Provider-specific settings */}
          {settings.provider === "gemini" ? (
            <>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium tracking-[0.18em] text-foreground/52 uppercase">
                  API Key
                </label>
                <div className="relative">
                  <Input
                    className="h-10 rounded-xl border-white/10 bg-white/[0.045] pr-10 text-sm font-mono"
                    onChange={(e) => setSettings({ ...settings, gemini: { ...settings.gemini, apiKey: e.target.value } })}
                    placeholder="Enter your Gemini API key"
                    type={showKey ? "text" : "password"}
                    value={settings.gemini.apiKey}
                  />
                  <Button
                    className="absolute right-1 top-1 size-8 rounded-lg text-foreground/48"
                    onClick={() => setShowKey(!showKey)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </Button>
                </div>
                <p className="text-[10px] text-foreground/36">
                  Stored locally in your browser. Never sent to our servers.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium tracking-[0.18em] text-foreground/52 uppercase">
                  Model
                </label>
                <select
                  className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.045] px-3 text-sm text-foreground"
                  onChange={(e) => setSettings({ ...settings, gemini: { ...settings.gemini, model: e.target.value as GeminiModelId } })}
                  value={settings.gemini.model}
                >
                  <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
                </select>
              </div>
            </>
          ) : settings.provider === "openai" ? (
            <>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium tracking-[0.18em] text-foreground/52 uppercase">
                  Base URL
                </label>
                <Input
                  className="h-10 rounded-xl border-white/10 bg-white/[0.045] text-sm font-mono"
                  onChange={(e) => setSettings({ ...settings, openai: { ...settings.openai, baseUrl: e.target.value } })}
                  placeholder="https://api.openai.com/v1"
                  value={settings.openai.baseUrl}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium tracking-[0.18em] text-foreground/52 uppercase">
                  API Key
                </label>
                <div className="relative">
                  <Input
                     className="h-10 rounded-xl border-white/10 bg-white/[0.045] pr-10 text-sm font-mono"
                     onChange={(e) => setSettings({ ...settings, openai: { ...settings.openai, apiKey: e.target.value } })}
                     placeholder="sk-..."
                     type={showKey ? "text" : "password"}
                     value={settings.openai.apiKey}
                   />
                   <Button
                     className="absolute right-1 top-1 size-8 rounded-lg text-foreground/48"
                     onClick={() => setShowKey(!showKey)}
                     size="icon-sm"
                     variant="ghost"
                   >
                     {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                   </Button>
                 </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium tracking-[0.18em] text-foreground/52 uppercase">
                  Model
                </label>
                <Input
                  className="h-10 rounded-xl border-white/10 bg-white/[0.045] text-sm font-mono"
                  onChange={(e) => setSettings({ ...settings, openai: { ...settings.openai, model: e.target.value } })}
                  placeholder="gpt-4-turbo, minimax-2.7..."
                  value={settings.openai.model}
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium tracking-[0.18em] text-foreground/52 uppercase">
                  Model
                </label>
                <Input
                  className="h-10 rounded-xl border-white/10 bg-white/[0.045] pr-10 text-sm font-mono"
                  disabled={!codexStatus?.available}
                  list="codex-models"
                  onChange={(e) => setSettings({ ...settings, codex: { ...settings.codex, model: e.target.value as CodexModelId } })}
                  placeholder="Seleziona o scrivi il modello..."
                  value={settings.codex.model}
                />
                <datalist id="codex-models">
                  {codexModels.length > 0 ? (
                     codexModels.map(m => <option key={m} value={m}>{m}</option>)
                  ) : (
                    <>
                      <option value="gpt-5.4">gpt-5.4</option>
                      <option value="gpt-5.3-codex">gpt-5.3-codex</option>
                      <option value="MiniMax-2.7">MiniMax-2.7</option>
                      <option value="gpt-5.1-codex-max">gpt-5.1-codex-max</option>
                      <option value="o3">o3</option>
                    </>
                  )}
                </datalist>
              </div>

              {/* Codex status */}
              <div className="space-y-2">
                {codexStatus === null ? (
                  <p className="text-[11px] text-foreground/40">Checking Codex CLI...</p>
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
                    <p className="text-[10px] text-foreground/36">
                      Install with: <code className="rounded bg-white/10 px-1 py-px text-emerald-200">npm install -g @openai/codex</code>
                    </p>
                  </div>
                )}
                <p className="text-[10px] text-foreground/36">
                  Codex uses your local login session. Run <code className="rounded bg-white/10 px-1 py-px text-emerald-200">codex login</code> in your terminal to authenticate.
                </p>
              </div>
            </>
          )}

          {/* Temperature (shared) */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium tracking-[0.18em] text-foreground/52 uppercase">
              Temperature ({settings.temperature.toFixed(1)})
            </label>
            <input
              className="w-full accent-emerald-400"
              max={1}
              min={0}
              onChange={(e) => setSettings({ ...settings, temperature: parseFloat(e.target.value) })}
              step={0.1}
              type="range"
              value={settings.temperature}
            />
            <div className="flex justify-between text-[10px] text-foreground/36">
              <span>Precise</span>
              <span>Creative</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button className="rounded-xl" onClick={() => setOpen(false)} size="sm" variant="ghost">
              Cancel
            </Button>
            <Button className="rounded-xl" onClick={handleSave} size="sm">
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
