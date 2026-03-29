import { Loader2 } from "lucide-react";

type GameSceneBarProps = {
  isLoading: boolean;
  onSwitchScene: (sceneId: string) => void;
  sceneIds: string[];
  selectedSceneId: string | null;
};

export function GameSceneBar(props: GameSceneBarProps) {
  if (props.sceneIds.length === 0) {
    return null;
  }

  const selectedSceneId = props.selectedSceneId && props.sceneIds.includes(props.selectedSceneId)
    ? props.selectedSceneId
    : props.sceneIds[0] ?? "";

  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-20 flex -translate-x-1/2 justify-center px-2">
      <div className="pointer-events-auto flex items-center gap-2 rounded-[18px] border border-white/8 bg-zinc-950/76 px-3 py-2 shadow-[0_20px_60px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
        <select
          className="min-w-44 appearance-none rounded-full border border-white/8 bg-white/6 px-3 py-1.5 text-[11px] text-white outline-none transition-colors hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={props.isLoading}
          onChange={(event) => props.onSwitchScene(event.target.value)}
          value={selectedSceneId}
        >
          {props.sceneIds.map((sceneId) => (
            <option key={sceneId} value={sceneId}>
              {sceneId}
            </option>
          ))}
        </select>

        {props.isLoading ? <Loader2 className="size-3.5 animate-spin text-cyan-200" /> : null}
      </div>
    </div>
  );
}