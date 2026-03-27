import { FileTree, PageShell, Section, renderPage, siteHref } from "../site";

const currentPath = window.location.pathname;

renderPage(
  "GGEZ | Project Layout",
  <PageShell
    currentPath={currentPath}
    intro="The scaffold is intentionally vanilla, but it is organized like a real game app: runtime glue in one place, scene logic in another, and animation bundles isolated behind their own loading boundary."
    title="Know where your code and content belong"
  >
    <Section
      intro="This is the practical shape of the current starter. Scene folders and animation bundles live next to the code that consumes them, while core runtime wiring stays under src/game."
      title="Starter folder structure"
    >
      <FileTree title="Starter tree">
        {`my-game/
  public/
  src/
    animations/
      index.ts
      player-locomotion/
        animation.bundle.json
        graph.animation.json
        assets/
    game/
      app.ts
      camera.ts
      gameplay.ts
      runtime-animation-sources.ts
      runtime-physics.ts
      runtime-scene-sources.ts
      scene-types.ts
      starter-player-controller.ts
    scenes/
      main/
        assets/
        index.ts
        scene.runtime.json
      index.ts
    main.ts
    style.css
  package.json`}
      </FileTree>
      <p>
        This layout keeps the runtime boundary explicit. Your app bootstrapping code stays in one place, while authored content is colocated with the modules that mount it.
      </p>
    </Section>

    <Section
      intro="You will move faster if you keep each folder opinionated instead of letting everything drift into src/."
      title="How to organize the project"
    >
      <ul>
        <li><strong className="text-white">src/game</strong> owns startup, scene loading, physics integration, animation bundle loading, and reusable helpers.</li>
        <li><strong className="text-white">src/scenes</strong> holds per-scene runtime manifests, asset folders, and the game logic that mounts each scene.</li>
        <li><strong className="text-white">src/animations</strong> holds exported animation bundles and any asset files that came with them.</li>
        <li><strong className="text-white">public</strong> is the right place for static files you want to serve directly rather than import through Vite.</li>
      </ul>
      <p>
        A good rule is simple: authored content stays close to the code that knows how to load it, and generic engine-ish helpers stay under <code className="rounded bg-white/8 px-2 py-1 text-sm text-white">src/game</code>.
      </p>
    </Section>

    <Section
      intro="Most teams will touch these areas in this order when building with the current starter."
      title="Typical day-to-day loop"
    >
      <ul>
        <li>Author or update a world in Trident, then export the runtime scene into a scene folder.</li>
        <li>Author or update animation bundles in Animation Studio, then unpack them into src/animations.</li>
        <li>Wire gameplay and transitions in the scene module and shared helpers under src/game.</li>
        <li>Run the Vite dev server and iterate inside the game, not inside a black-box engine runtime.</li>
      </ul>
      <p>
        When you need the tool-side commands, the <a className="text-emerald-200 underline decoration-emerald-400/40 underline-offset-4" href={siteHref("tools/")}>tools page</a> lists the current monorepo install and run flow.
      </p>
    </Section>
  </PageShell>
);
