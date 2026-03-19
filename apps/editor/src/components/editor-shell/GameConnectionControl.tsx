import * as React from "react";
import { Gamepad2, LoaderCircle, RefreshCw, Upload } from "lucide-react";
import type { DevSyncGameRegistration } from "@web-hammer/dev-sync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";

type GameConnectionControlProps = {
  activeGame?: DevSyncGameRegistration;
  error?: string;
  games: DevSyncGameRegistration[];
  isLoading: boolean;
  isPushing: boolean;
  lastPush?: {
    game: DevSyncGameRegistration;
    projectSlug: string;
    scenePath: string;
  };
  onProjectNameChange: (value: string) => void;
  onProjectSlugChange: (value: string) => void;
  onPushScene: (forceSwitch: boolean) => void;
  onRefresh: () => void;
  onSelectGame: (gameId: string) => void;
  projectName: string;
  projectSlug: string;
  selectedGameId?: string;
};

export function GameConnectionControl({
  activeGame,
  error,
  games,
  isLoading,
  isPushing,
  lastPush,
  onProjectNameChange,
  onProjectSlugChange,
  onPushScene,
  onRefresh,
  onSelectGame,
  projectName,
  projectSlug,
  selectedGameId
}: GameConnectionControlProps) {
  const connectionLabel = games.length === 0
    ? "No Game"
    : games.length === 1
      ? activeGame?.name ?? games[0]?.name ?? "Game"
      : `${games.length} Games`;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label="Game connection"
            className="flex flex-row gap-1 px-2 text-[11px] text-foreground/65 hover:text-foreground"
            size="icon-xs"
            title="Connected game"
            variant="ghost"
          >
            <Gamepad2 className={`size-3.5 ${games.length > 0 ? "text-emerald-400" : "text-foreground/55"}`} />
            <span className="max-w-28 truncate">{connectionLabel}</span>
          </Button>
        }
      />

      <PopoverContent
        align="end"
        className="w-96 gap-3 rounded-2xl border border-white/8 bg-[#09110f]/96 p-3 shadow-[0_24px_60px_rgba(1,6,5,0.5)] backdrop-blur-xl"
      >
        <PopoverHeader>
          <PopoverTitle className="text-sm text-foreground">Editor Sync</PopoverTitle>
          <PopoverDescription className="text-xs text-foreground/55">
            Push the current runtime scene straight into a connected game’s `src/scenes` folder.
          </PopoverDescription>
        </PopoverHeader>

        <div className="grid gap-2">
          <label className="grid gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">Project</span>
            <Input
              onChange={(event) => onProjectNameChange(event.currentTarget.value)}
              placeholder="Untitled Scene"
              value={projectName}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">Slug</span>
            <Input
              onChange={(event) => onProjectSlugChange(event.currentTarget.value)}
              placeholder="untitled-scene"
              value={projectSlug}
            />
          </label>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">Connected Games</span>
            <Button onClick={onRefresh} size="icon-xs" variant="ghost">
              <RefreshCw className={`size-3 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          <div className="grid max-h-40 gap-1 overflow-y-auto">
            {games.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-xs text-foreground/50">
                No scaffolded game dev server is advertising itself yet.
              </div>
            ) : (
              games.map((game) => (
                <button
                  className={`rounded-xl border px-3 py-2 text-left transition ${game.id === selectedGameId ? "border-emerald-400/35 bg-emerald-500/10 text-foreground" : "border-white/8 bg-white/4 text-foreground/70 hover:bg-white/7"}`}
                  key={game.id}
                  onClick={() => onSelectGame(game.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium">{game.name}</span>
                    <span className="text-[11px] text-foreground/45">{game.sceneIds.length} scenes</span>
                  </div>
                  <div className="truncate pt-0.5 text-[11px] text-foreground/45">{game.url}</div>
                </button>
              ))
            )}
          </div>
        </div>

        <ForceSwitchRow
          isPushing={isPushing}
          onPushScene={onPushScene}
          pushDisabled={!activeGame || isPushing || projectSlug.trim().length === 0}
        />

        {lastPush ? (
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/8 px-3 py-2 text-xs text-emerald-100/85">
            Pushed `{lastPush.projectSlug}` to `{lastPush.scenePath}` in {lastPush.game.name}.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-100/90">
            {error}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function ForceSwitchRow(props: {
  isPushing: boolean;
  onPushScene: (forceSwitch: boolean) => void;
  pushDisabled: boolean;
}) {
  const [forceSwitch, setForceSwitch] = React.useState(true);

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/4 px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-sm text-foreground">Force Scene Switch</div>
        <div className="text-xs text-foreground/50">Reload the running game into this scene after the files land.</div>
      </div>

      <div className="flex items-center gap-2">
        <Switch checked={forceSwitch} onCheckedChange={setForceSwitch} size="sm" />
        <Button disabled={props.pushDisabled} onClick={() => props.onPushScene(forceSwitch)} size="sm">
          {props.isPushing ? <LoaderCircle className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          Push
        </Button>
      </div>
    </div>
  );
}
