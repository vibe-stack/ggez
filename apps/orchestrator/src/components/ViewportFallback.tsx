import type { OrchestratorSnapshot } from "../types";

export function ViewportFallback({ snapshot }: { snapshot: OrchestratorSnapshot | null }) {
  const isGame = snapshot?.viewport.view === "game";

  return (
    <div className="engine-empty">
      <div className="engine-empty-card">
        <p className="engine-eyebrow mx-auto w-fit">Viewport idle</p>
        <h3 className="mt-5 text-3xl font-semibold tracking-tight text-white">
          {isGame ? "No game server running" : "Waiting for editor preview"}
        </h3>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-white/52">
          {isGame
            ? "Open Settings from the orb, select a game, and start its dev server."
            : "The orchestrator expects Trident and Animation Studio to be built so their preview servers can start."}
        </p>
      </div>
    </div>
  );
}
