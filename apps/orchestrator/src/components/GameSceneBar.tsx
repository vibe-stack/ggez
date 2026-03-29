type GameSceneBarProps = {
  activeSceneId: string | null;
  busySceneId: string | null;
  onSwitchScene: (sceneId: string) => void;
  sceneIds: string[];
};

export function GameSceneBar(props: GameSceneBarProps) {
  if (props.sceneIds.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-20 flex w-[min(72rem,calc(100vw-2rem))] -translate-x-1/2 justify-center px-2">
      <div className="pointer-events-auto flex max-w-full items-center gap-2 overflow-x-auto rounded-[22px] border border-white/8 bg-zinc-950/76 px-3 py-2 shadow-[0_20px_60px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
        <div className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Scenes
        </div>
        {props.sceneIds.map((sceneId) => {
          const isActive = props.activeSceneId === sceneId;
          const isBusy = props.busySceneId === sceneId;

          return (
            <button
              key={sceneId}
              type="button"
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
                isActive
                  ? "border-cyan-300/25 bg-cyan-400/16 text-cyan-100"
                  : "border-white/8 bg-white/4 text-white/60 hover:bg-white/8 hover:text-white/86"
              } ${isBusy ? "opacity-70" : ""}`}
              disabled={isBusy}
              onClick={() => props.onSwitchScene(sceneId)}
            >
              {sceneId}
            </button>
          );
        })}
      </div>
    </div>
  );
}